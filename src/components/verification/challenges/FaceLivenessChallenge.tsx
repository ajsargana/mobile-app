import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ChallengeProps } from './types';

/**
 * FaceLivenessChallenge — Tier 3.
 *
 * Uses `react-native-vision-camera` + `react-native-vision-camera-face-detector`
 * (ML Kit on Android, Apple Vision on iOS) to verify a live human face is
 * performing the requested action (smile / blink / look in a direction).
 *
 * Defensive: native modules are required at component mount inside try/catch.
 * If the modules aren't loaded yet (Expo Go, or fresh JS bundle before the
 * native rebuild), we report `unsupported` and the gate falls back to a
 * Tier 2 challenge.
 *
 * Spec params:
 *   { prompt: 'smile' | 'blink' | 'lookLeft' | 'lookRight' | 'lookUp' | 'lookDown',
 *     timeoutMs: number }
 */

type Prompt = 'smile' | 'blink' | 'lookLeft' | 'lookRight' | 'lookUp' | 'lookDown';

const PROMPT_TEXT: Record<Prompt, string> = {
  smile: 'Smile at the camera',
  blink: 'Blink twice',
  lookLeft: 'Turn your head to the left',
  lookRight: 'Turn your head to the right',
  lookUp: 'Tilt your head up',
  lookDown: 'Tilt your head down',
};

const SMILE_THRESHOLD = 0.75;
const SMILE_HOLD_MS = 600;
const EYE_OPEN_THRESHOLD = 0.85;
const EYE_CLOSED_THRESHOLD = 0.30;
const BLINK_WINDOW_MS = 5_000;
const YAW_THRESHOLD_DEG = 20;
const PITCH_THRESHOLD_DEG = 15;

interface NativeModules {
  Camera: any;
  useCameraDevice: any;
  useCameraPermission: any;
  useFrameProcessor: any;
  Worklets: any;
  useFaceDetector: any;
}

function loadNativeModules(): NativeModules | null {
  try {
    const visionCamera = require('react-native-vision-camera');
    const faceDetectorMod = require('react-native-vision-camera-face-detector');
    const worklets = require('react-native-worklets-core');
    if (
      !visionCamera?.Camera ||
      !visionCamera?.useCameraDevice ||
      !visionCamera?.useFrameProcessor ||
      !faceDetectorMod?.useFaceDetector ||
      !worklets?.Worklets
    ) {
      return null;
    }
    return {
      Camera: visionCamera.Camera,
      useCameraDevice: visionCamera.useCameraDevice,
      useCameraPermission: visionCamera.useCameraPermission,
      useFrameProcessor: visionCamera.useFrameProcessor,
      Worklets: worklets.Worklets,
      useFaceDetector: faceDetectorMod.useFaceDetector,
    };
  } catch {
    return null;
  }
}

const native = loadNativeModules();

interface FaceSnapshot {
  smilingProbability?: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  yawAngle?: number;
  pitchAngle?: number;
  rollAngle?: number;
}

export const FaceLivenessChallenge: React.FC<ChallengeProps> = ({ spec, onPass, onFail }) => {
  const { colors } = useTheme();
  const prompt = (spec.params?.prompt as Prompt) || 'smile';
  const timeoutMs = (spec.params?.timeoutMs as number) || 18_000;

  // If native modules failed to load, fail unsupported so the gate re-rolls.
  if (!native) {
    return <UnsupportedFallback colors={colors} onFail={onFail} />;
  }

  return <FaceLivenessImpl prompt={prompt} timeoutMs={timeoutMs} colors={colors} onPass={onPass} onFail={onFail} />;
};

