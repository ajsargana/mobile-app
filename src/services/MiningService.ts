import AsyncStorage from '@react-native-async-storage/async-storage';
import { MiningSession, DeviceMetrics, NetworkStats } from '../types';
import { EnhancedWalletService } from './EnhancedWalletService';
import { NetworkService } from './NetworkService';
import { sha256 } from 'js-sha256';
import config from '../config/environment';
import NotificationService from './NotificationService';

// Expo Go compatibility: these modules require custom dev build
// Provide fallbacks for Expo Go testing
let BackgroundTimer: any = null;
let DeviceInfo: any;

try {
  const bgTimer = require('react-native-background-timer');
  // Test if it actually works
  if (bgTimer && typeof bgTimer.setInterval === 'function') {
    BackgroundTimer = bgTimer;
    console.log('✅ BackgroundTimer loaded successfully');
  } else {
    throw new Error('BackgroundTimer module exists but not functional');
  }
} catch (e) {
  console.warn('BackgroundTimer not available (Expo Go) - using setTimeout fallback');
  // Fallback to regular JavaScript timers for Expo Go
  BackgroundTimer = {
    setInterval: (callback: () => void, delay: number) => {
      console.log('📱 Using regular setInterval (Expo Go mode)');
      return setInterval(callback, delay) as any;
    },
    clearInterval: (id: number) => {
      clearInterval(id);
    },
    setTimeout: (callback: () => void, delay: number) => {
      return setTimeout(callback, delay) as any;
    },
    clearTimeout: (id: number) => {
      clearTimeout(id);
    }
  };
}

try {
  DeviceInfo = require('react-native-device-info');
} catch (e) {
  console.warn('DeviceInfo not available (Expo Go) - using mock values');
  DeviceInfo = {
    getDeviceId: () => Promise.resolve('expo-go-device'),
    getBatteryLevel: () => Promise.resolve(0.8),
    isBatteryCharging: () => Promise.resolve(false),
    isPinOrFingerprintSet: () => Promise.resolve(false),
    getManufacturer: () => Promise.resolve('Apple'),
    getModel: () => Promise.resolve('iPhone'),
    getSystemVersion: () => '15.0',
    isEmulator: () => Promise.resolve(false),
    getTotalMemory: () => Promise.resolve(4000000000),
    getFreeDiskStorage: () => Promise.resolve(70000000000),
    getUsedMemory: () => Promise.resolve(700000000),
    getCpuTemperature: () => Promise.resolve(45),
    isLocationEnabled: () => Promise.resolve(true),
    hasSystemFeature: () => Promise.resolve(false),
    getBaseOs: () => Promise.resolve('iOS'),
    getDeviceName: () => Promise.resolve('iPhone'),
    getUniqueId: () => 'expo-go-unique-id',
    getBrand: () => 'Apple',
    getApplicationName: () => 'AURA50',
    getBuildNumber: () => '1',
    getVersion: () => '1.0.0'
  };
}

export class MiningService {
  private static instance: MiningService;
  private currentSession: MiningSession | null = null;
  private miningTimer: number | null = null;
  private isMining: boolean = false;
  private isLowPowerMode: boolean = false;
  private hashesPerSecond: number = 0;
  private walletService: EnhancedWalletService;
  private networkService: NetworkService;

  // Battery optimization tracking
  private cpuTemperature: number = 0;
  private screenState: 'on' | 'off' = 'on';
  private lastMiningInterval: number = 2000;
  private lastDeviceMetricsCheck: number = 0; // Track last device metrics update
  private lastBlockCheck: number = 0; // Track last block status check
  private blockChangeListener: ((block: any) => void) | null = null; // WebSocket block-change handler
  private sessionHashCount: number = 0; // Persistent counter across all concurrent mining loops
  private _rateWindowHashes: number = 0;
  private _rateWindowStart: number = 0;

  private constructor() {
    this.walletService = EnhancedWalletService.getInstance();
    this.networkService = NetworkService.getInstance();
  }

  static getInstance(): MiningService {
    if (!MiningService.instance) {
      MiningService.instance = new MiningService();
    }
    return MiningService.instance;
  }

  // Mining Cooldown Check
  private async checkMiningCooldown(): Promise<{
    canMine: boolean;
    reason?: string;
    nextAvailableTime?: Date;
  }> {
    const COOLDOWN_KEY = '@aura50_last_mining_time';
    const COOLDOWN_DURATION = 120000; // 2 minutes (block window)

    try {
      const authToken = await AsyncStorage.getItem('@aura50_auth_token');

      if (!authToken) {
        // If not authenticated, allow local mining (demo mode)
        return { canMine: true };
      }

      const response = await fetch(`${config.baseUrl}/api/participation/can-participate`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        // SECURITY FIX: Check local cooldown cache when backend unavailable
        console.warn('Backend unavailable, checking local cooldown cache');
        return await this.checkLocalCooldown(COOLDOWN_KEY, COOLDOWN_DURATION);
      }

      const result = await response.json();

      if (!result.canParticipate && result.nextAvailableTime) {
        await AsyncStorage.setItem(COOLDOWN_KEY, result.nextAvailableTime.toString());
      }

      return {
        canMine: result.canParticipate || false,
        reason: result.reason,
        nextAvailableTime: result.nextAvailableTime ? new Date(result.nextAvailableTime) : undefined
      };
    } catch (error) {
      console.error('Error checking mining cooldown:', error);
      return await this.checkLocalCooldown(COOLDOWN_KEY, COOLDOWN_DURATION);
    }
  }

  // Check local cooldown cache when backend is unavailable
  private async checkLocalCooldown(
    key: string,
    cooldownDuration: number
  ): Promise<{ canMine: boolean; reason?: string; nextAvailableTime?: Date }> {
    try {
      const lastMiningTime = await AsyncStorage.getItem(key);

      if (!lastMiningTime) {
        // No previous mining recorded, allow but with caution
        console.warn('No local mining history, allowing one attempt');
        return { canMine: true, reason: 'Offline mode - limited mining' };
      }

      const lastTime = parseInt(lastMiningTime, 10);
      const now = Date.now();
      const timeSinceLastMining = now - lastTime;

      if (timeSinceLastMining < cooldownDuration) {
        const nextAvailable = new Date(lastTime + cooldownDuration);
        return {
          canMine: false,
          reason: 'Cooldown active (offline mode)',
          nextAvailableTime: nextAvailable
        };
      }

      return { canMine: true, reason: 'Cooldown expired (offline mode)' };
    } catch (error) {
      // If we can't read local storage, be conservative and deny
      console.error('Error checking local cooldown:', error);
      return { canMine: false, reason: 'Unable to verify cooldown status' };
    }
  }

  // Record successful mining for local cooldown
  async recordMiningSuccess(): Promise<void> {
    try {
      await AsyncStorage.setItem('@aura50_last_mining_time', Date.now().toString());
    } catch (error) {
      console.error('Error recording mining success:', error);
    }
  }

