import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../config/environment';

export interface NetworkStats {
  network: {
    blockHeight: number;
    difficulty: number;
    hashRate: number;
    avgBlockTime: number;
    peerCount: number;
  };
  blockchain: {
    totalBlocks: number;
    totalTransactions: number;
    totalUsers: number;
  };
  economics: {
    totalSupply: string;
    maxSupply: string;
    circulatingSupply: string;
    currentBlockReward: string;
  };
}

export interface Block {
  id: string;
  height: number;
  timestamp: string;
  prevHash: string;
  merkleRoot: string;
  nonce: string;
  hash: string;
  difficulty: number;
  status: 'pending' | 'confirmed' | 'final';
  participantCount?: number;
  transactionCount?: number;
  totalReward: string;
}

export interface BlockDetail extends Block {
  participants: Array<{
    userId: string;
    username: string;
    shares: number;
    reward: string;
    timestamp: string;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    from: string;
    to: string;
    amount: string;
    timestamp: string;
    status: string;
  }>;
  payouts: Array<{
    userId: string;
    username: string;
    amount: string;
    timestamp: string;
  }>;
}

export interface Transaction {
  id: string;
  type: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  timestamp: string;
  status: string;
  blockId?: string;
  metadata?: Record<string, any>;
}

export interface TransactionDetail extends Transaction {
  block?: {
    id: string;
    height: number;
    timestamp: string;
    hash: string;
  };
}

export interface Address {
  address: string;
  username: string;
  balance: string;
  totalMined: string;
  miningStreak: number;
  createdAt: string;
}

export interface AddressDetail extends Address {
  transactions: Transaction[];
  miningHistory: Array<{
    blockId: string;
    height: number;
    reward: string;
    shares: number;
    status: string;
    timestamp: string;
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface Miner {
  rank: number;
  username: string;
  address?: string;
  totalMined: string;
  miningStreak?: number;
  balance?: string;
  blocksMinedCount?: number;
  lastActiveAt?: string;
}

export interface SearchResult {
  blocks: Array<{ id: string; height: number; hash: string; timestamp: string }>;
  transactions: Array<{ id: string; type: string; amount: string; timestamp: string }>;
  addresses: Array<{ address: string; username: string; balance: string }>;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export class BlockExplorerService {
  private static instance: BlockExplorerService;
  private readonly baseUrl: string;
  private readonly apiBase: string;

  private constructor() {
    this.baseUrl = config.baseUrl;
    this.apiBase = `${this.baseUrl}/api/explorer`;
  }

  static getInstance(): BlockExplorerService {
    if (!BlockExplorerService.instance) {
      BlockExplorerService.instance = new BlockExplorerService();
    }
    return BlockExplorerService.instance;
  }

  /**
   * Get network statistics
   */
  async getNetworkStats(): Promise<NetworkStats> {
    try {
      const url = `${this.apiBase}/stats`;
      console.log(`Fetching network stats from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Block Explorer API not available at ${this.baseUrl}`);
      }
      const data = await response.json();
      console.log('Network stats fetched successfully');
      return data;
    } catch (error) {
      console.error('Failed to fetch network stats:', error);
      throw error;
    }
  }

  /**
   * Get recent blocks (paginated)
   */
  async getBlocks(limit: number = 20, offset: number = 0): Promise<PaginatedResponse<Block>> {
    try {
      const url = `${this.apiBase}/blocks?limit=${limit}&offset=${offset}`;
      console.log(`Fetching blocks from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Block Explorer API not available at ${this.baseUrl}`);
      }
      const data = await response.json();
      console.log(`Fetched ${data.blocks?.length || 0} blocks`);
      if (data.blocks?.length > 0) {
        console.log('📦 Sample block data:', JSON.stringify(data.blocks[0], null, 2));
      }
      return {
        items: data.blocks || [],
        pagination: data.pagination || { limit, offset, total: 0, hasMore: false }
      };
    } catch (error) {
      console.error('Failed to fetch blocks:', error);
      throw error;
    }
  }

  /**
   * Get block detail by height, ID, or hash
   */
  async getBlockDetail(identifier: string | number): Promise<BlockDetail> {
    try {
      const url = `${this.apiBase}/block/${identifier}`;
      console.log(`Fetching block detail from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Block Explorer API not available at ${this.baseUrl}`);
      }
      const data = await response.json();
      if (!data.block) {
        throw new Error('No block data in response');
      }
      console.log('Block detail fetched successfully');
      return data.block;
    } catch (error) {
      console.error(`Failed to fetch block ${identifier}:`, error);
      throw error;
    }
  }

