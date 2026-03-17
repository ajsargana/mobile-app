import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  count: '@aura50_streak_count',
  best:  '@aura50_streak_best',
  last:  '@aura50_last_streak_date',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface StreakData {
  count: number;
  best: number;
  lastDate: string | null;
}

class StreakService {
  private static _instance: StreakService;
  static getInstance(): StreakService {
    if (!StreakService._instance) StreakService._instance = new StreakService();
    return StreakService._instance;
  }

  async getStreak(): Promise<StreakData> {
    const [countStr, bestStr, lastDate] = await AsyncStorage.multiGet([
      KEYS.count, KEYS.best, KEYS.last,
    ]).then(pairs => pairs.map(p => p[1]));

    return {
      count:    parseInt(countStr  ?? '0', 10) || 0,
      best:     parseInt(bestStr   ?? '0', 10) || 0,
      lastDate: lastDate ?? null,
    };
  }

  async recordActivity(): Promise<{ count: number; isNew: boolean }> {
    const today     = todayISO();
    const yesterday = yesterdayISO();
    const data      = await this.getStreak();

    if (data.lastDate === today) {
      return { count: data.count, isNew: false };
    }

    const newCount = data.lastDate === yesterday ? data.count + 1 : 1;
    const newBest  = Math.max(newCount, data.best);

    await AsyncStorage.multiSet([
      [KEYS.count, String(newCount)],
      [KEYS.best,  String(newBest)],
      [KEYS.last,  today],
    ]);

    return { count: newCount, isNew: true };
  }

  getCooldownMultiplier(streakCount: number): number {
    if (streakCount >= 30) return 0.80;
    if (streakCount >= 14) return 0.85;
    if (streakCount >= 7)  return 0.92;
    return 1.0;
  }

  getTrustBoost(streakCount: number): string {
    if (streakCount >= 30) return '+20% trust XP';
    if (streakCount >= 14) return '+15% trust XP';
    if (streakCount >= 7)  return '+10% trust XP';
    if (streakCount >= 3)  return '+5% trust XP';
    return '';
  }
}

export default StreakService;