  // Mining Session Management
  async startMining(): Promise<boolean> {
    try {
      // Try to load wallet if not already loaded
      const walletExists = this.walletService.isWalletCreated();
      if (!walletExists) {
        console.warn('⚠️ Wallet not loaded, attempting to load from storage...');
        await this.walletService.loadHDWallet();
      }

      const wallet = this.walletService.getCurrentAccount();
      const user = this.walletService.getUser();

      if (!wallet) {
        console.error('❌ Mining failed: No wallet account found');
        throw new Error('No wallet account found. Please create or restore a wallet first.');
      }

      if (!user) {
        console.error('❌ Mining failed: No user found');
        throw new Error('No user found. Please login first.');
      }

      console.log('✅ Mining prerequisites checked:', { userId: user.id, walletAddress: wallet.address.substring(0, 12) });

      // Check mining cooldown with backend
      const cooldownCheck = await this.checkMiningCooldown();
      if (!cooldownCheck.canMine) {
        console.warn('⏰ Mining cooldown active:', cooldownCheck.reason);
        console.warn('   Next available:', cooldownCheck.nextAvailableTime);
        throw new Error(cooldownCheck.reason || 'Mining cooldown active');
      }

      // Check device capabilities
      const deviceMetrics = await this.getDeviceMetrics();
      if (!this.canStartMining(deviceMetrics)) {
        return false;
      }

      // Fetch current block info
      const blockId = await this.getCurrentBlockId();

      // Validate block info before starting
      if (!this.currentBlockInfo) {
        console.error('❌ Mining failed: Could not fetch block info');
        throw new Error('Could not fetch current block information');
      }

      // Log block info for debugging
      console.log('📦 MINING BLOCK INFO:', {
        blockId: this.currentBlockInfo.blockId?.substring(0, 8),
        height: this.currentBlockInfo.height,
        status: this.currentBlockInfo.status,
        difficulty: this.currentBlockInfo.difficulty,
        targetThreshold: this.currentBlockInfo.targetThreshold?.substring(0, 16) + '...',
        targetLength: this.currentBlockInfo.targetThreshold?.length,
        merkleRoot: this.currentBlockInfo.merkleRoot?.substring(0, 16),
        prevHash: this.currentBlockInfo.prevHash?.substring(0, 16),
      });

      // Validate target threshold
      if (!this.currentBlockInfo.targetThreshold || this.currentBlockInfo.targetThreshold.length !== 64) {
        console.warn('⚠️ Invalid targetThreshold from server, will calculate locally');
      }

      // Create mining session
      this.currentSession = {
        id: this.generateSessionId(),
        userId: user.id,
        blockId: blockId,
        startTime: new Date(),
        hashesComputed: 0,
        difficultyTarget: await this.getDifficultyTarget(),
        status: 'active'
      };

      // Reset counters for new block
      this.sessionHashCount = 0;
      this._rateWindowHashes = 0;
      this._rateWindowStart = 0;
      this.lastDebugLog = 0;
      this.lastBlockCheck = 0;

      // Set mining flag to active
      this.isMining = true;

      // Start mining loop
      this.startMiningLoop();

      // Save session
      await this.saveMiningSession(this.currentSession);

      console.log('⛏️ Mining started:', {
        sessionId: this.currentSession.id,
        blockId: blockId.substring(0, 8),
        difficulty: this.currentBlockInfo.difficulty,
        expectedTime: `~${Math.round((this.currentBlockInfo.difficulty || 700000) / 25000)}s at 25K H/s`
      });
      return true;

    } catch (error) {
      console.error('Failed to start mining:', error);
      return false;
    }
  }

  async stopMining(): Promise<void> {
    // Stop mining flag FIRST (prevents any new/running iterations)
    this.isMining = false;

    // Stop mining timer immediately (clearTimeout works for both setTimeout and setInterval)
    if (this.miningTimer) {
      BackgroundTimer.clearTimeout(this.miningTimer);
      this.miningTimer = null;
    }

    // Remove WebSocket block-change listener
    if (this.blockChangeListener) {
      NetworkService.getInstance().off('newBlock', this.blockChangeListener);
      this.blockChangeListener = null;
    }

    // Only process session cleanup if session exists
    if (!this.currentSession) {
      return;
    }

    // Capture session for cleanup (before setting to null)
    const sessionToSave = this.currentSession;

    // Clear session reference BEFORE async operations
    // This ensures any lingering callbacks exit immediately
    this.currentSession = null;

    // Finalize and save the completed session
    sessionToSave.endTime = new Date();
    sessionToSave.status = 'completed';

    try {
      await this.saveMiningSession(sessionToSave);
      console.log('⏹️ Mining stopped:', sessionToSave.id);
    } catch (error) {
      console.error('Error saving final mining session:', error);
    }
  }

  // ── Mining loop — threaded (react-native-multithreading) with Expo Go fallback ──
  private startMiningLoop(): void {
    // Register WebSocket block-change listener (same for both paths)
    const network = NetworkService.getInstance();
    const miningBlockId = this.currentSession?.blockId;

    this.blockChangeListener = (newBlock: any) => {
      if (!this.isMining || !this.currentSession) return;
      const blockChanged   = newBlock?.id && newBlock.id !== this.currentSession.blockId;
      const blockFinalized = newBlock?.status === 'final';
      if (blockChanged || blockFinalized) {
        console.log('🔔 WebSocket: Block change detected while mining', {
          reason: blockChanged ? 'new block opened' : 'block finalized',
          newId: String(newBlock?.id ?? '').substring(0, 8),
          ourId: this.currentSession.blockId?.substring(0, 8),
        });
        this.stopMining().then(() => {
          setTimeout(async () => {
            const restarted = await this.startMining();
            if (restarted) console.log('✅ Mining restarted via WebSocket block notification');
          }, 2000);
        });
      }
    };
    network.on('newBlock', this.blockChangeListener);
    console.log('🔔 Block-change listener registered for session', miningBlockId?.substring(0, 8));

    // Try threaded path first, fall back to timer if unavailable (Expo Go)
    try {
      const { spawnThread } = require('react-native-multithreading');
      const { miningBatchWorklet } = require('./MiningHashWorklet');
      console.log('⚡ Using threaded mining (react-native-multithreading)');
      this.runThreadedMiningLoop(spawnThread, miningBatchWorklet);
    } catch (_) {
      console.warn('⚠️ react-native-multithreading unavailable — using Expo Go fallback (low-rate)');
      this.runFallbackMiningLoop();
    }
  }

