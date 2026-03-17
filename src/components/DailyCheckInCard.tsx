import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import AchievementService from '../services/AchievementService';
import StreakService from '../services/StreakService';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Returns 0=Mon … 6=Sun index for today */
function todayDowIndex(): number {
  const d = new Date().getDay(); // 0=Sun … 6=Sat
  return (d + 6) % 7;
}

/** Returns the ISO date string (YYYY-MM-DD) for day index i (0=Mon…6=Sun) of the current week */
function isoForDayIndex(i: number): string {
  const d   = new Date();
  const dow = d.getDay(); // 0=Sun … 6=Sat
  const diffToMonday = (dow + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  monday.setDate(monday.getDate() + i);
  return monday.toISOString().slice(0, 10);
}

interface Props {
  onCheckin?: (streakCount: number) => void; // callback for parent to refresh streak
  onNewBadges?: (ids: string[]) => void;
}

const DailyCheckInCard: React.FC<Props> = ({ onCheckin, onNewBadges }) => {
  const { colors, isDark } = useTheme();
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [filledDots, setFilledDots]         = useState<boolean[]>(Array(7).fill(false));

  // Confetti dots (8 colored dots)
  const confettiAnims = useRef(
    Array.from({ length: 8 }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      o: new Animated.Value(0),
    }))
  ).current;

  const btnScale   = useRef(new Animated.Value(1)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current; // 0=blue, 1=green (opacity overlay)

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    const [lastDate, weekCheckins] = await Promise.all([
      AchievementService.getInstance().getLastCheckinDate(),
      AchievementService.getInstance().getWeekCheckins(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const alreadyDone = lastDate === today;
    setCheckedInToday(alreadyDone);
    if (alreadyDone) btnOpacity.setValue(1); // show green immediately if already checked in
    // Each dot is filled only if that specific calendar day appears in weekCheckins
    setFilledDots(DAYS.map((_, i) => weekCheckins.includes(isoForDayIndex(i))));
  };

  const launchConfetti = () => {
    const colors_list = ['#E74C3C', '#F39C12', '#2ECC71', '#3498DB', '#9B59B6', '#1ABC9C', '#E67E22', '#5DADE2'];
    const anims = confettiAnims.map((dot, i) => {
      const angle  = (i / 8) * Math.PI * 2;
      const radius = 55 + Math.random() * 20;
      dot.x.setValue(0);
      dot.y.setValue(0);
      dot.o.setValue(1);
      return Animated.parallel([
        Animated.spring(dot.x, { toValue: Math.cos(angle) * radius, useNativeDriver: true }),
        Animated.spring(dot.y, { toValue: Math.sin(angle) * radius - 20, useNativeDriver: true }),
        Animated.timing(dot.o, { toValue: 0, duration: 900, delay: 300, useNativeDriver: true }),
      ]);
    });
    Animated.parallel(anims).start();
  };

  const handleCheckin = async () => {
    if (checkedInToday) return;

    // Button bounce + color flip
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    Animated.timing(btnOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    launchConfetti();

    const [checkinResult, streakResult] = await Promise.all([
      AchievementService.getInstance().recordCheckin(),
      StreakService.getInstance().recordActivity(),
    ]);

    setCheckedInToday(true);
    // Re-fetch the updated week list (now includes today)
    const updatedWeek = await AchievementService.getInstance().getWeekCheckins();
    setFilledDots(DAYS.map((_, i) => updatedWeek.includes(isoForDayIndex(i))));

    // Check achievements
    const totalSessions = await AchievementService.getInstance().getTotalSessions();
    const newBadges = await AchievementService.getInstance().checkAndUnlock({
      streakCount:    streakResult.count,
      totalSessions,
      checkinCount:   checkinResult.count,
    });
    if (newBadges.length > 0) onNewBadges?.(newBadges);
    onCheckin?.(streakResult.count);
  };

  const cardBg  = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const cardBdr = isDark ? 'rgba(52,152,219,0.15)' : 'rgba(37,99,235,0.10)';

  const CONFETTI_COLORS = ['#E74C3C', '#F39C12', '#2ECC71', '#3498DB', '#9B59B6', '#1ABC9C', '#E67E22', '#5DADE2'];

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBdr }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.settingTitle }]}>📅 Daily Check-In</Text>

        {/* Confetti container */}
        <View style={styles.confettiContainer} pointerEvents="none">
          {confettiAnims.map((dot, i) => (
            <Animated.View
              key={i}
              style={[
                styles.confettiDot,
                { backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length] },
                { opacity: dot.o, transform: [{ translateX: dot.x }, { translateY: dot.y }] },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity onPress={handleCheckin} disabled={checkedInToday} activeOpacity={0.8}>
          {/* Two stacked views — opacity cross-fade, both useNativeDriver: true */}
          <View style={[styles.checkinBtn, { overflow: 'hidden' }]}>
            {/* Blue base */}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#5DADE2', borderRadius: 8 }]} />
            {/* Green overlay fades in on check-in */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#2ECC71', borderRadius: 8, opacity: btnOpacity }]} />
            <Animated.Text style={[styles.btnScale, { transform: [{ scale: btnScale }] }]}>
              <Text style={styles.checkinBtnText}>{checkedInToday ? 'Done ✓' : 'CHECK IN'}</Text>
            </Animated.Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Week dots */}
      <View style={styles.dotsRow}>
        {DAYS.map((day, i) => (
          <View key={day} style={styles.dotCol}>
            <View style={[
              styles.dot,
              filledDots[i]
                ? { backgroundColor: '#5DADE2' }
                : { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)' },
              i === todayDowIndex() && { borderWidth: 2, borderColor: '#5DADE2' },
            ]} />
            <Text style={[styles.dayLabel, { color: colors.textMuted ?? '#566573' }]}>{day}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  confettiContainer: {
    position: 'absolute',
    right: 80,
    top: 0,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  checkinBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnScale: {
    // wraps text for scale animation
  },
  checkinBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dotCol: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});

export default React.memo(DailyCheckInCard);
