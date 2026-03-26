/**
 * AURA50 Mobile App - Environment Configuration
 * Configures API endpoints and services for different environments
 */

import { Platform } from 'react-native';

export interface EnvironmentConfig {
  baseUrl: string;
  p2pPort: number;
  wsProtocol: 'ws' | 'wss';
  apiVersion: string;
  timeout: number;
  retryAttempts: number;
}

export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  development: {
    baseUrl: 'http://62.84.187.126:5005',
    p2pPort: 8334,
    wsProtocol: 'ws',
    apiVersion: 'v1',
    timeout: 30000,
    retryAttempts: 3,
  },

  staging: {
    baseUrl: 'http://62.84.187.126:5005',
    p2pPort: 8334,
    wsProtocol: 'ws',
    apiVersion: 'v1',
    timeout: 30000,
    retryAttempts: 3,
  },

  production: {
    baseUrl: 'http://62.84.187.126:5005',
    p2pPort: 8334,
    wsProtocol: 'ws',
    apiVersion: 'v1',
    timeout: 30000,
    retryAttempts: 3,
  },
};

// Detect environment
const getEnvironment = (): string => {
  // Check if __DEV__ is available (React Native)
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__ ? 'development' : 'production';
  }

  // Fallback to NODE_ENV
  return process.env.NODE_ENV || 'development';
};

// Export current configuration
export const ENV = getEnvironment();
export const config: EnvironmentConfig = ENVIRONMENTS[ENV];

// Bootstrap nodes configuration
export const BOOTSTRAP_NODES = {
  development: [
    '62.84.187.126:5005',
  ],

  production: [
    '62.84.187.126:5005',
  ],
};

// API Endpoints
export const API_ENDPOINTS = {
  // Health & Info
  health: '/api/health',
  blockchainInfo: '/api/blockchain/info',
  leaderboard: '/api/leaderboard',

  // Authentication
  register: '/api/auth/register',
  login: '/api/auth/login',
  user: '/api/auth/user',
  refreshToken: '/api/auth/refresh',

  // User Profile
  profile: '/api/user/profile',
  stats: '/api/user/stats',

  // Mining
  miningStart: '/api/mining/start',
  miningSubmit: '/api/mining/submit',
  miningCanMine: '/api/mining/can-mine',
  miningPendingRewards: '/api/mining/pending-rewards',

  // Wallet & Transactions
  walletBalance: '/api/wallet/balance',
  transfer: '/api/transfer',
  transactions: '/api/transactions',
  transactionHistory: '/api/transactions/history',

  // Referrals
  referralJoin: '/api/referral/join',
  referralHistory: '/api/referrals/history',

  // Blocks
  currentBlock: '/api/blocks/current',
  blockHistory: '/api/blocks/history',
  submitShare: '/api/blocks/submit-share',

  // P2P Network
  p2pPeers: '/api/p2p/peers',
  p2pConnect: '/api/p2p/connect',
  p2pBroadcast: '/api/p2p/broadcast',

  // Security Circle
  securityCircle: '/api/security-circle',
  securityCircleInvite: '/api/security-circle/invite',
  securityCircleVerify: '/api/security-circle/verify',

  // Leaderboard & Avatar
  referralLeaderboard: '/api/referrals/leaderboard',
  userAvatar: '/api/user/avatar',

  // Insurance Pool
  insurancePoolStats: '/api/insurance-pool/stats',
  insurancePoolEligibility: '/api/insurance-pool/eligibility',
  insurancePoolContributions: '/api/insurance-pool/contributions',
  insurancePoolRewards: '/api/insurance-pool/rewards',
  insurancePoolDonate: '/api/insurance-pool/donate',
  insurancePoolProposals: '/api/insurance-pool/proposals',
};

// Feature flags
export const FEATURES = {
  enableP2P: ENV === 'development' || ENV === 'production',
  enableMining: true,
  enableReferrals: true,
  enableSecurityCircle: true,
  enableOfflineMode: true,
  enableBiometrics: true,
  enableNotifications: true,
  enableDevTools: ENV === 'development',
};

// Network Configuration
export const NETWORK_CONFIG = {
  // Connection timeouts
  connectionTimeout: 30000, // 30 seconds
  requestTimeout: 15000,    // 15 seconds

  // Retry configuration
  maxRetries: 3,
  retryDelay: 1000,         // 1 second

  // Sync settings
  syncInterval: 60000,      // 1 minute
  blockSyncBatchSize: 20,

  // Mobile optimizations
  lowBandwidthMode: false,  // Enable on 2G/3G
  compressionEnabled: true,
  cacheEnabled: true,
  cacheTTL: 300000,         // 5 minutes
};

// Logging configuration
export const LOG_CONFIG = {
  enableConsole: ENV === 'development',
  enableRemote: ENV === 'production',
  logLevel: ENV === 'development' ? 'debug' : 'error',
};

// Security configuration
export const SECURITY_CONFIG = {
  // JWT token settings
  tokenRefreshThreshold: 300000,  // Refresh 5 min before expiry

  // Biometric authentication
  biometricTimeout: 300000,       // 5 minutes

  // PIN settings
  pinLength: 6,
  maxPinAttempts: 5,
  pinLockoutDuration: 300000,     // 5 minutes

  // Session management
  sessionTimeout: 900000,         // 15 minutes
  requireReauthForSensitive: true,
};

// Export helper function to get full URL
export const getApiUrl = (endpoint: string): string => {
  return `${config.baseUrl}${endpoint}`;
};

// Export helper function to get WebSocket URL
export const getWsUrl = (): string => {
  const url = new URL(config.baseUrl);
  return `${config.wsProtocol}://${url.host}`;
};

// Debug helper (only in development)
if (ENV === 'development') {
  console.log('🔧 AURA50 Environment Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Environment: ${ENV}`);
  console.log(`Platform: ${Platform.OS}`);
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`P2P Port: ${config.p2pPort}`);
  console.log(`Bootstrap Nodes:`, BOOTSTRAP_NODES[ENV === 'production' ? 'production' : 'development']);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

export default config;