  // ── Threaded path: each batch runs on a dedicated background thread ──────────
  // The JS thread awaits spawnThread but is NOT blocked — Hermes schedules other
  // work (React renders, WS events) while the background thread computes hashes.
  private async runThreadedMiningLoop(spawnThread: any, miningBatchWorklet: any): Promise<void> {
    const BATCH_SIZE = 10_000; // ~20-50ms per thread on mid-range Android; safe interval

    while (this.isMining && this.currentSession) {
      const blockData = await this.getBlockData();
      if (!this.isMining || !this.currentSession) break;

      const difficulty      = this.currentBlockInfo?.difficulty || 1_500_000;
      const targetThreshold = this.currentBlockInfo?.targetThreshold ||
                              this.calculateTargetThreshold(difficulty);

      let result: { found: boolean; hash: string; nonce: number; count: number };
      try {
        // Capture primitives into the closure — they are copied to the thread
        const _blockData       = blockData;
        const _targetThreshold = targetThreshold;
        const _batchSize       = BATCH_SIZE;
        result = await spawnThread(() => {
          'worklet';
          return miningBatchWorklet(_blockData, _targetThreshold, _batchSize);
        });
      } catch (err) {
        console.warn('Thread error, retrying:', err);
        continue;
      }

      if (!this.isMining || !this.currentSession) break;

      this.currentSession.hashesComputed += result.count;
      this.sessionHashCount              += result.count;
      this._rateWindowHashes             += result.count;
      this.updateHashRate();

      if (result.found) {
        console.log(`✅ Valid hash found on background thread! (after ${this.currentSession.hashesComputed} total)`);
        await this.submitMiningProof(result.hash, result.nonce);
      }

      // Throttle / pause for critical battery or temperature (threaded-path version)
      const metricsAge = Date.now() - this.lastDeviceMetricsCheck;
      if (metricsAge > 7000) {
        this.lastDeviceMetricsCheck = Date.now();
        const metrics = await this.getDeviceMetrics();
        if (!this.isMining || !this.currentSession) break;
        const newInterval = await this.calculateMiningInterval(metrics);
        if (newInterval === null) {
          this.pauseMining();
          console.log('⚠️ Threaded mining paused: critical battery/temp');
          break;
        }
        // For low-battery: sleep proportionally so hash rate drops like the fallback timer would
        if (newInterval > 500) {
          await new Promise<void>(res => setTimeout(res, newInterval - 500));
        }
      }
    }
    console.log('⛏️ Threaded mining loop exited');
  }

  // ── Main mining loop: self-scheduling setTimeout ────────────────────────────
  // Uses recursive setTimeout (NOT setInterval) so the next tick is only
  // scheduled AFTER the current batch finishes — no overlapping callbacks.
  // Each tick: 300 hashes (~3ms on slow Android) then 50ms pause → UI stays
  // responsive and the JS thread is never blocked for more than ~3ms at a time.
  private runFallbackMiningLoop(): void {
    // Prefer react-native-quick-crypto (native JSI, ~50K-200K H/s) over pure-JS sha256 (~2-5K H/s)
    let hashFn: (data: string) => string;
    try {
      const QuickCrypto = require('react-native-quick-crypto');
      // Verify it works (throws if native module not linked)
      QuickCrypto.createHash('sha256').update('probe').digest('hex');
      hashFn = (data: string) => {
        const h = QuickCrypto.createHash('sha256');
        h.update(data);
        return h.digest('hex');
      };
      console.log('⚡ Fallback loop: using react-native-quick-crypto (native SHA-256)');
    } catch {
      const { sha256: jsSha256 } = require('js-sha256');
      hashFn = jsSha256;
      console.log('⚠️ Fallback loop: using js-sha256 (pure JS, lower hash rate)');
    }

    const BATCH = 300; // hashes per tick — keeps JS thread free for UI
    const PAUSE = 50;  // ms to yield after each batch

    const tick = () => {
      if (!this.isMining || !this.currentSession) return; // exit if stopped

      const difficulty      = this.currentBlockInfo?.difficulty || 1_500_000;
      const targetThreshold = this.currentBlockInfo?.targetThreshold ||
                              this.calculateTargetThreshold(difficulty);
      // Convert timestamp to milliseconds number (same as getBlockData()) to ensure
      // it matches the server's validation format regardless of how the server serialised it.
      const rawTs = this.currentBlockInfo?.timestamp;
      const tsNumber = typeof rawTs === 'number' ? rawTs : (rawTs ? new Date(rawTs).getTime() : 0);
      const blockData = this.currentBlockInfo
        ? `${this.currentBlockInfo.height}|${this.currentBlockInfo.prevHash}|${this.currentBlockInfo.merkleRoot}|${tsNumber}`
        : '';

      if (blockData) {
        let found = false;
        for (let i = 0; i < BATCH && !found; i++) {
          const nonce = Math.floor(Math.random() * 100_000_000);
          const hash  = hashFn(blockData + '|' + nonce.toString()) as string;
          this.sessionHashCount++;
          this._rateWindowHashes++;
          if (this.currentSession) this.currentSession.hashesComputed++;
          if (hash <= targetThreshold && this.currentSession) {
            found = true;
            this.submitMiningProof(hash, nonce);
          }
        }
        this.updateHashRate();
      }

      // Schedule next tick only after this one is done (prevents overlap)
      this.miningTimer = BackgroundTimer.setTimeout(tick, PAUSE);
    };

    // Kick off the first tick
    this.miningTimer = BackgroundTimer.setTimeout(tick, 0);
  }

  // BATTERY OPTIMIZATION: Adaptive Mining Interval
  private async calculateMiningInterval(metrics: DeviceMetrics): Promise<number | null> {
    // Stop mining if battery critical
    if (metrics.batteryLevel < 20) {
      return null; // Stop completely
    }

    // Base interval calculation optimized for high performance
    let interval = 500; // 500ms default (2 MH/s with yielding)

    // Battery level adjustments
    if (metrics.batteryLevel < 50 && !metrics.isCharging) {
      interval = 1500; // 1.5s - low battery (slower but still mining)
    } else if (metrics.isCharging) {
      interval = 300; // 300ms - charging (maximum performance: ~3.3 MH/s)
    } else {
      interval = 500; // 500ms - normal battery (high performance: ~2 MH/s)
    }

    // CPU temperature throttling (prevent overheating)
    if (this.cpuTemperature > 40) {
      interval += 3000; // Add 3s delay if hot
    } else if (this.cpuTemperature > 45) {
      interval += 6000; // Add 6s delay if very hot
    } else if (this.cpuTemperature > 50) {
      return null; // Stop if critical temperature
    }

    // Screen state optimization
    if (this.screenState === 'off') {
      interval += 3000; // Reduce activity when screen off
    }

    // Network type optimization
    if (metrics.networkType === '2G') {
      interval += 5000; // Slower on 2G
    }

    return interval;
  }

