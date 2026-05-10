/**
 * Shared types between AttestationService and the native module.
 */
export type AttestationAction = 'login' | 'mining_start' | 'mining_submit';

export interface ServerNonce {
  nonce: string;       // hex
  signature: string;   // hex HMAC
  exp: number;         // unix ms
  action: AttestationAction;
}

export interface AndroidAttestationPayload {
  platform: 'android';
  /** Play Integrity token (Standard request, returned by client SDK). */
  integrityToken: string;
  /** Base64-DER cert chain from AndroidKeyStore key attestation, leaf first. */
  keyAttestationChain: string[];
  /** SHA-256 hex of the attested public key (for client-side display). */
  publicKeyHash: string;
}

export interface IosAttestationPayload {
  platform: 'ios';
  /** Apple key identifier (base64). */
  iosKeyId: string;
  /** 'attestation' on first registration, 'assertion' on every subsequent call. */
  iosKind: 'attestation' | 'assertion';
  /** Attestation CBOR (base64) on first registration; assertion CBOR (base64) afterwards. */
  integrityToken: string;
  /** SHA-256 hex of the attested public key. */
  publicKeyHash: string;
}

export type AttestationPayload = AndroidAttestationPayload | IosAttestationPayload;

export interface AttestationStatus {
  bound: boolean;
  miningAvailable: boolean;
  platform?: 'android' | 'ios';
  trustScore?: number;
  rebindCount?: number;
  cooldownUntil?: number | null;
  lockedUntil?: number | null;
  message?: string;
}

export interface BindResult {
  success: boolean;
  kind?: 'first_bind' | 'same_account' | 'rebind' | 'locked';
  miningAvailable?: boolean;
  cooldownUntil?: number;
  lockedUntil?: number;
  trustScore?: number;
  /** Server-side reason code on failure (INTEGRITY_ROOTED, KEY_ATTESTATION_*, …). */
  code?: string;
  message?: string;
}
