/**
 * DeviceKeystoreService
 *
 * Replaces the old cloud-attestation (Play Integrity / App Attest) approach with
 * a purely cryptographic device identity:
 *
 *   1. On first use a secp256k1 keypair is generated and the private key is stored
 *      in expo-secure-store (backed by iOS Keychain / Android Keystore).
 *   2. The derived Ethereum address is the device's permanent identity.
 *   3. registerDevice() must be called after every login / account switch.
 *      It POSTs to /api/device/register and starts the 24h switch cooldown if the
 *      device was previously bound to a different account.
 *   4. getDeviceHeaders() produces the three headers the server validates on every
 *      /api/mining/start and /api/mining/submit request.
 *
 * Signed message formats (must match DeviceKeystoreRegistry.ts on the server):
 *   Registration : `register:${userId}:${deviceAddress}:${timestamp}`
 *   Mining       : `${userId}:${epochId}:${timestamp}`
 *
 * Epoch ID formula (matches server MiningEventIntegration):
 *   epochId = Math.floor(Date.now() / 60_000)
 */

import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../../config/environment';

const SECURE_KEY_DEVICE_PRIVKEY = 'aura50_device_privkey_v1';
const STORAGE_KEY_DEVICE_ADDRESS = '@aura50_device_address_v1';
const STORAGE_KEY_AUTH_TOKEN     = '@aura50_auth_token';
const EPOCH_DURATION_MS = 60_000; // must match server

export interface DeviceHeaders {
  'X-Device-Pubkey': string;
  'X-Device-Sig':    string;
  'X-Device-Ts':     string;
}

export interface RegisterResult {
  success: boolean;
  deviceAddress?: string;
  error?: string;
  cooldownMs?: number;
  cooldownHours?: number;
}

class DeviceKeystoreService {
  private wallet: ethers.Wallet | null = null;

  // ── Key management ─────────────────────────────────────────────────────────

  /**
   * Load the device wallet from secure storage, generating one if it doesn't exist.
   * Idempotent — safe to call multiple times.
   */
  async getOrCreateWallet(): Promise<ethers.Wallet> {
    if (this.wallet) return this.wallet;

    let privKey = await SecureStore.getItemAsync(SECURE_KEY_DEVICE_PRIVKEY);

    if (!privKey) {
      const newWallet = ethers.Wallet.createRandom();
      privKey = newWallet.privateKey;
      await SecureStore.setItemAsync(SECURE_KEY_DEVICE_PRIVKEY, privKey, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_ADDRESS, newWallet.address);
      console.log('🔑 Device keypair generated:', newWallet.address.substring(0, 12));
    }

    this.wallet = new ethers.Wallet(privKey);

    // Keep cached address in AsyncStorage for fast access without secure-store round-trip
    const cached = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_ADDRESS);
    if (!cached) {
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_ADDRESS, this.wallet.address);
    }

    return this.wallet;
  }

  /** Returns the device Ethereum address (0x…). Fast — uses cache when possible. */
  async getDeviceAddress(): Promise<string> {
    const cached = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_ADDRESS);
    if (cached) return cached;
    const w = await this.getOrCreateWallet();
    return w.address;
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Bind this device to the given userId on the server.
   * Call this after every login and after every account switch.
   */
  async registerDevice(userId: string): Promise<RegisterResult> {
    try {
      const wallet = await this.getOrCreateWallet();
      const timestamp = Date.now();
      const deviceAddress = wallet.address.toLowerCase();
      const message = `register:${userId}:${deviceAddress}:${timestamp}`;
      const signature = await wallet.signMessage(message);

      const authToken = await AsyncStorage.getItem(STORAGE_KEY_AUTH_TOKEN);
      const res = await fetch(`${config.baseUrl}/api/device/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          deviceAddress: wallet.address,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          signature,
          timestamp,
        }),
      });

      const json = await res.json().catch(() => ({})) as any;

      if (!res.ok) {
        console.warn('⚠️ Device registration failed:', res.status, json?.error);
        return {
          success: false,
          error: json?.error ?? `HTTP ${res.status}`,
          cooldownMs: json?.cooldownMs,
          cooldownHours: json?.cooldownHours,
        };
      }

      console.log('✅ Device registered:', wallet.address.substring(0, 12), '→ user', userId.substring(0, 8));
      return { success: true, deviceAddress: wallet.address };
    } catch (err: any) {
      console.error('DeviceKeystoreService.registerDevice error:', err);
      return { success: false, error: err?.message ?? String(err) };
    }
  }

  // ── Per-request headers ────────────────────────────────────────────────────

  /**
   * Returns the three headers needed for /api/mining/start and /api/mining/submit.
   * Signs the canonical message: `${userId}:${epochId}:${timestamp}`
   */
  async getDeviceHeaders(userId: string): Promise<DeviceHeaders> {
    const wallet    = await this.getOrCreateWallet();
    const timestamp = Date.now();
    const epochId   = Math.floor(timestamp / EPOCH_DURATION_MS);
    const message   = `${userId}:${epochId}:${timestamp}`;
    const signature = await wallet.signMessage(message);

    return {
      'X-Device-Pubkey': wallet.address,
      'X-Device-Sig':    signature,
      'X-Device-Ts':     String(timestamp),
    };
  }
}

export const deviceKeystoreService = new DeviceKeystoreService();
export default deviceKeystoreService;
