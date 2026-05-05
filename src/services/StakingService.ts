import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from './EnhancedWalletService';
import { getApiUrl, API_ENDPOINTS } from '../config/environment';

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
          this.activeStake = stake ?? null;
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
      this.activeStake = raw ? JSON.parse(raw) : null;
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

  async stake(amount: number, lockDays: LockDays): Promise<StakeRecord> {
    await this.load();

    if (amount <= 0) throw new Error('Stake amount must be greater than zero.');
    if (this.activeStake) throw new Error('An active stake already exists. Unstake after it expires first.');

    const available = this.getAvailableBalanceSync();
    if (amount > available) {
      throw new Error(`Insufficient balance. Available: ${available.toFixed(2)} A50`);
    }

    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetch(getApiUrl(API_ENDPOINTS.stakingStake), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount, lockDays }),
        });

        if (res.ok) {
          const { stake } = await res.json();
          this.activeStake = stake as StakeRecord;
          const wallet = EnhancedWalletService.getInstance().getCurrentAccount()?.address;
          if (wallet) {
            await AsyncStorage.setItem(storageKeyForAccount(wallet), JSON.stringify(this.activeStake));
          }
          // Backend deducted balance — refresh local wallet balance
          const walletService = EnhancedWalletService.getInstance();
          const account = walletService.getCurrentAccount();
          if (account) {
            const newBalance = (parseFloat(account.balance) - amount).toFixed(8);
            await (walletService as any).updateBalance(newBalance);
          }
          return this.activeStake!;
        }

        const { message } = await res.json().catch(() => ({ message: 'Stake failed' }));
        throw new Error(message);
      } catch (err) {
        if (err instanceof Error && !err.message.includes('fetch')) throw err;
        // Network error — fall through to offline stake
      }
    }

    // Offline fallback: stake locally (backend will reconcile on next sync)
    const walletService = EnhancedWalletService.getInstance();
    const account = walletService.getCurrentAccount();
    if (account) {
      const newBalance = (parseFloat(account.balance) - amount).toFixed(8);
      await (walletService as any).updateBalance(newBalance);
    }

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
    if (wallet) {
      await AsyncStorage.setItem(storageKeyForAccount(wallet), JSON.stringify(record));
    }
    return record;
  }

  async unstake(): Promise<void> {
    await this.load();

    if (!this.activeStake) throw new Error('No active stake to release.');
    if (Date.now() < this.activeStake.endTime) {
      const days = this.getRemainingDays();
      throw new Error(`Coins are locked for ${days} more day${days !== 1 ? 's' : ''}. No early withdrawal.`);
    }

    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetch(getApiUrl(API_ENDPOINTS.stakingUnstake), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const { released } = await res.json();
          const walletService = EnhancedWalletService.getInstance();
          const account = walletService.getCurrentAccount();
          if (account && released) {
            const restored = (parseFloat(account.balance) + released).toFixed(8);
            await (walletService as any).updateBalance(restored);
          }
          this.activeStake = null;
          const wallet = account?.address;
          if (wallet) await AsyncStorage.removeItem(storageKeyForAccount(wallet));
          return;
        }

        const { message } = await res.json().catch(() => ({ message: 'Unstake failed' }));
        throw new Error(message);
      } catch (err) {
        if (err instanceof Error && !err.message.includes('fetch')) throw err;
      }
    }

    // Offline fallback
    const walletService = EnhancedWalletService.getInstance();
    const account = walletService.getCurrentAccount();
    if (account) {
      const restored = (parseFloat(account.balance) + this.activeStake.lockedAmount).toFixed(8);
      await (walletService as any).updateBalance(restored);
    }

    const wallet = account?.address;
    this.activeStake = null;
    if (wallet) await AsyncStorage.removeItem(storageKeyForAccount(wallet));
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
    const total  = account ? parseFloat(account.balance) : 0;
    const locked = this.activeStake?.lockedAmount ?? 0;
    return Math.max(0, total - locked);
  }

  preview(amount: number, lockDays: number): BoostPreview {
    return computeStakingBoost(amount, lockDays);
  }
}

export default StakingService;