  /**
   * Get transaction detail
   */
  async getTransactionDetail(txId: string): Promise<TransactionDetail> {
    try {
      const response = await fetch(`${this.apiBase}/transaction/${txId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.transaction;
    } catch (error) {
      console.error(`Failed to fetch transaction ${txId}:`, error);
      throw error;
    }
  }

  /**
   * Get address/wallet detail with transactions
   */
  async getAddressDetail(
    address: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<AddressDetail> {
    try {
      const url = `${this.apiBase}/address/${address}?limit=${limit}&offset=${offset}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch address ${address}:`, error);
      throw error;
    }
  }

  /**
   * Get top miners leaderboard
   */
  async getTopMiners(limit: number = 10): Promise<Miner[]> {
    try {
      const response = await fetch(`${this.apiBase}/miners/top?limit=${limit}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.miners;
    } catch (error) {
      console.error('Failed to fetch top miners:', error);
      throw error;
    }
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit: number = 20): Promise<Transaction[]> {
    try {
      const response = await fetch(`${this.apiBase}/transactions/recent?limit=${limit}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.transactions;
    } catch (error) {
      console.error('Failed to fetch recent transactions:', error);
      throw error;
    }
  }

  /**
   * Search for blocks, transactions, or addresses
   */
  async search(query: string): Promise<SearchResult> {
    try {
      const response = await fetch(`${this.apiBase}/search?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Failed to search for "${query}":`, error);
      throw error;
    }
  }

  /**
   * Cache network stats locally
   */
  async cacheNetworkStats(stats: NetworkStats): Promise<void> {
    try {
      await AsyncStorage.setItem('@explorer_network_stats', JSON.stringify(stats));
    } catch (error) {
      console.error('Failed to cache network stats:', error);
    }
  }

  /**
   * Get cached network stats
   */
  async getCachedNetworkStats(): Promise<NetworkStats | null> {
    try {
      const cached = await AsyncStorage.getItem('@explorer_network_stats');
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Failed to get cached network stats:', error);
      return null;
    }
  }

  /**
   * Get all transactions (paginated) with optional filters
   */
  async getTransactions(
    limit: number = 20,
    offset: number = 0,
    type?: string,
    status?: string
  ): Promise<PaginatedResponse<Transaction>> {
    try {
      let url = `${this.apiBase}/transactions?limit=${limit}&offset=${offset}`;
      if (type) url += `&type=${encodeURIComponent(type)}`;
      if (status) url += `&status=${encodeURIComponent(status)}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return {
        items: data.transactions || [],
        pagination: data.pagination || { limit, offset, total: 0, hasMore: false }
      };
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      throw error;
    }
  }

  /**
   * Get pending/mempool transactions
   */
  async getPendingTransactions(): Promise<Transaction[]> {
    try {
      const response = await fetch(`${this.apiBase}/transactions/pending`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.transactions || [];
    } catch (error) {
      console.error('Failed to fetch pending transactions:', error);
      throw error;
    }
  }

  /**
   * Get paginated transactions for a block
   */
  async getBlockTransactions(
    blockId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedResponse<Transaction>> {
    try {
      const url = `${this.apiBase}/block/${blockId}/transactions?limit=${limit}&offset=${offset}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return {
        items: data.transactions || [],
        pagination: data.pagination || { limit, offset, total: 0, hasMore: false }
      };
    } catch (error) {
      console.error(`Failed to fetch transactions for block ${blockId}:`, error);
      throw error;
    }
  }

  /**
   * Get paginated transaction history for an address
   */
  async getAddressTransactions(
    address: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedResponse<Transaction>> {
    try {
      const url = `${this.apiBase}/address/${encodeURIComponent(address)}/transactions?limit=${limit}&offset=${offset}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return {
        items: data.transactions || [],
        pagination: data.pagination || { limit, offset, total: 0, hasMore: false }
      };
    } catch (error) {
      console.error(`Failed to fetch transactions for address ${address}:`, error);
      throw error;
    }
  }

  /**
   * Get paginated mining history for an address
   */
  async getAddressMiningHistory(
    address: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedResponse<any>> {
    try {
      const url = `${this.apiBase}/address/${encodeURIComponent(address)}/mining?limit=${limit}&offset=${offset}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return {
        items: data.miningHistory || [],
        pagination: data.pagination || { limit, offset, total: 0, hasMore: false }
      };
    } catch (error) {
      console.error(`Failed to fetch mining history for address ${address}:`, error);
      throw error;
    }
  }

  /**
   * Get chart/analytics data (time-series)
   */
  async getChartData(): Promise<any> {
    try {
      const response = await fetch(`${this.apiBase}/stats/charts`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch chart data:', error);
      throw error;
    }
  }

  /**
   * Get top miners with optional time-period filtering
   */
  async getTopMinersWithPeriod(limit: number = 10, period: 'all' | '24h' | '7d' | '30d' = 'all'): Promise<Miner[]> {
    try {
      const response = await fetch(`${this.apiBase}/miners/top?limit=${limit}&period=${period}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.miners || [];
    } catch (error) {
      console.error('Failed to fetch top miners:', error);
      throw error;
    }
  }
}

export default BlockExplorerService;