  // Dynamically adjust mining interval (fallback/timer path only)
  private async adjustMiningInterval(): Promise<void> {
    // Only relevant in the timer-based fallback path
    if (!this.currentSession || !this.isMining) {
      return;
    }
    // No timer means we're in the threaded path — handled inline in runThreadedMiningLoop
    if (!this.miningTimer) {
      return;
    }

    const metrics = await this.getDeviceMetrics();
    const newInterval = await this.calculateMiningInterval(metrics);

    // Double-check mining is still active after async operation
    if (!this.isMining || !this.currentSession) {
      return;
    }

    // Stop mining if interval is null (critical battery / temperature)
    if (newInterval === null) {
      this.pauseMining();
      console.log('Mining paused due to critical conditions');
    }
  }

  // Track last debug log time
  private lastDebugLog: number = 0;

  private async performMiningWork(): Promise<void> {
    // CRITICAL: Double-check both isMining flag AND session existence
    // This prevents race conditions when stopMining() is called
    if (!this.isMining || !this.currentSession) {
      return; // Silent return - don't spam logs
    }

    try {
      // Only update device metrics every 7 seconds (reduces overhead and battery usage)
      const now = Date.now();
      const DEVICE_METRICS_INTERVAL = 7000; // 7 seconds (middle of 5-10s range)
      const BLOCK_CHECK_INTERVAL = 60000; // Safety-net HTTP poll — WebSocket listener handles fast path
      const DEBUG_LOG_INTERVAL = 30000; // Debug log every 30 seconds

      if (now - this.lastDeviceMetricsCheck >= DEVICE_METRICS_INTERVAL) {
        // Update CPU temperature (simulate - in production would use native module)
        await this.updateCPUTemperature();

        // Check battery and dynamically adjust mining interval
        await this.adjustMiningInterval();

        this.lastDeviceMetricsCheck = now;
      }

      // DEBUG: Log mining state every 30 seconds
      if (now - this.lastDebugLog >= DEBUG_LOG_INTERVAL) {
        this.lastDebugLog = now;
        const session = this.currentSession;
        if (session && this.currentBlockInfo) {
          const elapsedSec = (now - session.startTime.getTime()) / 1000;
          const hashRate = session.hashesComputed / elapsedSec;
          console.log('📊 MINING DEBUG:', {
            blockId: this.currentBlockInfo.blockId?.substring(0, 8),
            blockHeight: this.currentBlockInfo.height,
            blockStatus: this.currentBlockInfo.status,
            difficulty: this.currentBlockInfo.difficulty,
            targetThreshold: this.currentBlockInfo.targetThreshold?.substring(0, 16) + '...',
            hashesComputed: session.hashesComputed.toLocaleString(),
            elapsedSec: elapsedSec.toFixed(0),
            hashRate: hashRate.toFixed(0) + ' H/s',
            expectedHashes: this.currentBlockInfo.difficulty?.toLocaleString(),
            progress: ((session.hashesComputed / (this.currentBlockInfo.difficulty || 700000)) * 100).toFixed(1) + '%',
          });
        }
      }

      // CRITICAL FIX: Check if block is still valid every 5 seconds (faster detection!)
      if (now - this.lastBlockCheck >= BLOCK_CHECK_INTERVAL) {
        this.lastBlockCheck = now;
        console.log('🔍 Checking block status...');
        const blockStillValid = await this.checkBlockStatus();
        if (!blockStillValid) {
          console.log('🔄 Block changed or finalized - restarting mining on new block...');
          await this.stopMining();
          // Auto-restart on new block after short delay
          setTimeout(async () => {
            const restarted = await this.startMining();
            if (restarted) {
              console.log('✅ Mining restarted on new block');
            }
          }, 2000);
          return;
        } else {
          console.log('✅ Block still valid, continuing mining...');
        }
      }

      const HASHES_PER_ITERATION = 100000; // original — async expo-crypto, ~25 kH/s

      // NUMERIC TARGET: Get target threshold from server (or calculate from difficulty)
      // difficulty = average attempts needed, target = MAX_HASH / difficulty
      const difficulty = this.currentBlockInfo?.difficulty || 700000; // 1.5M hashes avg
      const targetThreshold = this.currentBlockInfo?.targetThreshold || this.calculateTargetThreshold(difficulty);

      // Validate target threshold
      if (!targetThreshold || targetThreshold.length !== 64) {
        console.error('❌ Invalid targetThreshold:', targetThreshold?.substring(0, 20));
        console.log('⚠️ Using fallback calculation...');
      }

      const blockData = await this.getBlockData();
      let foundValidHash = false;

      // Capture session reference to avoid null access in loop
      const session = this.currentSession;
      if (!session) {
        return;
      }

      // DEBUG: Log sample hash every cycle
      let sampleHash = '';
      let sampleNonce = 0;
      let batchCount = 0; // accumulate locally — single write to session after loop

      for (let i = 0; i < HASHES_PER_ITERATION && !foundValidHash; i++) {
        // Check if mining was stopped - exit immediately without logging spam
        if (!this.isMining || !this.currentSession) {
          if (this.currentSession) this.currentSession.hashesComputed += batchCount;
          return; // Clean exit - timer will be cleared by stopMining()
        }

        const nonce = Math.floor(Math.random() * 100000000);
        const hash = await this.computeHash(blockData, nonce.toString()); // ASYNC - expo-crypto

        // Capture first hash for debugging
        if (i === 0) {
          sampleHash = hash;
          sampleNonce = nonce;
        }

        batchCount++; // local counter — avoids N writes to the session object per cycle
        this.sessionHashCount++; // persistent — survives session clearing, counts ALL concurrent loops
        this._rateWindowHashes++;

        // NUMERIC TARGET COMPARISON: hash must be <= targetThreshold
        if (this.hashMeetsTarget(hash, targetThreshold) && this.currentSession) {
          this.currentSession.hashesComputed += batchCount; // single write on success
          console.log(`✅ Valid hash found! Hash: ${hash} (after ${this.currentSession.hashesComputed} attempts)`);
          await this.submitMiningProof(hash, nonce);
          foundValidHash = true;
        }
      }

      // Single write for the full batch (no valid hash found this cycle)
      if (!foundValidHash && this.currentSession) {
        this.currentSession.hashesComputed += batchCount;
      }

      // DEBUG: Log sample hash comparison every iteration
      if (sampleHash && this.currentSession?.hashesComputed % 500000 < HASHES_PER_ITERATION) {
        console.log('🔬 Sample hash comparison:', {
          sampleHash: sampleHash.substring(0, 16) + '...',
          target: targetThreshold.substring(0, 16) + '...',
          hashMeetsTarget: this.hashMeetsTarget(sampleHash, targetThreshold),
          comparison: sampleHash.substring(0, 8) + ' vs ' + targetThreshold.substring(0, 8),
        });
      }

      // Check if session still exists before accessing it
      if (!this.currentSession || !this.isMining) {
        return;
      }

      // Update hash rate
      this.updateHashRate();

      // Save progress every 10 hashes
      if (this.currentSession && this.currentSession.hashesComputed % 10 === 0) {
        await this.saveMiningSession(this.currentSession);
      }

    } catch (error) {
      // Only log errors if we're still actively mining (not during cleanup)
      if (this.isMining) {
        console.error('Mining work error:', error);
      }
    }
  }

