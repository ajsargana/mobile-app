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
import attestation, { IS_NATIVE_MODULE_AVAILABLE } from '../attestation/DeviceAttestationModule';

const SECURE_KEY_DEVICE_PRIVKEY = 'aura50_device_privkey_v1';
const STORAGE_KEY_DEVICE_ADDRESS = '@aura50_device_address_v1';
const STORAGE_KEY_AUTH_TOKEN     = '@aura50_auth_token';
const STORAGE_KEY_USER_ID        = '@aura50_user_id';
const STORAGE_KEY_AUTH_EMAIL     = '@aura50_auth_email';
const STORAGE_KEY_AUTH_PASS      = '@aura50_auth_pass';
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
   * Ensure we have a *real* backend session (JWT + server userId), self-healing
   * out of "offline mode" if possible.
   *
   * device/register binds a device key to a server account, so it legitimately
   * needs to prove which account (the JWT). The offline fallback in
   * WalletSetupScreen stores `@aura50_user_id` = the wallet ADDRESS (0x…) and no
   * token — a stale non-session that produced the confusing tokenless 401s.
   *
   * Fast path: valid token + a real (non-0x) userId already present.
   * Recovery : re-authenticate from stored credentials and refresh both.
   * Returns null when no session can be established (caller should skip cleanly).
   */
  private async ensureBackendSession(): Promise<{ token: string; userId: string } | null> {
    const token  = await AsyncStorage.getItem(STORAGE_KEY_AUTH_TOKEN);
    const userId = await AsyncStorage.getItem(STORAGE_KEY_USER_ID);
    // A real server userId is a bare hex id; an offline placeholder is a 0x address.
    if (token && userId && !userId.startsWith('0x')) {
      return { token, userId };
    }

    // Recover or establish a session. SCHEDULING FIX: backend auth used to run
    // ONLY inside WalletSetup/WalletRestore (first-ever setup), so any later
    // launch (APK update, reinstall over kept data, offline fallback) reached
    // device-register with no session. Credentials are DETERMINISTIC — derived
    // from the wallet (same formula as WalletSetupScreen) — so the session can
    // be rebuilt here, exactly when it's needed, with no user input.
    let email = await AsyncStorage.getItem(STORAGE_KEY_AUTH_EMAIL);
    let pass  = await AsyncStorage.getItem(STORAGE_KEY_AUTH_PASS);
    if (!email || !pass) {
      const derived = await this.deriveWalletCredentials();
      if (derived) { email = derived.email; pass = derived.pass; }
    }
    if (!email || !pass) {
      console.log('ℹ️ Device registration skipped — no session and no wallet to derive one from.');
      return null;
    }
    return this.loginOrRegisterAccount(email, pass);
  }

  /**
   * Rebuild the deterministic backend credentials from the wallet. MUST match
   * WalletSetupScreen: email = `${address}@aura50.local`,
   * password = `A1${privateKey.substring(0, 30)}`.
   * Lazy require avoids a module cycle with the wallet service.
   */
  private async deriveWalletCredentials(): Promise<{ email: string; pass: string } | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { EnhancedWalletService } = require('../../services/EnhancedWalletService');
      const ws = EnhancedWalletService.getInstance();
      let acct = ws.getCurrentAccount?.();
      if (!acct) {
        await ws.loadHDWallet?.().catch(() => null);
        acct = ws.getCurrentAccount?.();
      }
      if (!acct?.address || !acct?.privateKey) return null;
      return {
        email: `${acct.address}@aura50.local`,
        pass: `A1${acct.privateKey.substring(0, 30)}`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Login with the given credentials; if the account doesn't exist yet (wallet
   * predates backend signup, or server DB was reset), create it — same payload
   * WalletSetupScreen uses, including any pending referral code so the invite
   * flow isn't bypassed. Persists token + userId + creds on success.
   */
  private async loginOrRegisterAccount(email: string, pass: string): Promise<{ token: string; userId: string } | null> {
    const persist = async (data: any): Promise<{ token: string; userId: string }> => {
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_TOKEN, data.token);
      await AsyncStorage.setItem(STORAGE_KEY_USER_ID, data.user.id);
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_EMAIL, email);
      await AsyncStorage.setItem(STORAGE_KEY_AUTH_PASS, pass);
      return { token: data.token, userId: data.user.id };
    };
    try {
      const login = await fetch(`${config.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      if (login.ok) {
        const d = await login.json();
        if (d?.token && d?.user?.id) {
          console.log('🔄 Backend session recovered via silent login.');
          return persist(d);
        }
      }

      // Account missing — create it from the wallet identity.
      const referralCode = await AsyncStorage.getItem('@aura50_pending_referral_code');
      const username = email.split('@')[0];
      const reg = await fetch(`${config.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: pass,
          firstName: 'Mobile',
          lastName: 'User',
          username,
          ...(referralCode ? { referralCode } : {}),
        }),
      });
      if (reg.ok) {
        const d = await reg.json();
        if (d?.token && d?.user?.id) {
          console.log('🆕 Backend account created from wallet identity.');
          return persist(d);
        }
      }
      const err = await reg.json().catch(() => ({} as any));
      console.warn('⚠️ Backend session could not be established:', reg.status, (err as any)?.message);
      return null;
    } catch (e: any) {
      console.warn('⚠️ Backend session error:', e?.message ?? String(e));
      return null;
    }
  }

  /**
   * Bind this device to the caller's account on the server.
   * Call this after every login and after every account switch.
   *
   * `userId` is optional and only a hint — the authoritative id comes from the
   * verified backend session, so a stale/offline id can never bind the device to
   * the wrong (or a non-existent) account. If no session can be established the
   * call is skipped cleanly rather than firing a doomed tokenless request.
   */
  async registerDevice(userId?: string): Promise<RegisterResult> {
    try {
      const session = await this.ensureBackendSession();
      if (!session) {
        return { success: false, error: 'not_authenticated' };
      }
      const effectiveUserId = session.userId;

      const wallet = await this.getOrCreateWallet();
      const timestamp = Date.now();
      const deviceAddress = wallet.address.toLowerCase();
      const message = `register:${effectiveUserId}:${deviceAddress}:${timestamp}`;
      const signature = await wallet.signMessage(message);

      // Optional hardware attestation (Android Key Attestation). FULLY
      // NON-BLOCKING: if the native module isn't linked (Expo Go), the device
      // can't attest, or anything throws, we register WITHOUT it and the server
      // fail-closes to tier 'none'. Registration + mining never break on this.
      const attestationBody = await this.tryGatherAttestation(message);

      const authToken = session.token;
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
          ...(attestationBody ? { attestation: attestationBody } : {}),
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

      console.log('✅ Device registered:', wallet.address.substring(0, 12), '→ user', effectiveUserId.substring(0, 8));
      return { success: true, deviceAddress: wallet.address };
    } catch (err: any) {
      console.error('DeviceKeystoreService.registerDevice error:', err);
      return { success: false, error: err?.message ?? String(err) };
    }
  }

  /**
   * Best-effort Android Key Attestation. Returns the leaf-first base64-DER cert
   * chain bound to this registration, or undefined if attestation isn't possible
   * here (Expo Go / unsupported device / error) — in which case registration
   * proceeds unattested. The challenge MUST equal the server's expectation:
   * sha256(registration message). Never throws.
   */
  private async tryGatherAttestation(
    registrationMessage: string,
  ): Promise<{ platform: 'android'; certChainDer: string[] } | undefined> {
    if (!IS_NATIVE_MODULE_AVAILABLE || Platform.OS !== 'android') return undefined;
    try {
      // sha256 of the exact signed message, hex without the 0x prefix — the
      // native module feeds these bytes to setAttestationChallenge().
      const nonceHex = ethers.sha256(ethers.toUtf8Bytes(registrationMessage)).slice(2);
      const res = await attestation.attestAndroid({ nonceHex });
      const chain = res?.keyAttestationChain;
      // Ignore the mock fallback chain — only forward a real cert chain.
      if (Array.isArray(chain) && chain.length >= 2 && !String(chain[0]).startsWith('MOCK')) {
        // TEMP DIAGNOSTIC — paste this whole block back to finish the verifier.
        console.log(
          `\n📋 AURA50_ATTESTATION_CHAIN (${chain.length} certs) — copy everything between the markers:\n` +
          `---BEGIN AURA50 CHAIN---\n${JSON.stringify(chain)}\n---END AURA50 CHAIN---\n`,
        );
        return { platform: 'android', certChainDer: chain };
      }
    } catch (e: any) {
      console.log('ℹ️ Device attestation unavailable — registering unattested (tier none):', e?.message ?? String(e));
    }
    return undefined;
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
