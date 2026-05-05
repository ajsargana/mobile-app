import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Star, Heart, Zap, Cloud, Anchor, Bell, Bone, Camera, Coffee, Diamond, Feather, Gift, Globe, Key, Leaf, Music } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ChallengeProps } from './types';

const ICON_SET = [Star, Heart, Zap, Cloud, Anchor, Bell, Bone, Camera, Coffee, Diamond, Feather, Gift, Globe, Key, Leaf, Music];
const ICON_NAMES = ['star', 'heart', 'zap', 'cloud', 'anchor', 'bell', 'bone', 'camera', 'coffee', 'diamond', 'feather', 'gift', 'globe', 'key', 'leaf', 'music'];

interface Params {
  gridSize: number;     // total cells (e.g. 16)
  targetIndex: number;  // index into ICON_SET that the user must tap
}

const MIN_DECISION_MS = 500;
const TIMEOUT_MS = 12_000;

export const TapPuzzleChallenge: React.FC<ChallengeProps> = ({ spec, onPass, onFail }) => {
  const { colors } = useTheme();
  const params = spec.params as Params;
  const targetIcon = ICON_SET[params.targetIndex % ICON_SET.length];
  const targetName = ICON_NAMES[params.targetIndex % ICON_NAMES.length];

  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  // Build a stable but seeded-feeling cell list. We don't need cryptographic
  // randomness here — the spec is already seeded by the daily seed.
  const cells = useMemo(() => {
    const arr = ICON_SET.slice(0, params.gridSize);
    // Place target at a deterministic but non-obvious slot derived from targetIndex
    const slot = (params.targetIndex * 7 + 3) % params.gridSize;
    [arr[slot], arr[params.targetIndex % params.gridSize]] = [arr[params.targetIndex % params.gridSize], arr[slot]];
    return arr.map((Icon, i) => ({ Icon, isTarget: Icon === targetIcon, key: i }));
  }, [params.gridSize, params.targetIndex, targetIcon]);

  const [tappedKey, setTappedKey] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onFail('timeout');
      }
    }, TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const handleTap = (cell: typeof cells[number]) => {
    if (completedRef.current) return;
    setTappedKey(cell.key);
    const elapsed = Date.now() - startedAt.current;
    if (elapsed < MIN_DECISION_MS) {
      completedRef.current = true;
      onFail('invalid', 'Tapped too fast');
      return;
    }
    if (cell.isTarget) {
      completedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onPass();
    } else {
      completedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      onFail('invalid', 'Wrong icon');
    }
  };

  const cols = 4;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Tap the {targetName}</Text>
      <Text style={[styles.sub, { color: colors.textSecondary || colors.textPrimary }]}>
        Find and tap the matching icon
      </Text>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const Icon = cell.Icon;
          const isTapped = tappedKey === cell.key;
          return (
            <TouchableOpacity
              key={cell.key}
              activeOpacity={0.7}
              onPress={() => handleTap(cell)}
              style={[
                styles.cell,
                {
                  width: `${100 / cols - 2}%`,
                  borderColor: isTapped ? colors.accent || '#00f3ff' : 'rgba(255,255,255,0.1)',
                  backgroundColor: isTapped ? 'rgba(0,243,255,0.1)' : 'rgba(255,255,255,0.05)',
                },
              ]}
            >
              <Icon size={28} color={colors.textPrimary} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6, textTransform: 'capitalize' },
  sub: { fontSize: 14, opacity: 0.7, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  cell: {
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: '1%',
  },
});

export default TapPuzzleChallenge;
