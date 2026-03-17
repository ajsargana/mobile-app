/**
 * Mobile Selective Validator
 *
 * Validates recent blocks (last N blocks) to participate in consensus
 * Optimized for mobile: minimal battery, bandwidth, and storage impact
 *
 * Key Features:
 * - Validates last 100-1000 blocks (configurable)
 * - 8-layer validation system
 * - Works when: foreground OR (charging + WiFi)
 * - Caches validation results locally
 * - Participates in Byzantine Fault Tolerance consensus
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';

// Validation configuration
export interface MobileValidationConfig {
  // Block Range
  recentBlockCount: number;        // How many recent blocks to validate
  checkpointDepth: number;         // Validate checkpoint every N blocks

  // Validation Level
  fullValidation: boolean;         // true = all 8 validation layers
  skipExpensiveChecks: boolean;    // Skip heavy checks on battery

  // Resource Limits
  maxBandwidthPerDay: number;      // MB per day limit
  maxBatteryPerHour: number;       // % battery drain limit per hour
  minBatteryLevel: number;         // Don't validate below this %

  // Timing
  validateInForeground: boolean;   // Validate when app is open
  validateWhenCharging: boolean;   // Background validation when charging
  requireWiFi: boolean;            // Only validate on WiFi

  // Coordination
  assignedBlockRange?: {           // Coordinator assigns specific blocks
    start: number;
    end: number;
  };
}

// Block validation result
export interface BlockValidationResult {
  blockHeight: number;
  blockHash: string;
  passed: boolean;
  validationLayers: {
    structure: boolean;      // Layer 1: Structure validation
    hash: boolean;           // Layer 2: Hash validation
    chain: boolean;          // Layer 3: Chain link validation
    timestamp: boolean;      // Layer 4: Timestamp validation
    difficulty: boolean;     // Layer 5: Difficulty validation
    merkleRoot: boolean;     // Layer 6: Merkle root validation
    participants: boolean;   // Layer 7: Participant validation
    proofOfWork: boolean;    // Layer 8: PoW validation
  };
  validatedAt: number;       // Timestamp
  batteryUsed: number;       // % battery consumed
  bandwidthUsed: number;     // Bytes used
}

// Validation statistics
export interface ValidationStats {
  totalBlocksValidated: number;
  successfulValidations: number;
  failedValidations: number;
  totalBatteryUsed: number;     // % total
  totalBandwidthUsed: number;   // Bytes total
  averageValidationTime: number; // ms
  lastValidationTime: number;    // timestamp
  reputationScore: number;       // 0-100
}

export class MobileSelectiveValidator {
  private config: MobileValidationConfig;
  private stats: ValidationStats;
  private validationCache: Map<number, BlockValidationResult>;
  private isValidating: boolean = false;
  private apiBaseUrl: string;

  // Default configuration
  private static DEFAULT_CONFIG: MobileValidationConfig = {
    recentBlockCount: 100,         // Last 100 blocks (~3 hours at 2min/block)
    checkpointDepth: 1000,         // Validate checkpoint every 1000 blocks
    fullValidation: true,          // All 8 layers
    skipExpensiveChecks: false,    // Don't skip when charging
    maxBandwidthPerDay: 100,       // 100MB per day
    maxBatteryPerHour: 2,          // 2% per hour max
    minBatteryLevel: 30,           // Don't validate below 30%
    validateInForeground: true,    // Always validate when app open
    validateWhenCharging: true,    // Background when charging
    requireWiFi: true,             // WiFi only by default
  };

  constructor(apiBaseUrl: string, config?: Partial<MobileValidationConfig>) {
    this.apiBaseUrl = apiBaseUrl;
    this.config = { ...MobileSelectiveValidator.DEFAULT_CONFIG, ...config };
    this.validationCache = new Map();
    this.stats = {
      totalBlocksValidated: 0,
      successfulValidations: 0,
      failedValidations: 0,
      totalBatteryUsed: 0,
      totalBandwidthUsed: 0,
      averageValidationTime: 0,
      lastValidationTime: 0,
      reputationScore: 50, // Start at 50/100
    };

    this.loadStatsFromStorage();
  }

  /**
   * Check if device is ready for validation
   * Considers: battery, network, charging state
   */
  async isReadyToValidate(isForeground: boolean): Promise<{ ready: boolean; reason?: string }> {
    try {
      // Check battery level
      const batteryLevel = await DeviceInfo.getBatteryLevel();
      if (batteryLevel < this.config.minBatteryLevel / 100) {
        return { ready: false, reason: `Battery too low: ${Math.round(batteryLevel * 100)}%` };
      }

      // Check if charging
      const isCharging = await DeviceInfo.isBatteryCharging();

      // Foreground validation - always OK if battery is sufficient
      if (isForeground && this.config.validateInForeground) {
        // Check network if WiFi required
        if (this.config.requireWiFi) {
          const netInfo = await NetInfo.fetch();
          if (netInfo.type !== 'wifi') {
            return { ready: false, reason: 'WiFi required, currently on cellular' };
          }
        }
        return { ready: true };
      }

      // Background validation - only when charging
      if (!isForeground && this.config.validateWhenCharging) {
        if (!isCharging) {
          return { ready: false, reason: 'Background validation requires charging' };
        }

        // Check WiFi for background
        const netInfo = await NetInfo.fetch();
        if (netInfo.type !== 'wifi') {
          return { ready: false, reason: 'Background validation requires WiFi' };
        }

        return { ready: true };
      }

      return { ready: false, reason: 'Validation not enabled for current state' };
    } catch (error) {
      console.error('[MobileValidator] Error checking readiness:', error);
      return { ready: false, reason: 'Error checking device state' };
    }
  }

  /**
   * Validate recent blocks
   * Downloads block headers and validates each one
   */
  async validateRecentBlocks(isForeground: boolean): Promise<BlockValidationResult[]> {
    // Check if already validating
    if (this.isValidating) {
      console.log('[MobileValidator] Already validating, skipping...');
      return [];
    }

    // Check if device is ready
    const readiness = await this.isReadyToValidate(isForeground);
    if (!readiness.ready) {
      console.log('[MobileValidator] Not ready:', readiness.reason);
      return [];
    }

    this.isValidating = true;
    const startTime = Date.now();
    const startBattery = await DeviceInfo.getBatteryLevel();
    let bytesUsed = 0;
    const results: BlockValidationResult[] = [];

    try {
      console.log('[MobileValidator] Starting validation cycle...');

      // Get current blockchain height
      const currentHeight = await this.getCurrentBlockHeight();
      console.log(`[MobileValidator] Current height: ${currentHeight}`);

      // Determine block range to validate
      const startHeight = this.config.assignedBlockRange?.start ||
                         Math.max(1, currentHeight - this.config.recentBlockCount);
      const endHeight = this.config.assignedBlockRange?.end || currentHeight;

      console.log(`[MobileValidator] Validating blocks ${startHeight} to ${endHeight}`);

      // Download block headers in batches (20 at a time to minimize bandwidth)
      const batchSize = 20;
      for (let height = startHeight; height <= endHeight; height += batchSize) {
        const batchEnd = Math.min(height + batchSize - 1, endHeight);

        // Download batch
        const blocks = await this.downloadBlockHeaders(height, batchEnd);
        bytesUsed += JSON.stringify(blocks).length;

        // Validate each block in the batch
        for (const block of blocks) {
          // Check if already validated (cached)
          const cached = this.validationCache.get(block.height);
          if (cached && cached.blockHash === block.hash) {
            console.log(`[MobileValidator] Block ${block.height} already validated (cached)`);
            results.push(cached);
            continue;
          }

          // Validate the block
          const validationResult = await this.validateBlock(block);
          bytesUsed += JSON.stringify(validationResult).length;

          // Cache the result
          this.validationCache.set(block.height, validationResult);
          results.push(validationResult);

          // Update stats
          this.stats.totalBlocksValidated++;
          if (validationResult.passed) {
            this.stats.successfulValidations++;
          } else {
            this.stats.failedValidations++;
            console.warn(`[MobileValidator] Block ${block.height} FAILED validation`);
          }
        }

        // Check battery drain - stop if exceeding limit
        const currentBattery = await DeviceInfo.getBatteryLevel();
        const batteryUsed = (startBattery - currentBattery) * 100;
        const elapsedHours = (Date.now() - startTime) / (1000 * 60 * 60);
        const batteryPerHour = batteryUsed / elapsedHours;

        if (batteryPerHour > this.config.maxBatteryPerHour) {
          console.warn(`[MobileValidator] Battery drain too high: ${batteryPerHour.toFixed(2)}%/hour`);
          break;
        }
      }

      // Calculate stats
      const endBattery = await DeviceInfo.getBatteryLevel();
      const totalBatteryUsed = (startBattery - endBattery) * 100;
      const totalTime = Date.now() - startTime;

      this.stats.totalBatteryUsed += totalBatteryUsed;
      this.stats.totalBandwidthUsed += bytesUsed;
      this.stats.averageValidationTime =
        (this.stats.averageValidationTime * (this.stats.totalBlocksValidated - results.length) + totalTime) /
        this.stats.totalBlocksValidated;
      this.stats.lastValidationTime = Date.now();

      // Update reputation based on accuracy
      const accuracy = this.stats.successfulValidations / Math.max(1, this.stats.totalBlocksValidated);
      this.stats.reputationScore = Math.min(100, Math.max(0, Math.round(accuracy * 100)));

      // Save stats
      await this.saveStatsToStorage();

      console.log(`[MobileValidator] Validation complete:`);
      console.log(`  - Blocks validated: ${results.length}`);
      console.log(`  - Time: ${totalTime}ms`);
      console.log(`  - Battery used: ${totalBatteryUsed.toFixed(2)}%`);
      console.log(`  - Bandwidth: ${(bytesUsed / 1024).toFixed(2)}KB`);
      console.log(`  - Reputation: ${this.stats.reputationScore}/100`);

      return results;
    } catch (error) {
      console.error('[MobileValidator] Validation error:', error);
      return results;
    } finally {
      this.isValidating = false;
    }
  }

  /**
   * Validate a single block using 8-layer validation
   */
  private async validateBlock(block: any): Promise<BlockValidationResult> {
    const startTime = Date.now();
    const startBattery = await DeviceInfo.getBatteryLevel();

    const result: BlockValidationResult = {
      blockHeight: block.height,
      blockHash: block.hash,
      passed: false,
      validationLayers: {
        structure: false,
        hash: false,
        chain: false,
        timestamp: false,
        difficulty: false,
        merkleRoot: false,
        participants: false,
        proofOfWork: false,
      },
      validatedAt: Date.now(),
      batteryUsed: 0,
      bandwidthUsed: 0,
    };

    try {
      // Layer 1: Structure Validation
      result.validationLayers.structure = this.validateStructure(block);

      // Layer 2: Hash Validation
      result.validationLayers.hash = this.validateHash(block);

      // Layer 3: Chain Link Validation
      result.validationLayers.chain = await this.validateChainLink(block);

      // Layer 4: Timestamp Validation
      result.validationLayers.timestamp = this.validateTimestamp(block);

      // Layer 5: Difficulty Validation
      result.validationLayers.difficulty = this.validateDifficulty(block);

      // Layer 6: Merkle Root Validation
      result.validationLayers.merkleRoot = this.validateMerkleRoot(block);

      // Layer 7: Participant Validation
      result.validationLayers.participants = this.validateParticipants(block);

      // Layer 8: Proof of Work Validation (expensive - skip on battery if configured)
      if (this.config.skipExpensiveChecks) {
        const isCharging = await DeviceInfo.isBatteryCharging();
        result.validationLayers.proofOfWork = isCharging ?
          this.validateProofOfWork(block) : true; // Skip if not charging
      } else {
        result.validationLayers.proofOfWork = this.validateProofOfWork(block);
      }

      // Block passes if ALL layers pass
      result.passed = Object.values(result.validationLayers).every(layer => layer);

      // Calculate resources used
      const endBattery = await DeviceInfo.getBatteryLevel();
      result.batteryUsed = (startBattery - endBattery) * 100;
      result.bandwidthUsed = JSON.stringify(block).length;

      return result;
    } catch (error) {
      console.error(`[MobileValidator] Error validating block ${block.height}:`, error);
      return result;
    }
  }

  // Validation layer implementations
  private validateStructure(block: any): boolean {
    return !!(
      block &&
      typeof block.height === 'number' &&
      typeof block.hash === 'string' &&
      typeof block.prevHash === 'string' &&
      typeof block.timestamp === 'string' &&
      typeof block.merkleRoot === 'string'
    );
  }

  private validateHash(block: any): boolean {
    // Hash should be 64-character hex string
    return /^[a-f0-9]{64}$/i.test(block.hash);
  }

  private async validateChainLink(block: any): Promise<boolean> {
    if (block.height === 0) return true; // Genesis block

    // Verify previous block hash matches
    try {
      const prevBlock = await this.getBlockByHeight(block.height - 1);
      return prevBlock && prevBlock.hash === block.prevHash;
    } catch {
      return false;
    }
  }

  private validateTimestamp(block: any): boolean {
    const blockTime = new Date(block.timestamp).getTime();
    const now = Date.now();

    // Block shouldn't be >10 minutes in future
    if (blockTime > now + 10 * 60 * 1000) return false;

    // Block shouldn't be >24 hours in past (for recent blocks)
    if (now - blockTime > 24 * 60 * 60 * 1000) return false;

    return true;
  }

  private validateDifficulty(block: any): boolean {
    // Difficulty should be positive number in acceptable range
    return block.difficulty > 0 &&
           block.difficulty >= 2097152 &&
           block.difficulty <= 16777216;
  }

  private validateMerkleRoot(block: any): boolean {
    // Merkle root should be 64-character hex string
    return /^[a-f0-9]{64}$/i.test(block.merkleRoot);
  }

  private validateParticipants(block: any): boolean {
    // Check participants array is valid
    if (!Array.isArray(block.participants)) return false;

    // Check no duplicate participants
    const uniqueParticipants = new Set(block.participants.map((p: any) => p.userId));
    return uniqueParticipants.size === block.participants.length;
  }

  private validateProofOfWork(block: any): boolean {
    // NUMERIC TARGET: hash must be <= MAX_HASH / difficulty
    // Validate difficulty completely
    if (!block.difficulty || block.difficulty <= 0 ||
        !Number.isFinite(block.difficulty) ||
        block.difficulty > Number.MAX_SAFE_INTEGER) {
      return false;
    }

    try {
      const MAX_HASH = BigInt('0x' + 'f'.repeat(64));
      const targetValue = MAX_HASH / BigInt(Math.floor(block.difficulty));
      const hashValue = BigInt('0x' + block.hash.toLowerCase());
      return hashValue <= targetValue;
    } catch (error) {
      // If BigInt fails (invalid hash format), reject
      console.error('PoW validation error:', error);
      return false;
    }
  }

  // API Helper Methods
  private async getCurrentBlockHeight(): Promise<number> {
    const response = await fetch(`${this.apiBaseUrl}/api/blockchain/info`);
    const data = await response.json();
    return data.network.blockHeight;
  }

  private async downloadBlockHeaders(startHeight: number, endHeight: number): Promise<any[]> {
    const response = await fetch(
      `${this.apiBaseUrl}/api/blocks/range?start=${startHeight}&end=${endHeight}&headersOnly=true`
    );
    const data = await response.json();
    return data.blocks || [];
  }

  private async getBlockByHeight(height: number): Promise<any> {
    const response = await fetch(`${this.apiBaseUrl}/api/blocks/${height}`);
    const data = await response.json();
    return data.block;
  }

  // Storage methods
  private async loadStatsFromStorage(): Promise<void> {
    try {
      const statsJson = await AsyncStorage.getItem('mobile-validator-stats');
      if (statsJson) {
        this.stats = JSON.parse(statsJson);
      }
    } catch (error) {
      console.error('[MobileValidator] Error loading stats:', error);
    }
  }

  private async saveStatsToStorage(): Promise<void> {
    try {
      await AsyncStorage.setItem('mobile-validator-stats', JSON.stringify(this.stats));
    } catch (error) {
      console.error('[MobileValidator] Error saving stats:', error);
    }
  }

  // Public getters
  getStats(): ValidationStats {
    return { ...this.stats };
  }

  getConfig(): MobileValidationConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<MobileValidationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Clear cache and stats
  async resetStats(): Promise<void> {
    this.stats = {
      totalBlocksValidated: 0,
      successfulValidations: 0,
      failedValidations: 0,
      totalBatteryUsed: 0,
      totalBandwidthUsed: 0,
      averageValidationTime: 0,
      lastValidationTime: 0,
      reputationScore: 50,
    };
    this.validationCache.clear();
    await this.saveStatsToStorage();
  }
}
