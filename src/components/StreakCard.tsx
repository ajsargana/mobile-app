import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useDeviceCapability } from '../contexts/DeviceCapabilityContext';
import StreakService, { StreakData } from '../services/StreakService';

interface Props {
  onPress?: () => void;
  refreshKey?: number; // increment to force reload
}

const StreakCard: React.FC<Props> = ({ onPress, refreshKey = 0 }) => {
  const { colors, isDark } = useTheme();
  const { isLowEnd } = useDeviceCapability();
  const [data, setData] = useState<StreakData>({ count: 0, best: 0, lastDate: null });
  const flameScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    StreakService.getInstance().getStreak().then(setData);
  }, [refreshKey]);

  // Pulse flame animation when streak >= 7 (skip on low-end)
  useEffect(() => {
    if (data.count >= 7 && !isLowEnd) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(flameScale, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(flameScale, { toValue: 1.0,  duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      flameScale.setValue(1);
    }
  }, [data.count, isLowEnd]);

  const multiplier  = StreakService.getInstance().getCooldownMultiplier(data.count);
  const hasBonus    = multiplier < 1.0;
  const reductionPct = Math.round((1 - multiplier) * 100);

  const cardBg  = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const cardBdr = isDark ? 'rgba(52,152,219,0.15)' : 'rgba(37,99,235,0.10)';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      style={[styles.card, { backgroundColor: cardBg, borderColor: cardBdr }]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          <Animated.Text style={[styles.flame, { transform: [{ scale: flameScale }] }]}>
            🔥
          </Animated.Text>
          <View>
            <Text style={[styles.streakNum, { color: colors.accentAlt ?? '#5DADE2' }]}>
              {data.count}-Day Streak
            </Text>
            <Text style={[styles.best, { color: colors.textMuted ?? '#566573' }]}>
              Best: {data.best} days
            </Text>
          </View>
        </View>

        {hasBonus && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Cooldown -{reductionPct}%</Text>
          </View>
        )}
      </View>

      {data.count > 0 && (
        <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }]}>
          <View style={[styles.progressFill, {
            width: `${Math.min(100, (data.count % 7) / 7 * 100 || (data.count >= 7 ? 100 : 0))}%` as any,
            backgroundColor: data.count >= 30 ? '#F1C40F' : data.count >= 7 ? '#E67E22' : '#5DADE2',
          }]} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flame: {
    fontSize: 24,
  },
  streakNum: {
    fontSize: 15,
    fontWeight: '700',
  },
  best: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    backgroundColor: 'rgba(230,126,34,0.18)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#E67E22',
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});

export default React.memo(StreakCard);
