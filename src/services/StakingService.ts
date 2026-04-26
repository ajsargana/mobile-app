import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from './EnhancedWalletService';

const STORAGE_KEY_PREFIX = '@aura50_staking_data';

/** Returns the AsyncStorage key scoped to a specific wallet address. */
function storageKeyForAccount(walletAddress: string): string {
  return `${STORAGE_KEY_PREFIX}_${walletAddress}`;
}

export type LockDays = number; // Allows any lock duration from 0 to 1095 days

export interface StakeRecord {
  lockedAmount: number;  // A50 coins locked
  lockDays: LockDays;    // chosen lock period
  startTime: number;     // epoch ms
  endTime: number;       // startTime + lockDays * 86_400_000
  score: number;         // (lockedAmount/100) * (lockDays/30)
  boostPct: number;      // min(10 * sqrt(score), 50)  — rounded to 2dp
  multiplier: number;    // 1 + boostPct / 100
}

export interface BoostPreview {
  score: number;
  boostPct: number;
  multiplier: number;
}

// ── Pure math ─────────────────────────────────────────────────────────────────

/**
 * Compute boost for any amount + lock duration.
 * No minimums — even 1 A50 earns a proportional boost.
 *
 * score      = (lockedAmount / 100) * (lockDays / 30)
 * boostPct   = min(10 * sqrt(score), 50)
 * multiplier = 1 + boostPct / 100
 */
export function computeStakingBoost(amount: number, lockDays: number): BoostPreview {
  if (amount <= 0 || lockDays <= 0) return { score: 0, boostPct: 0, multiplier: 1 };
  const score     = (amount / 100) * (lockDays / 30);
  const boostPct  = Math.min(10 * Math.sqrt(score), 50);
  const multiplier = 1 + boostPct / 100;
  return {
    score:      Math.round(score * 100) / 100,
    boostPct:   Math.round(boostPct * 100) / 100,
    multiplier: Math.round(multiplier * 10000) / 10000,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class StakingService {
  private static instance: StakingService;
  private activeStake: StakeRecord | null = null;
  private loaded = false;
  private loadedForWallet: string | null = null; // which wallet's stake is in memory

  private constructor() {}

  static getInstance(): StakingService {
    if (!StakingService.instance) {
      StakingService.instance = new StakingService();
    }
    return StakingService.instance;
  }

  // ── Load / persist ──────────────────────────────────────────────────────────

  async load(): Promise<void> {
    const wallet = EnhancedWalletService.getInstance().getCurrentAccount()?.address ?? null;

    // If the active account changed since last load, discard cached state and reload.
    if (this.loaded && this.loadedForWallet === wallet) return;

    this.loaded = false;
    this.activeStake = null;
    this.loadedForWallet = wallet;

    if (!wallet) {
      this.loaded = true;
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(storageKeyForAccount(wallet));
      this.activeStake = raw ? JSON.parse(raw) : null;
    } catch {
      this.activeStake = null;
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const wallet = EnhancedWalletService.getInstance().getCurrentAccount()?.address;
    if (!wallet) return;
    const key = storageKeyForAccount(wallet);
    if (this.activeStake) {
      await AsyncStorage.setItem(key, JSON.stringify(this.activeStake));
    } else {
      await AsyncStorage.removeItem(key);
    }
  }

  /**
   * Call this after the user logs out or switches accounts so stale stake
   * data from the previous account is never sent with the new account's shares.
   */
  resetForAccountSwitch(): void {
    this.activeStake = null;
    this.loaded = false;
    this.loadedForWallet = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Returns the current active stake, or null if none. */
  async getActiveStake(): Promise<StakeRecord | null> {
    await this.load();
    return this.activeStake;
  }

  /**
   * Stake `amount` A50 for `lockDays` days.
   * Coins are immediately deducted from spendable balance.
   * There is no early unlock — coins return only after endTime.
   */
  async stake(amount: number, lockDays: LockDays): Promise<StakeRecord> {
    await this.load();

    if (amount <= 0) throw new Error('Stake amount must be greater than zero.');
    if (this.activeStake) throw new Error('An active stake already exists. Unstake after it expires first.');

    const walletService = EnhancedWalletService.getInstance();
    const available = this.getAvailableBalanceSync();

    if (amount > available) {
      throw new Error(`Insufficient balance. Available: ${available.toFixed(2)} A50`);
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

    // Deduct from wallet — coins are locked, not spendable
    const account = walletService.getCurrentAccount();
    if (account) {
      const newBalance = (parseFloat(account.balance) - amount).toFixed(8);
      await (walletService as any).updateBalance(newBalance);
    }

    this.activeStake = record;
    await this.persist();
    return record;
  }

  /**
   * Unstake — only allowed once endTime has passed.
   * Returns the staked amount to the wallet balance.
   */
  async unstake(): Promise<void> {
    await this.load();

    if (!this.activeStake) throw new Error('No active stake to release.');

    if (Date.now() < this.activeStake.endTime) {
      const days = this.getRemainingDays();
      throw new Error(`Coins are locked for ${days} more day${days !== 1 ? 's' : ''}. No early withdrawal.`);
    }

    const walletService = EnhancedWalletService.getInstance();
    const account = walletService.getCurrentAccount();
    if (account) {
      const restored = (parseFloat(account.balance) + this.activeStake.lockedAmount).toFixed(8);
      await (walletService as any).updateBalance(restored);
    }

    this.activeStake = null;
    await this.persist();
  }

  // ── Read helpers ────────────────────────────────────────────────────────────

  /** Share multiplier used by MiningService (1.0 if no active stake). */
  getBoostMultiplier(): number {
    if (!this.activeStake) return 1.0;
    // Guard: expired stakes still in memory before unstake() is called
    if (Date.now() >= this.activeStake.endTime) return 1.0;
    return this.activeStake.multiplier;
  }

  /** Milliseconds until unlock (0 if expired or no stake). */
  getRemainingMs(): number {
    if (!this.activeStake) return 0;
    return Math.max(0, this.activeStake.endTime - Date.now());
  }

  /** Whole days remaining (ceiling). */
  getRemainingDays(): number {
    return Math.ceil(this.getRemainingMs() / 86_400_000);
  }

  /** Hours + minutes left for display (e.g. "3h 42m"). */
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

  /** True only when lock has expired and coins can be claimed. */
  canUnstake(): boolean {
    if (!this.activeStake) return false;
    return Date.now() >= this.activeStake.endTime;
  }

  /**
   * Spendable balance = wallet balance minus any locked stake.
   * Call this instead of walletService.getBalance() when checking
   * whether a send/transfer is affordable.
   */
  getAvailableBalanceSync(): number {
    const walletService = EnhancedWalletService.getInstance();
    const account = walletService.getCurrentAccount();
    const total = account ? parseFloat(account.balance) : 0;
    const locked = this.activeStake?.lockedAmount ?? 0;
    return Math.max(0, total - locked);
  }

  /** Pure preview for the UI calculator — no side effects. */
  preview(amount: number, lockDays: number): BoostPreview {
    return computeStakingBoost(amount, lockDays);
  }
}

export default StakingService;
