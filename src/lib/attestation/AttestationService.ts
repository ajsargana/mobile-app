/**
 * AttestationService — orchestrates device attestation for the mobile client.
 *
 * Lifecycle:
 *   1. After login, call `bindCurrentDevice()` once. This produces a Play Integrity
 *      token (Android) or App Attest attestation (iOS), bundles it with a Keystore
 *      key attestation (Android), and POSTs to /api/attestation/bind. The server
 *      records the device fingerprint and starts the 5-hour cooldown if it's a rebind.
 *
 *   2. Before every mining call (`/api/mining/start`, `/api/mining/submit`), call
 *      `attestForAction(...)`. Returns headers the caller must attach to the request.
 *      Android: fresh Play Integrity token + Keystore-signed nonce.
 *      iOS:     fresh App Attest assertion bound to the action nonce.
 *
 * Tokens are NOT cached across calls — each action gets a fresh nonce, fresh token.
 * (Play Integrity has rate limits; we coalesce in-flight requests but don't cache.)
 *
 * If the native module is unavailable (Expo Go, web, jest) the service falls back
 * to MOCK tokens of the form "MOCK|ok|<nonce>" which the server's mock-mode accepts.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../../config/environment';
import DeviceAttestationModule, {
  IS_NATIVE_MODULE_AVAILABLE,
} from './DeviceAttestationModule';
import type {
  AttestationAction,
  AttestationPayload,
  AttestationStatus,
  BindResult,
  ServerNonce,
} from './types';

const KEY_AUTH_TOKEN = '@aura50_auth_token';
const KEY_IOS_KEY_ID = '@aura50_ios_attest_key_id';
const KEY_IOS_REGISTERED = '@aura50_ios_attest_registered_v1';

export class AttestationService {
  private static instance: AttestationService | null = null;

  private inflightNonce = new Map<AttestationAction, Promise<ServerNonce>>();

  static getInstance(): AttestationService {
    if (!AttestationService.instance) AttestationService.instance = new AttestationService();
    return AttestationService.instance;
  }

  /* ── Public API ───────────────────────────────────────────────────────── */

  /** True if real native attestation is available (false in Expo Go / web / jest). */
  isNativeAvailable(): boolean {
    return IS_NATIVE_MODULE_AVAILABLE;
  }

  /**
   * Call once after login. Binds this device to the logged-in account on the server.
   * Safe to call multiple times — the server treats duplicate calls from the same
   * device+account as no-ops.
   */
  async bindCurrentDevice(): Promise<BindResult> {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const nonce = await this.requestNonce('login');
    const payload = await this.produceAttestation('login', nonce, /* register= */ true);
    return this.postBind(nonce, payload);
  }

  /**
   * Produce the attestation headers needed for a mining endpoint.
   * Caller attaches these to its existing fetch() / axios call.
   */
  async attestForAction(action: AttestationAction): Promise<Record<string, string>> {
    if (action === 'login') {
      throw new Error('Use bindCurrentDevice() for login');
    }
    const nonce = await this.requestNonce(action);
    const payload = await this.produceAttestation(action, nonce, /* register= */ false);
    return this.envelopeToHeaders(nonce, payload);
  }

  /** GET /api/attestation/status — for UI to render mining-ready / cooldown / lock. */
  async fetchStatus(): Promise<AttestationStatus> {
    const auth = await this.authHeader();
    const res = await fetch(`${config.baseUrl}/api/attestation/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...auth },
    });
    if (!res.ok) {
      return { bound: false, miningAvailable: false, message: `HTTP ${res.status}` };
    }
    return (await res.json()) as AttestationStatus;
  }

  /* ── Internals ────────────────────────────────────────────────────────── */

  private async requestNonce(action: AttestationAction): Promise<ServerNonce> {
    // Coalesce concurrent callers for the same action — they share one round-trip.
    const inflight = this.inflightNonce.get(action);
    if (inflight) return inflight;

    const p = (async () => {
      const auth = await this.authHeader();
      const nonceCtrl = new AbortController();
      const nonceTimer = setTimeout(() => nonceCtrl.abort(), 10_000);
      try {
        const res = await fetch(`${config.baseUrl}/api/attestation/nonce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ action }),
          signal: nonceCtrl.signal,
        });
        if (!res.ok) throw new Error(`Nonce request failed: HTTP ${res.status}`);
        const data = await res.json();
        if (!data?.success || !data?.nonce) throw new Error('Malformed nonce response');
        return {
          nonce: data.nonce,
          signature: data.signature,
          exp: data.exp,
          action: data.action,
        } as ServerNonce;
      } finally {
        clearTimeout(nonceTimer);
      }
    })();

    this.inflightNonce.set(action, p);
    try {
      return await p;
    } finally {
      this.inflightNonce.delete(action);
    }
  }

  private async produceAttestation(
    action: AttestationAction,
    nonce: ServerNonce,
    register: boolean
  ): Promise<AttestationPayload> {
    if (!IS_NATIVE_MODULE_AVAILABLE) {
      return this.mockAttestation(nonce);
    }

    if (Platform.OS === 'android') {
      const result = await DeviceAttestationModule.attestAndroid({
        nonceHex: nonce.nonce,
      });
      return {
        platform: 'android',
        integrityToken: result.integrityToken,
        keyAttestationChain: result.keyAttestationChain,
        publicKeyHash: result.publicKeyHash,
      };
    }

    if (Platform.OS === 'ios') {
      // First time: generate App Attest key + attestation. Persist keyId locally.
      let keyId = await AsyncStorage.getItem(KEY_IOS_KEY_ID);
      const alreadyRegistered = (await AsyncStorage.getItem(KEY_IOS_REGISTERED)) === '1';

      if (register || !keyId || !alreadyRegistered) {
        if (!keyId) {
          keyId = await DeviceAttestationModule.iosGenerateKey();
          await AsyncStorage.setItem(KEY_IOS_KEY_ID, keyId);
        }
        const attestation = await DeviceAttestationModule.iosAttestKey({
          keyId,
          challengeHex: nonce.nonce,
        });
        // Mark registered after the server-side bind succeeds (caller does that).
        return {
          platform: 'ios',
          iosKeyId: keyId,
          iosKind: 'attestation',
          integrityToken: attestation.attestationCborB64,
          publicKeyHash: attestation.publicKeyHash,
        };
      }

      // Subsequent calls: produce an assertion signed over the action nonce.
      const assertion = await DeviceAttestationModule.iosGenerateAssertion({
        keyId,
        clientDataHex: nonce.nonce,
      });
      return {
        platform: 'ios',
        iosKeyId: keyId,
        iosKind: 'assertion',
        integrityToken: assertion.assertionCborB64,
        publicKeyHash: assertion.publicKeyHash,
      };
    }

    // Web / unsupported — server enforce flag should keep this rejected.
    return this.mockAttestation(nonce);
  }

  private async postBind(nonce: ServerNonce, payload: AttestationPayload): Promise<BindResult> {
    const headers = this.envelopeToHeaders(nonce, payload);
    const auth = await this.authHeader();
    const res = await fetch(`${config.baseUrl}/api/attestation/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth, ...headers },
      body: JSON.stringify({}),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // ignore
    }
    if (!res.ok) {
      return { success: false, code: json?.code ?? `HTTP_${res.status}`, message: json?.message };
    }
    // iOS: mark registration complete.
    if (payload.platform === 'ios' && payload.iosKind === 'attestation' && json?.success) {
      await AsyncStorage.setItem(KEY_IOS_REGISTERED, '1');
    }
    return json as BindResult;
  }

  private envelopeToHeaders(nonce: ServerNonce, payload: AttestationPayload): Record<string, string> {
    const h: Record<string, string> = {
      'X-Attest-Platform': payload.platform,
      'X-Attest-Nonce': nonce.nonce,
      'X-Attest-NonceSig': nonce.signature,
      'X-Attest-NonceExp': String(nonce.exp),
      'X-Attest-Action': nonce.action,
      'X-Attest-Token': payload.integrityToken,
    };
    if (payload.platform === 'android') {
      h['X-Attest-KeyChain'] = JSON.stringify(payload.keyAttestationChain);
    } else {
      h['X-Attest-IosKeyId'] = payload.iosKeyId;
      h['X-Attest-IosKind'] = payload.iosKind;
      if (payload.iosKind === 'assertion') {
        h['X-Attest-IosAssertion'] = payload.integrityToken;
      }
    }
    return h;
  }

  private mockAttestation(nonce: ServerNonce): AttestationPayload {
    if (Platform.OS === 'ios') {
      return {
        platform: 'ios',
        iosKeyId: 'MOCK_KEYID',
        iosKind: 'attestation',
        integrityToken: `MOCK_IOS|ok|${nonce.nonce}`,
        publicKeyHash: 'mock_pubkey_hash',
      };
    }
    return {
      platform: 'android',
      integrityToken: `MOCK|ok|${nonce.nonce}`,
      keyAttestationChain: ['MOCK_LEAF_CERT_B64', 'MOCK_ROOT_CERT_B64'],
      publicKeyHash: 'mock_pubkey_hash',
    };
  }

  private async authHeader(): Promise<Record<string, string>> {
    const t = await AsyncStorage.getItem(KEY_AUTH_TOKEN);
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
}

export default AttestationService.getInstance();
