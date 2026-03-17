import AsyncStorage from '@react-native-async-storage/async-storage';
import { NetworkService } from './NetworkService';
import { EnhancedWalletService } from './EnhancedWalletService';
import { MiningService } from './MiningService';
import { MobileSelectiveValidator } from './MobileSelectiveValidator';
import { ConsensusParticipation } from './ConsensusParticipation';
import { BackgroundValidationService } from './BackgroundValidationService';
import { SybilResistanceService } from './SybilResistanceService';
import { CoordinatorClient } from './CoordinatorClient';
import { Transaction, Block, Peer, TrustLevel } from '../types';

export interface MobileNodeConfig {
  maxStorageSize: number; // 32MB default
  maxBlockAge: number; // 90 days default
  batteryThreshold: number; // 20% minimum
  wifiOnly: boolean; // false = allow cellular
  backgroundSync: boolean; // true = sync when charging
  validationLevel: 'light' | 'full'; // light for mobile
}

export interface NodeStats {
  blocksStored: number;
  peersConnected: number;
  transactionsValidated: number;
  uptime: number;
  rewardsEarned: string;
  trustScore: number;
  nodeRank: 'mobile' | 'regional' | 'archive';
}

export interface NodeRewards {
  validationRewards: string;
  miningRewards: string;
  networkRewards: string;
  loyaltyBonus: string;
  totalEarned: string;
  trustMultiplier: number;
}

export class MobileNodeService {
  private static instance: MobileNodeService;
  private isRunning: boolean = false;
  private config: MobileNodeConfig;
  private nodeId: string;
  private startTime: number = 0;
  private validationCount: number = 0;
  private lastCleanup: number = 0;

  // Service dependencies
  private networkService: NetworkService;
  private walletService: EnhancedWalletService;
  private miningService: MiningService;
  private validator: MobileSelectiveValidator;
  private consensus: ConsensusParticipation;
  private backgroundValidation: BackgroundValidationService;
  private sybilResistance: SybilResistanceService;
  private coordinatorClient: CoordinatorClient;

  private constructor() {
    this.config = {
      maxStorageSize: 32 * 1024 * 1024, // 32MB
      maxBlockAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      batteryThreshold: 20, // 20%
      wifiOnly: false,
      backgroundSync: true,
      validationLevel: 'light'
    };

    this.networkService = NetworkService.getInstance();
    this.walletService = EnhancedWalletService.getInstance();
    this.miningService = MiningService.getInstance();
    this.consensus = ConsensusParticipation.getInstance();
    this.backgroundValidation = BackgroundValidationService.getInstance();
    this.sybilResistance = SybilResistanceService.getInstance();
    this.coordinatorClient = CoordinatorClient.getInstance();

    // Initialize validator with mobile-optimized config
    const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://62.84.187.126:5005';
    this.validator = new MobileSelectiveValidator(apiBaseUrl, {
      recentBlockCount: 100,           // Validate last 100 blocks
      validateInForeground: true,      // Always validate when app is open
      validateWhenCharging: true,      // Background validation when charging
      requireWiFi: true,               // WiFi-only by default
      maxBatteryPerHour: 2,            // Max 2% battery drain per hour
      minBatteryLevel: 30,             // Don't validate below 30% battery
    });

    this.nodeId = this.generateNodeId();
  }

  static getInstance(): MobileNodeService {
    if (!MobileNodeService.instance) {
      MobileNodeService.instance = new MobileNodeService();
    }
    return MobileNodeService.instance;
  }

  // Node Lifecycle Management
  async startNode(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Node is already running');
    }

