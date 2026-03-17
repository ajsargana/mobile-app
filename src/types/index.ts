export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  trustLevel: TrustLevel;
  coinBalance: string;
  totalMined: string;
  miningStreak: number;
  dailyMined: string;
  createdAt: Date;
  lastMiningDate?: Date;
  profileImageUrl?: string;
  referralCode: string;
  nodeAddress: string;
  publicKey: string;
}

export interface MobileWallet {
  address: string;
  privateKey: string;
  publicKey: string;
  balance: string;
  transactions: Transaction[];
  offlineTransactions: Transaction[];
}

export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  timestamp: Date;
  // Status includes both frontend and backend values for compatibility
  status: 'pending' | 'confirmed' | 'completed' | 'failed' | 'offline' | 'included' | 'final';
  blockHeight?: number;
  hash?: string;
  signature?: string;
  // Enhanced blockchain data
  type?: 'transfer' | 'mining' | 'mining_reward' | 'participation' | 'referral' | 'referral_bonus';
  direction?: 'sent' | 'received';
  typeLabel?: string; // Human-readable label from backend
  confirmations?: number;
  confirmationStatus?: 'pending' | 'included' | 'confirmed' | 'final';
  isVerified?: boolean;
  isFinal?: boolean;
  // For offline-first support
  isOffline?: boolean;
  syncedAt?: Date;
}

export interface Block {
  id: string;
  height: number;
  hash: string;
  prevHash: string | null;
  merkleRoot: string;
  timestamp: Date;
  nonce: string;
  difficulty: number;
  transactions: Transaction[];
  participants: string[];
  status: 'pending' | 'mined' | 'confirmed';
}

export interface MiningSession {
  id: string;
  userId: string;
  blockId: string;
  startTime: Date;
  endTime?: Date;
  hashesComputed: number;
  difficultyTarget: string;
  reward?: string;
  status: 'active' | 'completed' | 'failed';
}

export interface P2PConnection {
  peerId: string;
  multiaddr: string;
  status: 'connecting' | 'connected' | 'disconnected';
  lastSeen: Date;
  reputation: number;
  latency: number;
}

export interface NetworkStats {
  connectedPeers: number;
  totalPeers: number;
  blockHeight: number;
  hashRate: number;
  difficulty: number;
  networkVersion: string;
  syncStatus: 'syncing' | 'synced' | 'offline';
}

export interface DeviceMetrics {
  batteryLevel: number;
  isCharging: boolean;
  networkType: '2G' | '3G' | '4G' | '5G' | 'WiFi' | 'offline';
  storageUsed: number;
  memoryUsage: number;
  cpuUsage: number;
  cpuTemperature?: number; // Celsius - optional for devices without temp sensor
}

export enum TrustLevel {
  NEW = 'new',
  ESTABLISHED = 'established',
  VETERAN = 'veteran',
  LEGEND = 'legend'
}

export interface TrustMetrics {
  level: TrustLevel;
  score: number;
  participationDays: number;
  transactionFeeRate: number;
  verificationSpeed: number;
  proofSize: number;
}

export interface BiometricConfig {
  enabled: boolean;
  type: 'fingerprint' | 'face' | 'voice' | 'pattern';
  enrollmentRequired: boolean;
}

export interface AppConfig {
  nodeEndpoint: string;
  p2pBootstrapNodes: string[];
  miningEnabled: boolean;
  offlineMode: boolean;
  biometric: BiometricConfig;
  dataCompression: boolean;
  lowBandwidthMode: boolean;
}

export interface NotificationConfig {
  mining: boolean;
  transactions: boolean;
  network: boolean;
  security: boolean;
  marketing: boolean;
}

export interface BackupData {
  wallet: MobileWallet;
  user: User;
  settings: AppConfig;
  encrypted: boolean;
  timestamp: Date;
}

export interface QRCodeData {
  type: 'address' | 'transaction' | 'mining' | 'backup';
  data: any;
  timestamp: Date;
  signature?: string;
}