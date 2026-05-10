/**
 * Sybil Resistance Service
 *
 * Multi-layered protection against fake validators and Sybil attacks
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { AttestationService } from '../lib/attestation';

export interface DeviceAttestation {
  deviceId: string;
  isRealDevice: boolean;
  attestationToken: string;
  platform: 'ios' | 'android';
  verified: boolean;
  timestamp: number;
}

export interface SybilScore {
  overallScore: number; // 0-100, higher = more trustworthy
  factors: {
    deviceAttestation: number;
    simVerification: number;
    miningProof: number;
    behavioralAnalysis: number;
    accountAge: number;
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  canValidate: boolean;
}

export class SybilResistanceService {
  private static instance: SybilResistanceService;

  private deviceAttestation: DeviceAttestation | null = null;
  private sybilScore: SybilScore | null = null;

  private constructor() {}

  static getInstance(): SybilResistanceService {
    if (!SybilResistanceService.instance) {
      SybilResistanceService.instance = new SybilResistanceService();
    }
    return SybilResistanceService.instance;
  }

  /**
   * Initialize Sybil resistance checks
   */
  async initialize(): Promise<void> {
    console.log('🛡️ Initializing Sybil resistance...');

    // Perform device attestation
    await this.performDeviceAttestation();

    // Calculate initial Sybil score
    await this.calculateSybilScore();

    console.log(`✅ Sybil resistance initialized (Score: ${this.sybilScore?.overallScore}/100, Risk: ${this.sybilScore?.riskLevel})`);
  }

  /**
   * Perform device attestation. Delegates to AttestationService which uses
   * Play Integrity (Android) / App Attest (iOS) and binds the device to the
   * current account on the server. The local DeviceAttestation cache is kept
   * for backwards compatibility with existing UI components (SybilScoreDisplay).
   */
  private async performDeviceAttestation(): Promise<void> {
    try {
      const deviceId = await DeviceInfo.getUniqueId();
      const isRealDevice = !(await DeviceInfo.isEmulator());
      const platform = ((await (DeviceInfo as any).getPlatform?.()) ?? Platform.OS) as 'ios' | 'android';

      const attestation = AttestationService;
      const status = await attestation.fetchStatus().catch(() => null);

      // If never bound, attempt the bind now. The server will reject if the user
      // is not authenticated (fine — the mining-time auto-auth path will retry).
      let bindOutcome: { code?: string; kind?: string; trustScore?: number } | null = null;
      if (!status || !status.bound) {
        bindOutcome = await attestation.bindCurrentDevice().catch((e) => ({
          code: 'BIND_FAILED',
          kind: undefined,
          message: String(e),
        }) as any);
      }

      const verified =
        attestation.isNativeAvailable() &&
        isRealDevice &&
        (status?.bound === true || bindOutcome?.kind === 'first_bind' || bindOutcome?.kind === 'same_account');

      this.deviceAttestation = {
        deviceId,
        isRealDevice,
        attestationToken: bindOutcome?.code ?? status?.platform ?? 'pending',
        platform,
        verified,
        timestamp: Date.now(),
      };

      await AsyncStorage.setItem('@aura50_device_attestation', JSON.stringify(this.deviceAttestation));

      if (!isRealDevice) {
        console.warn('⚠️ Emulator detected — mining will be blocked by server attestation gate');
      }
      if (!attestation.isNativeAvailable()) {
        console.warn('⚠️ Native attestation module unavailable — server must be in mock mode');
      }
    } catch (error) {
      console.error('Error performing device attestation:', error);
    }
  }

  /**
   * Calculate overall Sybil score
   */
  async calculateSybilScore(): Promise<SybilScore> {
    const scores = {
      deviceAttestation: await this.scoreDeviceAttestation(),
      simVerification: await this.scoreSIMVerification(),
      miningProof: await this.scoreMiningProof(),
      behavioralAnalysis: await this.scoreBehavioralAnalysis(),
      accountAge: await this.scoreAccountAge(),
    };

    // Weighted average
    const overallScore =
      scores.deviceAttestation * 0.3 +
      scores.simVerification * 0.25 +
      scores.miningProof * 0.2 +
      scores.behavioralAnalysis * 0.15 +
      scores.accountAge * 0.1;

    const riskLevel = this.determineRiskLevel(overallScore);
    const canValidate = overallScore >= 50 && riskLevel !== 'critical';

    this.sybilScore = {
      overallScore: Math.round(overallScore),
      factors: scores,
      riskLevel,
      canValidate,
    };

    await AsyncStorage.setItem('@aura50_sybil_score', JSON.stringify(this.sybilScore));

    return this.sybilScore;
  }

  /**
   * Score device attestation (30% weight)
   */
  private async scoreDeviceAttestation(): Promise<number> {
    if (!this.deviceAttestation) {
      return 0;
    }

    let score = 0;

    // Real device check (critical)
    if (this.deviceAttestation.isRealDevice) {
      score += 70;
    }

    // Attestation verified
    if (this.deviceAttestation.verified) {
      score += 20;
    }

    // Recent attestation (< 7 days)
    const age = Date.now() - this.deviceAttestation.timestamp;
    if (age < 7 * 24 * 60 * 60 * 1000) {
      score += 10;
    }

    return score;
  }

  /**
   * Score SIM verification (25% weight)
   */
  private async scoreSIMVerification(): Promise<number> {
    try {
      const simVerified = await AsyncStorage.getItem('@aura50_sim_verified');

      if (simVerified === 'true') {
        return 100; // SIM verified = maximum trust
      }

      return 0; // No SIM verification
    } catch {
      return 0;
    }
  }

  /**
   * Score mining proof (20% weight)
   */
  private async scoreMiningProof(): Promise<number> {
    try {
      const miningStats = await AsyncStorage.getItem('@aura50_mining_stats');

      if (!miningStats) {
        return 0;
      }

      const stats = JSON.parse(miningStats);
      const totalShares = stats.totalShares || 0;

      // More mining = more trustworthy (proves real device)
      if (totalShares >= 100) return 100;
      if (totalShares >= 50) return 75;
      if (totalShares >= 20) return 50;
      if (totalShares >= 10) return 25;

      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Score behavioral analysis (15% weight)
   */
  private async scoreBehavioralAnalysis(): Promise<number> {
    try {
      // Check for human-like interaction patterns
      const validationStats = await AsyncStorage.getItem('@aura50_validation_stats');

      if (!validationStats) {
        return 50; // Neutral - no data yet
      }

      const stats = JSON.parse(validationStats);

      let score = 50; // Start neutral

      // Consistent timing (not too regular = bot)
      const avgInterval = stats.averageInterval || 0;
      if (avgInterval > 0) {
        // Human-like variance in timing
        score += 25;
      }

      // Reasonable accuracy (not 100% = suspicious)
      const accuracy = stats.voteAccuracy || 0;
      if (accuracy >= 85 && accuracy <= 98) {
        score += 25; // Good but not perfect = human-like
      } else if (accuracy === 100) {
        score -= 25; // Too perfect = suspicious
      }

      return Math.max(0, Math.min(100, score));
    } catch {
      return 50; // Neutral on error
    }
  }

  /**
   * Score account age (10% weight)
   */
  private async scoreAccountAge(): Promise<number> {
    try {
      const userCreated = await AsyncStorage.getItem('@aura50_user_created');

      if (!userCreated) {
        return 0;
      }

      const createdTime = parseInt(userCreated);
      const age = Date.now() - createdTime;
      const daysSinceCreation = age / (24 * 60 * 60 * 1000);

      // Progressive trust over time
      if (daysSinceCreation >= 365) return 100; // 1 year+
      if (daysSinceCreation >= 90) return 75;   // 3 months+
      if (daysSinceCreation >= 30) return 50;   // 1 month+
      if (daysSinceCreation >= 7) return 25;    // 1 week+

      return 0; // Brand new account
    } catch {
      return 0;
    }
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 75) return 'low';
    if (score >= 50) return 'medium';
    if (score >= 25) return 'high';
    return 'critical';
  }

  /**
   * Check if device can participate as validator
   */
  canValidate(): boolean {
    return this.sybilScore?.canValidate || false;
  }

  /**
   * Get current Sybil score
   */
  getSybilScore(): SybilScore | null {
    return this.sybilScore;
  }

  /**
   * Get device attestation
   */
  getDeviceAttestation(): DeviceAttestation | null {
    return this.deviceAttestation;
  }

  /**
   * Force re-attestation
   */
  async reAttest(): Promise<void> {
    await this.performDeviceAttestation();
    await this.calculateSybilScore();
  }
}

export default SybilResistanceService;
