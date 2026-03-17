import AsyncStorage from '@react-native-async-storage/async-storage';

// NOTE: SESSION_COUNT key must NOT overlap with MiningService's '@aura50_mining_sessions'
const UNLOCKED_KEY   = '@aura50_achievements';
const UNLOCKED_DATES = '@aura50_achievements_dates';
const SESSION_COUNT  = '@aura50_session_count';       // just a number string
const CHECKIN_KEY    = '@aura50_last_checkin_date';
const CHECKIN_COUNT  = '@aura50_checkin_count';
const CHECKIN_WEEK   = '@aura50_checkin_week';        // string[] of YYYY-MM-DD for current week

/** ISO date string of the Monday that starts the current week */
function currentWeekMonday(): string {
  const d   = new Date();
  const dow = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() - ((dow + 6) % 7)); // rewind to Monday
  return d.toISOString().slice(0, 10);
}

export interface Achievement {
  id:          string;
  label:       string;
  icon:        string;
  description: string;
  benefit:     string;   // short "why it helps" shown on tap
  unlocked:    boolean;
  unlockedAt?: string;
}

const DEFINITIONS: Omit<Achievement, 'unlocked' | 'unlockedAt'>[] = [
  // ── Milestones: first steps ────────────────────────────────────────────────
  {
    id: 'first_forge',
    label: 'First Forge',
    icon: '⚡',
    description: 'Complete your first mining session',
    benefit: 'You\'re on the network! Each session earns trust XP that unlocks higher reward tiers over time.',
  },

  // ── Streaks ────────────────────────────────────────────────────────────────
  {
    id: 'consistent',
    label: 'Consistent',
    icon: '⭐',
    description: 'Reach a 3-day streak',
    benefit: 'Streaks prove reliable uptime to the network — validators with steady history earn priority slots.',
  },
  {
    id: 'week_warrior',
    label: 'Week Warrior',
    icon: '🔥',
    description: 'Reach a 7-day streak',
    benefit: 'Unlocks 8% cooldown reduction — you can start new sessions sooner than other miners.',
  },
  {
    id: 'fortnight',
    label: 'Fortnight Forge',
    icon: '🌙',
    description: 'Reach a 14-day streak',
    benefit: 'Unlocks 15% cooldown reduction and bumps your trust score weight — closer to Trusted tier.',
  },
  {
    id: 'diamond_hands',
    label: 'Diamond Hands',
    icon: '💎',
    description: 'Reach a 21-day streak',
    benefit: 'Shows the network you are a long-term participant. Boosts referral bonus multiplier for your invites.',
  },
  {
    id: 'month_master',
    label: 'Month Master',
    icon: '👑',
    description: 'Reach a 30-day streak',
    benefit: 'Maximum 20% cooldown reduction. Your node is treated as high-reliability — earns more block slots.',
  },

  // ── Session count ──────────────────────────────────────────────────────────
  {
    id: 'network_node',
    label: 'Network Node',
    icon: '🌐',
    description: 'Complete 50 mining sessions',
    benefit: 'At 50 sessions your device is logged as an established node — eligible for lightweight validator duties.',
  },
  {
    id: 'centurion',
    label: 'Centurion',
    icon: '💯',
    description: 'Complete 100 mining sessions',
    benefit: '100 sessions qualifies you for Trusted tier review, unlocking peer-to-peer transfer features.',
  },
  {
    id: 'veteran',
    label: 'Veteran',
    icon: '🎖️',
    description: 'Complete 250 mining sessions',
    benefit: 'Veteran nodes receive preferential block selection — higher chance of earning block credits each round.',
  },

  // ── Daily check-ins ────────────────────────────────────────────────────────
  {
    id: 'daily_devout',
    label: 'Daily Devout',
    icon: '📅',
    description: 'Check in 7 days in a row',
    benefit: 'Daily check-ins signal liveness to the network and count toward your activity score independently of mining.',
  },
  {
    id: 'checkin_regular',
    label: 'Regular',
    icon: '🗓️',
    description: 'Check in 30 times total',
    benefit: '30 check-ins adds a persistent +5% XP multiplier to every session you complete that day.',
  },
  {
    id: 'checkin_champion',
    label: 'Check-In Champion',
    icon: '🏅',
    description: 'Check in 100 times total',
    benefit: 'Your account is flagged as high-engagement — increases referral reward rate by 10% permanently.',
  },
];

class AchievementService {
  private static _instance: AchievementService;
  static getInstance(): AchievementService {
    if (!AchievementService._instance) AchievementService._instance = new AchievementService();
    return AchievementService._instance;
  }

