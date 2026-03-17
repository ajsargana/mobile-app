import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from './EnhancedWalletService';
import { NetworkService } from './NetworkService';
import MobileNodeService from './MobileNodeService';
import config from '../config/environment';

export interface MobileReferralData {
  referralCode: string;
  username?: string;
  deepLinks: string[];
  qrCodes: QRCodeData[];
  socialSharing: SocialShareData[];
  trustMultiplier: number;
  totalEarnings: string;
  totalReferrals: number;
}

export interface QRCodeData {
  type: 'code' | 'username' | 'app-download';
  data: string;
  imageUrl: string;
}

export interface SocialShareData {
  platform: 'whatsapp' | 'telegram' | 'sms' | 'contacts';
  title: string;
  message: string;
  url: string;
  deepLink?: string;
}

export interface ReferralReward {
  id: string;
  referredUserId: string;
  amount: string;
  trustBonus: number;
  timestamp: Date;
  source: 'mobile' | 'web' | 'qr' | 'social';
}

export class MobileReferralService {
  private static instance: MobileReferralService;
  private walletService: EnhancedWalletService;
  private networkService: NetworkService;
  private nodeService: MobileNodeService;

  private constructor() {
    this.walletService = EnhancedWalletService.getInstance();
    this.networkService = NetworkService.getInstance();
    this.nodeService = MobileNodeService.getInstance();
  }

  static getInstance(): MobileReferralService {
    if (!MobileReferralService.instance) {
      MobileReferralService.instance = new MobileReferralService();
    }
    return MobileReferralService.instance;
  }