  // CPU Temperature Monitoring (Battery Protection)
  private async updateCPUTemperature(): Promise<void> {
    try {
      // Skip if not actively mining
      if (!this.isMining) {
        this.cpuTemperature = Math.max(25, this.cpuTemperature - 1);
        return;
      }

      // In production, this would use a native module to get actual CPU temp
      // For now, simulate based on mining activity and battery
      const metrics = await this.getDeviceMetrics();

      // Capture session reference safely
      const session = this.currentSession;

      // Simulate temperature increase during mining
      if (session && this.isMining) {
        const sessionDuration = Date.now() - session.startTime.getTime();
        const minutesMining = sessionDuration / (1000 * 60);

        // Temperature rises over time, cools when charging
        let tempEstimate = 25 + (minutesMining * 2); // Base + 2°C per minute

        if (metrics.isCharging) {
          tempEstimate += 5; // Charging adds heat
        }

        if (metrics.batteryLevel < 30) {
          tempEstimate += 3; // Low battery adds heat
        }

        // Cap at realistic maximum
        this.cpuTemperature = Math.min(tempEstimate, 55);
      } else {
        // Cool down when not mining
        this.cpuTemperature = Math.max(25, this.cpuTemperature - 1);
      }

      // TODO: In production, replace with actual temperature sensor:
      // const temp = await NativeModules.DeviceTemp.getCPUTemperature();
      // this.cpuTemperature = temp;

    } catch (error) {
      // Only log if actively mining
      if (this.isMining) {
        console.error('Failed to update CPU temperature:', error);
      }
      this.cpuTemperature = 30; // Safe default
    }
  }

  // Mobile-Specific Optimizations
  private async adjustMiningIntensity(metrics: DeviceMetrics): Promise<void> {
    // Smart mining intensity based on multiple factors

    // CRITICAL: Stop if battery critical or overheating
    if ((metrics.batteryLevel < 20 && !metrics.isCharging) || this.cpuTemperature > 50) {
      this.pauseMining();
      return;
    }

    // ADAPTIVE: Adjust based on conditions
    if (metrics.batteryLevel < 50 && !metrics.isCharging) {
      this.isLowPowerMode = true; // Minimal mining
    } else if (metrics.isCharging) {
      this.isLowPowerMode = false; // Maximum mining when charging
    } else {
      this.isLowPowerMode = false; // Normal mining
    }

    // NETWORK: Reduce activity on slow networks
    if (metrics.networkType === '2G') {
      this.isLowPowerMode = true; // Treat like low power mode
    }
  }

  // Screen state tracking (for background optimization)
  public setScreenState(state: 'on' | 'off'): void {
    this.screenState = state;
    console.log(`Screen state changed to: ${state}`);

    // Adjust mining interval when screen state changes
    if (this.currentSession) {
      this.adjustMiningInterval();
    }
  }

  private pauseMining(): void {
    if (this.miningTimer) {
      BackgroundTimer.clearInterval(this.miningTimer);
      this.miningTimer = null;
    }
  }

  private resumeMining(): void {
    if (!this.miningTimer && this.currentSession) {
      this.startMiningLoop();
    }
  }

  // Device Metrics and Capabilities
  async getDeviceMetrics(): Promise<DeviceMetrics> {
    try {
      // Try to get real device metrics, use safe defaults if unavailable
      let batteryLevel = 80; // Default: 80% battery
      let isCharging = false;
      let totalMemory = 4 * 1024 * 1024 * 1024; // Default: 4GB
      let usedMemory = 2 * 1024 * 1024 * 1024; // Default: 2GB used

      try {
        batteryLevel = (await DeviceInfo.getBatteryLevel()) * 100;
      } catch (e) {
        console.log('ℹ️ Using default battery level (80%)');
      }

      try {
        isCharging = await DeviceInfo.isBatteryCharging();
      } catch (e) {
        console.log('ℹ️ Using default charging status (not charging)');
      }

      try {
        totalMemory = await DeviceInfo.getTotalMemory();
        usedMemory = await DeviceInfo.getUsedMemory();
      } catch (e) {
        console.log('ℹ️ Using default memory values (50% usage)');
      }

      const metrics = {
        batteryLevel,
        isCharging,
        networkType: '4G' as const, // Would be detected from network service
        storageUsed: 0, // Would be calculated
        memoryUsage: (usedMemory / totalMemory) * 100,
        cpuUsage: 0, // Would be monitored
        cpuTemperature: this.cpuTemperature
      };

      console.log('📱 Device metrics:', {
        battery: `${metrics.batteryLevel.toFixed(0)}%`,
        charging: metrics.isCharging ? 'YES' : 'NO',
        memory: `${metrics.memoryUsage.toFixed(0)}%`,
        temp: `${metrics.cpuTemperature}°C`,
        canMine: metrics.batteryLevel >= 15 || metrics.isCharging
      });

      return metrics;
    } catch (error) {
      console.error('Failed to get device metrics, using safe defaults:', error);
      // Return safe default values that allow mining
      return {
        batteryLevel: 80,
        isCharging: false,
        networkType: 'WiFi' as const,
        storageUsed: 0,
        memoryUsage: 50,
        cpuUsage: 0,
        cpuTemperature: 25
      };
    }
  }

  private canStartMining(metrics: DeviceMetrics): boolean {
    // Don't mine if battery is critically low
    if (metrics.batteryLevel < 15 && !metrics.isCharging) {
      return false;
    }

    // Don't mine if memory usage is too high
    if (metrics.memoryUsage > 90) {
      return false;
    }

    return true;
  }

  // NUMERIC TARGET: Calculate target threshold from difficulty
  // target = MAX_HASH / difficulty (as hex string)
  private calculateTargetThreshold(difficulty: number): string {
    // Validate difficulty
    if (!difficulty || difficulty <= 0 || !Number.isFinite(difficulty)) {
      difficulty = 700000; // Default to 2M
    }

    try {
      // Use BigInt for precise calculation (supported in React Native 0.64+)
      const MAX_HASH = BigInt('0x' + 'f'.repeat(64));
      const targetValue = MAX_HASH / BigInt(Math.floor(difficulty));
      return targetValue.toString(16).padStart(64, '0');
    } catch (error) {
      // Fallback for older React Native: use precise string division
      // For difficulty D, target = (2^256-1) / D
      // We can compute this by dividing the hex string manually
      console.warn('BigInt not available, using fallback calculation');
      return this.calculateTargetFallback(difficulty);
    }
  }