const UnsupportedFallback: React.FC<{ colors: any; onFail: ChallengeProps['onFail'] }> = ({ colors, onFail }) => {
  useEffect(() => {
    const t = setTimeout(() => onFail('unsupported', 'vision-camera native module not loaded'), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.accent || '#00f3ff'} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>Preparing camera…</Text>
      <Text style={[styles.sub, { color: colors.textSecondary || colors.textPrimary }]}>
        Falling back to a quick puzzle
      </Text>
    </View>
  );
};

const FaceLivenessImpl: React.FC<{
  prompt: Prompt;
  timeoutMs: number;
  colors: any;
  onPass: () => void;
  onFail: ChallengeProps['onFail'];
}> = ({ prompt, timeoutMs, colors, onPass, onFail }) => {
  const { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, Worklets, useFaceDetector } = native!;

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  const [permissionPhase, setPermissionPhase] = useState<'pending' | 'granted' | 'denied'>(
    hasPermission ? 'granted' : 'pending',
  );
  const [progress, setProgress] = useState(0); // 0..1
  const completedRef = useRef(false);

  // JS-side state for transitions (smile hold, blink count)
  const stateRef = useRef({
    smileHeldSince: 0 as number,
    blinkPhase: 'open' as 'open' | 'closed',
    blinkCount: 0,
    blinkWindowStartedAt: 0,
    lookSeenSinceMs: 0,
  });

  // Request permission on mount if needed.
  useEffect(() => {
    if (hasPermission) {
      setPermissionPhase('granted');
      return;
    }
    let cancelled = false;
    requestPermission().then((granted: boolean) => {
      if (cancelled) return;
      setPermissionPhase(granted ? 'granted' : 'denied');
      if (!granted) onFail('invalid', 'Camera permission denied');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Top-level timeout — fail if not solved in time.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onFail('timeout');
      }
    }, timeoutMs);
    return () => clearTimeout(t);
  }, []);

  const handleFace = useMemo(
    () =>
      Worklets.createRunOnJS((face: FaceSnapshot) => {
        if (completedRef.current) return;
        const s = stateRef.current;
        const now = Date.now();

        switch (prompt) {
          case 'smile': {
            const p = face.smilingProbability ?? 0;
            if (p > SMILE_THRESHOLD) {
              if (s.smileHeldSince === 0) s.smileHeldSince = now;
              const held = now - s.smileHeldSince;
              setProgress(Math.min(1, held / SMILE_HOLD_MS));
              if (held >= SMILE_HOLD_MS) {
                completedRef.current = true;
                onPass();
              }
            } else if (s.smileHeldSince !== 0) {
              s.smileHeldSince = 0;
              setProgress(0);
            }
            break;
          }
          case 'blink': {
            const left = face.leftEyeOpenProbability ?? 1;
            const right = face.rightEyeOpenProbability ?? 1;
            const avg = (left + right) / 2;
            if (s.blinkWindowStartedAt === 0) s.blinkWindowStartedAt = now;
            if (now - s.blinkWindowStartedAt > BLINK_WINDOW_MS) {
              // window expired without 2 blinks — keep retrying (rolling)
              s.blinkWindowStartedAt = now;
              s.blinkCount = 0;
            }
            if (s.blinkPhase === 'open' && avg < EYE_CLOSED_THRESHOLD) {
              s.blinkPhase = 'closed';
            } else if (s.blinkPhase === 'closed' && avg > EYE_OPEN_THRESHOLD) {
              s.blinkPhase = 'open';
              s.blinkCount += 1;
              setProgress(Math.min(1, s.blinkCount / 2));
              if (s.blinkCount >= 2) {
                completedRef.current = true;
                onPass();
              }
            }
            break;
          }
          case 'lookLeft':
          case 'lookRight': {
            const yaw = face.yawAngle ?? 0;
            const target = prompt === 'lookLeft' ? -YAW_THRESHOLD_DEG : YAW_THRESHOLD_DEG;
            const reached = prompt === 'lookLeft' ? yaw < target : yaw > target;
            setProgress(Math.min(1, Math.abs(yaw) / Math.abs(target)));
            if (reached) {
              completedRef.current = true;
              onPass();
            }
            break;
          }
          case 'lookUp':
          case 'lookDown': {
            const pitch = face.pitchAngle ?? 0;
            const target = prompt === 'lookUp' ? -PITCH_THRESHOLD_DEG : PITCH_THRESHOLD_DEG;
            const reached = prompt === 'lookUp' ? pitch < target : pitch > target;
            setProgress(Math.min(1, Math.abs(pitch) / Math.abs(target)));
            if (reached) {
              completedRef.current = true;
              onPass();
            }
            break;
          }
        }
      }),
    [prompt],
  );

  const { detectFaces } = useFaceDetector({
    performanceMode: 'fast',
    classificationMode: 'all',
    contourMode: 'none',
    landmarkMode: 'none',
    trackingEnabled: false,
  });

  const frameProcessor = useFrameProcessor(
    (frame: any) => {
      'worklet';
      try {
        const faces = detectFaces(frame);
        if (faces && faces.length > 0) {
          const f = faces[0];
          handleFace({
            smilingProbability: f.smilingProbability,
            leftEyeOpenProbability: f.leftEyeOpenProbability,
            rightEyeOpenProbability: f.rightEyeOpenProbability,
            yawAngle: f.yawAngle,
            pitchAngle: f.pitchAngle,
            rollAngle: f.rollAngle,
          });
        }
      } catch (e) {
        // swallow — frame processor errors should not crash the app
      }
    },
    [detectFaces, handleFace],
  );

  if (permissionPhase !== 'granted' || !device) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator size="large" color={colors.accent || '#00f3ff'} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {permissionPhase === 'denied' ? 'Camera permission required' : 'Initializing camera…'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{PROMPT_TEXT[prompt]}</Text>
      <View style={styles.cameraFrame}>
        <Camera
          style={styles.camera}
          device={device}
          isActive={true}
          frameProcessor={frameProcessor}
          pixelFormat="yuv"
        />
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: colors.accent || '#00f3ff' }]} />
      </View>
      <Text style={[styles.sub, { color: colors.textSecondary || colors.textPrimary }]}>
        Hold your face inside the frame
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 16, gap: 14 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 13, opacity: 0.7, textAlign: 'center' },
  cameraFrame: {
    width: 240,
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: '#000',
  },
  camera: { flex: 1 },
  bar: { width: 200, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  barFill: { height: '100%' },
});

export default FaceLivenessChallenge;