  // Get comprehensive mobile referral data
  async getMobileReferralData(): Promise<MobileReferralData> {
    try {
      const user = this.walletService.getUser();
      const currentAccount = this.walletService.getCurrentAccount();

      if (!user || !currentAccount) {
        throw new Error('User not authenticated');
      }

      // Get auth token
      const authToken = await this.getAuthToken();
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      // Get environment config
      const environment = config;
      const baseUrl = environment.baseUrl;

      // Fetch referral links from backend
      const linksResponse = await fetch(`${baseUrl}/api/referrals/links`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!linksResponse.ok) {
        throw new Error(`Failed to fetch referral links: HTTP ${linksResponse.status}`);
      }

      const linksData = await linksResponse.json();

      // Fetch mobile sharing options from backend
      const mobileResponse = await fetch(`${baseUrl}/api/referrals/mobile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!mobileResponse.ok) {
        throw new Error(`Failed to fetch mobile options: HTTP ${mobileResponse.status}`);
      }

      const mobileData = await mobileResponse.json();

      // Get trust level for multiplier calculation
      const trustLevel = this.walletService.calculateTrustLevel(user);
      const trustMultiplier = this.calculateTrustMultiplier(trustLevel);

      // Transform backend links to QR codes format
      const qrCodes: QRCodeData[] = linksData.links.map((link: any) => ({
        type: link.type === 'code' ? 'code' : 'username',
        data: link.url,
        imageUrl: `${baseUrl}${link.qrCodeUrl}`
      }));

      // Add app download QR
      qrCodes.push({
        type: 'app-download',
        data: `${baseUrl}/download?ref=${mobileData.referralCode}`,
        imageUrl: `${baseUrl}/api/referrals/qr/app-download-${mobileData.referralCode}`
      });

      // Transform backend mobile options to social sharing format
      const socialSharing: SocialShareData[] = mobileData.mobileOptions.map((option: any) => ({
        platform: option.platform,
        title: option.displayName,
        message: `Join me on AURA50 - Revolutionary mobile blockchain mining! Use code ${mobileData.referralCode}`,
        url: option.url,
        deepLink: `${mobileData.referralUrl}?source=${option.platform}`
      }));

      // Generate deep links
      const appScheme = 'AURA5O://';
      const deepLinks = [
        `${appScheme}join?ref=${mobileData.referralCode}&source=mobile`,
        mobileData.referralUrl,
        user.username ? `${baseUrl}/join/${user.username}` : null
      ].filter(Boolean) as string[];

      // Get referral statistics from backend
      const { totalEarnings, totalReferrals } = await this.getReferralStats();

      return {
        referralCode: mobileData.referralCode,
        username: user.username,
        deepLinks,
        qrCodes,
        socialSharing,
        trustMultiplier,
        totalEarnings,
        totalReferrals
      };

    } catch (error) {
      console.error('Failed to get mobile referral data:', error);

      // Fallback to local data if backend unavailable
      return this.getFallbackReferralData();
    }
  }

  // Generate mobile-optimized social sharing options
  private generateSocialSharing(user: any, baseUrl: string): SocialShareData[] {
    const referralMessage = `🚀 Join AURA5O - the world's first mobile-native blockchain! Start mining on your phone and earn A50 tokens. Use my referral code: ${user.referralCode}`;

    return [
      {
        platform: 'whatsapp',
        title: 'Share on WhatsApp',
        message: referralMessage,
        url: `whatsapp://send?text=${encodeURIComponent(referralMessage + ' ' + baseUrl + '?ref=' + user.referralCode)}`,
        deepLink: `${baseUrl}?ref=${user.referralCode}&source=whatsapp`
      },
      {
        platform: 'telegram',
        title: 'Share on Telegram',
        message: referralMessage,
        url: `tg://msg_url?url=${encodeURIComponent(baseUrl + '?ref=' + user.referralCode)}&text=${encodeURIComponent(referralMessage)}`,
        deepLink: `${baseUrl}?ref=${user.referralCode}&source=telegram`
      },
      {
        platform: 'sms',
        title: 'Share via SMS',
        message: referralMessage,
        url: `sms:?body=${encodeURIComponent(referralMessage + ' Download: ' + baseUrl + '?ref=' + user.referralCode)}`,
        deepLink: `${baseUrl}?ref=${user.referralCode}&source=sms`
      },
      {
        platform: 'contacts',
        title: 'Share with Contacts',
        message: referralMessage,
        url: '', // Handled by native contact picker
        deepLink: `${baseUrl}?ref=${user.referralCode}&source=contacts`
      }
    ];
  }

  // Process incoming referral for mobile users
  async processIncomingReferral(referralCode: string, source: string = 'mobile'): Promise<ReferralReward | null> {
    try {
      const user = this.walletService.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check if user already used a referral
      const existingReferral = await this.getExistingReferral();
      if (existingReferral) {
        throw new Error('User has already used a referral code');
      }

      // Validate referral code via network
      const referralData = await this.validateReferralCode(referralCode);
      if (!referralData.valid) {
        throw new Error('Invalid referral code');
      }

      // Calculate trust-based bonus
      const referrerTrustLevel = referralData.referrerTrustLevel;
      const trustMultiplier = this.calculateTrustMultiplier(referrerTrustLevel);
      const baseBonus = 10; // 10 A50 base bonus
      const bonusAmount = baseBonus * trustMultiplier;

      // Check if referral spending limit reached (mobile check via network)
      const canPayReferrals = await this.checkReferralSpendingLimit(bonusAmount);
      if (!canPayReferrals) {
        throw new Error('Referral bonus limit reached. No more referral bonuses available.');
      }

      // Create referral reward
      const reward: ReferralReward = {
        id: `mobile_referral_${Date.now()}`,
        referredUserId: user.id,
        amount: bonusAmount.toFixed(8),
        trustBonus: trustMultiplier,
        timestamp: new Date(),
        source: source as any
      };

      // Store referral locally
      await this.storeReferralReward(reward);

      // Broadcast referral to network if connected
      if (this.networkService.isNetworkConnected()) {
        await this.broadcastReferral(referralCode, user.id, source, bonusAmount);
      } else {
        // Queue for later broadcast
        await this.queueReferralForBroadcast(referralCode, user.id, source, bonusAmount);
      }

      // Update local balance
      await this.walletService.updateBalance(
        (parseFloat(this.walletService.getBalance()) + bonusAmount).toFixed(8)
      );

      console.log(`✅ Referral processed: ${bonusAmount} A50 earned from ${referralCode}`);
      return reward;

    } catch (error) {
      console.error('Failed to process referral:', error);
      return null;
    }
  }

  // Share referral with native mobile sharing
  async shareReferral(platform: string, customMessage?: string): Promise<boolean> {
    try {
      const referralData = await this.getMobileReferralData();
      const shareData = referralData.socialSharing.find(s => s.platform === platform);

      if (!shareData) {
        throw new Error(`Sharing platform ${platform} not supported`);
      }

      const message = customMessage || shareData.message;
      const url = shareData.deepLink || shareData.url;

      // Track sharing activity
      await this.trackSharingActivity(platform, url);

      // Platform-specific sharing
      switch (platform) {
        case 'whatsapp':
          return await this.shareToWhatsApp(message, url);
        case 'telegram':
          return await this.shareToTelegram(message, url);
        case 'sms':
          return await this.shareToSMS(message);
        case 'contacts':
          return await this.shareToContacts(message, url);
        default:
          throw new Error(`Unknown platform: ${platform}`);
      }

    } catch (error) {
      console.error(`Failed to share to ${platform}:`, error);
      return false;
    }
  }

  // Generate QR code for in-person sharing
  async generateQRCodeForSharing(type: 'code' | 'username' | 'app-download' = 'code'): Promise<string> {
    try {
      const referralData = await this.getMobileReferralData();
      const qrCode = referralData.qrCodes.find(qr => qr.type === type);

      if (!qrCode) {
        throw new Error(`QR code type ${type} not available`);
      }

      // Track QR code generation
      await this.trackSharingActivity('qr-code', qrCode.data);

      return qrCode.imageUrl;

    } catch (error) {
      console.error('Failed to generate QR code:', error);
      throw error;
    }
  }

  // Integration with mobile node system
  async integrateWithMobileNode(): Promise<void> {
    try {
      // Enhanced referral rewards for mobile node operators
      if (this.nodeService.isNodeRunning()) {
        const nodeStats = await this.nodeService.getNodeStats();

        // Additional referral bonus for node operators
        const nodeBonus = this.calculateNodeOperatorBonus(nodeStats);

        console.log(`📱 Mobile node referral bonus: ${nodeBonus}x multiplier`);

        // Store node operator status
        await AsyncStorage.setItem('@aura50_node_operator', 'true');
      }

      // Listen for node rewards and apply referral bonuses
      this.nodeService.on?.('rewardEarned', async (reward: any) => {
        await this.processNodeReferralBonus(reward);
      });

    } catch (error) {
      console.error('Failed to integrate with mobile node:', error);
    }
  }

  // Calculate trust-based multiplier for referral bonuses
  private calculateTrustMultiplier(trustLevel: string): number {
    switch (trustLevel) {
      case 'legend': return 3.0;   // 3x bonus for legends
      case 'veteran': return 2.0;  // 2x bonus for veterans
      case 'established': return 1.5; // 1.5x bonus for established
      case 'new':
      default: return 1.0; // Base bonus for new users
    }
  }

  // Calculate additional bonus for mobile node operators
  private calculateNodeOperatorBonus(nodeStats: any): number {
    // Node operators get enhanced referral rewards
    const baseBonus = 1.0;
    const uptimeBonus = Math.min(0.5, nodeStats.uptime / (24 * 60 * 60 * 1000) * 0.1); // Up to 0.5x for 5 days uptime
    const trustBonus = nodeStats.trustScore / 100 * 0.3; // Up to 0.3x for high trust

    return baseBonus + uptimeBonus + trustBonus;
  }

  // Platform-specific sharing implementations
  private async shareToWhatsApp(message: string, url: string): Promise<boolean> {
    try {
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message + ' ' + url)}`;
      // In React Native, would use Linking.openURL(whatsappUrl)
      return true;
    } catch (error) {
      return false;
    }
  }

  private async shareToTelegram(message: string, url: string): Promise<boolean> {
    try {
      const telegramUrl = `tg://msg_url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`;
      // In React Native, would use Linking.openURL(telegramUrl)
      return true;
    } catch (error) {
      return false;
    }
  }

