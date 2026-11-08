/**
 * PendingRewardService — the wallet's live "Pending ≈ X A50" line.
 *
 * The server computes it (open-block estimate + exact amounts still in the
 * 5-minute challenge window) and returns it on calls the app already makes:
 *   • POST /api/blocks/submit-share  → pendingReward   (every landed share)
 *   • GET  /api/blocks/current       → pendingReward   (every mining round)
 *   • GET  /api/mining/pending-rewards → myPending     (wallet open / refresh)
 * so showing it costs no extra polling.
 *
 * Rules the UI must keep:
 *   • It is NOT spendable — show it apart from the balance, prefixed "≈".
 *   • Replace, never add: the server drops an epoch from `total` the moment it
 *     is credited, so the balance goes up as pending goes down. Never sum this
 *     into the balance.
 */
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../config/environment';

export interface PendingReward {
  /** Estimate for shares in blocks no epoch has taken yet (moves as others join). */
  estimated: string;
  /** Exact amounts waiting out the challenge window. */
  awaiting: string;
  /** estimated + awaiting — the number to display. */
  total: string;
  myWeight: number;
  poolWeight: number;
  poolReward: string;
  /** When the latest awaiting epoch finishes its challenge window (ms), if any. */
  settlesBy: number | null;
}

export const PENDING_REWARD_EVENT = 'aura50:pendingReward';

let latest: PendingReward | null = null;

const isPendingReward = (v: any): v is PendingReward =>
  !!v && typeof v === 'object' && typeof v.total === 'string' && Number.isFinite(parseFloat(v.total));

/** Accept a server value (ignores missing/malformed ones) and notify listeners. */
export function publishPendingReward(value: unknown): void {
  if (!isPendingReward(value)) return;
  latest = value;
  DeviceEventEmitter.emit(PENDING_REWARD_EVENT, value);
}

export function getLatestPendingReward(): PendingReward | null {
  return latest;
}

/** Fetch the current figure (wallet open / pull-to-refresh). Never throws. */
export async function refreshPendingReward(): Promise<PendingReward | null> {
  try {
    const token = await AsyncStorage.getItem('@aura50_auth_token');
    if (!token) return latest;
    const res = await fetch(`${config.baseUrl}/api/mining/pending-rewards`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return latest;
    const json = await res.json();
    publishPendingReward(json?.myPending);
  } catch {
    // Offline or server busy — keep showing the last known value.
  }
  return latest;
}