  // Fallback target calculation without BigInt
  private calculateTargetFallback(difficulty: number): string {
    // Use logarithms to compute approximate target position
    // target = MAX_HASH / difficulty
    // log2(target) = 256 - log2(difficulty)
    const log2Target = 256 - Math.log2(difficulty);
    const hexDigits = Math.floor(log2Target / 4);
    const remainder = log2Target % 4;

    // Build target: leading zeros + first significant nibble + trailing f's
    const leadingZeros = 64 - hexDigits - 1;
    const firstNibble = Math.floor(Math.pow(2, remainder)).toString(16);
    const trailingFs = 'f'.repeat(Math.max(0, hexDigits));

    return '0'.repeat(Math.max(0, leadingZeros)) + firstNibble + trailingFs;
  }

  // NUMERIC TARGET: Check if hash meets target (hash <= target)
  private hashMeetsTarget(hash: string, targetThreshold: string): boolean {
    // Validate inputs
    if (!hash || !targetThreshold) {
      return false;
    }

    try {
      // Use BigInt for precise comparison (preferred)
      const hashValue = BigInt('0x' + hash.toLowerCase());
      const targetValue = BigInt('0x' + targetThreshold.toLowerCase());
      return hashValue <= targetValue;
    } catch (error) {
      // Fallback: lexicographic string comparison (works for same-length hex)
      const normalizedHash = hash.toLowerCase().padStart(64, '0').substring(0, 64);
      const normalizedTarget = targetThreshold.toLowerCase().padStart(64, '0').substring(0, 64);
      return normalizedHash <= normalizedTarget;
    }
  }

