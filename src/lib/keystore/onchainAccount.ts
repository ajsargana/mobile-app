/**
 * Put this wallet's account on chain (server Phase 3.2).
 *
 * The chain's account id is the wallet address, and the address must belong to
 * the registered key. The wallet key signs a proof of possession:
 *
 *   aura50-tx:v1|<chainId>|account_register|<address>|<compressed pubkey hex>
 *
 * — the same canonical payload and the same signing (noble secp256k1 v3,
 * sha256 prehash, compact low-S) as the server's server/state/txAuth.ts. The
 * server only relays it; every validator re-checks it, so no server can create
 * an account for a key it does not hold. The private key never leaves the phone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (k: Uint8Array, m: Uint8Array) => hmac(sha256, k, m);

const DONE_KEY = (address: string) => `@aura50_onchain_registered_${address}`;

export function registrationPayload(chainId: string, id: string, pubkeyHex: string): Uint8Array {
  for (const f of [chainId, id, pubkeyHex]) if (f.includes('|')) throw new Error('field may not contain "|"');
  return Buffer.from(['aura50-tx:v1', chainId, 'account_register', id, pubkeyHex].join('|'), 'utf8');
}

/** Compact (r‖s, 64 bytes) low-S signature as hex — what the server verifies. */
export function signRegistration(chainId: string, id: string, pubkeyHex: string, privateKeyHex: string): string {
  const sig = secp.sign(registrationPayload(chainId, id, pubkeyHex), Buffer.from(privateKeyHex, 'hex'));
  return Buffer.from(sig).toString('hex');
}

export type OnchainResult = 'registered' | 'queued' | 'not-enabled' | 'skipped' | 'failed';

/**
 * Idempotent and cheap: two GETs, then nothing more once the chain has the
 * account (remembered per address). Safe to call on every app focus.
 */
export async function ensureOnchainAccount(
  apiBase: string,
  token: string | null,
  account: { address: string; publicKey: string; privateKey: string } | null,
): Promise<OnchainResult> {
  if (!token || !account?.address || !account.publicKey || !account.privateKey) return 'skipped';
  const address = account.address.toLowerCase();
  const pubkey = account.publicKey.toLowerCase();
  if (!/^0[23][0-9a-f]{64}$/.test(pubkey)) return 'skipped';           // needs the compressed key
  if (address !== 'aura50' + pubkey.slice(0, 32)) return 'skipped';   // not this key's address
  try {
    if (await AsyncStorage.getItem(DONE_KEY(address))) return 'registered';
    const status = await fetch(`${apiBase}/api/state/root`).then(r => (r.ok ? r.json() : null));
    if (!status || status.activationHeight == null || !status.enabledTypes?.includes('account_register')) return 'not-enabled';
    const have = await fetch(`${apiBase}/api/state/account/${encodeURIComponent(address)}`).then(r => (r.ok ? r.json() : null));
    if (have?.account) { await AsyncStorage.setItem(DONE_KEY(address), '1'); return 'registered'; }
    const sig = signRegistration(String(status.chainId), address, pubkey, account.privateKey);
    const res = await fetch(`${apiBase}/api/state/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pubkey, sig }),
    });
    if (res.status === 200) { await AsyncStorage.setItem(DONE_KEY(address), '1'); return 'registered'; }
    return res.status === 202 ? 'queued' : 'failed';
  } catch {
    return 'failed';
  }
}
