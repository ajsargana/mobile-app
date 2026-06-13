/**
 * PhaseTaskService — client for the server's launch-phase system.
 *
 * The server exposes only the user's CURRENT task (progressive disclosure) and
 * the live 6-month wallet-lock status. Both are cached in AsyncStorage so the
 * wallet screen can render offline; the server remains authoritative and the
 * lock card disappears as soon as the server reports locked:false.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl, API_ENDPOINTS } from '../config/environment';

const TASK_CACHE_KEY = '@aura50_phase_current_task';
const LOCK_CACHE_KEY = '@aura50_phase_lock_status';

export interface CurrentTask {
  taskId: 'unlock_invites' | 'invite_3_verified' | 'six_month_lock' | null;
  phase: number;
  title: string;
  description: string;
  progress: { current: number; target: number };
  meta: Record<string, any>;
}

export interface LockStatus {
  locked: boolean;
  phase: 0 | 1 | 2;       // 0 = unlocked/legacy, 1 = building circle, 2 = 180-day lock
  reason: string;
  unlockAt: string | null;
  remainingMs: number;
  progress: { current: number; target: number };
}

export interface UnlockInvitesResult {
  ok: boolean;
  alreadyUnlocked?: boolean;
  inviteCode?: string;
  message: string;
}

async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem('@aura50_auth_token');
}

export class PhaseTaskService {
  private static instance: PhaseTaskService;

  static getInstance(): PhaseTaskService {
    if (!PhaseTaskService.instance) {
      PhaseTaskService.instance = new PhaseTaskService();
    }
    return PhaseTaskService.instance;
  }

  /** Current launch task — server returns only the next visible one. */
  async getCurrentTask(): Promise<CurrentTask | null> {
    try {
      const token = await getAuthToken();
      if (token) {
        const res = await fetch(getApiUrl(API_ENDPOINTS.phasesCurrent), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { task } = await res.json();
          if (task) {
            await AsyncStorage.setItem(TASK_CACHE_KEY, JSON.stringify(task));
            return task;
          }
        }
      }
    } catch {
      // Network error — fall through to cache
    }

    try {
      const raw = await AsyncStorage.getItem(TASK_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Live wallet send-lock status. The card hides itself once locked === false. */
  async getLockStatus(): Promise<LockStatus | null> {
    try {
      const token = await getAuthToken();
      if (token) {
        const res = await fetch(getApiUrl(API_ENDPOINTS.phasesLockStatus), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const status: LockStatus = {
            locked:      !!data.locked,
            phase:       (data.phase ?? 0) as 0 | 1 | 2,
            reason:      data.reason ?? '',
            unlockAt:    data.unlockAt ?? null,
            remainingMs: data.remainingMs ?? 0,
            progress:    data.progress ?? { current: 0, target: 3 },
          };
          await AsyncStorage.setItem(LOCK_CACHE_KEY, JSON.stringify(status));
          return status;
        }
      }
    } catch {
      // Network error — fall through to cache
    }

    try {
      const raw = await AsyncStorage.getItem(LOCK_CACHE_KEY);
      if (!raw) return null;
      const cached: LockStatus = JSON.parse(raw);
      // Honour expiry offline: if a phase-2 lock's unlock time has passed, the
      // lock is gone even without server contact (the server agrees on sync).
      if (cached.locked && cached.phase === 2 && cached.unlockAt && Date.now() >= new Date(cached.unlockAt).getTime()) {
        const unlocked: LockStatus = { locked: false, phase: 0, reason: '', unlockAt: null, remainingMs: 0, progress: cached.progress };
        await AsyncStorage.setItem(LOCK_CACHE_KEY, JSON.stringify(unlocked));
        return unlocked;
      }
      if (cached.locked && cached.unlockAt) {
        cached.remainingMs = Math.max(0, new Date(cached.unlockAt).getTime() - Date.now());
      }
      return cached;
    } catch {
      return null;
    }
  }

  /** Lock the 10 A50 invite bond that unlocks the invite link (idempotent). */
  async unlockInvites(): Promise<UnlockInvitesResult> {
    const token = await getAuthToken();
    if (!token) return { ok: false, message: 'Not authenticated' };
    try {
      const res = await fetch(getApiUrl(API_ENDPOINTS.phasesUnlockInvites), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return { ok: true, alreadyUnlocked: data.alreadyUnlocked, inviteCode: data.inviteCode, message: data.message ?? 'Invites unlocked' };
      }
      return { ok: false, message: data.message ?? 'Could not unlock invites' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Network error' };
    }
  }
}

export default PhaseTaskService;
