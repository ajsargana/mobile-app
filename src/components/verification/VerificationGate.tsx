import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import HumanVerificationService, {
  ChallengeSpec,
  DailySeed,
  ChallengeId,
  getRandomNonce,
} from '../../services/HumanVerificationService';
import ChallengeHost from './ChallengeHost';
import type { FailReason } from './challenges/types';

interface Props {
  visible: boolean;
  /** Pre-fetched seed (e.g. delivered in a 403 response). If absent the gate fetches its own. */
  seed?: DailySeed | null;
  onPass: () => void;
  onCancel: () => void;
}

type Phase = 'loading' | 'running' | 'attesting' | 'done' | 'failed' | 'cooldown' | 'error';

export const VerificationGate: React.FC<Props> = ({ visible, seed, onPass, onCancel }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('loading');
  const [seedState, setSeedState] = useState<DailySeed | null>(seed ?? null);
  const [challenges, setChallenges] = useState<ChallengeSpec[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const startedAtRef = useRef<number>(0);
  const passedIdsRef = useRef<ChallengeId[]>([]);
  const reRollCountRef = useRef(0);
  const attemptCountRef = useRef(0);

  const svc = HumanVerificationService.getInstance();

  // Initialize: check cooldown, load seed, pick challenges
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const cd = await svc.isInCooldown();
        if (cancelled) return;
        if (cd.inCooldown) {
          setCooldownUntil(cd.until);
          setPhase('cooldown');
          return;
        }

        let s = seed ?? seedState;
        if (!s) {
          s = await svc.fetchDailySeed();
        }
        if (cancelled) return;

        setSeedState(s);
        const picks = svc.pickChallenges(s.seed, attemptCountRef.current);
        setChallenges(picks);
        passedIdsRef.current = [];
        startedAtRef.current = Date.now();
        setPhase('running');
      } catch (e: any) {
        if (cancelled) return;
        setErrorMsg(e?.message || 'Could not start verification');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Reset internal state when modal closes (attempt counter intentionally kept
  // so each re-open shows a different challenge).
  useEffect(() => {
    if (!visible) {
      setPhase('loading');
      setChallenges([]);
      passedIdsRef.current = [];
      reRollCountRef.current = 0;
      attemptCountRef.current += 1; // advance so next open is a fresh challenge
    }
  }, [visible]);

  const handleAllPass = useCallback(async () => {
    if (!seedState) {
      setPhase('error');
      setErrorMsg('Missing seed — please try again');
      return;
    }
    setPhase('attesting');
    try {
      const ids = challenges.map((c) => c.id);
      const elapsed = Date.now() - startedAtRef.current;
      const nonce = await getRandomNonce();

      // Race attest against a 15-second hard timeout so the modal never hangs
      await Promise.race([
        svc.attest(seedState, ids, nonce, elapsed),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Verification timed out — check your connection')), 15_000)
        ),
      ]);

      setPhase('done');
      setTimeout(() => onPass(), 500);
    } catch (e: any) {
      console.warn('[VerificationGate] attest failed:', e);
      setErrorMsg(e?.message || 'Verification rejected');
      setPhase('error');
    }
  }, [challenges, seedState, onPass]);

  const handleFail = useCallback(
    async (reason: FailReason, detail?: string) => {
      const ids = challenges.map((c) => c.id);
      await svc.recordFail(ids, `${reason}${detail ? `: ${detail}` : ''}`);
      const cd = await svc.isInCooldown();
      if (cd.inCooldown) {
        setCooldownUntil(cd.until);
        setPhase('cooldown');
        return;
      }
      setPhase('failed');
    },
    [challenges],
  );

  // Re-roll a single challenge if it reports `unsupported` (e.g. face module
  // not installed yet). We swap in a Tier-2 fallback once, then fail closed
  // if even the fallback is unsupported.
  const handleUnsupported = useCallback(
    (failedSpec: ChallengeSpec) => {
      if (reRollCountRef.current > 0 || !seedState) {
        handleFail('unsupported', failedSpec.id);
        return;
      }
      reRollCountRef.current += 1;
      // Swap face → a guaranteed non-face challenge derived from the same seed.
      let fallback: ChallengeSpec;
      try {
        fallback = svc.pickFallbackChallenge(seedState.seed, attemptCountRef.current);
      } catch {
        fallback = { id: 'tap', tier: 2, params: { gridSize: 16, targetIndex: 0 } };
      }
      setChallenges((prev) => prev.map((c) => (c.id === failedSpec.id ? fallback : c)));
    },
    [seedState, handleFail],
  );

  const retry = useCallback(() => {
    setErrorMsg('');
    setPhase('loading');
    attemptCountRef.current += 1;
    (async () => {
      try {
        const cd = await svc.isInCooldown();
        if (cd.inCooldown) {
          setCooldownUntil(cd.until);
          setPhase('cooldown');
          return;
        }
        const s = await svc.fetchDailySeed();
        setSeedState(s);
        const picks = svc.pickChallenges(s.seed, attemptCountRef.current);
        setChallenges(picks);
        passedIdsRef.current = [];
        startedAtRef.current = Date.now();
        reRollCountRef.current = 0;
        setPhase('running');
      } catch (e: any) {
        setErrorMsg(e?.message || 'Could not start verification');
        setPhase('error');
      }
    })();
  }, []);

  // Cooldown countdown ticker
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (phase !== 'cooldown') return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const cooldownSecondsLeft = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <LinearGradient
          colors={isDark ? ['#0A1929', '#0F2940', '#0A1929'] : ['#EBF5FB', '#FFFFFF', '#EBF5FB']}
          style={[styles.sheet, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
        >
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Daily Verification</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary || colors.textPrimary }]}>
                Quick check to confirm you're human
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {phase === 'loading' && (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.accent || '#00f3ff'} />
                <Text style={[styles.loadingText, { color: colors.textSecondary || colors.textPrimary }]}>
                  Preparing today's challenge…
                </Text>
              </View>
            )}

            {phase === 'running' && challenges.length > 0 && (
              <ChallengeHost
                challenges={challenges}
                onAllPass={handleAllPass}
                onFail={handleFail}
                onUnsupported={handleUnsupported}
              />
            )}

            {phase === 'attesting' && (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.accent || '#00f3ff'} />
                <Text style={[styles.loadingText, { color: colors.textSecondary || colors.textPrimary }]}>
                  Recording verification…
                </Text>
              </View>
            )}

            {phase === 'done' && (
              <View style={styles.center}>
                <Text style={[styles.bigCheck, { color: colors.accent || '#00f3ff' }]}>✓</Text>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Verified</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary || colors.textPrimary }]}>
                  You're set for today
                </Text>
              </View>
            )}

            {phase === 'failed' && (
              <View style={styles.center}>
                <Text style={[styles.bigCross, { color: '#ef4444' }]}>✕</Text>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Try again</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary || colors.textPrimary, marginBottom: 24 }]}>
                  Don't worry — we'll give you a new challenge.
                </Text>
                <TouchableOpacity
                  onPress={retry}
                  style={[styles.btn, { backgroundColor: colors.accent || '#00f3ff' }]}
                >
                  <Text style={styles.btnText}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {phase === 'cooldown' && (
              <View style={styles.center}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Take a short break</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary || colors.textPrimary }]}>
                  Try again in {Math.floor(cooldownSecondsLeft / 60)}:
                  {String(cooldownSecondsLeft % 60).padStart(2, '0')}
                </Text>
              </View>
            )}

            {phase === 'error' && (
              <View style={styles.center}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Couldn't verify</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary || colors.textPrimary, marginBottom: 24 }]}>
                  {errorMsg}
                </Text>
                <TouchableOpacity
                  onPress={retry}
                  style={[styles.btn, { backgroundColor: colors.accent || '#00f3ff' }]}
                >
                  <Text style={styles.btnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, opacity: 0.75, marginTop: 2 },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, opacity: 0.75 },
  bigCheck: { fontSize: 96, fontWeight: '800' },
  bigCross: { fontSize: 96, fontWeight: '800' },
  btn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: '#0A1929', fontWeight: '700', fontSize: 16 },
});

export default VerificationGate;
