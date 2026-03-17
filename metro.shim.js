/**
 * Metro Bundler ESM Compatibility Shim
 * Minimal setup to avoid early initialization errors
 */

// Set up basic globals only
if (typeof global.__dirname === 'undefined') {
  global.__dirname = '/';
}

if (typeof global.__filename === 'undefined') {
  global.__filename = '/index.js';
}

// Buffer and process will be set up by crypto-polyfill.js which runs after this
