// API Configuration for AURA50 Mobile App

// Get the local IP address for development
// Replace with your computer's local IP address when testing on physical device
// You can find it by running: ipconfig (Windows) or ifconfig (Mac/Linux)
const getApiUrl = () => {
  // For Expo Go on physical device, use your computer's local IP address
  // For Android Emulator, use 10.0.2.2
  // For iOS Simulator, use localhost

  // Your local IP: 192.168.18.20
  return 'http://62.84.187.126:5005';
};

export const API_CONFIG = {
  BASE_URL: getApiUrl(),
  ENDPOINTS: {
    AUTH: {
      REGISTER: '/api/auth/register',
      LOGIN: '/api/auth/login',
      LOGOUT: '/api/auth/logout',
    },
    MINING: {
      START: '/api/mining/start',
      STOP: '/api/mining/stop',
      STATUS: '/api/mining/status',
      HISTORY: '/api/mining/history',
    },
    WALLET: {
      BALANCE: '/api/wallet/balance',
      TRANSACTIONS: '/api/wallet/transactions',
      SEND: '/api/wallet/send',
    },
    USER: {
      PROFILE: '/api/user/profile',
      TRUST_LEVEL: '/api/user/trust-level',
    },
    REFERRALS: {
      GET_CODE: '/api/referrals/code',
      SUBMIT: '/api/referrals/submit',
      LIST: '/api/referrals/list',
    },
    SECURITY: {
      CIRCLE: '/api/security/circle',
      VERIFY: '/api/security/verify',
    },
  },
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
};

// Network configuration
export const NETWORK_CONFIG = {
  // P2P network settings
  BOOTSTRAP_NODES: [
    // Add bootstrap node addresses here
  ],
  CONNECTION_TIMEOUT: 10000,
  MAX_PEERS: 50,
  MIN_PEERS: 5,
};

// Feature flags
export const FEATURES = {
  BIOMETRIC_AUTH: true,
  OFFLINE_MODE: true,
  P2P_MINING: true,
  BACKGROUND_MINING: false, // Disabled for battery conservation
};

export default API_CONFIG;