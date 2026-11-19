/**
 * User transaction authority — the app side of the server's
 * security/userTxAuth.ts.
 *
 * Contract calls (staking, and later bridge/deploy) execute AS the account,
 * so every validator requires the account's device key to have signed them.
 * The flow:
 *
 *   1. POST the request as usual.
 *   2. Server answers 428 { code: 'SIGNATURE_REQUIRED', authMessage, nonce }.
 *   3. We check that authMessage describes EXACTLY the call the user asked
 *      for (function, arguments, value, contract, gas) and recompute its
 *      payload hash ourselves. Only then does the device key sign it
 *      (EIP-191 personal_sign).
 *   4. Resend the same body plus auth: { deviceAddress, signature, nonce }.
 *
 * Step 3 is what keeps this non-custodial: the server builds the message, but
 * it cannot get a different call signed than the one on the user's screen.
 *
 * The message format MUST match authMessage() in the server's userTxAuth.ts:
 *
 *   AURA50 transaction v1
 *   network: <networkId>
 *   account: <userId>
 *   type: contract_call
 *   action: call <fn>(<stableJson args>) on <contract>, value <sats> sats, gas <gas>
 *   nonce: <nonce>
 *   payload: <sha256 hex of stableJson({args, contract, function, gasLimit, value})>
 */
import { ethers } from 'ethers';

/** What the user asked for — the signed message must say exactly this. */
export interface ExpectedCall {
  contract: string;
  function: string;
  args: unknown[];
  /** Value in satoshis (string or integer). */
  valueSats: string | number | bigint;
  /** Gas limit; when omitted any gas is accepted (it only bounds the fee). */
  gasLimit?: number;
  /** The signed-in account id, when known; the message must name it. */
  account?: string | null;
}

/** Same canonical JSON as the server (sorted keys, undefined dropped). */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter(k => o[k] !== undefined)
    .sort()
    .map(k => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(',')}}`;
}

const sha256Hex = (s: string): string => ethers.sha256(ethers.toUtf8Bytes(s)).slice(2);

/**
 * Check a server-built authMessage against the call the user asked for.
 * Returns null when it matches, otherwise why it does not.
 */
export function checkCallAuthMessage(message: string, nonce: number, expect: ExpectedCall): string | null {
  const lines = message.split('\n');
  if (lines.length !== 7 || lines[0] !== 'AURA50 transaction v1') return 'unexpected message format';
  const field = (i: number, name: string): string | null =>
    lines[i].startsWith(`${name}: `) ? lines[i].slice(name.length + 2) : null;

  const network = field(1, 'network');
  const account = field(2, 'account');
  const type = field(3, 'type');
  const action = field(4, 'action');
  const nonceStr = field(5, 'nonce');
  const payload = field(6, 'payload');
  if (network === null || !network) return 'missing network';
  if (account === null || !account) return 'missing account';
  if (expect.account && !expect.account.startsWith('0x') && account !== expect.account) return 'message names a different account';
  if (type !== 'contract_call') return `unexpected transaction type ${type}`;
  if (nonceStr !== String(nonce)) return 'nonce does not match';

  const value = BigInt(expect.valueSats).toString();
  // The action line carries every payload field; rebuild it from what the user
  // asked for and require an exact match (gas taken from the message if the
  // caller did not pin it).
  const m = /, gas (\d+)$/.exec(action ?? '');
  if (!m) return 'missing gas';
  const gas = Number(m[1]);
  if (expect.gasLimit !== undefined && gas !== expect.gasLimit) return 'gas limit differs';
  const want = `call ${expect.function}(${stableJson(expect.args)}) on ${expect.contract}, value ${value} sats, gas ${gas}`;
  if (action !== want) return 'the call to sign differs from the one requested';

  const hash = sha256Hex(stableJson({
    contract: expect.contract, function: expect.function, args: expect.args, value, gasLimit: gas,
  }));
  if (payload !== hash) return 'payload hash does not match the call';
  return null;
}

/** The device key. Lazy import keeps this module free of storage dependencies (testable in Node). */
async function deviceWallet(): Promise<ethers.Wallet> {
  const { deviceKeystoreService } = await import('./DeviceKeystoreService');
  return deviceKeystoreService.getOrCreateWallet();
}

export class TxAuthRefused extends Error {
  constructor(reason: string) {
    super(`Refused to sign: ${reason}`);
    this.name = 'TxAuthRefused';
  }
}

/**
 * POST a request that creates a contract call on the user's behalf, answering
 * the server's signature challenge with the device key after checking it.
 * Returns the final response (2xx, or the server's error) for the caller to
 * read as before.
 */
export async function postSignedCall(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  expect: ExpectedCall,
  wallet?: { address: string; signMessage(m: string): Promise<string> },
): Promise<Response> {
  const send = (b: Record<string, unknown>) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(b) });

  const first = await send(body);
  if (first.status !== 428) return first;

  const challenge = (await first.json().catch(() => null)) as { authMessage?: unknown; nonce?: unknown } | null;
  const message = typeof challenge?.authMessage === 'string' ? challenge.authMessage : null;
  const nonce = typeof challenge?.nonce === 'number' ? challenge.nonce : NaN;
  if (!message || !Number.isSafeInteger(nonce)) throw new TxAuthRefused('server sent no message to sign');

  const why = checkCallAuthMessage(message, nonce, expect);
  if (why) throw new TxAuthRefused(why);

  const w = wallet ?? (await deviceWallet());
  const signature = await w.signMessage(message);
  return send({ ...body, auth: { deviceAddress: w.address.toLowerCase(), signature, nonce } });
}
