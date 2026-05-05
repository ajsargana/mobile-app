import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ChallengeProps } from './types';

interface Params {
  sequence: number[]; // values 0..3
  flashMs: number;
  gapMs: number;
}

const COLORS = ['#ff5577', '#22d3ee', '#facc15', '#22c55e'];
const TIMEOUT_MS = 15_000;

type Phase = 'show' | 'input' | 'done';

export const SequenceChallenge: React.FC<ChallengeProps> = ({ spec, onPass, onFail }) => {
  const { colors } = useTheme();
  const params = spec.params as Params;

  const [phase, setPhase] = useState<Phase>('show');
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [userInput, setUserInput] = useState<number[]>([]);
  const completedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // Timeout
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        playbackRef.current.forEach((t) => clearTimeout(t));
        onFail('timeout');
      }
    }, TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      playbackRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Playback
  useEffect(() => {
    let t = 0;
    params.sequence.forEach((idx, i) => {
      const showAt = t;
      const hideAt = t + params.flashMs;
      playbackRef.current.push(
        setTimeout(() => {
          if (!completedRef.current) setActiveIdx(idx);
        }, showAt),
      );
      playbackRef.current.push(
        setTimeout(() => {
          if (!completedRef.current) setActiveIdx(null);
          if (i === params.sequence.length - 1 && !completedRef.current) {
            setPhase('input');
          }
        }, hideAt),
      );
      t += params.flashMs + params.gapMs;
    });
  }, []);

  const handleTap = (idx: number) => {
    if (phase !== 'input' || completedRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const nextInput = [...userInput, idx];
    setUserInput(nextInput);
    const expected = params.sequence[nextInput.length - 1];
    if (idx !== expected) {
      completedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      onFail('invalid', 'Wrong sequence');
      return;
    }
    if (nextInput.length === params.sequence.length) {
      completedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPhase('done');
      onPass();
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {phase === 'show' ? 'Watch the pattern' : phase === 'input' ? 'Repeat the pattern' : 'Done'}
      </Text>
      <Text style={[styles.sub, { color: colors.textSecondary || colors.textPrimary }]}>
        {phase === 'input' ? `${userInput.length} / ${params.sequence.length}` : ' '}
      </Text>

      <View style={styles.pad}>
        {COLORS.map((c, i) => {
          const lit = activeIdx === i;
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.7}
              disabled={phase !== 'input'}
              onPress={() => handleTap(i)}
              style={[
                styles.tile,
                {
                  backgroundColor: lit ? c : `${c}55`,
                  borderColor: c,
                  opacity: phase === 'input' ? 1 : lit ? 1 : 0.4,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sub: { fontSize: 14, opacity: 0.7, marginBottom: 24, minHeight: 18 },
  pad: { width: 220, height: 220, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { width: '47%', height: '47%', borderRadius: 16, borderWidth: 2, marginBottom: '6%' },
});

export default SequenceChallenge;
