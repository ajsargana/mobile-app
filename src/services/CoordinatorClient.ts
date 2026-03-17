/**
 * Coordinator Client
 *
 * Mobile client for communicating with the Network Coordinator
 * Receives validation assignments and reports results
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

export interface DeviceCapability {
  ramGB: number;
  cores: number;
  isTablet: boolean;
  capability: 'low' | 'medium' | 'high';
}

export interface Assignment {
  blockHeights: number[];
  assignedAt: number;
  deadline: number;
}

export class CoordinatorClient {
  private static instance: CoordinatorClient;

  private baseUrl: string;
  private validatorId: string | null = null;
  private deviceCapability: DeviceCapability | null = null;
  private currentAssignment: Assignment | null = null;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private assignmentTimer: NodeJS.Timeout | null = null;

  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly ASSIGNMENT_CHECK_INTERVAL = 60000; // 1 minute

  private constructor() {
    this.baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://62.84.187.126:5005';
  }

  static getInstance(): CoordinatorClient {
    if (!CoordinatorClient.instance) {
      CoordinatorClient.instance = new CoordinatorClient();
    }
    return CoordinatorClient.instance;
  }

  /**
   * Initialize coordinator client
   */
  async initialize(): Promise<void> {
    console.log('🎯 Initializing Coordinator Client...');

    // Generate/load validator ID and detect device capability in parallel
    await Promise.all([
      this.initializeValidatorId(),
      this.detectDeviceCapability(),
    ]);

    // Register with coordinator
    await this.register();

    // Start heartbeat
    this.startHeartbeat();

    // Start assignment polling
    this.startAssignmentPolling();

    console.log('✅ Coordinator Client initialized');
  }

  /**
   * Shutdown coordinator client
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Coordinator Client...');

    // Stop timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.assignmentTimer) {
      clearInterval(this.assignmentTimer);
      this.assignmentTimer = null;
    }

    // Unregister from coordinator
    await this.unregister();

    console.log('✅ Coordinator Client shutdown complete');
  }

  /**
   * Get current assignment
   */
  getCurrentAssignment(): Assignment | null {
    return this.currentAssignment;
  }

  /**
   * Report validation completion
   */
  async reportCompletion(
    blockHeight: number,
    passed: boolean,
    validationTime: number
  ): Promise<void> {
    if (!this.validatorId) {
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/coordinator/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validatorId: this.validatorId,
          blockHeight,
          passed,
          validationTime,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to report completion: ${response.statusText}`);
      }

      // Remove from current assignment
      if (this.currentAssignment) {
        this.currentAssignment.blockHeights = this.currentAssignment.blockHeights.filter(
          h => h !== blockHeight
        );
      }

      console.log(`✅ Reported completion for block ${blockHeight}`);
    } catch (error) {
      console.error('Error reporting completion:', error);
    }
  }

  /**
   * Report validation failure
   */
  async reportFailure(blockHeight: number): Promise<void> {
    if (!this.validatorId) {
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/coordinator/fail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validatorId: this.validatorId,
          blockHeight,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to report failure: ${response.statusText}`);
      }

      // Remove from current assignment
      if (this.currentAssignment) {
        this.currentAssignment.blockHeights = this.currentAssignment.blockHeights.filter(
          h => h !== blockHeight
        );
      }

      console.log(`⚠️ Reported failure for block ${blockHeight}`);
    } catch (error) {
      console.error('Error reporting failure:', error);
    }
  }

  /**
   * Get validator ID
   */
  getValidatorId(): string | null {
    return this.validatorId;
  }

  /**
   * Get device capability
   */
  getDeviceCapability(): DeviceCapability | null {
    return this.deviceCapability;
  }

  // Private methods

  /**
   * Initialize validator ID
   */
  private async initializeValidatorId(): Promise<void> {
    try {
      // Try to load existing ID
      const saved = await AsyncStorage.getItem('@aura50_validator_id');

      if (saved) {
        this.validatorId = saved;
      } else {
        // Generate new ID
        const deviceId = await DeviceInfo.getUniqueId();
        this.validatorId = `validator_${deviceId}_${Date.now()}`;
        await AsyncStorage.setItem('@aura50_validator_id', this.validatorId);
      }

      console.log(`📱 Validator ID: ${this.validatorId}`);
    } catch (error) {
      console.error('Error initializing validator ID:', error);
      // Fallback to random ID
      this.validatorId = `validator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Detect device capability
   */
  private async detectDeviceCapability(): Promise<void> {
    try {
      const totalMemory = await DeviceInfo.getTotalMemory();
      const ramGB = totalMemory / (1024 * 1024 * 1024);

      const isTablet = await DeviceInfo.isTablet();

      // Estimate cores (not all devices report this accurately)
      let cores = 4; // Default assumption
      try {
        // Some devices expose this
        cores = parseInt(await DeviceInfo.getDeviceId()) || 4;
      } catch {
        // Fallback to default
      }

      // Determine capability level
      let capability: 'low' | 'medium' | 'high' = 'medium';

      if (ramGB < 2) {
        capability = 'low'; // Budget devices
      } else if (ramGB < 4) {
        capability = 'medium'; // Mid-range devices
      } else {
        capability = 'high'; // Flagship devices
      }

      // Tablets get upgraded one tier
      if (isTablet && capability === 'low') {
        capability = 'medium';
      } else if (isTablet && capability === 'medium') {
        capability = 'high';
      }

      this.deviceCapability = {
        ramGB,
        cores,
        isTablet,
        capability,
      };

      console.log(`📊 Device capability: ${capability} (${ramGB.toFixed(1)} GB RAM, ${cores} cores)`);
    } catch (error) {
      console.error('Error detecting device capability:', error);
      // Fallback to medium
      this.deviceCapability = {
        ramGB: 3,
        cores: 4,
        isTablet: false,
        capability: 'medium',
      };
    }
  }

  /**
   * Register with coordinator
   */
  private async register(): Promise<void> {
    if (!this.validatorId || !this.deviceCapability) {
      return;
    }

    try {
      // Get reputation from local storage (from consensus service)
      const reputationData = await AsyncStorage.getItem('@aura50_validator_reputation');
      const reputation = reputationData ? JSON.parse(reputationData).reputation : 50;

      const response = await fetch(`${this.baseUrl}/api/coordinator/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validatorId: this.validatorId,
          deviceCapability: this.deviceCapability.capability,
          reputation,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to register: ${response.statusText}`);
      }

      console.log('✅ Registered with coordinator');
    } catch (error) {
      console.error('Error registering with coordinator:', error);
    }
  }

  /**
   * Unregister from coordinator
   */
  private async unregister(): Promise<void> {
    if (!this.validatorId) {
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/coordinator/unregister`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validatorId: this.validatorId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to unregister: ${response.statusText}`);
      }

      console.log('✅ Unregistered from coordinator');
    } catch (error) {
      console.error('Error unregistering from coordinator:', error);
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);

    // Send initial heartbeat immediately
    this.sendHeartbeat();
  }

  /**
   * Send heartbeat to coordinator
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.validatorId) {
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/coordinator/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validatorId: this.validatorId,
        }),
      });

      if (!response.ok) {
        console.warn('Heartbeat failed, will retry...');
      }
    } catch (error) {
      // Silent fail - will retry on next interval
    }
  }

  /**
   * Start assignment polling
   */
  private startAssignmentPolling(): void {
    this.assignmentTimer = setInterval(async () => {
      await this.fetchAssignment();
    }, this.ASSIGNMENT_CHECK_INTERVAL);

    // Fetch initial assignment immediately
    this.fetchAssignment();
  }

  /**
   * Fetch assignment from coordinator
   */
  private async fetchAssignment(): Promise<void> {
    if (!this.validatorId) {
      return;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/coordinator/assignment/${this.validatorId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch assignment: ${response.statusText}`);
      }

      const assignment = await response.json();

      if (assignment && assignment.blockHeights && assignment.blockHeights.length > 0) {
        this.currentAssignment = {
          blockHeights: assignment.blockHeights,
          assignedAt: Date.now(),
          deadline: Date.now() + 300000, // 5 minutes
        };

        console.log(`📋 Received assignment: ${assignment.blockHeights.length} blocks`);
      }
    } catch (error) {
      // Silent fail - will retry on next interval
    }
  }
}

export default CoordinatorClient;
