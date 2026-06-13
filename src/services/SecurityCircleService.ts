/**
 * Mobile SecurityCircleService
 *
 * Client-side companion to the server's SecurityCircleService.
 * All balance mutations (staking, slashing, releasing) are authoritative
 * on the server. This service:
 *  - Fetches circle state and stake status from the server.
 *  - Maintains a local AsyncStorage cache for offline display.
 *  - Does NOT do local balance deductions — the server owns all coin movements.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from './EnhancedWalletService';
import config from '../config/environment';
import PhaseTaskService from './PhaseTaskService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SecurityCircleMember {
  id: string;
  username?: string;
  email?: string;
  invitedBy?: string;
  invitedAt: Date;
  firstMiningAt?: Date;
  isActive: boolean;
  status: 'invited' | 'registered' | 'mining_completed' | 'active';
}

export interface SecurityCircle {
  userId: string;
  inviter?: string;
  members: SecurityCircleMember[];
  isComplete: boolean;
  walletUnlocked: boolean;
  completedAt?: Date;

  invitesSent: number;
  invitesRegistered: number;
  invitesActiveMining: number;
  inviterActiveMining: boolean;

  economicStake: {
    memberStake: string;
    inviterStake: string;
    totalStaked: string;
    stakeLockedAt?: Date;
    stakeReleasedAt?: Date;
    slashingRisk: boolean;
  };

  newUserPeriod: {
    createdAt: Date;
    restrictionsActive: boolean;
    allowedActions: string[];
    maxTransactionAmount: string;
    maxWalletBalance: string;
    verificationLevel: 'basic' | 'verified' | 'trusted';
  };
}

export interface InviteLink {
  inviteCode: string;
  inviterId: string;
  inviterUsername?: string;
  createdAt: Date;
  isUsed: boolean;
  usedBy?: string;
  usedAt?: Date;
}

/** Reflects server-side /api/stake/status response */
export interface StakeStatus {
  totalLocked: string;
  coinBalance: string;
  availableBalance: string;
  lockedStakeBalance: string;
  lockedStakes: Array<{
    id: string;
    purpose: 'member_invite' | 'inviter_bond';
    amount: string;
    beneficiaryId: string;
    lockedAt: string;
  }>;
}