  private async shareToSMS(message: string): Promise<boolean> {
    try {
      // In React Native, would use react-native-sms or Linking for SMS
      return true;
    } catch (error) {
      return false;
    }
  }

  private async shareToContacts(message: string, url: string): Promise<boolean> {
    try {
      // In React Native, would use react-native-contacts
      return true;
    } catch (error) {
      return false;
    }
  }

  // Helper methods
  private async getReferralStats(): Promise<{ totalEarnings: string; totalReferrals: number }> {
    try {
      // Get auth token
      const authToken = await this.getAuthToken();
      if (!authToken) {
        return this.getLocalReferralStats();
      }

      // Get environment config
      const environment = config;
      const baseUrl = environment.baseUrl;

      // Fetch referral progress from backend (more accurate than analytics)
      const response = await fetch(`${baseUrl}/api/referral/progress`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        console.warn('Failed to fetch referral progress, using local data');
        return this.getLocalReferralStats();
      }

      const progress = await response.json();

      if (!progress.success) {
        return this.getLocalReferralStats();
      }

      // Calculate total referrals from progress data
      const totalReferrals = (progress.referrals || []).length;

      // Calculate earnings from referral bonuses (estimate: 1 A50 per verified referral)
      const totalEarnings = (progress.verified || 0).toString();

      // Cache the stats locally
      await AsyncStorage.setItem('@aura50_referral_stats', JSON.stringify({
        totalEarnings,
        totalReferrals,
        verified: progress.verified,
        pending: progress.pending,
        mined: progress.mined,
      }));

      console.log('✅ Referral stats fetched:', { totalReferrals, verified: progress.verified, pending: progress.pending, mined: progress.mined });

      return {
        totalEarnings,
        totalReferrals
      };

    } catch (error) {
      console.error('Error fetching referral stats:', error);
      return this.getLocalReferralStats();
    }
  }

  private async getLocalReferralStats(): Promise<{ totalEarnings: string; totalReferrals: number }> {
    try {
      const stored = await AsyncStorage.getItem('@aura50_referral_stats');
      return stored ? JSON.parse(stored) : { totalEarnings: '0', totalReferrals: 0 };
    } catch (error) {
      return { totalEarnings: '0', totalReferrals: 0 };
    }
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('@aura50_auth_token');
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  }

