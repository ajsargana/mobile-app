import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from './EnhancedWalletService';
import { getApiUrl, API_ENDPOINTS } from '../config/environment';
import { postSignedCall } from '../lib/keystore/txAuth';

const STORAGE_KEY_PREFIX = '@aura50_staking_data';

function storageKeyForAccount(walletAddress: string): string {
  return `${STORAGE_KEY_PREFIX}_${walletAddress}`;
}

export type LockDays = number;

export interface StakeRecord {
  lockedAmount: number;
  lockDays: LockDays;
  startTime: number;
  endTime: number;
  score: number;
  boostPct: number;
  multiplier: number;
}

export interface BoostPreview {
  score: number;
  boostPct: number;
  multiplier: number;
}

export function computeStakingBoost(amount: number, lockDays: number): BoostPreview {
  if (amount <= 0 || lockDays <= 0) return { score: 0, boostPct: 0, multiplier: 1 };
  const score      = (amount / 100) * (lockDays / 30);
  const boostPct   = Math.min(10 * Math.sqrt(score), 50);
  const multiplier = 1 + boostPct / 100;
  return {
    score:      Math.round(score * 100) / 100,
    boostPct:   Math.round(boostPct * 100) / 100,
    multiplier: Math.round(multiplier * 10_000) / 10_000,
  };
}

// ── Auth token helper ─────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem('@aura50_auth_token');
}

// ── Signed contract calls ─────────────────────────────────────────────────────
// Stake/unstake are contract calls that execute as this account, so the server
// asks for a device-key signature (428) and every validator re-checks it. The
// expected call below must match what the server's staking route builds
// (server/routes/staking.ts); txAuth refuses to sign anything else.
const STAKING_CONTRACT = 'b1d386e181943ca70e3dfaac8d9e0dbfe46f1cc5'; // server/staking-genesis.ts
const STAKING_GAS_LIMIT = 5_000_000;
const SATS_PER_A50 = 100_000_000;

// ── Service ───────────────────────────────────────────────────────────────────

export class StakingService {
  private static instance: StakingService;
  private activeStake: StakeRecord | null = null;
  private loaded = false;
  private loadedForWallet: string | null = null;

  private constructor() {}