export interface ReferralProgress {
  required: number;
  verified: number;
  pending: number;
  mined: number;
  rejected: number;
  conditionMet: boolean;
  referrals: any[];
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SecurityCircleService {
  private static instance: SecurityCircleService;
  private walletService: EnhancedWalletService;

  private constructor() {
    this.walletService = EnhancedWalletService.getInstance();
  }

  static getInstance(): SecurityCircleService {
    if (!SecurityCircleService.instance) {
      SecurityCircleService.instance = new SecurityCircleService();
    }
    return SecurityCircleService.instance;
  }

  // ── Auth helper ────────────────────────────────────────────────────────────

  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await AsyncStorage.getItem('@aura50_auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  // ── Stake status (server-authoritative) ───────────────────────────────────

  /**
   * Fetch the real locked-stake breakdown from the server.
   * Shows how much of the user's balance is escrowed vs spendable.
   */
  async getStakeStatus(): Promise<StakeStatus | null> {
    try {
      const resp = await fetch(`${config.baseUrl}/api/stake/status`, {
        headers: await this.getAuthHeaders(),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.success) return null;
      return data as StakeStatus;
    } catch {
      return null;
    }
  }

  // ── Referral progress (server-authoritative) ───────────────────────────────

  async getReferralProgress(): Promise<ReferralProgress | null> {
    try {
      const resp = await fetch(`${config.baseUrl}/api/referral/progress`, {
        headers: await this.getAuthHeaders(),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.success ? data : null;
    } catch {
      return null;
    }
  }

  // ── Circle progress (merges server + local cache) ─────────────────────────

  async getCircleProgress(userId: string): Promise<{
    invited: number;
    registered: number;
    active: number;
    walletStatus: 'locked' | 'unlocked';
    requirements: string;
    stakeStatus: StakeStatus | null;
  }> {
    const [backendProgress, stakeStatus] = await Promise.all([
      this.getReferralProgress(),
      this.getStakeStatus(),
    ]);

    if (backendProgress) {
      await this.syncLocalCircleWithBackend(userId, backendProgress);
      return {
        invited:      backendProgress.pending + backendProgress.mined + backendProgress.verified,
        registered:   backendProgress.pending + backendProgress.mined + backendProgress.verified,
        active:       backendProgress.mined + backendProgress.verified,
        walletStatus: backendProgress.conditionMet ? 'unlocked' : 'locked',
        requirements: backendProgress.conditionMet
          ? 'Referral condition complete!'
          : `${backendProgress.verified}/${backendProgress.required} verified — invite ${backendProgress.required - backendProgress.verified} more users who mine`,
        stakeStatus,
      };
    }

    // Offline fallback
    const circle = await this.getLocalCircle(userId);
    if (!circle) {
      return { invited: 0, registered: 0, active: 0, walletStatus: 'locked', requirements: 'Initialize Security Circle first', stakeStatus };
    }

    return {
      invited:      circle.invitesSent,
      registered:   circle.invitesRegistered,
      active:       circle.invitesActiveMining,
      walletStatus: circle.walletUnlocked ? 'unlocked' : 'locked',
      requirements: circle.inviter
        ? 'Invite 3 new users + your inviter must be active'
        : 'Invite 3 new users to mine',
      stakeStatus,
    };
  }

  // ── Invite link generation ─────────────────────────────────────────────────

  /**
   * Generate (reveal) the invite link.
   * Locks the single 10 A50 invite bond server-side (idempotent) before
   * revealing the link. One shared invite code (the referral code) is used by
   * all 3 invitees. Throws a user-facing message if the bond can't be locked
   * (e.g. insufficient balance) so the caller can surface it.
   */
  async generateInviteLink(userId: string): Promise<InviteLink> {
    const user = this.walletService.getUser();
    if (!user || user.id !== userId) throw new Error('User not authenticated');

    let circle = await this.getLocalCircle(userId);
    if (!circle) circle = this.buildDefaultCircle(userId);

    // Lock the 10 A50 invite bond (server-authoritative, idempotent). First call
    // escrows the bond; later calls just return the existing code.
    const unlock = await PhaseTaskService.getInstance().unlockInvites();
    if (!unlock.ok) {
      throw new Error(unlock.message);
    }

    // Prefer the server-returned invite code (== referral code); fall back to local
    let inviteCode = unlock.inviteCode || user.referralCode;
    if (!inviteCode) {
      const headers = await this.getAuthHeaders();
      const resp = await fetch(`${config.baseUrl}/api/auth/user`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        inviteCode = data.referralCode;
      }
    }
    if (inviteCode && inviteCode !== user.referralCode) {
      user.referralCode = inviteCode;
      this.walletService.setUser(user);
    }
    if (!inviteCode) throw new Error('Could not obtain referral code from server');

    const inviteLink: InviteLink = {
      inviteCode,
      inviterId:       userId,
      inviterUsername: user.username,
      createdAt:       new Date(),
      isUsed:          false,
    };

    // Persist locally so the share sheet can show it offline
    await this.storeInviteLink(inviteLink);

    // Record that the bond is locked (single 10 A50, not per-invite).
    circle.economicStake.inviterStake = '10';
    circle.economicStake.totalStaked  = '10';
    if (!circle.economicStake.stakeLockedAt) circle.economicStake.stakeLockedAt = new Date();
    await this.storeLocalCircle(userId, circle);

    console.log(`🔗 Invite link ready: ${inviteCode} (10 A50 bond locked server-side)`);
    return inviteLink;
  }

  // ── Wallet unlock check ────────────────────────────────────────────────────

  async isWalletUnlocked(userId: string): Promise<boolean> {
    const progress = await this.getReferralProgress();
    if (progress) return progress.conditionMet;
    const circle = await this.getLocalCircle(userId);
    return circle?.walletUnlocked ?? false;
  }

  // ── Transaction permissions (local + server state) ─────────────────────────

  async checkTransactionPermission(
    userId: string,
    amount: string,
    transactionType: 'send' | 'receive' | 'mining' = 'send',
  ): Promise<{ allowed: boolean; reason?: string; restrictions?: any }> {
    const circle = await this.getLocalCircle(userId);
    if (!circle) return { allowed: false, reason: 'Security Circle not initialised' };

    const newUserCheck = this.checkNewUserRestrictionsLocal(circle, amount, transactionType);
    if (!newUserCheck.allowed) return newUserCheck;

    const unlocked = await this.isWalletUnlocked(userId);
    if (!unlocked) {
      const progress = await this.getCircleProgress(userId);
      return {
        allowed: false,
        reason: `Wallet locked. Progress: ${progress.active}/3 active invites. ${progress.requirements}`,
        restrictions: {
          circleComplete: false,
          newUserPeriod: circle.newUserPeriod.restrictionsActive,
          maxTransaction: circle.newUserPeriod.maxTransactionAmount,
          maxBalance: circle.newUserPeriod.maxWalletBalance,
        },
      };
    }

    return { allowed: true };
  }

  private checkNewUserRestrictionsLocal(
    circle: SecurityCircle,
    amount: string,
    transactionType: 'send' | 'receive' | 'mining',
  ): { allowed: boolean; reason?: string } {
    const daysSince = (Date.now() - new Date(circle.newUserPeriod.createdAt).getTime()) / 86_400_000;
    if (daysSince >= 30) return { allowed: true };

    const amt    = parseFloat(amount);
    const maxTx  = parseFloat(circle.newUserPeriod.maxTransactionAmount);

    if (transactionType === 'send' && amt > maxTx) {
      return {
        allowed: false,
        reason: `New-user restriction: max ${maxTx} A50 per transaction for first 30 days`,
      };
    }
    if (circle.newUserPeriod.verificationLevel === 'basic' && amt > 50) {
      return {
        allowed: false,
        reason: 'Basic verification: max 50 A50 per transaction. Complete Security Circle for higher limits.',
      };
    }
    return { allowed: true };
  }

  // ── Local storage helpers ──────────────────────────────────────────────────

  private async getLocalCircle(userId: string): Promise<SecurityCircle | null> {
    try {
      const raw = await AsyncStorage.getItem(`@aura50_security_circle_${userId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private async storeLocalCircle(userId: string, circle: SecurityCircle): Promise<void> {
    try {
      await AsyncStorage.setItem(`@aura50_security_circle_${userId}`, JSON.stringify(circle));
    } catch (err) {
      console.error('Failed to store security circle locally:', err);
    }
  }

  private async storeInviteLink(invite: InviteLink): Promise<void> {
    try {
      const sentKey = `@aura50_invites_sent_${invite.inviterId}`;
      const raw     = await AsyncStorage.getItem(sentKey);
      const list    = raw ? JSON.parse(raw) : [];
      list.push(invite);
      await AsyncStorage.setItem(sentKey, JSON.stringify(list));
      await AsyncStorage.setItem(`@aura50_invite_${invite.inviteCode}`, JSON.stringify(invite));
    } catch (err) {
      console.error('Failed to store invite link:', err);
    }
  }

  async getPendingInvites(userId: string): Promise<InviteLink[]> {
    try {
      const raw = await AsyncStorage.getItem(`@aura50_invites_sent_${userId}`);
      const list: InviteLink[] = raw ? JSON.parse(raw) : [];
      return list.filter(i => !i.isUsed);
    } catch {
      return [];
    }
  }

  private buildDefaultCircle(userId: string): SecurityCircle {
    const now = new Date();
    return {
      userId,
      members: [],
      isComplete: false,
      walletUnlocked: false,
      invitesSent: 0,
      invitesRegistered: 0,
      invitesActiveMining: 0,
      inviterActiveMining: false,
      economicStake: {
        memberStake: '0',
        inviterStake: '0',
        totalStaked: '0',
        slashingRisk: true,
      },
      newUserPeriod: {
        createdAt: now,
        restrictionsActive: true,
        allowedActions: ['mining', 'viewing_balance', 'generating_invites'],
        maxTransactionAmount: '100',
        maxWalletBalance: '1000',
        verificationLevel: 'basic',
      },
    };
  }

  private async syncLocalCircleWithBackend(userId: string, progress: ReferralProgress): Promise<void> {
    try {
      let circle = await this.getLocalCircle(userId) ?? this.buildDefaultCircle(userId);

      circle.invitesRegistered   = progress.pending + progress.mined + progress.verified;
      circle.invitesActiveMining = progress.mined + progress.verified;
      circle.walletUnlocked      = progress.conditionMet;
      circle.isComplete          = progress.conditionMet;

      if (progress.referrals.length > 0) {
        circle.members = progress.referrals.map((r: any) => ({
          id:          r.refereeId,
          invitedAt:   new Date(r.createdAt),
          isActive:    r.status === 'mined' || r.status === 'verified',
          status:      r.status === 'pending'  ? 'registered'      :
                       r.status === 'mined'    ? 'mining_completed' :
                       r.status === 'verified' ? 'active'          : 'invited',
        }));
        circle.invitesSent = progress.referrals.length;
      }

      await this.storeLocalCircle(userId, circle);
    } catch (err) {
      console.error('Failed to sync local circle with backend:', err);
    }
  }

  // ── Expose getSecurityCircleStatus for backward compat ─────────────────────

  async getSecurityCircleStatus(userId: string): Promise<SecurityCircle | null> {
    return this.getLocalCircle(userId);
  }

  async getSecurityCircle(userId: string): Promise<SecurityCircle | null> {
    return this.getLocalCircle(userId);
  }
}

export default SecurityCircleService;
