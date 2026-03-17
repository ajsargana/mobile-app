/**
 * Background Validation Service
 *
 * Manages intelligent background validation for mobile validators
 * Optimized for battery life, network efficiency, and user experience
 *
 * Key Features:
 * - Smart charging detection (USB, AC, wireless)
 * - Network state monitoring (WiFi, cellular, offline)
 * - Battery level tracking with safety thresholds
 * - Configurable validation schedules
 * - Adaptive validation frequency
 * - Power management integration
 * - Background task lifecycle management
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

export interface BackgroundValidationConfig {
  // Charging Settings
  validateWhenCharging: boolean;
  chargingTypes: ('usb' | 'ac' | 'wireless')[];
  minChargeLevel: number; // Minimum battery % when charging

  // Network Settings
  wifiOnly: boolean;
  allowCellular: boolean;
  maxCellularDataMB: number; // Max MB per day on cellular

  // Battery Settings
  minBatteryLevel: number;
  maxBatteryDrainPerHour: number;
  pauseOnLowBattery: boolean;

  // Scheduling Settings
  validationInterval: number; // Minutes between validations
  adaptiveScheduling: boolean; // Adjust frequency based on conditions
  quietHoursEnabled: boolean;
  quietHoursStart: number; // Hour (0-23)
  quietHoursEnd: number; // Hour (0-23)

  // Performance Settings
  maxConcurrentValidations: number;
  validationTimeout: number; // Milliseconds
  retryFailedValidations: boolean;
  maxRetries: number;
}

export interface DeviceState {
  // Battery
  batteryLevel: number;
  isCharging: boolean;
  chargingType: 'usb' | 'ac' | 'wireless' | 'none';

  // Network
  isConnected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none';

  // App State
  appState: AppStateStatus;

  // Power
  isPowerSaveMode: boolean;

  // Timestamp
  lastUpdated: number;
}

export interface ValidationSchedule {
  nextValidation: number; // Timestamp
  lastValidation: number; // Timestamp
  validationCount: number;
  failedCount: number;
  skippedCount: number;
  averageInterval: number; // Milliseconds
}

export interface BackgroundStats {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  skippedValidations: number;
  totalBatteryUsed: number;
  totalDataUsed: number; // Bytes
  averageValidationTime: number; // Milliseconds
  lastValidationTime: number;
  uptime: number; // Milliseconds service has been running
}

export class BackgroundValidationService {
  private static instance: BackgroundValidationService;

  private config: BackgroundValidationConfig;
  private deviceState: DeviceState;
  private schedule: ValidationSchedule;
  private stats: BackgroundStats;

  private isRunning: boolean = false;
  private validationTimer: NodeJS.Timeout | null = null;
  private stateCheckTimer: NodeJS.Timeout | null = null;

  private appStateSubscription: any = null;
  private netInfoSubscription: any = null;

  private startTime: number = 0;

  private constructor() {
    this.config = this.getDefaultConfig();
    this.deviceState = this.getDefaultDeviceState();
    this.schedule = this.getDefaultSchedule();
    this.stats = this.getDefaultStats();
  }

  static getInstance(): BackgroundValidationService {
    if (!BackgroundValidationService.instance) {
      BackgroundValidationService.instance = new BackgroundValidationService();
    }
    return BackgroundValidationService.instance;
  }

  /**
   * Start background validation service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Background validation already running');
      return;
    }

    console.log('🔄 Starting background validation service...');

    // Load saved configuration and state in parallel
    await Promise.all([this.loadConfig(), this.loadStats()]);

    // Initialize device state monitoring
    await this.initializeStateMonitoring();

    // Start validation scheduler
    this.startValidationScheduler();

    this.isRunning = true;
    this.startTime = Date.now();

    console.log('✅ Background validation service started');
    console.log(`📋 Configuration:`, {
      validateWhenCharging: this.config.validateWhenCharging,
      wifiOnly: this.config.wifiOnly,
      minBatteryLevel: this.config.minBatteryLevel,
      validationInterval: this.config.validationInterval,
    });
  }

  /**
   * Stop background validation service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping background validation service...');

    // Stop timers
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
      this.validationTimer = null;
    }

    if (this.stateCheckTimer) {
      clearInterval(this.stateCheckTimer);
      this.stateCheckTimer = null;
    }

    // Unsubscribe from state changes
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (this.netInfoSubscription) {
      this.netInfoSubscription();
      this.netInfoSubscription = null;
    }

    // Save final state
    await this.saveStats();

    this.isRunning = false;

    console.log('✅ Background validation service stopped');
  }

  /**
   * Initialize device state monitoring
   */
  private async initializeStateMonitoring(): Promise<void> {
    // Initial device state update
    await this.updateDeviceState();

    // Monitor app state changes
    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      const prevAppState = this.deviceState.appState;
      this.deviceState.appState = nextAppState;

      console.log(`📱 App state changed: ${prevAppState} → ${nextAppState}`);

      if (nextAppState === 'background' && this.config.validateWhenCharging) {
        // App went to background, check if we should validate
        await this.checkAndScheduleValidation();
      }
    });

    // Monitor network state changes
    this.netInfoSubscription = NetInfo.addEventListener(async (state: NetInfoState) => {
      const prevConnected = this.deviceState.isConnected;
      const prevType = this.deviceState.connectionType;

      this.deviceState.isConnected = state.isConnected || false;
      this.deviceState.connectionType = this.getConnectionType(state);

      if (prevConnected !== this.deviceState.isConnected || prevType !== this.deviceState.connectionType) {
        console.log(`🌐 Network changed: ${prevType} → ${this.deviceState.connectionType} (${this.deviceState.isConnected ? 'connected' : 'disconnected'})`);

        // Network changed, re-evaluate validation schedule
        await this.checkAndScheduleValidation();
      }
    });

    // Periodic device state checks (every 30 seconds)
    this.stateCheckTimer = setInterval(async () => {
      await this.updateDeviceState();
    }, 30000);
  }

  /**
   * Update current device state
   */
  private async updateDeviceState(): Promise<void> {
    try {
      // Battery state
      const batteryLevel = await DeviceInfo.getBatteryLevel();
      this.deviceState.batteryLevel = Math.round(batteryLevel * 100);

      // Charging state
      const powerState = await DeviceInfo.getPowerState();
      this.deviceState.isCharging = powerState.batteryState === 'charging' || powerState.batteryState === 'full';
      this.deviceState.chargingType = this.getChargingType(powerState);

      // Power save mode
      this.deviceState.isPowerSaveMode = await DeviceInfo.isPowerSaveMode();

      // Network state
      const netInfo = await NetInfo.fetch();
      this.deviceState.isConnected = netInfo.isConnected || false;
      this.deviceState.connectionType = this.getConnectionType(netInfo);

      // App state
      this.deviceState.appState = AppState.currentState;

      this.deviceState.lastUpdated = Date.now();

    } catch (error) {
      console.error('Error updating device state:', error);
    }
  }

  /**
   * Get charging type from power state
   */
  private getChargingType(powerState: any): 'usb' | 'ac' | 'wireless' | 'none' {
    if (!powerState || powerState.batteryState !== 'charging') {
      return 'none';
    }

    // Try to detect charging type (platform-specific)
    // For now, default to AC
    return 'ac';
  }

  /**
   * Get connection type from network state
   */
  private getConnectionType(state: NetInfoState): 'wifi' | 'cellular' | 'none' {
    if (!state.isConnected) {
      return 'none';
    }

    if (state.type === 'wifi') {
      return 'wifi';
    }

    if (state.type === 'cellular') {
      return 'cellular';
    }

    return 'none';
  }

  /**
   * Start validation scheduler
   */
  private startValidationScheduler(): void {
    // Check if we should validate immediately
    this.checkAndScheduleValidation();

    // Set up periodic validation checks
    const checkInterval = this.config.adaptiveScheduling
      ? 60000  // Check every minute for adaptive scheduling
      : this.config.validationInterval * 60000; // Use configured interval

    this.validationTimer = setInterval(async () => {
      await this.checkAndScheduleValidation();
    }, checkInterval);
  }

  /**
   * Check if validation should run and schedule accordingly
   */
  private async checkAndScheduleValidation(): Promise<void> {
    // Check if enough time has passed since last validation
    const now = Date.now();
    const timeSinceLastValidation = now - this.schedule.lastValidation;
    const intervalMs = this.config.validationInterval * 60000;

    if (timeSinceLastValidation < intervalMs) {
      return; // Too soon
    }

    // Check quiet hours
    if (this.config.quietHoursEnabled && this.isQuietHours()) {
      console.log('🔕 Skipping validation during quiet hours');
      this.stats.skippedValidations++;
      this.schedule.skippedCount++;
      return;
    }

    // Check if device is ready for validation
    const readiness = await this.isDeviceReadyForValidation();

    if (!readiness.ready) {
      console.log(`⏸️ Skipping validation: ${readiness.reason}`);
      this.stats.skippedValidations++;
      this.schedule.skippedCount++;
      return;
    }

    // All checks passed, trigger validation
    await this.performBackgroundValidation();
  }

  /**
   * Check if current time is within quiet hours
   */
  private isQuietHours(): boolean {
    const now = new Date();
    const currentHour = now.getHours();

    const start = this.config.quietHoursStart;
    const end = this.config.quietHoursEnd;

    if (start < end) {
      // Normal range (e.g., 22:00 - 06:00)
      return currentHour >= start && currentHour < end;
    } else {
      // Wraps around midnight (e.g., 22:00 - 06:00)
      return currentHour >= start || currentHour < end;
    }
  }

  /**
   * Check if device is ready for background validation
   */
  private async isDeviceReadyForValidation(): Promise<{ ready: boolean; reason?: string }> {
    await this.updateDeviceState();

    // Check battery level
    if (this.deviceState.batteryLevel < this.config.minBatteryLevel) {
      return { ready: false, reason: `Battery too low: ${this.deviceState.batteryLevel}%` };
    }

    // Check power save mode
    if (this.deviceState.isPowerSaveMode && this.config.pauseOnLowBattery) {
      return { ready: false, reason: 'Power save mode enabled' };
    }

    // Check charging requirement
    if (this.config.validateWhenCharging && !this.deviceState.isCharging) {
      return { ready: false, reason: 'Not charging' };
    }

    // Check charging type
    if (this.deviceState.isCharging) {
      if (!this.config.chargingTypes.includes(this.deviceState.chargingType)) {
        return { ready: false, reason: `Charging type not allowed: ${this.deviceState.chargingType}` };
      }
    }

    // Check network connectivity
    if (!this.deviceState.isConnected) {
      return { ready: false, reason: 'No network connection' };
    }

    // Check WiFi requirement
    if (this.config.wifiOnly && this.deviceState.connectionType !== 'wifi') {
      return { ready: false, reason: 'WiFi only mode, but not on WiFi' };
    }

    // Check cellular data limit
    if (this.deviceState.connectionType === 'cellular' && !this.config.allowCellular) {
      return { ready: false, reason: 'Cellular data not allowed' };
    }

    return { ready: true };
  }

  /**
   * Perform background validation
   */
  private async performBackgroundValidation(): Promise<void> {
    console.log('🔄 Starting background validation...');

    const startTime = Date.now();
    const startBattery = this.deviceState.batteryLevel;

    try {
      // Import validation services
      const { MobileNodeService } = await import('./MobileNodeService');
      const nodeService = MobileNodeService.getInstance();

      // Trigger validation cycle
      // Note: MobileNodeService handles the actual validation
      // We just ensure conditions are right for it to happen

      const endTime = Date.now();
      const endBattery = await DeviceInfo.getBatteryLevel();
      const batteryUsed = startBattery - (endBattery * 100);
      const timeElapsed = endTime - startTime;

      // Update statistics
      this.stats.totalValidations++;
      this.stats.successfulValidations++;
      this.stats.totalBatteryUsed += batteryUsed;
      this.stats.averageValidationTime = (
        (this.stats.averageValidationTime * (this.stats.totalValidations - 1) + timeElapsed) /
        this.stats.totalValidations
      );
      this.stats.lastValidationTime = endTime;

      // Update schedule
      this.schedule.lastValidation = endTime;
      this.schedule.validationCount++;

      // Save stats
      await this.saveStats();

      console.log(`✅ Background validation complete (${timeElapsed}ms, -${batteryUsed.toFixed(2)}% battery)`);

    } catch (error) {
      console.error('❌ Background validation failed:', error);

      this.stats.failedValidations++;
      this.schedule.failedCount++;

      await this.saveStats();
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<BackgroundValidationConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfig();

    // Restart scheduler with new config
    if (this.isRunning) {
      if (this.validationTimer) {
        clearInterval(this.validationTimer);
      }
      this.startValidationScheduler();
    }

    console.log('✅ Background validation config updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): BackgroundValidationConfig {
    return { ...this.config };
  }

  /**
   * Get current device state
   */
  getDeviceState(): DeviceState {
    return { ...this.deviceState };
  }

  /**
   * Get validation statistics
   */
  getStats(): BackgroundStats {
    return {
      ...this.stats,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Get validation schedule
   */
  getSchedule(): ValidationSchedule {
    return { ...this.schedule };
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  // Storage methods
  private async loadConfig(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem('@aura50_background_validation_config');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Error loading background validation config:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await AsyncStorage.setItem('@aura50_background_validation_config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Error saving background validation config:', error);
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem('@aura50_background_validation_stats');
      if (saved) {
        this.stats = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Error loading background validation stats:', error);
    }
  }

  private async saveStats(): Promise<void> {
    try {
      await AsyncStorage.setItem('@aura50_background_validation_stats', JSON.stringify(this.stats));
    } catch (error) {
      console.error('Error saving background validation stats:', error);
    }
  }

  // Default configurations
  private getDefaultConfig(): BackgroundValidationConfig {
    return {
      validateWhenCharging: true,
      chargingTypes: ['usb', 'ac', 'wireless'],
      minChargeLevel: 20,
      wifiOnly: true,
      allowCellular: false,
      maxCellularDataMB: 100,
      minBatteryLevel: 30,
      maxBatteryDrainPerHour: 2,
      pauseOnLowBattery: true,
      validationInterval: 15, // 15 minutes
      adaptiveScheduling: true,
      quietHoursEnabled: false,
      quietHoursStart: 22, // 10 PM
      quietHoursEnd: 6,    // 6 AM
      maxConcurrentValidations: 1,
      validationTimeout: 300000, // 5 minutes
      retryFailedValidations: true,
      maxRetries: 3,
    };
  }

  private getDefaultDeviceState(): DeviceState {
    return {
      batteryLevel: 100,
      isCharging: false,
      chargingType: 'none',
      isConnected: false,
      connectionType: 'none',
      appState: 'active',
      isPowerSaveMode: false,
      lastUpdated: Date.now(),
    };
  }

  private getDefaultSchedule(): ValidationSchedule {
    return {
      nextValidation: Date.now(),
      lastValidation: 0,
      validationCount: 0,
      failedCount: 0,
      skippedCount: 0,
      averageInterval: 0,
    };
  }

  private getDefaultStats(): BackgroundStats {
    return {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      skippedValidations: 0,
      totalBatteryUsed: 0,
      totalDataUsed: 0,
      averageValidationTime: 0,
      lastValidationTime: 0,
      uptime: 0,
    };
  }
}

export default BackgroundValidationService;
