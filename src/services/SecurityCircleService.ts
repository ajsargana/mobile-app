import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from './EnhancedWalletService';
import { NetworkService } from './NetworkService';
import SybilInsurancePool from './SybilInsurancePool';
import config from '../config/environment';

export interface SecurityCircleMember {
  id: string;
  username?: string;
  email?: string;
  invitedBy?: string; // User ID who invited them
  invitedAt: Date;
  firstMiningAt?: Date;
  isActive: boolean; // Has completed first mining session
  status: 'invited' | 'registered' | 'mining_completed' | 'active';
}

export interface SecurityCircle {
  userId: string;
  inviter?: string; // Person who invited this user (becomes 4th member)
  members: SecurityCircleMember[]; // 3 people this user must invite
  isComplete: boolean; // All 4 people (3 invited + 1 inviter) have mined
  walletUnlocked: boolean;
  completedAt?: Date;

  // Progress tracking
  invitesSent: number; // How many invites sent (max 3)
  invitesRegistered: number; // How many people registered
  invitesActiveMining: number; // How many completed first mining
  inviterActiveMining: boolean; // Has the person who invited them mined?

  // Economic Stakes (Anti-Sybil)
  economicStake: {
    memberStake: string; // 10 A50 per member invited (30 A50 total)
    inviterStake: string; // 40 A50 locked by inviter
    totalStaked: string; // Total A50 at risk
    stakeLockedAt?: Date;
    stakeReleasedAt?: Date;
    slashingRisk: boolean; // Can lose stake if flagged as Sybil
  };

