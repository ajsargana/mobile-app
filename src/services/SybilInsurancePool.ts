import AsyncStorage from '@react-native-async-storage/async-storage';
import { config, API_ENDPOINTS, getApiUrl } from '../config/environment';

/** Create an AbortSignal that times out after `ms` milliseconds (Hermes-safe) */
function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// ============================================================================
// Sybil Insurance Pool - Mobile Service (API-Backed)
// All data fetched from real server endpoints, with local caching
// ============================================================================

export interface PoolContribution {
  id: string;
  contributorId: string;
  amount: string;
  source: 'sybil_slashing' | 'voluntary_donation' | 'protocol_fee';
  reason: string;
  timestamp: string;
  slashingDetails?: {
    slashedUserId: string;
    detectionConfidence: number;
    evidenceHash: string;
  };
}

export interface HonestUserReward {
  id: string;
  userId: string;
  amount: string;
  rewardType: 'detection_bonus' | 'circle_completion' | 'ecosystem_participation' | 'loyalty_bonus';
  eligibilityCriteria: string[];
  distributedAt: string;
  poolContributionId: string;
}

export interface InsurancePoolStats {
  totalBalance: string;
  totalContributions: string;
  totalRewardsDistributed: string;
  totalEcosystemFunding: string;
  sybilAttacksStopped: number;
  honestUsersRewarded: number;
  contributionsBySource: {
    sybil_slashing: string;
    voluntary_donation: string;
    protocol_fee: string;
  };
  monthlyStats: {
    slashingEvents: number;
    rewardsDistributed: number;
    newHonestUsers: number;
    ecosystemProjects: number;
  };
  recentActivity: Array<{
    type: string;
    amount: string;
    description: string;
    timestamp: string;
  }>;
}

export interface RewardEligibility {
  userId: string;
  eligibilityScore: number;
  eligibilityCriteria: {
    completedSecurityCircle: boolean;
    trustLevel: string;
    participationDays: number;
    detectionContributions: number;
    communityVouches: number;
    slashingRisk: boolean;
  };
  estimatedReward: string;
  rank?: number;
  totalEligibleUsers?: number;
}

export interface FundingProposal {
  id: string;
  proposerId: string;
  projectName: string;
  amount: string;
  purpose: string;
  description: string;
  createdAt: string;
  votingEnds: string;
  votes: { yes: number; no: number };
  voters: string[];
  status: 'active' | 'passed' | 'rejected' | 'executed';
}

// Cache TTL: 2 minutes for stats, 5 minutes for contributions
const CACHE_TTL_STATS = 2 * 60 * 1000;
const CACHE_TTL_DATA = 5 * 60 * 1000;

export class SybilInsurancePool {
  private static instance: SybilInsurancePool;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  private constructor() {}

  static getInstance(): SybilInsurancePool {
    if (!SybilInsurancePool.instance) {
      SybilInsurancePool.instance = new SybilInsurancePool();
    }
    return SybilInsurancePool.instance;
  }

  // ========================================================================
  // Auth helper
  // ========================================================================

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await AsyncStorage.getItem('@aura50_auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private getCached<T>(key: string, ttl: number): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < ttl) {
      return entry.data as T;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /** Parse JSON safely, throwing a clear error if the server returned HTML */
  private async parseJSON<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Server returned ${contentType || 'unknown content type'} instead of JSON (status ${response.status}). The API endpoint may not exist — restart the server.`);
    }
    return response.json();
  }

  // ========================================================================
  // Pool Statistics
  // ========================================================================

  async getPoolStats(): Promise<InsurancePoolStats> {
    // Check cache first
    const cached = this.getCached<InsurancePoolStats>('poolStats', CACHE_TTL_STATS);
    if (cached) return cached;

    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.insurancePoolStats), {
        method: 'GET',
        headers: await this.getAuthHeaders(),
        signal: createTimeoutSignal(config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const stats: InsurancePoolStats = await this.parseJSON(response);
      this.setCache('poolStats', stats);

      // Also save to local storage for offline access
      await AsyncStorage.setItem('@aura50_pool_stats_cache', JSON.stringify(stats));

      return stats;
    } catch (error) {
      console.warn('Failed to fetch pool stats from server, trying local cache:', error);

      // Fallback to local storage cache
      const localCache = await AsyncStorage.getItem('@aura50_pool_stats_cache');
      if (localCache) {
        return JSON.parse(localCache);
      }

      // Return empty stats if no cache available
      return this.emptyStats();
    }
  }

  // ========================================================================
  // Reward Eligibility
  // ========================================================================

  async calculateRewardEligibility(userId: string): Promise<RewardEligibility> {
    const cacheKey = `eligibility_${userId}`;
    const cached = this.getCached<RewardEligibility>(cacheKey, CACHE_TTL_STATS);
    if (cached) return cached;

    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.insurancePoolEligibility), {
        method: 'GET',
        headers: await this.getAuthHeaders(),
        signal: createTimeoutSignal(config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const eligibility: RewardEligibility = await this.parseJSON(response);
      this.setCache(cacheKey, eligibility);

      await AsyncStorage.setItem('@aura50_eligibility_cache', JSON.stringify(eligibility));

      return eligibility;
    } catch (error) {
      console.warn('Failed to fetch eligibility from server:', error);

      const localCache = await AsyncStorage.getItem('@aura50_eligibility_cache');
      if (localCache) {
        return JSON.parse(localCache);
      }

      return {
        userId,
        eligibilityScore: 0,
        eligibilityCriteria: {
          completedSecurityCircle: false,
          trustLevel: 'new',
          participationDays: 0,
          detectionContributions: 0,
          communityVouches: 0,
          slashingRisk: true,
        },
        estimatedReward: '0',
      };
    }
  }

  // ========================================================================
  // Contributions
  // ========================================================================

  async getContributions(limit = 20, offset = 0): Promise<{ contributions: PoolContribution[]; total: number }> {
    try {
      const url = `${getApiUrl(API_ENDPOINTS.insurancePoolContributions)}?limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: await this.getAuthHeaders(),
        signal: createTimeoutSignal(config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return await this.parseJSON(response);
    } catch (error) {
      console.warn('Failed to fetch contributions:', error);
      return { contributions: [], total: 0 };
    }
  }