  static getInstance(): StakingService {
    if (!StakingService.instance) {
      StakingService.instance = new StakingService();
    }
    return StakingService.instance;
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    const wallet = EnhancedWalletService.getInstance().getCurrentAccount()?.address ?? null;
    if (this.loaded && this.loadedForWallet === wallet) return;

    this.loaded = false;
    this.activeStake = null;
    this.loadedForWallet = wallet;

    if (!wallet) {
      this.loaded = true;
      return;
    }

    // Try backend first, fall back to AsyncStorage (offline)
    try {
      const token = await getAuthToken();
      if (token) {
        const url = `${getApiUrl(API_ENDPOINTS.stakingQuery)}/${encodeURIComponent(wallet)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { stake } = await res.json();
          // A stake past its end no longer locks anything: its coins are free
          // and the next stake replaces its record (server clears it).
          this.activeStake = stake && stake.endTime > Date.now() ? stake : null;
          // Sync to AsyncStorage for offline use
          if (this.activeStake) {
            await AsyncStorage.setItem(storageKeyForAccount(wallet), JSON.stringify(this.activeStake));
          } else {
            await AsyncStorage.removeItem(storageKeyForAccount(wallet));
          }
          this.loaded = true;
          return;
        }
      }
    } catch {
      // Network error — fall through to AsyncStorage
    }

    try {
      const raw = await AsyncStorage.getItem(storageKeyForAccount(wallet));
      const cached: StakeRecord | null = raw ? JSON.parse(raw) : null;
      this.activeStake = cached && cached.endTime > Date.now() ? cached : null;
    } catch {
      this.activeStake = null;
    }
    this.loaded = true;
  }

  resetForAccountSwitch(): void {
    this.activeStake = null;
    this.loaded = false;
    this.loadedForWallet = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async getActiveStake(): Promise<StakeRecord | null> {
    await this.load();
    return this.activeStake;
  }

  /**
   * Lock `amount` of this account's own balance for `lockDays`. The coins stay
   * in the wallet; the chain locks them when the stake settles (~1 block) and
   * they unlock by themselves at the end — there is nothing to claim back.
   * Needs the network: a stake is a device-signed transaction every validator
   * checks, so there is no offline stake.
   */
  async stake(amount: number, lockDays: LockDays): Promise<StakeRecord> {
    await this.load();

    if (amount <= 0) throw new Error('Stake amount must be greater than zero.');
    if (!Number.isInteger(lockDays) || lockDays < 1 || lockDays > 1095) throw new Error('Lock period must be 1–1095 whole days.');
    if (this.activeStake) throw new Error('You already have an active stake. You can stake again after it ends.');

    const available = this.getAvailableBalanceSync();
    if (amount > available) {
      throw new Error(`Insufficient balance. Available: ${available.toFixed(2)} A50`);
    }

    const token = await getAuthToken();
    if (!token) throw new Error('Please sign in again to stake.');

    let res: Response;
    try {
      res = await postSignedCall(
        getApiUrl(API_ENDPOINTS.stakingStake),
        { amount, lockDays },
        { Authorization: `Bearer ${token}` },
        {
          contract: STAKING_CONTRACT, function: 'stake', args: [lockDays],
          valueSats: Math.round(amount * SATS_PER_A50), gasLimit: STAKING_GAS_LIMIT,
          account: await AsyncStorage.getItem('@aura50_user_id'),
        },
      );
    } catch (err) {
      if (err instanceof Error && !err.message.includes('fetch')) throw err;
      throw new Error('You are offline. Staking needs a connection — nothing was locked.');
    }
    if (!res.ok) {
      const { message } = await res.json().catch(() => ({ message: 'Stake failed' }));
      throw new Error(message);
    }

    // Queued; it settles in ~1 block. Show it now (the balance is unchanged:
    // the coins stay in the wallet, locked), then confirm from the chain.
    const { score, boostPct, multiplier } = computeStakingBoost(amount, lockDays);
    const now = Date.now();
    const record: StakeRecord = {
      lockedAmount: amount,
      lockDays,
      startTime: now,
      endTime:   now + lockDays * 86_400_000,
      score,
      boostPct,
      multiplier,
    };
    this.activeStake = record;
    const wallet = EnhancedWalletService.getInstance().getCurrentAccount()?.address;
    if (wallet) await AsyncStorage.setItem(storageKeyForAccount(wallet), JSON.stringify(record));
    // If the chain refused it (e.g. the balance was spent first), this clears it.
    setTimeout(() => { this.syncFromServer().catch(() => {}); }, 70_000);
    return record;
  }

  /**
   * Clear an ENDED stake's record on chain. Optional: an ended stake's coins
   * are already free, and a new stake replaces the old record by itself.
   */
  async unstake(): Promise<void> {
    await this.load();
    const wallet = EnhancedWalletService.getInstance().getCurrentAccount()?.address;
    if (this.activeStake && Date.now() < this.activeStake.endTime) {
      const days = this.getRemainingDays();
      throw new Error(`Coins are locked for ${days} more day${days !== 1 ? 's' : ''}. No early withdrawal.`);
    }

    const token = await getAuthToken();
    if (token) {
      try {
        const res = await postSignedCall(
          getApiUrl(API_ENDPOINTS.stakingUnstake),
          {},
          { Authorization: `Bearer ${token}` },
          {
            contract: STAKING_CONTRACT, function: 'unstake', args: [],
            valueSats: 0, gasLimit: STAKING_GAS_LIMIT,
            account: await AsyncStorage.getItem('@aura50_user_id'),
          },
        );
        // 404: nothing to clear. Anything else non-OK is reported.
        if (!res.ok && res.status !== 404) {
          const { message } = await res.json().catch(() => ({ message: 'Unstake failed' }));
          throw new Error(message);
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes('fetch')) throw err;
        // Offline: nothing to do locally — the coins are already free.
      }
    }
    this.activeStake = null;
    if (wallet) await AsyncStorage.removeItem(storageKeyForAccount(wallet));
  }

  /**
   * Confirm a just-queued stake against the chain. Until it settles the server
   * reports no stake, so keep the local record for a few blocks; if the chain
   * still has none after that, the stake was refused (e.g. the balance was
   * spent first) and the local record is dropped.
   */
  private async syncFromServer(attempt = 0): Promise<void> {
    const pending = this.activeStake;
    const wallet = EnhancedWalletService.getInstance().getCurrentAccount()?.address;
    const token = await getAuthToken();
    if (!wallet || !token) return;
    const res = await fetch(`${getApiUrl(API_ENDPOINTS.stakingQuery)}/${encodeURIComponent(wallet)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { stake } = await res.json();
    if (stake && stake.endTime > Date.now()) {
      this.activeStake = stake;
      await AsyncStorage.setItem(storageKeyForAccount(wallet), JSON.stringify(stake));
      return;
    }
    if (pending && attempt < 4) {
      setTimeout(() => { this.syncFromServer(attempt + 1).catch(() => {}); }, 60_000);
      return;
    }
    this.activeStake = null;
    await AsyncStorage.removeItem(storageKeyForAccount(wallet));
  }

  // ── Read helpers ────────────────────────────────────────────────────────────

  getBoostMultiplier(): number {
    if (!this.activeStake) return 1.0;
    if (Date.now() >= this.activeStake.endTime) return 1.0;
    return this.activeStake.multiplier;
  }

  getRemainingMs(): number {
    if (!this.activeStake) return 0;
    return Math.max(0, this.activeStake.endTime - Date.now());
  }

  getRemainingDays(): number {
    return Math.ceil(this.getRemainingMs() / 86_400_000);
  }

  getRemainingLabel(): string {
    const ms = this.getRemainingMs();
    if (ms <= 0) return 'Unlockable now';
    const totalMins = Math.floor(ms / 60_000);
    const days  = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins  = totalMins % 60;
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  }

  canUnstake(): boolean {
    if (!this.activeStake) return false;
    return Date.now() >= this.activeStake.endTime;
  }

  getAvailableBalanceSync(): number {
    const walletService = EnhancedWalletService.getInstance();
    const account = walletService.getCurrentAccount();
    // Staked coins stay in account.balance (the chain locks them in place), so
    // a running stake is subtracted here, as is the security-circle stake.
    const total = account ? parseFloat(account.balance) : 0;
    const circleLocked = parseFloat((account as any)?.lockedStakeBalance ?? '0');
    const stakeLocked = this.activeStake && this.activeStake.endTime > Date.now() ? this.activeStake.lockedAmount : 0;
    return Math.max(0, total - circleLocked - stakeLocked);
  }

  preview(amount: number, lockDays: number): BoostPreview {
    return computeStakingBoost(amount, lockDays);
  }
}

export default StakingService;
