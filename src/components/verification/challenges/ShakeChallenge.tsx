import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ChallengeProps } from './types';

const G = 9.80665;
const SAMPLE_RATE_MS = 20;       // 50 Hz
const ENTROPY_FLOOR_SAMPLES = 10; // reject N consecutive identical readings (low-noise real sensors need more headroom)

interface Params {
  peaksRequired: number;
  windowMs: number;
  magThreshold: number; // m/s² delta from gravity
}

export const ShakeChallenge: React.FC<ChallengeProps> = ({ spec, onPass, onFail }) => {
  const { colors } = useTheme();
  const params = spec.params as Params;

  const [peaks, setPeaks] = useState(0);
  const peaksRef = useRef(0);
  const lastPeakAt = useRef(0);
  const recentSamples = useRef<string[]>([]);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Accelerometer.setUpdateInterval(SAMPLE_RATE_MS);
    const sub = Accelerometer.addListener((data) => {
      if (completedRef.current) return;

      // Entropy floor — reject perfectly-identical streams (emulator)
      const fp = `${data.x.toFixed(4)}|${data.y.toFixed(4)}|${data.z.toFixed(4)}`;
      recentSamples.current = [fp, ...recentSamples.current].slice(0, ENTROPY_FLOOR_SAMPLES);
      if (
        recentSamples.current.length === ENTROPY_FLOOR_SAMPLES &&
        recentSamples.current.every((s) => s === recentSamples.current[0])
      ) {
        completedRef.current = true;
        sub.remove();
        onFail('invalid', 'Sensor entropy floor');
        return;
      }

      // Window expired — fail
      if (Date.now() - startedAt.current > params.windowMs + 12_000) {
        completedRef.current = true;
        sub.remove();
        onFail('timeout');
        return;
      }

      // Magnitude — values are in g on Expo. Convert to m/s² then subtract gravity.
      const mag = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z) * G;
      const delta = Math.abs(mag - G);

      const now = Date.now();
      if (delta > params.magThreshold && now - lastPeakAt.current > 150) {
        lastPeakAt.current = now;
        peaksRef.current += 1;
        setPeaks(peaksRef.current);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 90, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();

        if (peaksRef.current >= params.peaksRequired) {
          completedRef.current = true;
          sub.remove();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onPass();
        }
      }
    });

    return () => {
      completedRef.current = true;
      sub.remove();
    };
  }, []);

  const remaining = Math.max(0, params.peaksRequired - peaks);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Shake your phone</Text>
      <Text style={[styles.sub, { color: colors.textSecondary || colors.textPrimary }]}>
        {remaining > 0 ? `Shake firmly — ${remaining} more` : 'Almost there…'}
      </Text>
      <Animated.View style={[styles.dotRow, { transform: [{ scale: pulse }] }]}>
        {Array.from({ length: params.peaksRequired }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i < peaks ? colors.accent || '#00f3ff' : 'rgba(255,255,255,0.15)' },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sub: { fontSize: 15, opacity: 0.75, marginBottom: 28 },
  dotRow: { flexDirection: 'row', gap: 12 },
  dot: { width: 16, height: 16, borderRadius: 8 },
});

export default ShakeChallenge;