    try {
      console.log('🚀 Starting AURA5O Mobile Node...');

      // Check device readiness
      await this.checkDeviceReadiness();

      // Initialize storage
      await this.initializeNodeStorage();

      // Start network services
      await this.networkService.startP2PNetwork();

      // Begin blockchain synchronization
      await this.startBlockchainSync();

      // Start transaction validation
      this.startTransactionValidation();

      // Start mining participation
      await this.startMiningParticipation();

      // Start block validation (NEW)
      await this.startBlockValidation();

      // Initialize consensus participation (Phase 2)
      await this.consensus.initialize();

      // Start background validation service (Phase 3)
      await this.backgroundValidation.start();

      // Initialize Sybil resistance (Phase 4)
      await this.sybilResistance.initialize();

      // Initialize network coordinator (Phase 5)
      await this.coordinatorClient.initialize();

      // Begin reward tracking
      this.startRewardTracking();

      // Schedule maintenance tasks
      this.scheduleMaintenance();

      this.isRunning = true;
      this.startTime = Date.now();

      console.log('✅ Mobile Node started successfully');
      console.log(`📱 Node ID: ${this.nodeId}`);
      console.log(`🔧 Mode: ${this.config.validationLevel}`);
      console.log(`💾 Max Storage: ${this.config.maxStorageSize / 1024 / 1024}MB`);

    } catch (error) {
      console.error('❌ Failed to start mobile node:', error);
      throw error;
    }
  }

  async stopNode(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('🛑 Stopping AURA5O Mobile Node...');

      // Stop mining
      await this.miningService.stopMining();

      // Stop background validation
      await this.backgroundValidation.stop();

      // Shutdown coordinator client
      await this.coordinatorClient.shutdown();

      // Stop network services
      await this.networkService.stopP2PNetwork();

      // Save final state
      await this.saveNodeState();

      this.isRunning = false;
      console.log('✅ Mobile Node stopped successfully');

    } catch (error) {
      console.error('❌ Error stopping mobile node:', error);
    }
  }

  // Device Readiness Checks
  private async checkDeviceReadiness(): Promise<void> {
    // Check battery level
    const batteryLevel = await this.getBatteryLevel();
    if (batteryLevel < this.config.batteryThreshold && !await this.isCharging()) {
      throw new Error(`Battery too low: ${batteryLevel}% (minimum: ${this.config.batteryThreshold}%)`);
    }

    // Check available storage
    const availableStorage = await this.getAvailableStorage();
    if (availableStorage < this.config.maxStorageSize) {
      throw new Error(`Insufficient storage: ${availableStorage / 1024 / 1024}MB available (need: ${this.config.maxStorageSize / 1024 / 1024}MB)`);
    }

    // Check network connectivity
    const networkInfo = await this.networkService.getNetworkInfo();
    if (!networkInfo.isConnected) {
      throw new Error('No network connectivity available');
    }

    // WiFi-only mode check
    if (this.config.wifiOnly && networkInfo.type !== 'wifi') {
      throw new Error('WiFi-only mode enabled but not connected to WiFi');
    }

    console.log('✅ Device readiness checks passed');
  }

  // Blockchain Synchronization
  private async startBlockchainSync(): Promise<void> {
    console.log('🔄 Starting blockchain synchronization...');

    try {
      // Get current blockchain height from peers
      const currentHeight = await this.getCurrentBlockHeight();

      // Get local blockchain height
      const localHeight = await this.getLocalBlockHeight();

      console.log(`📊 Network height: ${currentHeight}, Local height: ${localHeight}`);

      if (currentHeight > localHeight) {
        const blocksToSync = Math.min(currentHeight - localHeight, 1000); // Sync in batches
        console.log(`⬇️ Syncing ${blocksToSync} blocks...`);

        for (let i = 0; i < blocksToSync; i++) {
          const blockHeight = localHeight + i + 1;
          const block = await this.downloadBlock(blockHeight);

          if (block) {
            await this.validateAndStoreBlock(block);
          }

          // Progress update every 100 blocks
          if ((i + 1) % 100 === 0) {
            console.log(`📥 Synced ${i + 1}/${blocksToSync} blocks`);
          }
        }
      }

      console.log('✅ Blockchain synchronization complete');

    } catch (error) {
      console.error('❌ Blockchain sync error:', error);
      throw error;
    }
  }

  // Transaction Validation
  private startTransactionValidation(): void {
    console.log('🔍 Starting transaction validation...');

    // Listen for new transactions from network
    this.networkService.on('newTransaction', async (transaction: Transaction) => {
      try {
        const isValid = await this.validateTransaction(transaction);

        if (isValid) {
          // Forward valid transaction to peers
          await this.networkService.broadcastTransaction(transaction);

          // Track validation for rewards
          this.validationCount++;

          console.log(`✅ Validated transaction: ${transaction.id}`);
        } else {
          console.log(`❌ Invalid transaction rejected: ${transaction.id}`);
        }

      } catch (error) {
        console.error('Transaction validation error:', error);
      }
    });

    console.log('✅ Transaction validation started');
  }

  // Mining Participation
  private async startMiningParticipation(): Promise<void> {
    console.log('⛏️ Starting mining participation...');

    try {
      // Configure mobile-optimized mining
      await this.miningService.configureMobileMode({
        intensity: 'low', // Battery-friendly
        pauseOnLowBattery: true,
        requiresCharging: this.config.backgroundSync,
        maxCpuUsage: 25 // 25% max CPU
      });

      // Start mining with mobile optimizations
      await this.miningService.startMining();

      console.log('✅ Mining participation started');

    } catch (error) {
      console.error('❌ Mining participation error:', error);
    }
  }

  // Block Validation (NEW)
  private async startBlockValidation(): Promise<void> {
    console.log('🔍 Starting block validation...');

    try {
      // Initial foreground validation
      await this.performValidationCycle(true);

      // Set up periodic foreground validation (every 5 minutes)
      setInterval(async () => {
        if (this.isRunning) {
          await this.performValidationCycle(true);
        }
      }, 5 * 60 * 1000);

      // Set up background validation when charging (every 15 minutes)
      setInterval(async () => {
        if (this.isRunning && await this.isCharging()) {
          await this.performValidationCycle(false);
        }
      }, 15 * 60 * 1000);

      console.log('✅ Block validation started');

    } catch (error) {
      console.error('❌ Block validation error:', error);
    }
  }

  // Perform a single validation cycle
  private async performValidationCycle(isForeground: boolean): Promise<void> {
    try {
      console.log(`🔍 Running ${isForeground ? 'foreground' : 'background'} validation cycle...`);

      // Validate recent blocks
      const results = await this.validator.validateRecentBlocks(isForeground);

      // Process results
      const successCount = results.filter(r => r.passed).length;
      const failCount = results.filter(r => !r.passed).length;

      console.log(`✅ Validation complete: ${successCount} passed, ${failCount} failed`);

      // Check Sybil score before casting votes (Phase 4)
      const canValidate = await this.canParticipateAsValidator();
      if (!canValidate) {
        const sybilScore = await this.getSybilScore();
        console.warn(`⚠️ Cannot cast votes - Sybil score too low: ${sybilScore?.overallScore}/100 (Risk: ${sybilScore?.riskLevel})`);
        return;
      }

      // Cast consensus votes on validated blocks (Phase 2)
      for (const result of results) {
        try {
          await this.consensus.castVote(
            result.blockHeight,
            result.blockHash,
            {
              passed: result.passed,
              layer1_structure: result.layer1_structure,
              layer2_hash: result.layer2_hash,
              layer3_chain: result.layer3_chain,
              layer4_timestamp: result.layer4_timestamp,
              layer5_difficulty: result.layer5_difficulty,
              layer6_merkle: result.layer6_merkle,
              layer7_participants: result.layer7_participants,
              layer8_pow: result.layer8_pow,
            }
          );
        } catch (error) {
          console.error(`Error casting vote for block ${result.blockHeight}:`, error);
        }
      }

      // Update validation count for rewards
      this.validationCount += successCount;

      // Update node reputation based on accuracy
      if (results.length > 0) {
        await this.updateValidationReputation(results);
      }

      // Get validation stats
      const stats = this.validator.getStats();
      const votingStats = this.consensus.getVotingStats();
      console.log(`📊 Validation stats: ${stats.totalBlocksValidated} total, ${stats.reputationScore} reputation`);
      console.log(`🗳️ Consensus stats: ${votingStats.totalVotesCast} votes, ${votingStats.voteAccuracy.toFixed(1)}% accuracy`);

    } catch (error) {
      console.error('❌ Validation cycle error:', error);
    }
  }

  // Update node reputation based on validation accuracy
  private async updateValidationReputation(results: any[]): Promise<void> {
    try {
      const stats = this.validator.getStats();
      const accuracy = stats.totalBlocksValidated > 0
        ? (stats.successfulValidations / stats.totalBlocksValidated) * 100
        : 100;

      // Store reputation score
      await AsyncStorage.setItem('@aura50_validation_reputation', JSON.stringify({
        accuracy,
        totalValidations: stats.totalBlocksValidated,
        reputationScore: stats.reputationScore,
        lastUpdate: Date.now()
      }));

      // Log reputation changes
      if (accuracy < 95) {
        console.warn(`⚠️ Validation accuracy below 95%: ${accuracy.toFixed(2)}%`);
      }

    } catch (error) {
      console.error('Error updating validation reputation:', error);
    }
  }

  // Node Validation Functions
  private async validateTransaction(transaction: Transaction): Promise<boolean> {
    try {
      // Basic validation checks
      if (!transaction.id || !transaction.from || !transaction.to || !transaction.amount) {
        return false;
      }

      // Signature validation
      const signatureValid = await this.validateTransactionSignature(transaction);
      if (!signatureValid) {
        return false;
      }

      // Balance check (if we have sender's account info)
      const balanceValid = await this.validateSenderBalance(transaction);
      if (!balanceValid) {
        return false;
      }

      // Fee validation
      const feeValid = this.validateTransactionFee(transaction);
      if (!feeValid) {
        return false;
      }

      return true;

    } catch (error) {
      console.error('Transaction validation error:', error);
      return false;
    }
  }

  private async validateAndStoreBlock(block: Block): Promise<boolean> {
    try {
      // Validate block structure
      if (!this.validateBlockStructure(block)) {
        return false;
      }

      // Validate block hash
      if (!this.validateBlockHash(block)) {
        return false;
      }

      // Validate proof of work
      if (!this.validateProofOfWork(block)) {
        return false;
      }

      // Store block if valid
      await this.storeBlock(block);

      console.log(`✅ Block ${block.height} validated and stored`);
      return true;

    } catch (error) {
      console.error('Block validation error:', error);
      return false;
    }
  }

  // Storage Management
  private async initializeNodeStorage(): Promise<void> {
    console.log('💾 Initializing node storage...');

    try {
      // Create storage directories
      await this.createStorageStructure();

      // Load existing node state
      await this.loadNodeState();

      // Cleanup old data if needed
      await this.cleanupOldData();

      console.log('✅ Node storage initialized');

    } catch (error) {
      console.error('Storage initialization error:', error);
      throw error;
    }
  }

  private async cleanupOldData(): Promise<void> {
    const now = Date.now();

    // Only cleanup once per day
    if (now - this.lastCleanup < 24 * 60 * 60 * 1000) {
      return;
    }

    console.log('🧹 Cleaning up old data...');

    try {
      // Remove blocks older than maxBlockAge
      const cutoffTime = now - this.config.maxBlockAge;
      let removedCount = 0;

      const blocks = await this.getStoredBlocks();
      for (const block of blocks) {
        if (block.timestamp < cutoffTime) {
          await this.removeBlock(block.height);
          removedCount++;
        }
      }

      // Compress temporal data
      await this.compressTemporalData();

      this.lastCleanup = now;

      console.log(`✅ Cleanup complete: ${removedCount} old blocks removed`);

    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  // Reward System
  private startRewardTracking(): void {
    console.log('💰 Starting reward tracking...');

    // Track validation rewards
    setInterval(async () => {
      if (this.validationCount > 0) {
        const rewards = await this.calculateValidationRewards();
        await this.creditRewards(rewards);
        this.validationCount = 0;
      }
    }, 60000); // Every minute

    // Track uptime rewards
    setInterval(async () => {
      const uptime = this.getUptime();
      const rewards = await this.calculateUptimeRewards(uptime);
      await this.creditRewards(rewards);
    }, 3600000); // Every hour

    console.log('✅ Reward tracking started');
  }

  private async calculateValidationRewards(): Promise<NodeRewards> {
    const baseReward = this.validationCount * 0.001; // 0.001 A50 per validation
    const trustMultiplier = await this.getTrustMultiplier();

    return {
      validationRewards: (baseReward * trustMultiplier).toFixed(8),
      miningRewards: '0',
      networkRewards: '0',
      loyaltyBonus: (baseReward * (trustMultiplier - 1)).toFixed(8),
      totalEarned: (baseReward * trustMultiplier).toFixed(8),
      trustMultiplier
    };
  }

  // Node Statistics
  async getNodeStats(): Promise<NodeStats> {
    const blocks = await this.getStoredBlocks();
    const peers = await this.networkService.getConnectedPeers();
    const uptime = this.getUptime();
    const rewards = await this.getTotalRewards();
    const trustScore = await this.getTrustScore();

    return {
      blocksStored: blocks.length,
      peersConnected: peers.length,
      transactionsValidated: this.validationCount,
      uptime,
      rewardsEarned: rewards,
      trustScore,
      nodeRank: 'mobile'
    };
  }

  // Trust System Integration
  private async getTrustMultiplier(): Promise<number> {
    const user = this.walletService.getUser();
    if (!user) return 1.0;

    const trustLevel = this.walletService.calculateTrustLevel(user);

    switch (trustLevel) {
      case TrustLevel.LEGEND: return 3.0;   // 3x rewards
      case TrustLevel.VETERAN: return 2.0;  // 2x rewards
      case TrustLevel.ESTABLISHED: return 1.5; // 1.5x rewards
      default: return 1.0; // Base rewards
    }
  }

  // Utility Functions
  private generateNodeId(): string {
    return 'mobile_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private getUptime(): number {
    return this.isRunning ? Date.now() - this.startTime : 0;
  }

  private async getBatteryLevel(): Promise<number> {
    // Mock implementation - in real app would use react-native-device-info
    return 75; // 75%
  }

  private async isCharging(): Promise<boolean> {
    // Mock implementation - in real app would use device API
    return false;
  }

  private async getAvailableStorage(): Promise<number> {
    // Mock implementation - in real app would check actual storage
    return 64 * 1024 * 1024; // 64MB available
  }

  // Placeholder implementations for complex functions
  private async getCurrentBlockHeight(): Promise<number> { return 1000; }
  private async getLocalBlockHeight(): Promise<number> { return 950; }
  private async downloadBlock(height: number): Promise<Block | null> { return null; }
  private async storeBlock(block: Block): Promise<void> { }
  private async getStoredBlocks(): Promise<Block[]> { return []; }
  private async removeBlock(height: number): Promise<void> { }
  private async validateTransactionSignature(tx: Transaction): Promise<boolean> { return true; }
  private async validateSenderBalance(tx: Transaction): Promise<boolean> { return true; }
  private validateTransactionFee(tx: Transaction): boolean { return true; }
  private validateBlockStructure(block: Block): boolean { return true; }
  private validateBlockHash(block: Block): boolean { return true; }
  private validateProofOfWork(block: Block): boolean { return true; }
  private async createStorageStructure(): Promise<void> { }
  private async loadNodeState(): Promise<void> { }
  private async saveNodeState(): Promise<void> { }
  private async compressTemporalData(): Promise<void> { }
  private async creditRewards(rewards: NodeRewards): Promise<void> { }
  private async calculateUptimeRewards(uptime: number): Promise<NodeRewards> {
    return {
      validationRewards: '0',
      miningRewards: '0',
      networkRewards: (uptime / 3600000 * 0.01).toFixed(8), // 0.01 A50 per hour
      loyaltyBonus: '0',
      totalEarned: (uptime / 3600000 * 0.01).toFixed(8),
      trustMultiplier: 1.0
    };
  }
  private async getTotalRewards(): Promise<string> { return '0.00000000'; }
  private async getTrustScore(): Promise<number> { return 50; }
  private scheduleMaintenance(): void {
    // Schedule periodic maintenance tasks
    setInterval(() => this.cleanupOldData(), 24 * 60 * 60 * 1000); // Daily
  }

  // Public API
  isNodeRunning(): boolean {
    return this.isRunning;
  }

  getNodeId(): string {
    return this.nodeId;
  }

  getConfig(): MobileNodeConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<MobileNodeConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await AsyncStorage.setItem('@aura50_node_config', JSON.stringify(this.config));
  }

  // Sybil Resistance Integration (Phase 4)
  async getSybilScore() {
    return this.sybilResistance.getSybilScore();
  }

  async getDeviceAttestation() {
    return this.sybilResistance.getDeviceAttestation();
  }

  async canParticipateAsValidator(): Promise<boolean> {
    return this.sybilResistance.canValidate();
  }

  async reattestDevice(): Promise<void> {
    await this.sybilResistance.reAttest();
  }
}

export default MobileNodeService;