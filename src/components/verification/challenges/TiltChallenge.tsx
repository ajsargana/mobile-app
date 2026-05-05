import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import Svg, { Rect, Circle } from 'react-native-svg';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ChallengeProps } from './types';

type Direction = 'left' | 'right' | 'up' | 'down';

interface Params {
  sequence: Direction[];
  holdMs: number;
  toleranceDeg: number;
}

const RAD2DEG = 180 / Math.PI;
const TILT_DEG = 20;         // detection threshold (degrees from neutral)
const TILT_TARGET_DEG = 30;  // angle the ghost phone is rendered at
const TILT_CLAMP = 65;       // max visual rotation
const BASELINE_SAMPLES = 15; // ~0.5 s at 30 Hz

const PHONE_W = 72;
const PHONE_H = 124;

const LABELS: Record<Direction, string> = {
  left:  '◀  Tilt Left',
  right: 'Tilt Right  ▶',
  up:    '▲  Tilt Up',
  down:  'Tilt Down  ▼',
};

// Ghost target angles for each challenge direction.
// Sign conventions:
//   rotateZ positive = clockwise = "tilted left" from user's POV
//   rotateX positive = top goes into screen = "tilted up"
function targetAngles(dir: Direction): { rz: number; rx: number } {
  switch (dir) {
    case 'left':  return { rz:  TILT_TARGET_DEG, rx: 0 };
    case 'right': return { rz: -TILT_TARGET_DEG, rx: 0 };
    case 'up':    return { rz: 0, rx:  TILT_TARGET_DEG };
    case 'down':  return { rz: 0, rx: -TILT_TARGET_DEG };
  }
}

function inZone(dir: Direction, relRoll: number, relPitch: number, tol: number): boolean {
  switch (dir) {
    case 'left':  return relRoll < -TILT_DEG && Math.abs(relPitch) < tol;
    case 'right': return relRoll >  TILT_DEG && Math.abs(relPitch) < tol;
    case 'up':    return relPitch < -TILT_DEG && Math.abs(relRoll) < tol;
    case 'down':  return relPitch >  TILT_DEG && Math.abs(relRoll) < tol;
  }
}

// Phone silhouette — solid for live, dashed outline for ghost target
const PhoneBody: React.FC<{ color: string; opacity: number; dashed?: boolean }> = ({
  color,
  opacity,
  dashed,
}) => (
  <Svg width={PHONE_W} height={PHONE_H} viewBox={`0 0 ${PHONE_W} ${PHONE_H}`}>
    <Rect
      x="3" y="3"
      width={PHONE_W - 6} height={PHONE_H - 6}
      rx="12" ry="12"
      stroke={color}
      strokeWidth={dashed ? 2 : 3}
      strokeDasharray={dashed ? '7 4' : undefined}
      fill={dashed ? 'none' : 'rgba(8,20,36,0.92)'}
      strokeOpacity={opacity}
    />
    {!dashed && (
      <>
        {/* Speaker pill */}
        <Rect x="24" y="10" width="24" height="4" rx="2" fill={color} fillOpacity={opacity * 0.6} />
        {/* Camera dot */}
        <Circle cx="50" cy="12" r="3" fill={color} fillOpacity={opacity * 0.6} />
        {/* Home bar */}
        <Rect x="20" y={PHONE_H - 14} width="32" height="5" rx="2.5" fill={color} fillOpacity={opacity * 0.4} />
      </>
    )}
  </Svg>
);

