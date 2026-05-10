/**
 * JS shim over the native ExpoDeviceAttestation module.
 *
 * The native module lives at `modules/expo-device-attestation/` and is auto-linked
 * by Expo when the project is rebuilt. In environments where it is not available
 * (Expo Go, Jest, web), `IS_NATIVE_MODULE_AVAILABLE` is false and callers should
 * fall back to mock tokens.
 */
import { NativeModules, Platform } from 'react-native';

export interface AndroidAttestResult {
  /** Play Integrity token (Standard API). */
  integrityToken: string;
  /** Base64-DER X.509 chain from Keystore key attestation, leaf first. */
  keyAttestationChain: string[];
  /** SHA-256 hex of the leaf public key. */
  publicKeyHash: string;
}

export interface IosAttestResult {
  /** Base64 CBOR attestation object from DCAppAttestService.attestKey(). */
  attestationCborB64: string;
  /** SHA-256 hex of the attested public key (mirrors keyId). */
  publicKeyHash: string;
}

export interface IosAssertionResult {
  /** Base64 CBOR assertion from DCAppAttestService.generateAssertion(). */
  assertionCborB64: string;
  /** SHA-256 hex of the public key. */
  publicKeyHash: string;
}

interface DeviceAttestationNativeModule {
  isAvailable(): Promise<boolean>;
  attestAndroid(opts: { nonceHex: string }): Promise<AndroidAttestResult>;
  iosGenerateKey(): Promise<string>;
  iosAttestKey(opts: { keyId: string; challengeHex: string }): Promise<IosAttestResult>;
  iosGenerateAssertion(opts: { keyId: string; clientDataHex: string }): Promise<IosAssertionResult>;
}

// Try Expo Modules first (via global), fall back to legacy NativeModules registration.
function loadModule(): DeviceAttestationNativeModule | null {
  try {
    // Expo Modules registers under requireNativeModule. We avoid a hard
    // import because expo-modules-core may not be present in all build flavors.
    const ExpoModules = require('expo-modules-core');
    if (ExpoModules?.requireNativeModule) {
      return ExpoModules.requireNativeModule('ExpoDeviceAttestation');
    }
  } catch {
    /* fall through */
  }
  const m = (NativeModules as Record<string, unknown>)['ExpoDeviceAttestation'];
  if (m) return m as DeviceAttestationNativeModule;
  return null;
}

const nativeModule = loadModule();
export const IS_NATIVE_MODULE_AVAILABLE = nativeModule != null;

const fallback: DeviceAttestationNativeModule = {
  async isAvailable() {
    return false;
  },
  async attestAndroid({ nonceHex }) {
    return {
      integrityToken: `MOCK|ok|${nonceHex}`,
      keyAttestationChain: ['MOCK_LEAF', 'MOCK_ROOT'],
      publicKeyHash: 'mock',
    };
  },
  async iosGenerateKey() {
    return 'MOCK_KEYID';
  },
  async iosAttestKey({ challengeHex }) {
    return { attestationCborB64: `MOCK_IOS|ok|${challengeHex}`, publicKeyHash: 'mock' };
  },
  async iosGenerateAssertion({ clientDataHex }) {
    return { assertionCborB64: `MOCK_IOS|ok|${clientDataHex}`, publicKeyHash: 'mock' };
  },
};

if (!nativeModule && !__DEV__) {
  console.warn(
    '[DeviceAttestation] Native module not linked. Build the project with `expo run:android` / ' +
      '`expo run:ios` after installing modules/expo-device-attestation. Falling back to MOCK ' +
      'tokens — the server must be in ATTESTATION_MOCK_MODE for these to be accepted.'
  );
}

const moduleToExport = nativeModule ?? fallback;

// Cheap platform sanity guard — calling iOS APIs on Android (or vice-versa) is a programming error.
const guarded: DeviceAttestationNativeModule = {
  isAvailable: () => moduleToExport.isAvailable(),
  attestAndroid: (opts) => {
    if (Platform.OS !== 'android') return Promise.reject(new Error('attestAndroid: not on Android'));
    return moduleToExport.attestAndroid(opts);
  },
  iosGenerateKey: () => {
    if (Platform.OS !== 'ios') return Promise.reject(new Error('iosGenerateKey: not on iOS'));
    return moduleToExport.iosGenerateKey();
  },
  iosAttestKey: (opts) => {
    if (Platform.OS !== 'ios') return Promise.reject(new Error('iosAttestKey: not on iOS'));
    return moduleToExport.iosAttestKey(opts);
  },
  iosGenerateAssertion: (opts) => {
    if (Platform.OS !== 'ios') return Promise.reject(new Error('iosGenerateAssertion: not on iOS'));
    return moduleToExport.iosGenerateAssertion(opts);
  },
};

export default guarded;