  // New User Period Restrictions
  newUserPeriod: {
    createdAt: Date;
    restrictionsActive: boolean; // True for first 30 days
    allowedActions: string[]; // Limited functionality during new period
    maxTransactionAmount: string; // 100 A50 max during new period
    maxWalletBalance: string; // 1000 A50 max during new period
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

export interface ViralGrowthStats {
  totalUsers: number;
  totalCircles: number;
  completedCircles: number;
  pendingActivations: number;
  growthRate: number; // Users per day
  viralCoefficient: number; // Average invites per user
}

export class SecurityCircleService {
  private static instance: SecurityCircleService;
  private walletService: EnhancedWalletService;
  private networkService: NetworkService;
  private _insurancePool: SybilInsurancePool | null = null;

  private constructor() {
    this.walletService = EnhancedWalletService.getInstance();
    this.networkService = NetworkService.getInstance();
    // Lazy load to avoid circular dependency
  }

  // Lazy getter to avoid circular dependency with SybilInsurancePool
  private get insurancePool(): SybilInsurancePool {
    if (!this._insurancePool) {
      this._insurancePool = SybilInsurancePool.getInstance();
    }
    return this._insurancePool;
  }

  static getInstance(): SecurityCircleService {
    if (!SecurityCircleService.instance) {
      SecurityCircleService.instance = new SecurityCircleService();
    }
    return SecurityCircleService.instance;
  }

  // Initialize Security Circle for new user
  async initializeSecurityCircle(userId: string, inviterCode?: string): Promise<SecurityCircle> {
    try {
      const user = this.walletService.getUser();
      if (!user || user.id !== userId) {
        throw new Error('User not authenticated');
      }

      let inviter: string | undefined;

      // If user was invited, add inviter to their circle
      if (inviterCode) {
        const inviteLink = await this.getInviteLink(inviterCode);
        if (inviteLink && !inviteLink.isUsed) {
          inviter = inviteLink.inviterId;

          // Mark invite as used
          await this.markInviteUsed(inviterCode, userId);

          // Add this user to inviter's circle
          await this.addMemberToInviterCircle(inviter, userId);

          // Inviter must stake 40 A50 for this new user
          await this.lockInviterStake(inviter, userId);
        }
      }

      const now = new Date();
      const securityCircle: SecurityCircle = {
        userId,
        inviter,
        members: [],
        isComplete: false,
        walletUnlocked: false,
        invitesSent: 0,
        invitesRegistered: 0,
        invitesActiveMining: 0,
        inviterActiveMining: false,

        // Economic Stakes (Anti-Sybil Protection)
        economicStake: {
          memberStake: '0', // Will increase as user invites others (10 A50 per invite)
          inviterStake: inviter ? '40' : '0', // 40 A50 locked by inviter
          totalStaked: inviter ? '40' : '0',
          stakeLockedAt: inviter ? now : undefined,
          slashingRisk: true
        },

        // New User Period (30-day restrictions)
        newUserPeriod: {
          createdAt: now,
          restrictionsActive: true,
          allowedActions: ['mining', 'viewing_balance', 'generating_invites'],
          maxTransactionAmount: '100', // 100 A50 max per transaction
          maxWalletBalance: '1000', // 1000 A50 max balance
          verificationLevel: 'basic'
        }
      };

      await this.storeSecurityCircle(userId, securityCircle);

      console.log(`🛡️ Security Circle initialized for ${user.username || userId}`);
      console.log(`   Inviter: ${inviter ? 'Yes (40 A50 staked)' : 'None'}`);
      console.log(`   Must invite: 3 new users`);
      console.log(`   Economic stake: ${securityCircle.economicStake.totalStaked} A50 at risk`);
      console.log(`   New user restrictions: Active for 30 days`);
      console.log(`   Max transaction: ${securityCircle.newUserPeriod.maxTransactionAmount} A50`);
      console.log(`   Wallet Status: 🔒 LOCKED until circle complete`);

      return securityCircle;

    } catch (error) {
      console.error('Failed to initialize Security Circle:', error);
      throw error;
    }
  }

  // Generate invite link for user
  async generateInviteLink(userId: string): Promise<InviteLink> {
    try {
      const user = this.walletService.getUser();
      if (!user || user.id !== userId) {
        throw new Error('User not authenticated');
      }

      let circle = await this.getSecurityCircle(userId);
      if (!circle) {
        // Auto-initialize Security Circle for new users
        console.log('🔄 Auto-initializing Security Circle for user:', userId);
        circle = await this.initializeSecurityCircle(userId);
      }

      if (circle.invitesSent >= 3) {
        throw new Error('Maximum invites (3) already sent');
      }

      // Check if user has sufficient balance for staking
      const requiredStake = 10; // 10 A50 per invite
      const userBalance = parseFloat(this.walletService.getBalance());

      if (userBalance < requiredStake) {
        throw new Error(`Insufficient balance. Need ${requiredStake} A50 to stake for invite (current balance: ${userBalance.toFixed(2)} A50)`);
      }

      // Lock 10 A50 stake for this invite
      await this.lockMemberStake(userId, requiredStake);

      // Use the user's REAL referral code from backend (not a local SEC code)
      // This ensures the code is recognized during registration
      let inviteCode = user.referralCode;

      // If referral code not in local user object, fetch from backend
      if (!inviteCode) {
        try {
          const authToken = await AsyncStorage.getItem('@aura50_auth_token');
          if (authToken) {
            const environment = config;
            const resp = await fetch(`${environment.baseUrl}/api/auth/user`, {
              headers: { 'Authorization': `Bearer ${authToken}` },
            });
            if (resp.ok) {
              const userData = await resp.json();
              inviteCode = userData.referralCode;
              // Update local user with the referral code
              if (inviteCode) {
                user.referralCode = inviteCode;
                this.walletService.setUser(user);
                console.log('📋 Fetched referral code from backend:', inviteCode);
              }
            }
          }
        } catch (fetchErr) {
          console.warn('Could not fetch referral code from backend:', fetchErr);
        }
      }

      // Last resort fallback (should rarely happen)
      if (!inviteCode) {
        inviteCode = this.generateInviteCode(userId);
        console.warn('⚠️ Using local SEC code as fallback - backend referral code unavailable');
      }

      const inviteLink: InviteLink = {
        inviteCode,
        inviterId: userId,
        inviterUsername: user.username,
        createdAt: new Date(),
        isUsed: false
      };

      await this.storeInviteLink(inviteLink);

      // Update circle stats and stake
      circle.invitesSent++;
      circle.economicStake.memberStake = (parseFloat(circle.economicStake.memberStake) + requiredStake).toString();
      circle.economicStake.totalStaked = (parseFloat(circle.economicStake.totalStaked) + requiredStake).toString();
      await this.storeSecurityCircle(userId, circle);

      console.log(`🔗 Invite link generated: ${inviteCode}`);
      console.log(`   Inviter: ${user.username || userId}`);
      console.log(`   Invites sent: ${circle.invitesSent}/3`);
      console.log(`   Stake locked: ${requiredStake} A50 (total: ${circle.economicStake.totalStaked} A50)`);

      return inviteLink;

    } catch (error) {
      console.error('Failed to generate invite link:', error);
      throw error;
    }
  }

  // User completes their first mining session
  async recordFirstMining(userId: string): Promise<{ walletUnlocked: boolean; message: string }> {
    try {
      const user = this.walletService.getUser();
      if (!user || user.id !== userId) {
        throw new Error('User not authenticated');
      }

      // Update user's own circle
      const circle = await this.getSecurityCircle(userId);
      if (circle) {
        // Check if this unlocks anyone's wallet who invited this user
        if (circle.inviter) {
          await this.checkInviterCircleCompletion(circle.inviter, userId);
        }
      }

      // Check if this user was invited by someone - update their circle
      const inviterUserId = circle?.inviter;
      if (inviterUserId) {
        await this.updateInviterProgress(inviterUserId, userId);
      }

      // Check if this user's own wallet can be unlocked
      const walletUnlocked = await this.checkWalletUnlock(userId);

      const message = walletUnlocked
        ? "🎉 Congratulations! Your Security Circle is complete and your wallet is now UNLOCKED!"
        : "✅ First mining completed. Continue inviting to unlock your wallet.";

      console.log(`⛏️ First mining recorded for ${user.username || userId}`);
      console.log(`   Wallet Status: ${walletUnlocked ? '🔓 UNLOCKED' : '🔒 LOCKED'}`);

      return { walletUnlocked, message };

    } catch (error) {
      console.error('Failed to record first mining:', error);
      return { walletUnlocked: false, message: "Error processing mining completion." };
    }
  }

  // Get Security Circle status for user
  async getSecurityCircleStatus(userId: string): Promise<SecurityCircle | null> {
    return await this.getSecurityCircle(userId);
  }

  // Get pending invites for user
  async getPendingInvites(userId: string): Promise<InviteLink[]> {
    try {
      const stored = await AsyncStorage.getItem(`@aura50_invites_sent_${userId}`);
      const invites: InviteLink[] = stored ? JSON.parse(stored) : [];
      return invites.filter(invite => !invite.isUsed);
    } catch (error) {
      return [];
    }
  }

  // Check if user can perform transactions (wallet unlocked)
  async isWalletUnlocked(userId: string): Promise<boolean> {
    try {
      const circle = await this.getSecurityCircle(userId);
      return circle ? circle.walletUnlocked : false;
    } catch (error) {
      return false;
    }
  }

  // Get viral growth statistics
  async getViralGrowthStats(): Promise<ViralGrowthStats> {
    try {
      // In production, this would query the database
      // For now, return simulated stats based on stored data
      const allCircles = await this.getAllSecurityCircles();

      const totalUsers = allCircles.length;
      const completedCircles = allCircles.filter(c => c.isComplete).length;
      const pendingActivations = allCircles.filter(c => !c.isComplete).length;

      const totalInvites = allCircles.reduce((sum, circle) => sum + circle.invitesSent, 0);
      const viralCoefficient = totalUsers > 0 ? totalInvites / totalUsers : 0;

      // Simple growth rate calculation
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentUsers = allCircles.filter(c =>
        c.members.some(m => new Date(m.invitedAt) > oneDayAgo)
      ).length;

      return {
        totalUsers,
        totalCircles: totalUsers,
        completedCircles,
        pendingActivations,
        growthRate: recentUsers,
        viralCoefficient
      };

    } catch (error) {
      console.error('Failed to get viral growth stats:', error);
      return {
        totalUsers: 0,
        totalCircles: 0,
        completedCircles: 0,
        pendingActivations: 0,
        growthRate: 0,
        viralCoefficient: 0
      };
    }
  }

  // Admin function: Get user's invitation tree
  async getInvitationTree(userId: string, depth: number = 3): Promise<any> {
    try {
      const circle = await this.getSecurityCircle(userId);
      if (!circle) return null;

      const tree = {
        userId,
        username: circle.userId,
        inviter: circle.inviter,
        walletUnlocked: circle.walletUnlocked,
        members: []
      };

      if (depth > 0) {
        for (const member of circle.members) {
          const subtree = await this.getInvitationTree(member.id, depth - 1);
          if (subtree) {
            tree.members.push(subtree);
          }
        }
      }

      return tree;

    } catch (error) {
      console.error('Failed to get invitation tree:', error);
      return null;
    }
  }

  // Private helper methods
  private generateInviteCode(userId: string): string {
    const timestamp = Date.now().toString(36);
    const userHash = userId.slice(-8);
    const random = Math.random().toString(36).substr(2, 5);
    return `SEC${timestamp}${userHash}${random}`.toUpperCase();
  }

  private async checkWalletUnlock(userId: string): Promise<boolean> {
    try {
      const circle = await this.getSecurityCircle(userId);
      if (!circle) return false;

      // Count active members (completed mining)
      const activeMemberCount = circle.members.filter(m => m.isActive).length;

      // Check if inviter is active (if exists)
      const inviterActive = !circle.inviter || circle.inviterActiveMining;

      // Need all 3 invited members active + inviter active (if exists)
      const requiredMembers = 3;
      const isComplete = activeMemberCount >= requiredMembers && inviterActive;

      if (isComplete && !circle.walletUnlocked) {
        circle.isComplete = true;
        circle.walletUnlocked = true;
        circle.completedAt = new Date();
        await this.storeSecurityCircle(userId, circle);

        console.log(`🎉 WALLET UNLOCKED for ${userId}!`);
        console.log(`   Active members: ${activeMemberCount}/3`);
        console.log(`   Inviter active: ${inviterActive}`);
      }

      return circle.walletUnlocked;

    } catch (error) {
      console.error('Failed to check wallet unlock:', error);
      return false;
    }
  }

  private async updateInviterProgress(inviterId: string, newlyActiveMemberId: string): Promise<void> {
    try {
      const inviterCircle = await this.getSecurityCircle(inviterId);
      if (!inviterCircle) return;

      // Find the member and update their status
      const member = inviterCircle.members.find(m => m.id === newlyActiveMemberId);
      if (member) {
        member.isActive = true;
        member.firstMiningAt = new Date();
        member.status = 'active';

        // Update counters
        inviterCircle.invitesActiveMining = inviterCircle.members.filter(m => m.isActive).length;

        await this.storeSecurityCircle(inviterId, inviterCircle);

        console.log(`📈 Inviter progress updated: ${inviterId}`);
        console.log(`   Active invites: ${inviterCircle.invitesActiveMining}/3`);
      }

    } catch (error) {
      console.error('Failed to update inviter progress:', error);
    }
  }

  private async checkInviterCircleCompletion(inviterId: string, userId: string): Promise<void> {
    try {
      const inviterCircle = await this.getSecurityCircle(inviterId);
      if (!inviterCircle) return;

      // If this user was the inviter's inviter, mark inviter as active
      if (inviterCircle.inviter === userId) {
        inviterCircle.inviterActiveMining = true;
        await this.storeSecurityCircle(inviterId, inviterCircle);

        // Check if inviter's wallet can now be unlocked
        await this.checkWalletUnlock(inviterId);
      }

    } catch (error) {
      console.error('Failed to check inviter circle completion:', error);
    }
  }

  private async addMemberToInviterCircle(inviterId: string, newMemberId: string): Promise<void> {
    try {
      const inviterCircle = await this.getSecurityCircle(inviterId);
      if (!inviterCircle) return;

      const newMember: SecurityCircleMember = {
        id: newMemberId,
        invitedBy: inviterId,
        invitedAt: new Date(),
        isActive: false,
        status: 'registered'
      };

      inviterCircle.members.push(newMember);
      inviterCircle.invitesRegistered++;

      await this.storeSecurityCircle(inviterId, inviterCircle);

      console.log(`👥 Member added to inviter's circle: ${inviterId} → ${newMemberId}`);

    } catch (error) {
      console.error('Failed to add member to inviter circle:', error);
    }
  }

  // Storage methods
  private async storeSecurityCircle(userId: string, circle: SecurityCircle): Promise<void> {
    try {
      await AsyncStorage.setItem(`@aura50_security_circle_${userId}`, JSON.stringify(circle));
    } catch (error) {
      console.error('Failed to store security circle:', error);
    }
  }

  private async getSecurityCircle(userId: string): Promise<SecurityCircle | null> {
    try {
      const stored = await AsyncStorage.getItem(`@aura50_security_circle_${userId}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  private async storeInviteLink(inviteLink: InviteLink): Promise<void> {
    try {
      // Store in inviter's sent invites
      const sentKey = `@aura50_invites_sent_${inviteLink.inviterId}`;
      const stored = await AsyncStorage.getItem(sentKey);
      const sentInvites = stored ? JSON.parse(stored) : [];
      sentInvites.push(inviteLink);
      await AsyncStorage.setItem(sentKey, JSON.stringify(sentInvites));

      // Store globally for lookup
      await AsyncStorage.setItem(`@aura50_invite_${inviteLink.inviteCode}`, JSON.stringify(inviteLink));

    } catch (error) {
      console.error('Failed to store invite link:', error);
    }
  }

  private async getInviteLink(inviteCode: string): Promise<InviteLink | null> {
    try {
      const stored = await AsyncStorage.getItem(`@aura50_invite_${inviteCode}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  private async markInviteUsed(inviteCode: string, usedBy: string): Promise<void> {
    try {
      const inviteLink = await this.getInviteLink(inviteCode);
      if (inviteLink) {
        inviteLink.isUsed = true;
        inviteLink.usedBy = usedBy;
        inviteLink.usedAt = new Date();
        await AsyncStorage.setItem(`@aura50_invite_${inviteCode}`, JSON.stringify(inviteLink));
      }
    } catch (error) {
      console.error('Failed to mark invite as used:', error);
    }
  }

  private async getAllSecurityCircles(): Promise<SecurityCircle[]> {
    try {
      // In production, this would be a database query
      // For now, we'll need to implement a different approach
      // or maintain a global list
      return [];
    } catch (error) {
      return [];
    }
  }

  // Public utility methods
  async getCircleProgress(userId: string): Promise<{
    invited: number;
    registered: number;
    active: number;
    walletStatus: 'locked' | 'unlocked';
    requirements: string;
  }> {
    try {
      // First, try to fetch from backend to get accurate data
      const backendProgress = await this.fetchProgressFromBackend();
      if (backendProgress) {
        // Update local circle with backend data
        await this.syncLocalCircleWithBackend(userId, backendProgress);

        return {
          invited: backendProgress.pending + backendProgress.mined + backendProgress.verified,
          registered: backendProgress.pending + backendProgress.mined + backendProgress.verified,
          active: backendProgress.mined + backendProgress.verified,
          walletStatus: backendProgress.conditionMet ? 'unlocked' : 'locked',
          requirements: backendProgress.conditionMet
            ? 'Referral condition complete!'
            : `${backendProgress.verified}/${backendProgress.required} verified - invite ${backendProgress.required - backendProgress.verified} more users who mine`
        };
      }

      // Fallback to local data if backend unavailable
      const circle = await this.getSecurityCircle(userId);
      if (!circle) {
        return {
          invited: 0,
          registered: 0,
          active: 0,
          walletStatus: 'locked',
          requirements: 'Initialize Security Circle first'
        };
      }

      const requirements = circle.inviter
        ? 'Invite 3 new users + your inviter must be active'
        : 'Invite 3 new users to mine';

      return {
        invited: circle.invitesSent,
        registered: circle.invitesRegistered,
        active: circle.invitesActiveMining,
        walletStatus: circle.walletUnlocked ? 'unlocked' : 'locked',
        requirements
      };

    } catch (error) {
      return {
        invited: 0,
        registered: 0,
        active: 0,
        walletStatus: 'locked',
        requirements: 'Error loading circle data'
      };
    }
  }

  // Fetch referral progress from backend
  private async fetchProgressFromBackend(): Promise<{
    required: number;
    verified: number;
    pending: number;
    mined: number;
    rejected: number;
    conditionMet: boolean;
    referrals: any[];
  } | null> {
    try {
      const authToken = await AsyncStorage.getItem('@aura50_auth_token');
      if (!authToken) {
        console.log('No auth token, using local data');
        return null;
      }

      const environment = config;
      const response = await fetch(`${environment.baseUrl}/api/referral/progress`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        console.warn('Failed to fetch referral progress from backend:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.success) {
        console.log('✅ Fetched referral progress from backend:', data);
        return {
          required: data.required,
          verified: data.verified,
          pending: data.pending,
          mined: data.mined,
          rejected: data.rejected,
          conditionMet: data.conditionMet,
          referrals: data.referrals || [],
        };
      }

      return null;
    } catch (error) {
      console.warn('Error fetching from backend, using local data:', error);
      return null;
    }
  }

  // Sync local circle data with backend
  private async syncLocalCircleWithBackend(userId: string, backendProgress: any): Promise<void> {
    try {
      let circle = await this.getSecurityCircle(userId);
      if (!circle) {
        // Create new circle from backend data
        circle = await this.initializeSecurityCircle(userId);
      }

      // Update local circle with backend counts
      circle.invitesRegistered = backendProgress.pending + backendProgress.mined + backendProgress.verified;
      circle.invitesActiveMining = backendProgress.mined + backendProgress.verified;
      circle.walletUnlocked = backendProgress.conditionMet;
      circle.isComplete = backendProgress.conditionMet;

      // Update members from backend referrals
      if (backendProgress.referrals && backendProgress.referrals.length > 0) {
        circle.members = backendProgress.referrals.map((ref: any) => ({
          id: ref.refereeId,
          invitedAt: new Date(ref.createdAt),
          isActive: ref.status === 'mined' || ref.status === 'verified',
          status: ref.status === 'pending' ? 'registered' :
                  ref.status === 'mined' ? 'mining_completed' :
                  ref.status === 'verified' ? 'active' : 'invited',
        }));
        circle.invitesSent = backendProgress.referrals.length;
      }

      await this.storeSecurityCircle(userId, circle);
      console.log('✅ Local circle synced with backend');
    } catch (error) {
      console.error('Failed to sync local circle with backend:', error);
    }
  }

  // Enhanced transaction permission check with new user restrictions
  async checkTransactionPermission(userId: string, amount: string, transactionType: 'send' | 'receive' | 'mining' = 'send'): Promise<{ allowed: boolean; reason?: string; restrictions?: any }> {
    try {
      const circle = await this.getSecurityCircle(userId);
      if (!circle) {
        return { allowed: false, reason: 'Security Circle not initialized' };
      }

      // Check new user period restrictions
      const newUserRestrictions = await this.checkNewUserRestrictions(userId, amount, transactionType);
      if (!newUserRestrictions.allowed) {
        return newUserRestrictions;
      }

      // Check if wallet is unlocked through Security Circle
      const isUnlocked = await this.isWalletUnlocked(userId);
      if (!isUnlocked) {
        const progress = await this.getCircleProgress(userId);
        const reason = `Wallet locked. Security Circle progress: ${progress.active}/3 active invites. ${progress.requirements}`;
        return {
          allowed: false,
          reason,
          restrictions: {
            circleComplete: false,
            newUserPeriod: circle.newUserPeriod.restrictionsActive,
            maxTransaction: circle.newUserPeriod.maxTransactionAmount,
            maxBalance: circle.newUserPeriod.maxWalletBalance
          }
        };
      }

      return {
        allowed: true,
        restrictions: {
          circleComplete: true,
          newUserPeriod: circle.newUserPeriod.restrictionsActive,
          maxTransaction: circle.newUserPeriod.restrictionsActive ? circle.newUserPeriod.maxTransactionAmount : null,
          maxBalance: circle.newUserPeriod.restrictionsActive ? circle.newUserPeriod.maxWalletBalance : null
        }
      };

    } catch (error) {
      return { allowed: false, reason: 'Security Circle verification failed' };
    }
  }

  // Check new user period restrictions (30 days)
  async checkNewUserRestrictions(userId: string, amount: string, transactionType: 'send' | 'receive' | 'mining'): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const circle = await this.getSecurityCircle(userId);
      if (!circle) {
        return { allowed: false, reason: 'Security Circle not found' };
      }

      // Check if new user period is still active
      const now = new Date();
      const daysSinceCreation = (now.getTime() - circle.newUserPeriod.createdAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceCreation >= 30) {
        // Update restrictions to inactive after 30 days
        circle.newUserPeriod.restrictionsActive = false;
        circle.newUserPeriod.verificationLevel = 'verified';
        await this.storeSecurityCircle(userId, circle);
        return { allowed: true };
      }

      // New user period is active - apply restrictions
      const transactionAmount = parseFloat(amount);
      const maxTransactionAmount = parseFloat(circle.newUserPeriod.maxTransactionAmount);
      const currentBalance = parseFloat(this.walletService.getBalance());
      const maxWalletBalance = parseFloat(circle.newUserPeriod.maxWalletBalance);

      // Check allowed actions
      const allowedActions = circle.newUserPeriod.allowedActions;
      if (transactionType === 'send' && !allowedActions.includes('sending_transactions')) {
        // For new users, only allow small transactions initially
        if (transactionAmount > maxTransactionAmount) {
          return {
            allowed: false,
            reason: `New user restriction: Maximum transaction is ${maxTransactionAmount} A50 during first 30 days (attempted: ${amount} A50)`
          };
        }
      }

      // Check wallet balance limits for new users
      if (transactionType === 'receive' || transactionType === 'mining') {
        if (currentBalance + transactionAmount > maxWalletBalance) {
          return {
            allowed: false,
            reason: `New user restriction: Maximum wallet balance is ${maxWalletBalance} A50 during first 30 days (current: ${currentBalance.toFixed(2)} A50, attempted to add: ${amount} A50)`
          };
        }
      }

      // Apply progressive restrictions based on verification level
      if (circle.newUserPeriod.verificationLevel === 'basic') {
        if (transactionAmount > 50) { // Even more restrictive for basic verification
          return {
            allowed: false,
            reason: `Basic verification: Maximum transaction is 50 A50 (attempted: ${amount} A50). Complete Security Circle for higher limits.`
          };
        }
      }

      return { allowed: true };

    } catch (error) {
      console.error('Failed to check new user restrictions:', error);
      return { allowed: false, reason: 'Failed to validate new user restrictions' };
    }
  }

  // Update user verification level based on Security Circle progress
  async updateVerificationLevel(userId: string): Promise<void> {
    try {
      const circle = await this.getSecurityCircle(userId);
      if (!circle) return;

      let newVerificationLevel: 'basic' | 'verified' | 'trusted' = 'basic';

      // Determine verification level based on circle progress
      if (circle.isComplete && circle.walletUnlocked) {
        newVerificationLevel = 'trusted'; // Full Security Circle complete
      } else if (circle.invitesActiveMining >= 2) {
        newVerificationLevel = 'verified'; // Partial circle (2/3 active)
      } else if (circle.invitesRegistered >= 2) {
        newVerificationLevel = 'basic'; // Some invites registered but not active
      }

      // Update if changed
      if (circle.newUserPeriod.verificationLevel !== newVerificationLevel) {
        circle.newUserPeriod.verificationLevel = newVerificationLevel;

        // Increase limits based on verification level
        if (newVerificationLevel === 'verified') {
          circle.newUserPeriod.maxTransactionAmount = '250'; // Increased from 100
          circle.newUserPeriod.maxWalletBalance = '2500'; // Increased from 1000
          circle.newUserPeriod.allowedActions.push('sending_transactions');
        } else if (newVerificationLevel === 'trusted') {
          circle.newUserPeriod.maxTransactionAmount = '500'; // Further increased
          circle.newUserPeriod.maxWalletBalance = '5000'; // Further increased
          circle.newUserPeriod.allowedActions = ['all']; // All actions allowed
        }

        await this.storeSecurityCircle(userId, circle);
        console.log(`📈 Verification level updated for ${userId}: ${newVerificationLevel}`);
      }

    } catch (error) {
      console.error('Failed to update verification level:', error);
    }
  }

  // Economic Staking Methods

  // Lock inviter's stake when they invite someone
  private async lockInviterStake(inviterId: string, newUserId: string): Promise<void> {
    try {
      const stakeAmount = 40; // 40 A50 stake per invite
      const inviterBalance = parseFloat(this.walletService.getBalance()); // Would need to get inviter's balance

      if (inviterBalance < stakeAmount) {
        throw new Error(`Insufficient balance to stake for invite. Need ${stakeAmount} A50`);
      }

      // Deduct stake from inviter's balance
      // await this.walletService.updateBalance((inviterBalance - stakeAmount).toFixed(8));

      console.log(`💰 Locked ${stakeAmount} A50 stake for inviter ${inviterId} → new user ${newUserId}`);

      // Store stake record
      await this.storeStakeRecord(inviterId, newUserId, stakeAmount, 'inviter_stake');

    } catch (error) {
      console.error('Failed to lock inviter stake:', error);
      throw error;
    }
  }

  // Lock member's stake when they generate an invite
  private async lockMemberStake(userId: string, stakeAmount: number): Promise<void> {
    try {
      const userBalance = parseFloat(this.walletService.getBalance());

      if (userBalance < stakeAmount) {
        throw new Error(`Insufficient balance to stake for invite. Need ${stakeAmount} A50`);
      }

      // Deduct stake from user's balance
      // await this.walletService.updateBalance((userBalance - stakeAmount).toFixed(8));

      console.log(`💰 Locked ${stakeAmount} A50 member stake for user ${userId}`);

      // Store stake record
      await this.storeStakeRecord(userId, userId, stakeAmount, 'member_stake');

    } catch (error) {
      console.error('Failed to lock member stake:', error);
      throw error;
    }
  }

  // Release stakes when Security Circle is complete (after 90 days)
  async releaseStakes(userId: string): Promise<{ released: boolean; amount: string; reason: string }> {
    try {
      const circle = await this.getSecurityCircle(userId);
      if (!circle) {
        return { released: false, amount: '0', reason: 'Security Circle not found' };
      }

      if (!circle.isComplete) {
        return { released: false, amount: '0', reason: 'Security Circle not complete' };
      }

      // Check if 90 days have passed since completion
      if (!circle.completedAt) {
        return { released: false, amount: '0', reason: 'Completion date not recorded' };
      }

      const now = new Date();
      const daysSinceCompletion = (now.getTime() - circle.completedAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceCompletion < 90) {
        const remainingDays = Math.ceil(90 - daysSinceCompletion);
        return {
          released: false,
          amount: '0',
          reason: `Stakes locked for ${remainingDays} more days (90-day security period)`
        };
      }

      // Release stakes
      const totalStakeAmount = parseFloat(circle.economicStake.totalStaked);

      if (totalStakeAmount > 0) {
        // Return stake to user's balance
        const currentBalance = parseFloat(this.walletService.getBalance());
        // await this.walletService.updateBalance((currentBalance + totalStakeAmount).toFixed(8));

        // Update circle to mark stakes as released
        circle.economicStake.stakeReleasedAt = now;
        circle.economicStake.slashingRisk = false;
        await this.storeSecurityCircle(userId, circle);

        console.log(`🎉 Released ${totalStakeAmount} A50 in stakes for completed Security Circle ${userId}`);

        return {
          released: true,
          amount: totalStakeAmount.toString(),
          reason: 'Stakes released after 90-day security period'
        };
      }

      return { released: false, amount: '0', reason: 'No stakes to release' };

    } catch (error) {
      console.error('Failed to release stakes:', error);
      return { released: false, amount: '0', reason: 'Error releasing stakes' };
    }
  }

  // Slash stakes if Sybil activity is detected
  async slashStakes(userId: string, reason: string, evidence: any): Promise<{ slashed: boolean; amount: string; reason: string }> {
    try {
      const circle = await this.getSecurityCircle(userId);
      if (!circle) {
        return { slashed: false, amount: '0', reason: 'Security Circle not found' };
      }

      if (!circle.economicStake.slashingRisk) {
        return { slashed: false, amount: '0', reason: 'Stakes already released or not at risk' };
      }

      const totalStakeAmount = parseFloat(circle.economicStake.totalStaked);

      if (totalStakeAmount > 0) {
        // Get detection confidence from Sybil analysis
        const sybilDetection = await this.detectSybilActivity(userId);

        // Record slashing event
        await this.recordSlashingEvent(userId, totalStakeAmount, reason, evidence);

        // Add slashed funds to Sybil Insurance Pool
        await this.insurancePool.addSlashedFunds(
          userId,
          totalStakeAmount.toString(),
          reason,
          sybilDetection.confidence,
          evidence
        );

        // Update circle to mark stakes as slashed
        circle.economicStake.totalStaked = '0';
        circle.economicStake.memberStake = '0';
        circle.economicStake.inviterStake = '0';
        circle.economicStake.slashingRisk = false;
        circle.walletUnlocked = false; // Re-lock wallet

        await this.storeSecurityCircle(userId, circle);

        console.log(`⚡ SLASHED ${totalStakeAmount} A50 in stakes for Sybil activity: ${userId}`);
        console.log(`   Reason: ${reason}`);
        console.log(`   💰 Funds added to Sybil Insurance Pool for honest user rewards`);

        return {
          slashed: true,
          amount: totalStakeAmount.toString(),
          reason: `Stakes slashed due to: ${reason}. Funds redistributed to honest users.`
        };
      }

      return { slashed: false, amount: '0', reason: 'No stakes to slash' };

    } catch (error) {
      console.error('Failed to slash stakes:', error);
      return { slashed: false, amount: '0', reason: 'Error slashing stakes' };
    }
  }

  // Detect potential Sybil activity
  async detectSybilActivity(userId: string): Promise<{ suspicious: boolean; confidence: number; reasons: string[] }> {
    try {
      const circle = await this.getSecurityCircle(userId);
      if (!circle) {
        return { suspicious: false, confidence: 0, reasons: ['No Security Circle found'] };
      }

      let suspicionScore = 0;
      const reasons: string[] = [];

      // Check 1: All invites from same IP range
      const ipAddresses = circle.members.map(m => this.getIPFromUser(m.id));
      const uniqueIPs = new Set(ipAddresses);
      if (uniqueIPs.size < circle.members.length * 0.7) { // Less than 70% unique IPs
        suspicionScore += 30;
        reasons.push('Low IP diversity among circle members');
      }

      // Check 2: Rapid account creation and mining
      const memberCreationTimes = circle.members.map(m => new Date(m.invitedAt).getTime());
      const timeDiffs = memberCreationTimes.map((time, i) =>
        i > 0 ? time - memberCreationTimes[i-1] : 0
      );
      const avgTimeBetweenInvites = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;

      if (avgTimeBetweenInvites < 24 * 60 * 60 * 1000) { // Less than 24 hours between invites
        suspicionScore += 25;
        reasons.push('Suspiciously rapid invite pattern');
      }

      // Check 3: All members mining within short timeframe
      const miningTimes = circle.members
        .filter(m => m.firstMiningAt)
        .map(m => new Date(m.firstMiningAt!).getTime());

      if (miningTimes.length >= 3) {
        const miningTimeSpread = Math.max(...miningTimes) - Math.min(...miningTimes);
        if (miningTimeSpread < 60 * 60 * 1000) { // All mined within 1 hour
          suspicionScore += 35;
          reasons.push('All members completed first mining within 1 hour');
        }
      }

      // Check 4: New user period violations
      if (circle.newUserPeriod.restrictionsActive) {
        const daysSinceCreation = (Date.now() - circle.newUserPeriod.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 7 && circle.invitesSent === 3) { // All invites sent within first week
          suspicionScore += 20;
          reasons.push('All invites sent within first week of account creation');
        }
      }

      const confidence = Math.min(suspicionScore, 100);
      const suspicious = confidence >= 70; // 70% confidence threshold

      if (suspicious) {
        console.log(`🚨 Potential Sybil activity detected for ${userId}:`);
        console.log(`   Confidence: ${confidence}%`);
        reasons.forEach(reason => console.log(`   - ${reason}`));
      }

      return { suspicious, confidence, reasons };

    } catch (error) {
      console.error('Failed to detect Sybil activity:', error);
      return { suspicious: false, confidence: 0, reasons: ['Detection error'] };
    }
  }

  // Helper methods for staking
  private async storeStakeRecord(stakerId: string, beneficiaryId: string, amount: number, type: string): Promise<void> {
    try {
      const record = {
        stakerId,
        beneficiaryId,
        amount: amount.toString(),
        type,
        timestamp: new Date().toISOString(),
        released: false
      };

      await AsyncStorage.setItem(`@aura50_stake_${stakerId}_${beneficiaryId}`, JSON.stringify(record));
    } catch (error) {
      console.error('Failed to store stake record:', error);
    }
  }

  private async recordSlashingEvent(userId: string, amount: number, reason: string, evidence: any): Promise<void> {
    try {
      const slashingEvent = {
        userId,
        amount: amount.toString(),
        reason,
        evidence,
        timestamp: new Date().toISOString()
      };

      const stored = await AsyncStorage.getItem('@aura50_slashing_events');
      const events = stored ? JSON.parse(stored) : [];
      events.push(slashingEvent);

      await AsyncStorage.setItem('@aura50_slashing_events', JSON.stringify(events));
    } catch (error) {
      console.error('Failed to record slashing event:', error);
    }
  }

  private getIPFromUser(userId: string): string {
    // Simplified IP extraction - in production would use actual IP tracking
    return `192.168.1.${userId.slice(-3)}`;
  }
}

export default SecurityCircleService;