export const TiltChallenge: React.FC<ChallengeProps> = ({ spec, onPass, onFail }) => {
  const { colors } = useTheme();
  const params = spec.params as Params;

  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [calibrating, setCalibrating] = useState(true);
  const [inTarget, setInTarget] = useState(false);
  const [debugAngles, setDebugAngles] = useState<{ roll: number; pitch: number; raw: boolean } | null>(null);

  const stepRef       = useRef(0);
  const progressRef   = useRef(0);
  const heldSinceRef  = useRef<number | null>(null);
  const completedRef  = useRef(false);
  const startedAt     = useRef(Date.now());
  const baselineRef   = useRef<{ roll: number; pitch: number } | null>(null);
  const baselineBuf   = useRef<Array<{ roll: number; pitch: number }>>([]);
  const inTargetRef   = useRef(false);

  // Animated.Value drives the live-phone 3-D rotation without JS re-renders at 30 Hz.
  // We interpolate to deg strings so rotateX / rotateZ accept them directly.
  // Sign: relRoll < 0 = tilted left = want +rotateZ (clockwise) → negate.
  //       relPitch < 0 = tilted up  = want +rotateX (top into screen) → negate.
  const rollAnim  = useRef(new Animated.Value(0)).current;
  const pitchAnim = useRef(new Animated.Value(0)).current;

  const rotateZ = rollAnim.interpolate({
    inputRange:  [-TILT_CLAMP, TILT_CLAMP],
    outputRange: [`-${TILT_CLAMP}deg`, `${TILT_CLAMP}deg`],
  });
  const rotateX = pitchAnim.interpolate({
    inputRange:  [-TILT_CLAMP, TILT_CLAMP],
    outputRange: [`-${TILT_CLAMP}deg`, `${TILT_CLAMP}deg`],
  });

  useEffect(() => {
    DeviceMotion.setUpdateInterval(33); // 30 Hz

    const run = async () => {
      if (typeof DeviceMotion.requestPermissionsAsync === 'function') {
        const { status } = await DeviceMotion.requestPermissionsAsync();
        if (status !== 'granted') {
          completedRef.current = true;
          onFail('unsupported', 'Motion permission denied');
          return;
        }
      }
      const available = await DeviceMotion.isAvailableAsync();
      if (!available) {
        completedRef.current = true;
        onFail('unsupported', 'Device motion not available');
        return;
      }

      const sub = DeviceMotion.addListener((data) => {
        if (completedRef.current) return;

        if (Date.now() - startedAt.current > 16_000 + params.sequence.length * 4_000) {
          completedRef.current = true;
          sub.remove();
          onFail('timeout');
          return;
        }

        const rot = data.rotation;
        if (!rot) {
          setDebugAngles({ roll: 0, pitch: 0, raw: false });
          return;
        }

        const rollDeg  = (rot.gamma ?? 0) * RAD2DEG;
        const pitchDeg = (rot.beta  ?? 0) * RAD2DEG;

        // Phase 1 — calibrate to the angle the user is already holding at
        if (!baselineRef.current) {
          setDebugAngles({ roll: rollDeg, pitch: pitchDeg, raw: true });
          baselineBuf.current.push({ roll: rollDeg, pitch: pitchDeg });
          if (baselineBuf.current.length >= BASELINE_SAMPLES) {
            const n = baselineBuf.current.length;
            baselineRef.current = {
              roll:  baselineBuf.current.reduce((s, b) => s + b.roll,  0) / n,
              pitch: baselineBuf.current.reduce((s, b) => s + b.pitch, 0) / n,
            };
            setCalibrating(false);
          }
          return;
        }

        // Phase 2 — relative angles from neutral
        const relRoll  = rollDeg  - baselineRef.current.roll;
        const relPitch = pitchDeg - baselineRef.current.pitch;

        setDebugAngles({ roll: relRoll, pitch: relPitch, raw: false });

        // Drive live phone (setValue avoids React re-renders at 30 Hz)
        rollAnim.setValue(Math.max(-TILT_CLAMP, Math.min(TILT_CLAMP, -relRoll)));
        pitchAnim.setValue(Math.max(-TILT_CLAMP, Math.min(TILT_CLAMP, -relPitch)));

        const tol    = (params.toleranceDeg ?? 20) + 15;
        const target = params.sequence[stepRef.current];
        const hit    = inZone(target, relRoll, relPitch, tol);

        if (hit !== inTargetRef.current) {
          inTargetRef.current = hit;
          setInTarget(hit);
        }

        if (hit) {
          if (heldSinceRef.current === null) heldSinceRef.current = Date.now();
          const held = Date.now() - heldSinceRef.current;
          const prog = Math.min(1, held / params.holdMs);
          if (prog !== progressRef.current) {
            progressRef.current = prog;
            setProgress(prog);
          }
          if (held >= params.holdMs) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            heldSinceRef.current  = null;
            progressRef.current   = 0;
            setProgress(0);
            inTargetRef.current   = false;
            setInTarget(false);
            const next = stepRef.current + 1;
            stepRef.current = next;
            setStep(next);
            if (next >= params.sequence.length) {
              completedRef.current = true;
              sub.remove();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onPass();
            }
          }
        } else {
          if (heldSinceRef.current !== null) heldSinceRef.current = null;
          if (progressRef.current > 0) {
            progressRef.current = 0;
            setProgress(0);
          }
        }
      });

      return () => sub.remove();
    };

    let cleanup: (() => void) | undefined;
    run().then((fn) => { cleanup = fn; });
    return () => {
      completedRef.current = true;
      cleanup?.();
    };
  }, []);

  const currentDir = params.sequence[step];
  const accent     = colors.accent || '#00f3ff';
  const tgt        = currentDir ? targetAngles(currentDir) : null;
  const liveColor  = !calibrating && inTarget ? accent : (colors.textPrimary || '#ffffff');

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Tilt your phone</Text>
      <Text style={[styles.sub, { color: colors.textSecondary || colors.textPrimary }]}>
        {calibrating
          ? 'Hold still — calibrating…'
          : currentDir
          ? LABELS[currentDir]
          : 'All done!'}
      </Text>

      {/* Phone visualization — ghost (target) + live (your device) stacked */}
      <View style={styles.phoneArea}>
        {/* Ghost: static target position */}
        {tgt && !calibrating && (
          <View
            style={[
              styles.phoneAbsolute,
              {
                transform: [
                  { perspective: 800 },
                  { rotateX: `${tgt.rx}deg` },
                  { rotateZ: `${tgt.rz}deg` },
                ],
              },
            ]}
          >
            <PhoneBody color={accent} opacity={0.45} dashed />
          </View>
        )}

        {/* Live phone — driven by Animated.Value.setValue (no re-render at 30 Hz) */}
        <Animated.View
          style={[
            styles.phoneAbsolute,
            { transform: [{ perspective: 800 }, { rotateX }, { rotateZ }] },
          ]}
        >
          <PhoneBody color={liveColor} opacity={1} />
        </Animated.View>
      </View>

      {/* Hold-progress bar */}
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
      </View>

      <Text style={[styles.stepLabel, { color: colors.textSecondary || colors.textPrimary }]}>
        {calibrating
          ? 'Calibrating…'
          : `${Math.min(step + 1, params.sequence.length)} / ${params.sequence.length}`}
      </Text>

      {/* Sensor debug readout — remove once angles are confirmed */}
      <View style={styles.debugBox}>
        {debugAngles === null ? (
          <Text style={styles.debugText}>waiting for sensor…</Text>
        ) : debugAngles.raw ? (
          <Text style={styles.debugText}>
            raw  roll={debugAngles.roll.toFixed(1)}°  pitch={debugAngles.pitch.toFixed(1)}°
          </Text>
        ) : (
          <>
            <Text style={styles.debugText}>
              rel  roll={debugAngles.roll.toFixed(1)}°  pitch={debugAngles.pitch.toFixed(1)}°
            </Text>
            <Text style={[styles.debugText, { color: inTarget ? '#4ade80' : '#f87171' }]}>
              need {currentDir}: {inTarget ? '✓ IN ZONE' : '✗ not yet'}  threshold=±{TILT_DEG}°
            </Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingVertical: 28 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sub:   { fontSize: 16, fontWeight: '600', marginBottom: 24, opacity: 0.85 },

  phoneArea: {
    width: PHONE_W + 100,
    height: PHONE_H + 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  phoneAbsolute: {
    position: 'absolute',
  },

  bar: {
    width: 200,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginTop: 4,
  },
  barFill:   { height: '100%' },
  stepLabel: { fontSize: 13, marginTop: 8, opacity: 0.5 },
  debugBox:  { marginTop: 14, padding: 10, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', minWidth: 240 },
  debugText: { fontSize: 12, fontFamily: 'monospace', color: '#94a3b8', lineHeight: 18 },
});

export default TiltChallenge;