  async getUnlocked(): Promise<string[]> {
    const raw = await AsyncStorage.getItem(UNLOCKED_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async getAllWithStatus(): Promise<Achievement[]> {
    const unlocked = await this.getUnlocked();
    const rawDates = await AsyncStorage.getItem(UNLOCKED_DATES);
    const dates: Record<string, string> = rawDates ? JSON.parse(rawDates) : {};

    return DEFINITIONS.map(def => ({
      ...def,
      unlocked:   unlocked.includes(def.id),
      unlockedAt: dates[def.id],
    }));
  }

  async checkAndUnlock(ctx: {
    streakCount: number;
    totalSessions: number;
    checkinCount: number;
  }): Promise<string[]> {
    const { streakCount, totalSessions, checkinCount } = ctx;
    const unlocked = await this.getUnlocked();
    const newlyUnlocked: string[] = [];

    const check = (id: string, condition: boolean) => {
      if (condition && !unlocked.includes(id)) {
        unlocked.push(id);
        newlyUnlocked.push(id);
      }
    };

    check('first_forge',      totalSessions >= 1);
    check('consistent',       streakCount   >= 3);
    check('week_warrior',     streakCount   >= 7);
    check('fortnight',        streakCount   >= 14);
    check('diamond_hands',    streakCount   >= 21);
    check('month_master',     streakCount   >= 30);
    check('network_node',     totalSessions >= 50);
    check('centurion',        totalSessions >= 100);
    check('veteran',          totalSessions >= 250);
    check('daily_devout',     checkinCount  >= 7);
    check('checkin_regular',  checkinCount  >= 30);
    check('checkin_champion', checkinCount  >= 100);

    if (newlyUnlocked.length > 0) {
      await AsyncStorage.setItem(UNLOCKED_KEY, JSON.stringify(unlocked));

      const rawDates = await AsyncStorage.getItem(UNLOCKED_DATES);
      const dates: Record<string, string> = rawDates ? JSON.parse(rawDates) : {};
      const now = new Date().toISOString();
      newlyUnlocked.forEach(id => { dates[id] = now; });
      await AsyncStorage.setItem(UNLOCKED_DATES, JSON.stringify(dates));
    }

    return newlyUnlocked;
  }

  /** Increment total session count and return new value.
   *  Uses @aura50_session_count — separate from MiningService's session array key. */
  async incrementSessions(): Promise<number> {
    const raw = await AsyncStorage.getItem(SESSION_COUNT);
    const next = (parseInt(raw ?? '0', 10) || 0) + 1;
    await AsyncStorage.setItem(SESSION_COUNT, String(next));
    return next;
  }

  async getTotalSessions(): Promise<number> {
    const raw = await AsyncStorage.getItem(SESSION_COUNT);
    return parseInt(raw ?? '0', 10) || 0;
  }

  /** Record a check-in (once per day) and return new total count. */
  async recordCheckin(): Promise<{ count: number; isNew: boolean }> {
    const today    = new Date().toISOString().slice(0, 10);
    const lastDate = await AsyncStorage.getItem(CHECKIN_KEY);
    if (lastDate === today) {
      const c = parseInt((await AsyncStorage.getItem(CHECKIN_COUNT)) ?? '0', 10) || 0;
      return { count: c, isNew: false };
    }
    const raw   = await AsyncStorage.getItem(CHECKIN_COUNT);
    const count = (parseInt(raw ?? '0', 10) || 0) + 1;

    // Update per-day week array — drop dates from previous weeks
    const monday   = currentWeekMonday();
    const weekRaw  = await AsyncStorage.getItem(CHECKIN_WEEK);
    const weekDates: string[] = weekRaw
      ? (JSON.parse(weekRaw) as string[]).filter(d => d >= monday)
      : [];
    if (!weekDates.includes(today)) weekDates.push(today);

    await AsyncStorage.multiSet([
      [CHECKIN_KEY,   today],
      [CHECKIN_COUNT, String(count)],
      [CHECKIN_WEEK,  JSON.stringify(weekDates)],
    ]);
    return { count, isNew: true };
  }

  /** Returns the ISO date strings (YYYY-MM-DD) that were checked in during the current week. */
  async getWeekCheckins(): Promise<string[]> {
    const monday  = currentWeekMonday();
    const weekRaw = await AsyncStorage.getItem(CHECKIN_WEEK);
    if (!weekRaw) return [];
    return (JSON.parse(weekRaw) as string[]).filter(d => d >= monday);
  }

  async getCheckinCount(): Promise<number> {
    const raw = await AsyncStorage.getItem(CHECKIN_COUNT);
    return parseInt(raw ?? '0', 10) || 0;
  }

  async getLastCheckinDate(): Promise<string | null> {
    return AsyncStorage.getItem(CHECKIN_KEY);
  }

  getDefinitions() {
    return DEFINITIONS;
  }
}

export default AchievementService;