  // Crypto Operations (Mobile-Optimized)
  private async computeHash(data: string, nonce: string): Promise<string> {
    // REVERTED: Back to async expo-crypto (it was actually faster!)
    // Server expects: height|prevHash|merkleRoot|timestamp|nonce
    const Crypto = require('expo-crypto');

    // Add pipe separator before nonce to match server format
    const input = data + '|' + nonce;

    try {
      // Use async SHA-256 (expo-crypto is optimized for React Native)
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        input
      );
      return hash; // Returns lowercase hex string
    } catch (error) {
      console.error('Hash computation error:', error);
      // Fallback to simple hash if crypto fails (should never happen)
      let hash = 0;
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16).padStart(8, '0');
    }
  }

  private async submitMiningProof(hash: string, nonce: number): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      const wallet = this.walletService.getCurrentAccount();
      const user = this.walletService.getUser();

      if (!wallet || !user) {
        console.error('❌ Cannot submit proof: No wallet or user');
        return;
      }

      // Use difficulty from server (stored in currentBlockInfo)
      // NUMERIC TARGET: 2,000,000 = ~2M hashes average
      const difficulty = this.currentBlockInfo?.difficulty || 700000;

      // Calculate hash rate data for security detection
      const timeElapsed = Date.now() - this.currentSession.startTime.getTime();
      const hashesComputed = this.sessionHashCount; // all concurrent loops counted
      const hashRate = Math.round(hashesComputed / (timeElapsed / 1000));

      console.log('📊 Mining performance:', {
        hashesComputed,
        timeElapsed: `${(timeElapsed / 1000).toFixed(1)}s`,
        hashRate: `${hashRate.toLocaleString()} H/s`,
      });

      // Submit share to decentralized block (for A50 rewards)
      const shareResult = await this.networkService.submitMiningShare({
        blockId: this.currentSession.blockId,
        nonce: nonce, // Already a number
        hash,
        difficulty,
        hashesComputed,  // For hash rate anomaly detection
        timeElapsed,     // For hash rate anomaly detection
      });

      if (shareResult.accepted) {
        console.log('✅ Mining share accepted! Block height:', shareResult.blockHeight);
        console.log('   Participants in block:', shareResult.acceptedShares);
        console.log('   Reward will be distributed when block settles (every 2 min)');

        // Record successful mining for local cooldown cache
        await this.recordMiningSuccess();

        // Schedule a notification for when the per-block cooldown (forge limit) resets.
        // The cooldown window matches COOLDOWN_DURATION in checkMiningCooldown (120 000 ms).
        const MINING_COOLDOWN_DURATION = 120000; // 2 minutes — keep in sync with checkMiningCooldown
        const resetTimestamp = Date.now() + MINING_COOLDOWN_DURATION;
        NotificationService.getInstance()
          .scheduleLimitResetNotification(resetTimestamp)
          .catch(() => { /* non-critical — ignore notification errors */ });

        // STOP mining for current block (already submitted our share)
        console.log('⏸️ Stopping mining - waiting for next block...');

        // Store current block ID BEFORE stopping (session will be cleared)
        const currentBlockId = this.currentSession.blockId;

        await this.stopMining();

        // Sync balance immediately
        this.walletService.syncBalanceFromBackend().then((result) => {
          if (result.success) {
            console.log('✅ Balance synced after mining:', result.balance);
          }
        }).catch(err => console.error('Balance sync error:', err));

        // Sync mining history
        this.syncMiningHistory().then((result) => {
          if (result.success) {
            console.log('✅ Mining history synced:', result.blockCount, 'blocks');
          }
        }).catch(err => console.error('History sync error:', err));

        // EVENT-DRIVEN: wait for WebSocket push instead of polling every 10 s
        console.log('🔔 Waiting for new block via WebSocket push...');
        const network = NetworkService.getInstance();

        let resolved = false;
        const onNewBlock = async (newBlock: any) => {
          if (resolved || newBlock?.id === currentBlockId) return;
          resolved = true;
          clearTimeout(fallbackTimer);
          network.off('newBlock', onNewBlock);

          console.log('🆕 New block pushed via WebSocket!', String(newBlock?.id ?? '').substring(0, 8));
          // NOTE: balance/history sync is NOT done here intentionally.
          // Rewards are only distributed at block settlement (~2 min), not on new block open.
          // Syncing here for 2M users would produce ~33K API calls/sec with no benefit.
          // Balance was already synced right after share acceptance above.
          // Users can pull-to-refresh for the latest balance at any time.

          console.log('🔄 Auto-restarting mining on new block...');
          const restarted = await this.startMining();
          if (restarted) {
            console.log('✅ Continuous mining resumed on new block');
          } else {
            console.error('❌ Failed to restart continuous mining');
          }
        };

        network.on('newBlock', onNewBlock);

        // Safety fallback: if WebSocket never fires, poll once after 3 minutes
        const fallbackTimer = setTimeout(async () => {
          if (resolved) return;
          resolved = true;
          network.off('newBlock', onNewBlock);
          console.log('⚠️ WebSocket fallback: polling once after 3 minutes');
          const newBlockId = await this.getCurrentBlockId();
          if (newBlockId !== currentBlockId) {
            await this.startMining();
          }
        }, 3 * 60 * 1000);

      } else {
        // Share was rejected - handle different rejection reasons
        const reason = shareResult.reason || shareResult.message || '';

        // Case 1: User already submitted share for this block
        if (reason.toLowerCase().includes('already submitted')) {
          console.log('⏸️ Already submitted share for this block - waiting for next block...');

          // Store current block ID BEFORE stopping (session will be cleared)
          const currentBlockId = this.currentSession?.blockId;

          // Stop current mining
          await this.stopMining();

          // EVENT-DRIVEN: wait for WebSocket push instead of polling every 10 s
          console.log('🔔 Waiting for new block via WebSocket push...');
          const network = NetworkService.getInstance();

          let resolvedAlt = false;
          const onNewBlockAlt = async (newBlock: any) => {
            if (resolvedAlt || newBlock?.id === currentBlockId) return;
            resolvedAlt = true;
            clearTimeout(fallbackTimerAlt);
            network.off('newBlock', onNewBlockAlt);

            console.log('🆕 New block pushed via WebSocket!', String(newBlock?.id ?? '').substring(0, 8));
            await this.walletService.syncBalanceFromBackend();
            await this.syncMiningHistory();

            console.log('🔄 Auto-restarting mining on new block...');
            const restarted = await this.startMining();
            if (restarted) {
              console.log('✅ Continuous mining resumed on new block');
            } else {
              console.error('❌ Failed to restart continuous mining');
            }
          };

          network.on('newBlock', onNewBlockAlt);

          // Safety fallback: if WebSocket never fires, poll once after 3 minutes
          const fallbackTimerAlt = setTimeout(async () => {
            if (resolvedAlt) return;
            resolvedAlt = true;
            network.off('newBlock', onNewBlockAlt);
            console.log('⚠️ WebSocket fallback: polling once after 3 minutes');
            const newBlockId = await this.getCurrentBlockId();
            if (newBlockId !== currentBlockId) {
              await this.walletService.syncBalanceFromBackend();
              await this.syncMiningHistory();
              await this.startMining();
            }
          }, 3 * 60 * 1000);

        // Case 2: Block is final or not accepting shares
        } else if (reason.toLowerCase().includes('block is final') || reason.toLowerCase().includes('not accepting shares')) {
          console.log('🔄 Block finalized - will restart mining on new block');

          // Stop current mining
          await this.stopMining();

          // IMPORTANT: Restart mining AFTER current work loop iteration completes
          // Using setTimeout ensures we're outside the current call stack
          setTimeout(async () => {
            // Wait for new block to be available
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Restart mining (will fetch new block automatically)
            const restarted = await this.startMining();
            if (restarted) {
              console.log('✅ Mining restarted on new block');
            } else {
              console.error('❌ Failed to restart mining - check device metrics');
            }
          }, 100); // Short delay to exit current call stack

        // Case 3: Other rejection reasons (just warn)
        } else {
          console.warn('❌ Mining share rejected:', reason);
        }
      }

    } catch (error) {
      console.error('Failed to submit mining share:', error);
    }
  }

  // Network Integration
  private currentBlockInfo: any = null; // Store full block info for hash calculation

  private async getCurrentBlockId(): Promise<string> {
    try {
      const token = await AsyncStorage.getItem('@aura50_auth_token');

      if (!token) {
        console.error('❌ No auth token found - cannot get current block');
        return `block_${Date.now()}`;
      }

      const response = await fetch(`${config.baseUrl}/api/blocks/current`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Got current block:', data.blockId);
        // Store full block info for hash calculation
        this.currentBlockInfo = data;
        return data.blockId;
      } else {
        console.error('Failed to fetch current block:', response.status);
        return `block_${Date.now()}`;
      }
    } catch (error) {
      console.error('Error fetching current block:', error);
      return `block_${Date.now()}`;
    }
  }

  /**
   * Check if the current block we're mining on is still valid
   * Returns false if block is finalized or a new block is available
   */
  private async checkBlockStatus(): Promise<boolean> {
    if (!this.currentSession || !this.currentBlockInfo) {
      console.log('⚠️ checkBlockStatus: No session or block info');
      return false;
    }

    try {
      const token = await AsyncStorage.getItem('@aura50_auth_token');

      if (!token) {
        console.log('⚠️ checkBlockStatus: No auth token');
        return true; // Can't check, assume valid
      }

      const response = await fetch(`${config.baseUrl}/api/blocks/current`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();

        // DEBUG: Log what we received
        console.log('🔍 Block status response:', {
          serverBlockId: data.blockId?.substring(0, 8),
          ourBlockId: this.currentSession.blockId?.substring(0, 8),
          serverStatus: data.status,
          serverHeight: data.height,
        });

        // Check if block changed (new block created)
        if (data.blockId !== this.currentSession.blockId) {
          console.log(`📢 BLOCK CHANGED! Mining wrong block!`);
          console.log(`   Old block: ${this.currentSession.blockId?.substring(0, 8)} (height: ${this.currentBlockInfo.height})`);
          console.log(`   New block: ${data.blockId?.substring(0, 8)} (height: ${data.height})`);
          // PRE-UPDATE: Store new block info so restart uses fresh data
          this.currentBlockInfo = data;
          return false;
        }

        // Check if our block is finalized
        if (data.status === 'final') {
          console.log(`📢 Block FINALIZED! Height: ${data.height}`);
          console.log(`   Need to wait for new block...`);
          return false;
        }

        // Check if block is 'confirmed' but not yet 'final' - still valid but close
        if (data.status === 'confirmed') {
          const blockAge = Date.now() - new Date(data.timestamp).getTime();
          console.log(`⏳ Block confirmed, ${Math.floor((120000 - blockAge) / 1000)}s until settlement`);
        }

        // Update block info in case difficulty or other params changed
        this.currentBlockInfo = data;
        return true;
      } else {
        console.error('❌ Block status check failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Block status check error:', error);
    }

    return true; // Assume valid on error
  }

  private async getDifficultyTarget(): Promise<string> {
    // NUMERIC TARGET: Get from server or calculate from difficulty
    const difficulty = this.currentBlockInfo?.difficulty || 700000;
    return this.currentBlockInfo?.targetThreshold || this.calculateTargetThreshold(difficulty);
  }

  private async getBlockData(): Promise<string> {
    // CRITICAL: Must match server format exactly!
    // Server expects: `${block.height}|${block.prevHash}|${block.merkleRoot}|${block.timestamp}|${nonce}`
    // Note: nonce is added later during mining (with the pipe added by computeHash)
    if (!this.currentBlockInfo) {
      console.error('❌ No block info available for hash calculation');
      return '';
    }

    // CRITICAL FIX: Convert timestamp to number (milliseconds since epoch)
    // Server uses timestamp as number, not Date string!
    let timestamp = this.currentBlockInfo.timestamp;
    if (typeof timestamp !== 'number') {
      // If it's a Date object or string, convert to milliseconds
      timestamp = new Date(timestamp).getTime();
    }

    // Return WITHOUT trailing pipe - computeHash will add it
    return `${this.currentBlockInfo.height}|${this.currentBlockInfo.prevHash}|${this.currentBlockInfo.merkleRoot}|${timestamp}`;
  }

  // Statistics and Monitoring
  private updateHashRate(): void {
    if (!this.currentSession || !this.isMining) return;
    const now = Date.now();
    if (this._rateWindowStart === 0) this._rateWindowStart = now;
    const windowMs = now - this._rateWindowStart;
    if (windowMs >= 2000) { // sample every 2 s for a fresh current rate
      this.hashesPerSecond = (this._rateWindowHashes / windowMs) * 1000;
      this._rateWindowHashes = 0;
      this._rateWindowStart  = now;
    }
  }

  getMiningStats(): {
    isActive: boolean;
    hashRate: number;
    sessionDuration: number;
    totalHashes: number;
    estimatedReward: string;
    cpuTemperature: number;
    miningInterval: number;
    batteryImpact: string;
  } {
    if (!this.currentSession) {
      return {
        isActive: false,
        hashRate: 0,
        sessionDuration: 0,
        totalHashes: 0,
        estimatedReward: '0',
        cpuTemperature: this.cpuTemperature,
        miningInterval: 0,
        batteryImpact: '0% per hour'
      };
    }

    const duration = Date.now() - this.currentSession.startTime.getTime();
    const estimatedReward = this.calculateEstimatedReward();
    const batteryImpact = this.calculateBatteryImpact();

    return {
      isActive: true,
      hashRate: this.hashesPerSecond,
      sessionDuration: duration,
      totalHashes: this.currentSession.hashesComputed,
      estimatedReward,
      cpuTemperature: this.cpuTemperature,
      miningInterval: this.lastMiningInterval,
      batteryImpact
    };
  }

  // Calculate estimated battery impact per hour
  private calculateBatteryImpact(): string {
    const interval = this.lastMiningInterval;

    // Estimated battery drain based on mining interval
    // Lower interval = more work = more battery drain
    let drainPerHour = 0;

    if (interval >= 10000) {
      drainPerHour = 1.0; // ~1% per hour (10s interval)
    } else if (interval >= 5000) {
      drainPerHour = 2.0; // ~2% per hour (5s interval)
    } else if (interval >= 2000) {
      drainPerHour = 5.0; // ~5% per hour (2s interval)
    } else {
      drainPerHour = 10.0; // ~10% per hour (1s interval)
    }

    // Add temperature penalty
    if (this.cpuTemperature > 40) {
      drainPerHour += 1.0;
    }

    return `${drainPerHour.toFixed(1)}% per hour`;
  }

  private calculateEstimatedReward(): string {
    // Simplified reward calculation
    if (!this.currentSession) {
      return '0';
    }

    const baseReward = 0.1; // Base A50 per minute of mining
    const timeInMinutes = (Date.now() - this.currentSession.startTime.getTime()) / (1000 * 60);

    return (baseReward * timeInMinutes).toFixed(8);
  }

  // Persistence
  private async saveMiningSession(session: MiningSession): Promise<void> {
    try {
      const sessions = await this.getMininSessions();
      const updated = sessions.filter(s => s.id !== session.id);
      updated.push(session);

      await AsyncStorage.setItem('@aura50_mining_sessions', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save mining session:', error);
    }
  }

  async getMininSessions(): Promise<MiningSession[]> {
    try {
      const data = await AsyncStorage.getItem('@aura50_mining_sessions');
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Utility
  private generateSessionId(): string {
    return `mining_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Mining History Management
  async fetchMiningHistory(limit: number = 20, offset: number = 0): Promise<{
    success: boolean;
    blocks?: any[];
    pagination?: any;
    error?: string;
  }> {
    try {
      const authToken = await AsyncStorage.getItem('@aura50_auth_token');

      if (!authToken) {
        const localHistory = await this.getMiningHistory();
        return {
          success: true,
          blocks: localHistory.slice(offset, offset + limit),
          pagination: { limit, offset, total: localHistory.length, hasMore: offset + limit < localHistory.length }
        };
      }

      const response = await fetch(
        `${config.baseUrl}/api/blocks/history?limit=${limit}&offset=${offset}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      if (!response.ok) {
        console.warn('Failed to fetch mining history from backend');

        // If 401 Unauthorized, clear the invalid token
        if (response.status === 401) {
          console.log('🔓 Auth token invalid/expired, clearing token');
          await AsyncStorage.removeItem('@aura50_auth_token');
        }

        // Fallback to local history
        const localHistory = await this.getMiningHistory();
        return {
          success: true,
          blocks: localHistory.slice(offset, offset + limit),
          pagination: {
            limit,
            offset,
            total: localHistory.length,
            hasMore: offset + limit < localHistory.length
          }
        };
      }

      const data = await response.json();

      // Save to local storage for offline access
      if (data.blocks && data.blocks.length > 0) {
        await this.saveMiningHistory(data.blocks);
      }

      console.log('✅ Mining history fetched:', data.blocks?.length, 'blocks');
      return {
        success: true,
        blocks: data.blocks,
        pagination: data.pagination
      };
    } catch (error) {
      console.error('Error fetching mining history:', error);
      // Fallback to local history
      const localHistory = await this.getMiningHistory();
      return {
        success: false,
        blocks: localHistory.slice(offset, offset + limit),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async saveMiningHistory(blocks: any[]): Promise<void> {
    try {
      const existing = await this.getMiningHistory();

      // Merge with existing, avoiding duplicates
      const merged = [...existing];
      for (const block of blocks) {
        const existingIndex = merged.findIndex(b => b.id === block.id);
        if (existingIndex >= 0) {
          // Update existing block
          merged[existingIndex] = block;
        } else {
          // Add new block
          merged.push(block);
        }
      }

      // Sort by height descending (most recent first)
      merged.sort((a, b) => (b.height || 0) - (a.height || 0));

      // Keep last 100 blocks max
      const trimmed = merged.slice(0, 100);

      await AsyncStorage.setItem('@aura50_mining_history', JSON.stringify(trimmed));
      console.log('💾 Mining history saved:', trimmed.length, 'blocks');
    } catch (error) {
      console.error('Failed to save mining history:', error);
    }
  }

  async getMiningHistory(): Promise<any[]> {
    try {
      const data = await AsyncStorage.getItem('@aura50_mining_history');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to load mining history:', error);
      return [];
    }
  }

  // Public method to sync mining history from backend
  async syncMiningHistory(): Promise<{
    success: boolean;
    blockCount?: number;
    error?: string;
  }> {
    try {
      console.log('🔄 Syncing mining history from backend...');
      const result = await this.fetchMiningHistory(50, 0); // Fetch last 50 blocks

      if (result.success && result.blocks) {
        return {
          success: true,
          blockCount: result.blocks.length
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to fetch history'
      };
    } catch (error) {
      console.error('Error syncing mining history:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Public Getters
  isActiveMining(): boolean {
    return this.currentSession?.status === 'active';
  }

  getCurrentSession(): MiningSession | null {
    return this.currentSession;
  }
}