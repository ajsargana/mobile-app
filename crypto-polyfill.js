// Polyfills for Node.js modules in React Native
// Safe initialization with error handling

// 1. Set up crypto.getRandomValues FIRST (required for wallet creation)
try {
  if (typeof crypto === 'undefined') {
    global.crypto = {};
  }

  if (!crypto.getRandomValues) {
    // Use expo-crypto for secure random number generation
    const expoCrypto = require('expo-crypto');

    crypto.getRandomValues = (array) => {
      if (!array || !array.length) {
        throw new Error('Array must have length');
      }

      // Generate random bytes using expo-crypto
      const randomBytes = expoCrypto.getRandomBytes(array.length);

      // Copy to the array
      for (let i = 0; i < array.length; i++) {
        array[i] = randomBytes[i];
      }

      return array;
    };

    console.log('✅ crypto.getRandomValues polyfill loaded');
  }
} catch (error) {
  console.error('Failed to load crypto polyfill:', error);
  // Fallback to Math.random (INSECURE - only for development)
  if (!crypto.getRandomValues) {
    crypto.getRandomValues = (array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    };
    console.warn('⚠️ Using insecure Math.random fallback for crypto');
  }
}

// 2. Set up Buffer
try {
  const { Buffer } = require('buffer');
  if (Buffer && typeof Buffer.from === 'function') {
    global.Buffer = Buffer;
    console.log('✅ Buffer polyfill loaded');
  }
} catch (error) {
  console.error('Failed to load Buffer polyfill:', error);
}

// 3. Set up process
try {
  const process = require('process/browser');
  if (process) {
    global.process = process;
    console.log('✅ process polyfill loaded');
  }
} catch (error) {
  console.error('Failed to load process polyfill:', error);
  // Minimal process polyfill
  global.process = {
    env: {},
    version: '',
    versions: {},
    platform: 'react-native',
    nextTick: (fn) => setTimeout(fn, 0)
  };
  console.log('✅ Minimal process polyfill loaded');
}
