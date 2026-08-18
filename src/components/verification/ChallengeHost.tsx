import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { ChallengeSpec } from '../../services/HumanVerificationService';
import type { FailReason } from './challenges/types';
import ShakeChallenge from './challenges/ShakeChallenge';
import TiltChallenge from './challenges/TiltChallenge';
import TapPuzzleChallenge from './challenges/TapPuzzleChallenge';
import SequenceChallenge from './challenges/SequenceChallenge';
import FaceLivenessChallenge from './challenges/FaceLivenessChallenge';

interface Props {
  challenges: ChallengeSpec[];
  onAllPass: () => void;
  onFail: (reason: FailReason, detail?: string) => void;
  onUnsupported: (failedSpec: ChallengeSpec) => void;
}

const COMPONENTS = {
  shake: ShakeChallenge,
  tilt: TiltChallenge,
  tap: TapPuzzleChallenge,
  sequence: SequenceChallenge,
  face: FaceLivenessChallenge,
};

export const ChallengeHost: React.FC<Props> = ({ challenges, onAllPass, onFail, onUnsupported }) => {
  const { colors } = useTheme();
  const [idx, setIdx] = useState(0);
  const completedRef = useRef(false);

  const current = challenges[idx];
  const Component = useMemo(() => (current ? COMPONENTS[current.id] : null), [current]);

  // Keyed on the spec identity, not just `idx`: an `unsupported` re-roll swaps
  // the challenge in place at the same index, and the replacement needs a fresh
  // latch or its onPass/onFail would be swallowed by the previous one's.
  const challengeKey = `${current ? current.id : 'none'}-${idx}`;
  useEffect(() => {
    completedRef.current = false;
  }, [challengeKey]);

  if (!current || !Component) {
    return null;
  }

  const handlePass = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (idx + 1 >= challenges.length) {
      onAllPass();
    } else {
      setIdx(idx + 1);
    }
  };

  const handleFail = (reason: FailReason, detail?: string) => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (reason === 'unsupported') {
      onUnsupported(current);
      return;
    }
    onFail(reason, detail);
  };

  return (
    <View style={styles.wrap}>
      {/* Progress dots — only shown when there are multiple challenges */}
      {challenges.length > 1 && (
        <View style={styles.dotsRow}>
          {challenges.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i < idx
                      ? colors.accent || '#00f3ff'
                      : i === idx
                      ? colors.textPrimary
                      : 'rgba(255,255,255,0.2)',
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Active challenge */}
      <Component
        key={challengeKey}
        spec={current}
        onPass={handlePass}
        onFail={handleFail}
      />

      <Text style={[styles.tier, { color: colors.textSecondary || colors.textPrimary }]}>
        {challenges.length > 1 ? `Step ${idx + 1} of ${challenges.length} · ` : ''}Tier {current.tier}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  dotsRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 12, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tier: { textAlign: 'center', fontSize: 12, opacity: 0.5, marginTop: 8 },
});

export default ChallengeHost;