  // ========================================================================
  // Rewards
  // ========================================================================

  async getRewards(mine = false, limit = 20, offset = 0): Promise<{ rewards: HonestUserReward[]; total: number }> {
    try {
      const url = `${getApiUrl(API_ENDPOINTS.insurancePoolRewards)}?mine=${mine}&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: await this.getAuthHeaders(),
        signal: createTimeoutSignal(config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return await this.parseJSON(response);
    } catch (error) {
      console.warn('Failed to fetch rewards:', error);
      return { rewards: [], total: 0 };
    }
  }

  // ========================================================================
  // Voluntary Donation
  // ========================================================================

  async makeVoluntaryContribution(
    userId: string,
    amount: string,
    message: string
  ): Promise<{ success: boolean; contribution?: PoolContribution; newBalance?: string; message?: string }> {
    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.insurancePoolDonate), {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({ amount, message }),
        signal: createTimeoutSignal(config.timeout),
      });

      const data = await this.parseJSON(response);

      if (!response.ok) {
        throw new Error(data.message || 'Donation failed');
      }

      // Invalidate stats cache after donation
      this.cache.delete('poolStats');
      this.cache.delete(`eligibility_${userId}`);

      return data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to process donation');
    }
  }

  // ========================================================================
  // Governance Proposals
  // ========================================================================

  async getProposals(): Promise<FundingProposal[]> {
    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.insurancePoolProposals), {
        method: 'GET',
        headers: await this.getAuthHeaders(),
        signal: createTimeoutSignal(config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await this.parseJSON(response);
      return data.proposals || [];
    } catch (error) {
      console.warn('Failed to fetch proposals:', error);
      return [];
    }
  }

  async createProposal(
    projectName: string,
    amount: string,
    purpose: string,
    description: string
  ): Promise<FundingProposal | null> {
    try {
      const response = await fetch(getApiUrl(API_ENDPOINTS.insurancePoolProposals), {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({ projectName, amount, purpose, description }),
        signal: createTimeoutSignal(config.timeout),
      });

      const data = await this.parseJSON(response);

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create proposal');
      }

      return data.proposal;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create proposal');
    }
  }

  async voteOnProposal(proposalId: string, vote: 'yes' | 'no'): Promise<FundingProposal | null> {
    try {
      const response = await fetch(
        `${getApiUrl(API_ENDPOINTS.insurancePoolProposals)}/${proposalId}/vote`,
        {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify({ vote }),
          signal: createTimeoutSignal(config.timeout),
        }
      );

      const data = await this.parseJSON(response);

      if (!response.ok) {
        throw new Error(data.message || 'Failed to cast vote');
      }

      return data.proposal;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to cast vote');
    }
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  clearCache(): void {
    this.cache.clear();
  }

  private emptyStats(): InsurancePoolStats {
    return {
      totalBalance: '0',
      totalContributions: '0',
      totalRewardsDistributed: '0',
      totalEcosystemFunding: '0',
      sybilAttacksStopped: 0,
      honestUsersRewarded: 0,
      contributionsBySource: {
        sybil_slashing: '0',
        voluntary_donation: '0',
        protocol_fee: '0',
      },
      monthlyStats: {
        slashingEvents: 0,
        rewardsDistributed: 0,
        newHonestUsers: 0,
        ecosystemProjects: 0,
      },
      recentActivity: [],
    };
  }
}

export default SybilInsurancePool;
