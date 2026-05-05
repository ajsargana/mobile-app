/**
 * HumanVerificationService (mobile client)
 *
 * Daily human-presence gate before mining. Pairs with the server-side
 * service of the same name in `aura50/EthForge/server/HumanVerificationService.ts`.
 *
 * Flow:
 *   1. fetchDailySeed()  — GET /api/mining/verification/seed (HMAC-signed by server)
 *   2. pickChallenges(seed) — deterministic per (seed) so the same user sees
 *                              the same 2 challenges all day
 *   3. UI runs the challenges; on success → attest()
 *   4. attest() — POST /api/mining/verification/attest (server records day)
 *   5. isVerifiedToday() — local cache, falls through to GET /status if stale
 *
 * Local storage keys:
 *   @aura50_verify_today        { utcDay, seed, sig, attestedAt }
 *   @aura50_verify_fail_count   number — resets on pass
 *   @aura50_verify_cooldown_until  epoch ms
 *   @aura50_verify_stats        { pass, fail, byChallenge }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import config from '../config/environment';

// ── Storage keys ────────────────────────────────────────────────────────────
const KEY_TODAY = '@aura50_verify_today';
const KEY_FAIL_COUNT = '@aura50_verify_fail_count';
const KEY_COOLDOWN_UNTIL = '@aura50_verify_cooldown_until';
const KEY_STATS = '@aura50_verify_stats';
const KEY_AUTH_TOKEN = '@aura50_auth_token';

// ── Tunables ────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const MAX_FAILS_BEFORE_COOLDOWN = 3;
const COOLDOWN_MS = 5 * 60 * 1000;
const FACE_DAY_PROBABILITY = 0.30;

// ── Types ───────────────────────────────────────────────────────────────────
export type ChallengeId = 'shake' | 'tilt' | 'tap' | 'sequence' | 'face';
export type ChallengeTier = 1 | 2 | 3;

export interface ChallengeSpec {
  id: ChallengeId;
  tier: ChallengeTier;
  params: Record<string, any>;
}

export interface DailySeed {
  seed: string;   // hex
  sig: string;    // hex HMAC from server
  day: number;    // utc day number
}

interface TodayCache {
  utcDay: number;
  seed: string;
  sig: string;
  attestedAt: number;
}

interface VerifyStats {
  pass: number;
  fail: number;
  byChallenge: Record<string, { pass: number; fail: number }>;
}

// ── Service ─────────────────────────────────────────────────────────────────

export class HumanVerificationService {
  private static instance: HumanVerificationService;

  static getInstance(): HumanVerificationService {
    if (!HumanVerificationService.instance) {
      HumanVerificationService.instance = new HumanVerificationService();
    }
    return HumanVerificationService.instance;
  }

  private constructor() {}

  // ── UTC day helpers ──────────────────────────────────────────────────────

  private currentUtcDay(): number {
    return Math.floor(Date.now() / DAY_MS);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  private async authHeader(): Promise<Record<string, string>> {
    const token = await AsyncStorage.getItem(KEY_AUTH_TOKEN);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async reAuthWithStoredCredentials(): Promise<string | null> {
    try {
      const email    = await AsyncStorage.getItem('@aura50_auth_email');
      const password = await AsyncStorage.getItem('@aura50_auth_pass');
      if (!email || !password) return null;
      const res = await fetch(`${config.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) return null;
      const data = await res.json();
      if (data?.token) {
        await AsyncStorage.setItem(KEY_AUTH_TOKEN, data.token);
        return data.token;
      }
    } catch {
      // re-auth is best-effort
    }
    return null;
  }

  // ── Local cache ──────────────────────────────────────────────────────────

  /**
   * Local-fast check. If the cached record is for today we trust it.
   * Caller should also handle 403 from server endpoints (which forces a
   * fresh gate even if local cache says verified — e.g. after data wipe).
   */
  async isVerifiedToday(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(KEY_TODAY);
      if (!raw) return false;
      const cache: TodayCache = JSON.parse(raw);
      return cache?.utcDay === this.currentUtcDay();
    } catch {
      return false;
    }
  }

  /**
   * Authoritative check — round-trips to server. Use sparingly (e.g. on app
   * start) since it costs a network call.
   */
  async refreshVerifiedStatus(): Promise<boolean> {
    try {
      const headers = await this.authHeader();
      if (!headers.Authorization) return false;
      const res = await fetch(`${config.baseUrl}/api/mining/verification/status`, {
        method: 'GET',
        headers,
      });
      if (!res.ok) return false;
      if (!(res.headers.get('content-type') ?? '').includes('application/json')) return false;
      const data = await res.json();
      if (data?.verifiedToday) {
        await this.writeTodayCache({
          utcDay: data.day ?? this.currentUtcDay(),
          seed: '',
          sig: '',
          attestedAt: data.attestedAt ?? Date.now(),
        });
        return true;
      }
      // Server says not verified — drop stale cache.
      await AsyncStorage.removeItem(KEY_TODAY);
      return false;
    } catch (e) {
      console.warn('[HumanVerify] refreshVerifiedStatus failed:', e);
      return false;
    }
  }

  private async writeTodayCache(cache: TodayCache): Promise<void> {
    await AsyncStorage.setItem(KEY_TODAY, JSON.stringify(cache));
  }

  // ── Cooldown ─────────────────────────────────────────────────────────────

  async isInCooldown(): Promise<{ inCooldown: boolean; until: number }> {
    try {
      const raw = await AsyncStorage.getItem(KEY_COOLDOWN_UNTIL);
      const until = raw ? parseInt(raw, 10) : 0;
      const now = Date.now();
      if (Number.isFinite(until) && until > now) {
        return { inCooldown: true, until };
      }
      return { inCooldown: false, until: 0 };
    } catch {
      return { inCooldown: false, until: 0 };
    }
  }

  private async incrementFailCount(): Promise<number> {
    const raw = await AsyncStorage.getItem(KEY_FAIL_COUNT);
    const n = raw ? parseInt(raw, 10) : 0;
    const next = (Number.isFinite(n) ? n : 0) + 1;
    await AsyncStorage.setItem(KEY_FAIL_COUNT, String(next));
    return next;
  }

  private async resetFailCount(): Promise<void> {
    await AsyncStorage.removeItem(KEY_FAIL_COUNT);
    await AsyncStorage.removeItem(KEY_COOLDOWN_UNTIL);
  }

  // ── Server interactions ──────────────────────────────────────────────────

  async fetchDailySeed(): Promise<DailySeed> {
    const url = `${config.baseUrl}/api/mining/verification/seed`;
    let authHeaders = await this.authHeader();

    if (!authHeaders.Authorization) {
      const freshToken = await this.reAuthWithStoredCredentials();
      if (freshToken) {
        authHeaders = { Authorization: `Bearer ${freshToken}` };
      } else {
        throw new Error('Please log in to complete verification');
      }
    }

    let res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    });

    // Token expired mid-session — re-auth and retry once
    if (res.status === 401) {
      const freshToken = await this.reAuthWithStoredCredentials();
      if (freshToken) {
        res = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        });
      }
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch verification seed (HTTP ${res.status})`);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      throw new Error('Verification service unavailable — please try again later');
    }
    const data = await res.json();
    if (!data?.seed || !data?.sig || typeof data?.day !== 'number') {
      throw new Error('Malformed verification seed response');
    }
    return { seed: data.seed, sig: data.sig, day: data.day };
  }

  /**
   * Submit attestation to server. On success, write local cache so subsequent
   * sessions today skip the gate.
   *
   * @param elapsedMs total time from gate-open to last challenge pass
   * @param nonce 16+ hex chars (callers should pass `await getRandomNonce()`)
   */
  async attest(
    seed: DailySeed,
    challengeIds: ChallengeId[],
    nonce: string,
    elapsedMs: number,
  ): Promise<void> {
    const url = `${config.baseUrl}/api/mining/verification/attest`;
    const body = JSON.stringify({ seed: seed.seed, sig: seed.sig, challengeIds, nonce, elapsedMs });
    let authHeaders = await this.authHeader();

    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body,
    });

    if (res.status === 401) {
      const freshToken = await this.reAuthWithStoredCredentials();
      if (freshToken) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
          body,
        });
      }
    }

    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err?.message) reason = err.message;
      } catch {}
      throw new Error(`Attestation rejected: ${reason}`);
    }
    // Server accepted — cache locally and reset fail counters.
    await this.writeTodayCache({
      utcDay: seed.day,
      seed: seed.seed,
      sig: seed.sig,
      attestedAt: Date.now(),
    });
    await this.resetFailCount();
    await this.bumpStats('pass', challengeIds);
  }

  /**
   * Local-only fail recording. Drives the cooldown after MAX_FAILS_BEFORE_COOLDOWN
   * consecutive fails. Does NOT hit the server (the server only sees pass attestations).
   */
  async recordFail(challengeIds: ChallengeId[], reason: string): Promise<void> {
    const fails = await this.incrementFailCount();
    if (fails >= MAX_FAILS_BEFORE_COOLDOWN) {
      const until = Date.now() + COOLDOWN_MS;
      await AsyncStorage.setItem(KEY_COOLDOWN_UNTIL, String(until));
    }
    await this.bumpStats('fail', challengeIds);
    console.log(`[HumanVerify] Fail #${fails} — ${reason}`);
  }

  // ── Telemetry ────────────────────────────────────────────────────────────

  private async bumpStats(kind: 'pass' | 'fail', challengeIds: ChallengeId[]): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(KEY_STATS);
      const stats: VerifyStats = raw
        ? JSON.parse(raw)
        : { pass: 0, fail: 0, byChallenge: {} };
      stats[kind] += 1;
      for (const id of challengeIds) {
        if (!stats.byChallenge[id]) stats.byChallenge[id] = { pass: 0, fail: 0 };
        stats.byChallenge[id][kind] += 1;
      }
      await AsyncStorage.setItem(KEY_STATS, JSON.stringify(stats));
    } catch {
      // telemetry is best-effort
    }
  }

  async getStats(): Promise<VerifyStats> {
    try {
      const raw = await AsyncStorage.getItem(KEY_STATS);
      if (!raw) return { pass: 0, fail: 0, byChallenge: {} };
      return JSON.parse(raw);
    } catch {
      return { pass: 0, fail: 0, byChallenge: {} };
    }
  }

  // ── Challenge picker ─────────────────────────────────────────────────────

  /**
   * Deterministic from seed: same seed → same challenge. The seed rotates
   * daily (server-issued), so the user sees a stable pick for the day but
   * different days roll different challenges.
   *
   * Returns exactly 1 challenge drawn from any tier.
   */
  pickChallenges(seedHex: string): ChallengeSpec[] {
    if (!seedHex || seedHex.length < 8) {
      throw new Error('Invalid seed');
    }
    const rng = makeXorshift32(seedHex);

    // 30 % chance of a face challenge; otherwise pick uniformly from all tiers
    if (rng() < FACE_DAY_PROBABILITY) {
      return [this.specFor('face', rng)];
    }

    const pool: ChallengeId[] = ['shake', 'tilt', 'tap', 'sequence'];
    const id = pool[Math.floor(rng() * pool.length)];
    return [this.specFor(id, rng)];
  }

  private specFor(id: ChallengeId, rng: () => number): ChallengeSpec {
    switch (id) {
      case 'shake':
        return { id, tier: 1, params: { peaksRequired: 4, windowMs: 3000, magThreshold: 12 } };
      case 'tilt': {
        const dirs: Array<'left' | 'right' | 'up' | 'down'> = ['left', 'right', 'up', 'down'];
        const dir1 = dirs[Math.floor(rng() * dirs.length)];
        let dir2 = dirs[Math.floor(rng() * dirs.length)];
        if (dir2 === dir1) dir2 = dirs[(dirs.indexOf(dir1) + 1) % dirs.length];
        return { id, tier: 1, params: { sequence: [dir1, dir2], holdMs: 500, toleranceDeg: 20 } };
      }
      case 'tap': {
        const targetIndex = Math.floor(rng() * 16);
        return { id, tier: 2, params: { gridSize: 16, targetIndex } };
      }
      case 'sequence': {
        const seq: number[] = [];
        for (let i = 0; i < 4; i++) seq.push(Math.floor(rng() * 4));
        return { id, tier: 2, params: { sequence: seq, flashMs: 600, gapMs: 200 } };
      }
      case 'face': {
        const prompts = ['smile', 'blink', 'lookLeft', 'lookRight', 'lookUp', 'lookDown'] as const;
        const prompt = prompts[Math.floor(rng() * prompts.length)];
        return { id, tier: 3, params: { prompt, timeoutMs: 18_000 } };
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Random nonce for replay protection. Must match the server's [8, 128] length
 * range. Returns 32 hex chars (16 bytes).
 */
export async function getRandomNonce(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Tiny seedable RNG. Reads first 4 bytes of seed hex into a 32-bit state.
 * Output: float in [0, 1).
 */
function makeXorshift32(seedHex: string): () => number {
  let state = parseInt(seedHex.substring(0, 8), 16) >>> 0;
  if (state === 0) state = 0xdeadbeef;
  return function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export default HumanVerificationService;