  private async getFallbackReferralData(): Promise<MobileReferralData> {
    // Fallback to local data when backend unavailable
    const user = this.walletService.getUser();
    const trustLevel = user ? this.walletService.calculateTrustLevel(user) : 'new';
    const trustMultiplier = this.calculateTrustMultiplier(trustLevel);
    const { totalEarnings, totalReferrals } = await this.getLocalReferralStats();

    const baseUrl = 'https://AURA5O.com';
    const appScheme = 'AURA5O://';
    const referralCode = user?.referralCode || 'DEMO';

    return {
      referralCode,
      username: user?.username,
      deepLinks: [
        `${appScheme}join?ref=${referralCode}&source=mobile`,
        `${baseUrl}?ref=${referralCode}&source=mobile`
      ],
      qrCodes: [
        {
          type: 'code',
          data: `${baseUrl}?ref=${referralCode}`,
          imageUrl: `${baseUrl}/api/qr/code/${referralCode}`
        }
      ],
      socialSharing: this.generateSocialSharing(user || { referralCode }, baseUrl),
      trustMultiplier,
      totalEarnings,
      totalReferrals
    };
  }

  private async getExistingReferral(): Promise<ReferralReward | null> {
    try {
      const stored = await AsyncStorage.getItem('@aura50_user_referral');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  private async validateReferralCode(code: string): Promise<{ valid: boolean; referrerTrustLevel: string }> {
    // In real implementation, would validate via network/API
    return { valid: true, referrerTrustLevel: 'established' };
  }

  private async storeReferralReward(reward: ReferralReward): Promise<void> {
    await AsyncStorage.setItem('@aura50_user_referral', JSON.stringify(reward));
  }

  private async broadcastReferral(referralCode: string, userId: string, source: string, amount: number): Promise<void> {
    // Broadcast referral to P2P network
    await this.networkService.broadcastMessage({
      type: 'referral',
      referralCode,
      userId,
      source,
      amount: amount.toFixed(8),
      timestamp: new Date().toISOString()
    });
  }

  private async queueReferralForBroadcast(referralCode: string, userId: string, source: string, amount: number): Promise<void> {
    const queue = await AsyncStorage.getItem('@aura50_referral_queue') || '[]';
    const queueData = JSON.parse(queue);

    queueData.push({
      referralCode,
      userId,
      source,
      amount: amount.toFixed(8),
      timestamp: new Date().toISOString()
    });

    await AsyncStorage.setItem('@aura50_referral_queue', JSON.stringify(queueData));
  }

  private async trackSharingActivity(platform: string, url: string): Promise<void> {
    console.log(`📊 Tracking referral share: ${platform} -> ${url}`);

    // Store locally for analytics
    const activity = {
      platform,
      url,
      timestamp: new Date().toISOString()
    };

    const stored = await AsyncStorage.getItem('@aura50_sharing_activity') || '[]';
    const activities = JSON.parse(stored);
    activities.push(activity);

    // Keep only last 100 activities
    if (activities.length > 100) {
      activities.splice(0, activities.length - 100);
    }

    await AsyncStorage.setItem('@aura50_sharing_activity', JSON.stringify(activities));
  }

  private async processNodeReferralBonus(reward: any): Promise<void> {
    // Apply additional referral bonuses for node operators
    const nodeBonus = await this.calculateNodeOperatorBonus(reward);
    console.log(`🎯 Node operator referral bonus applied: ${nodeBonus}x`);
  }

  // Public API
  async isNodeOperator(): Promise<boolean> {
    try {
      const isOperator = await AsyncStorage.getItem('@aura50_node_operator');
      return isOperator === 'true';
    } catch (error) {
      return false;
    }
  }

  async getTotalReferralEarnings(): Promise<string> {
    const stats = await this.getReferralStats();
    return stats.totalEarnings;
  }

  async getTotalReferrals(): Promise<number> {
    const stats = await this.getReferralStats();
    return stats.totalReferrals;
  }

  // Check referral spending limit via network API
  private async checkReferralSpendingLimit(requestedAmount: number): Promise<boolean> {
    try {
      if (!this.networkService.isNetworkConnected()) {
        // If offline, allow referral but it will be validated when synced
        return true;
      }

      // Query network for current referral spending status
      const response = await fetch('/api/referral/spending-status');
      const status = await response.json();

      if (!status.enabled) {
        return false;
      }

      const currentSpent = parseFloat(status.totalSpent || '0');
      const limit = 2_000_000; // 2M A50 limit

      return (currentSpent + requestedAmount) <= limit;

    } catch (error) {
      console.error('Failed to check referral spending limit:', error);
      // Fail safe: allow if we can't check (will be validated server-side)
      return true;
    }
  }
}

export default MobileReferralService;