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
 * Liveness model — every prompt runs a two-phase state machine:
 *
 *   phase 1 (baseline)  the user must first be observed in a NEUTRAL pose for
 *                       NEUTRAL_HOLD_MS of *continuous* detection. For the
 *                       look-* prompts the neutral head angle is captured here,
 *                       so the check measures a DELTA rather than an absolute
 *                       angle — a phone held at chest height reads 15-30° of
 *                       pitch before the user does anything, and an absolute
 *                       check passes on the first frame.
 *   phase 2 (action)    the target gesture must be held for its hold window,
 *                       again continuously. Any frame gap longer than
 *                       MAX_FRAME_GAP_MS (face left the frame, detector
 *                       stalled, app backgrounded) resets accumulated hold to
 *                       zero, so "two qualifying frames far apart" can never
 *                       add up to a pass.
 *
 * Every value coming out of the detector is validated before use. ML Kit
 * reports -1 for classification probabilities it could not compute, and the
 * bridge may deliver undefined; both are rejected rather than coerced into a
 * plausible-looking number. If a signal is unavailable for MAX_INVALID_SAMPLES
 * consecutive detections we report `unsupported` so the gate re-rolls to a
 * Tier-2 challenge instead of stranding the user until timeout.
 *
 * Defensive: native modules are required at module load inside try/catch.
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

/** Shown while we're still establishing the neutral baseline. */
const BASELINE_TEXT: Record<Prompt, string> = {
  smile: 'Relax your face for a moment…',
  blink: 'Keep both eyes open…',
  lookLeft: 'Look straight ahead first…',
  lookRight: 'Look straight ahead first…',
  lookUp: 'Look straight ahead first…',
  lookDown: 'Look straight ahead first…',
};

// ── Detection / presence tuning ─────────────────────────────────────────────
const DETECT_FPS = 8;            // throttle ML Kit; full camera fps is wasteful
const MAX_FRAME_GAP_MS = 450;    // gap above this breaks hold continuity
const FACE_LOST_MS = 600;        // no usable face for this long → reset progress
const MIN_FACE_RATIO = 0.12;     // face height vs. short edge of the frame
const NEUTRAL_HOLD_MS = 350;
const MAX_INVALID_SAMPLES = 24;  // ~3s at 8fps → signal unavailable on this device
const DEVICE_GRACE_MS = 2500;    // no front camera after this → unsupported

// ── Gesture thresholds ──────────────────────────────────────────────────────
const SMILE_THRESHOLD = 0.75;
const SMILE_NEUTRAL_MAX = 0.4;
const SMILE_HOLD_MS = 600;

const EYE_OPEN_THRESHOLD = 0.8;
const EYE_CLOSED_THRESHOLD = 0.35;
const BLINK_WINDOW_MS = 6_000;
const BLINKS_REQUIRED = 2;

const YAW_THRESHOLD_DEG = 20;
const PITCH_THRESHOLD_DEG = 15;
const NEUTRAL_YAW_MAX = 12;
const NEUTRAL_PITCH_MAX = 14;
const LOOK_HOLD_MS = 400;

/**
 * Head-angle axis conventions, as surfaced by
 * react-native-vision-camera-face-detector:
 *
 *   yawAngle   > 0 → head turned toward the USER'S LEFT
 *   pitchAngle > 0 → head tilted UP
 *
 * (ML Kit's headEulerAngleY is positive when the face turns toward the right
 * of the *captured image*; the raw front-camera image is un-mirrored, so the
 * image's right is the user's left. headEulerAngleX is positive looking up.)
 *
 * These two `sign` fields are the only place in this file that assumes a
 * direction — if a device is found to report the opposite, flip them here and
 * nothing else needs to change.
 */
const LOOK_AXIS: Record<
  'lookLeft' | 'lookRight' | 'lookUp' | 'lookDown',
  { axis: 'yaw' | 'pitch'; sign: 1 | -1; thresholdDeg: number }
> = {
  lookLeft: { axis: 'yaw', sign: 1, thresholdDeg: YAW_THRESHOLD_DEG },
  lookRight: { axis: 'yaw', sign: -1, thresholdDeg: YAW_THRESHOLD_DEG },
  lookUp: { axis: 'pitch', sign: 1, thresholdDeg: PITCH_THRESHOLD_DEG },
  lookDown: { axis: 'pitch', sign: -1, thresholdDeg: PITCH_THRESHOLD_DEG },
};

const isLookPrompt = (p: Prompt): p is keyof typeof LOOK_AXIS => p in LOOK_AXIS;

// ── Native module loading ───────────────────────────────────────────────────

interface NativeModules {
  Camera: any;
  useCameraDevice: any;
  useCameraPermission: any;
  useFrameProcessor: any;
  runAtTargetFps: any | null;
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
      !visionCamera?.useCameraPermission ||
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
      // Optional — present since VisionCamera v3. Without it we simply run the
      // detector on every frame.
      runAtTargetFps: typeof visionCamera.runAtTargetFps === 'function' ? visionCamera.runAtTargetFps : null,
      Worklets: worklets.Worklets,
      useFaceDetector: faceDetectorMod.useFaceDetector,
    };
  } catch {
    return null;
  }
}

const native = loadNativeModules();

/** Bridge a JS callback into the worklet runtime, tolerating either API name. */
function makeRunOnJS(Worklets: any, fn: (...args: any[]) => void): any {
  if (typeof Worklets?.createRunOnJS === 'function') return Worklets.createRunOnJS(fn);
  if (typeof Worklets?.createRunInJsFn === 'function') return Worklets.createRunInJsFn(fn);
  return null;
}

// ── Sample shape crossing the worklet → JS boundary ─────────────────────────

/**
 * Numbers only — no undefined, so nothing is lost across the bridge. Missing
 * values use out-of-range sentinels that the validators below reject.
 */
interface Sample {
  ok: boolean;
  reason: 'ok' | 'none' | 'multi';
  smile: number;
  leftEye: number;
  rightEye: number;
  yaw: number;
  pitch: number;
  sizeRatio: number; // -1 when the frame/bounds geometry wasn't available
}

const NO_PROB = -1;
const NO_ANGLE = 999;

const isProb = (v: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isAngle = (v: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 180;

type UiStatus = 'searching' | 'multi' | 'far' | 'baseline' | 'action';

interface MachineState {
  lastTick: number;
  invalidSince: number;
  invalidSignal: number;
  zeroAxis: number;
  neutralHeldMs: number;
  baselineReady: boolean;
  baseYaw: number;
  basePitch: number;
  baseSeeded: boolean;
  actionHeldMs: number;
  blinkPhase: 'open' | 'closed';
  blinkCount: number;
  blinkWindowStart: number;
}

function freshState(): MachineState {
  return {
    lastTick: 0,
    invalidSince: 0,
    invalidSignal: 0,
    zeroAxis: 0,
    neutralHeldMs: 0,
    baselineReady: false,
    baseYaw: 0,
    basePitch: 0,
    baseSeeded: false,
    actionHeldMs: 0,
    blinkPhase: 'open',
    blinkCount: 0,
    blinkWindowStart: 0,
  };
}

/**
 * Drop everything the user has accumulated, but keep the captured neutral
 * baseline — re-establishing it on every brief dropout would make the
 * look-* prompts miserable to complete.
 */
function resetProgress(st: MachineState): void {
  st.neutralHeldMs = 0;
  st.actionHeldMs = 0;
  st.blinkCount = 0;
  st.blinkWindowStart = 0;
  st.blinkPhase = 'open';
  st.lastTick = 0;
}

// ── Component ───────────────────────────────────────────────────────────────

export const FaceLivenessChallenge: React.FC<ChallengeProps> = ({ spec, onPass, onFail }) => {
  const { colors } = useTheme();
  const prompt = (spec.params?.prompt as Prompt) || 'smile';
  const timeoutMs = (spec.params?.timeoutMs as number) || 25_000;

  // If native modules failed to load, fail unsupported so the gate re-rolls.
  if (!native) {
    return <UnsupportedFallback colors={colors} onFail={onFail} />;
  }

  return (
    <FaceLivenessImpl
      prompt={prompt}
      timeoutMs={timeoutMs}
      colors={colors}
      onPass={onPass}
      onFail={onFail}
    />
  );
};

const UnsupportedFallback: React.FC<{ colors: any; onFail: ChallengeProps['onFail'] }> = ({ colors, onFail }) => {
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  useEffect(() => {
    const t = setTimeout(() => onFailRef.current('unsupported', 'vision-camera native module not loaded'), 400);
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
  const { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, runAtTargetFps, Worklets, useFaceDetector } =
    native!;

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  const [permissionPhase, setPermissionPhase] = useState<'pending' | 'granted' | 'denied'>(
    hasPermission ? 'granted' : 'pending',
  );
  const [ui, setUi] = useState<{ progress: number; status: UiStatus }>({ progress: 0, status: 'searching' });
  const [finished, setFinished] = useState(false);

  // Callbacks are read through a ref so the worklet bridge and the mount-time
  // effects below never capture a stale closure.
  const cbRef = useRef({ onPass, onFail });
  cbRef.current = { onPass, onFail };

  const doneRef = useRef(false);
  const stateRef = useRef<MachineState>(freshState());
  const uiRef = useRef<{ progress: number; status: UiStatus }>({ progress: 0, status: 'searching' });

  const finish = (kind: 'pass' | 'timeout' | 'invalid' | 'unsupported', detail?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFinished(true); // stops the camera stream
    if (kind === 'pass') cbRef.current.onPass();
    else cbRef.current.onFail(kind, detail);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** Only re-render when something visible actually moved. */
  const pushUi = (progress: number, status: UiStatus) => {
    const clamped = progress < 0 ? 0 : progress > 1 ? 1 : progress;
    const prev = uiRef.current;
    if (prev.status === status && Math.abs(prev.progress - clamped) < 0.02) return;
    uiRef.current = { progress: clamped, status };
    setUi(uiRef.current);
  };

  // Request permission on mount if needed.
  useEffect(() => {
    if (hasPermission) {
      setPermissionPhase('granted');
      return;
    }
    let cancelled = false;
    Promise.resolve(requestPermission())
      .then((granted: boolean) => {
        if (cancelled) return;
        setPermissionPhase(granted ? 'granted' : 'denied');
        // Reported as `invalid` (not `unsupported`) on purpose: falling back to
        // an easier Tier-2 puzzle would make "deny the camera" a way to skip
        // the liveness tier entirely.
        if (!granted) finishRef.current('invalid', 'Camera permission denied');
      })
      .catch(() => {
        if (cancelled) return;
        setPermissionPhase('denied');
        finishRef.current('invalid', 'Camera permission request failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // No usable front camera → let the gate re-roll rather than hang until timeout.
  useEffect(() => {
    if (permissionPhase !== 'granted' || device) return;
    const t = setTimeout(() => finishRef.current('unsupported', 'no front camera device'), DEVICE_GRACE_MS);
    return () => clearTimeout(t);
  }, [permissionPhase, device]);

  // Top-level timeout — fail if not solved in time.
  useEffect(() => {
    const t = setTimeout(() => finishRef.current('timeout'), timeoutMs);
    return () => clearTimeout(t);
  }, []);

  // Reset the machine if the prompt ever changes under us.
  useEffect(() => {
    stateRef.current = freshState();
  }, [prompt]);

  // ── The evaluator (JS thread) ─────────────────────────────────────────────
  // Held in a ref so `reportSample` below can be created exactly once and the
  // frame processor never has to be rebuilt.
  const evaluateRef = useRef<(s: Sample) => void>(() => {});
  evaluateRef.current = (s: Sample) => {
    if (doneRef.current) return;
    const st = stateRef.current;
    const now = Date.now();

    // ── Presence gate ───────────────────────────────────────────────────────
    const tooSmall = s.ok && s.sizeRatio >= 0 && s.sizeRatio < MIN_FACE_RATIO;
    if (!s.ok || tooSmall) {
      if (st.invalidSince === 0) st.invalidSince = now;
      if (now - st.invalidSince > FACE_LOST_MS) {
        resetProgress(st);
        pushUi(0, tooSmall ? 'far' : s.reason === 'multi' ? 'multi' : 'searching');
      }
      st.lastTick = 0; // any hold resumed after this counts as discontinuous
      return;
    }
    st.invalidSince = 0;

    // ── Continuity ──────────────────────────────────────────────────────────
    const dt = st.lastTick === 0 ? 0 : now - st.lastTick;
    st.lastTick = now;
    if (dt > MAX_FRAME_GAP_MS) {
      // Detector stalled or the face was gone — accumulated hold is void.
      st.neutralHeldMs = 0;
      st.actionHeldMs = 0;
      st.blinkPhase = 'open';
    }
    const step = dt > 0 && dt <= MAX_FRAME_GAP_MS ? dt : 0;

    const signalOk = () => {
      st.invalidSignal = 0;
    };
    const signalMissing = (what: string) => {
      st.invalidSignal += 1;
      if (st.invalidSignal >= MAX_INVALID_SAMPLES) {
        finishRef.current('unsupported', `${what} unavailable on this device`);
      }
    };

    switch (prompt) {
      case 'smile': {
        if (!isProb(s.smile)) {
          signalMissing('smile classification');
          return;
        }
        signalOk();

        if (!st.baselineReady) {
          if (s.smile < SMILE_NEUTRAL_MAX) {
            st.neutralHeldMs += step;
            if (st.neutralHeldMs >= NEUTRAL_HOLD_MS) st.baselineReady = true;
          } else {
            st.neutralHeldMs = 0;
          }
          pushUi(0.25 * (st.neutralHeldMs / NEUTRAL_HOLD_MS), 'baseline');
          return;
        }

        if (s.smile > SMILE_THRESHOLD) {
          st.actionHeldMs += step;
          if (st.actionHeldMs >= SMILE_HOLD_MS) {
            finishRef.current('pass');
            return;
          }
        } else {
          st.actionHeldMs = 0;
        }
        pushUi(0.25 + 0.75 * (st.actionHeldMs / SMILE_HOLD_MS), 'action');
        return;
      }

      case 'blink': {
        if (!isProb(s.leftEye) || !isProb(s.rightEye)) {
          signalMissing('eye-open classification');
          return;
        }
        signalOk();
        const avg = (s.leftEye + s.rightEye) / 2;

        if (!st.baselineReady) {
          if (avg > EYE_OPEN_THRESHOLD) {
            st.neutralHeldMs += step;
            if (st.neutralHeldMs >= NEUTRAL_HOLD_MS) {
              st.baselineReady = true;
              st.blinkPhase = 'open';
              st.blinkWindowStart = now;
            }
          } else {
            st.neutralHeldMs = 0;
          }
          pushUi(0.25 * (st.neutralHeldMs / NEUTRAL_HOLD_MS), 'baseline');
          return;
        }

        // Rolling window — blinks must be close enough together to read as a
        // deliberate action rather than ordinary blinking over 20 seconds.
        if (st.blinkWindowStart === 0) st.blinkWindowStart = now;
        if (now - st.blinkWindowStart > BLINK_WINDOW_MS) {
          st.blinkWindowStart = now;
          st.blinkCount = 0;
        }

        if (st.blinkPhase === 'open' && avg < EYE_CLOSED_THRESHOLD) {
          st.blinkPhase = 'closed';
        } else if (st.blinkPhase === 'closed' && avg > EYE_OPEN_THRESHOLD) {
          st.blinkPhase = 'open';
          st.blinkCount += 1;
          if (st.blinkCount >= BLINKS_REQUIRED) {
            finishRef.current('pass');
            return;
          }
        }
        pushUi(0.25 + 0.75 * (st.blinkCount / BLINKS_REQUIRED), 'action');
        return;
      }

      default: {
        if (!isLookPrompt(prompt)) return;
        const cfg = LOOK_AXIS[prompt];
        const raw = cfg.axis === 'yaw' ? s.yaw : s.pitch;

        if (!isAngle(raw)) {
          signalMissing('head-angle estimation');
          return;
        }
        // A head angle pinned at exactly 0.0 across seconds of detection means
        // the device isn't computing that axis at all — a finite-but-frozen
        // value would otherwise just burn the timeout.
        if (raw === 0) {
          st.zeroAxis += 1;
          if (st.zeroAxis >= MAX_INVALID_SAMPLES) {
            finishRef.current('unsupported', `${cfg.axis} angle not reported on this device`);
            return;
          }
        } else {
          st.zeroAxis = 0;
        }
        signalOk();

        if (!st.baselineReady) {
          const neutral = Math.abs(s.yaw) <= NEUTRAL_YAW_MAX && Math.abs(s.pitch) <= NEUTRAL_PITCH_MAX;
          if (neutral && isAngle(s.yaw) && isAngle(s.pitch)) {
            // EMA so a single jittery frame doesn't skew the reference pose.
            if (!st.baseSeeded) {
              st.baseYaw = s.yaw;
              st.basePitch = s.pitch;
              st.baseSeeded = true;
            } else {
              st.baseYaw = st.baseYaw * 0.7 + s.yaw * 0.3;
              st.basePitch = st.basePitch * 0.7 + s.pitch * 0.3;
            }
            st.neutralHeldMs += step;
            if (st.neutralHeldMs >= NEUTRAL_HOLD_MS) st.baselineReady = true;
          } else {
            st.neutralHeldMs = 0;
          }
          pushUi(0.25 * (st.neutralHeldMs / NEUTRAL_HOLD_MS), 'baseline');
          return;
        }

        // Measured against the captured neutral pose, so a constant offset from
        // how the phone is held can never satisfy the check on its own.
        const base = cfg.axis === 'yaw' ? st.baseYaw : st.basePitch;
        const delta = cfg.sign * (raw - base);
        if (delta >= cfg.thresholdDeg) {
          st.actionHeldMs += step;
          if (st.actionHeldMs >= LOOK_HOLD_MS) {
            finishRef.current('pass');
            return;
          }
        } else {
          st.actionHeldMs = 0;
        }
        const reach = Math.max(0, delta) / cfg.thresholdDeg;
        const hold = st.actionHeldMs / LOOK_HOLD_MS;
        pushUi(0.25 + 0.75 * Math.max(0, Math.min(1, reach)) * (0.5 + 0.5 * Math.min(1, hold)), 'action');
        return;
      }
    }
  };

  // Created once — a stable identity keeps the frame processor from being
  // rebuilt (which would restart the camera pipeline) on every render.
  const reportSample = useMemo(() => makeRunOnJS(Worklets, (s: Sample) => evaluateRef.current(s)), []);

  // Memoized: a fresh options object on every render would give `detectFaces` a
  // new identity, rebuilding the frame processor (and restarting the camera
  // pipeline) each time the progress bar moves.
  const detectorOptions = useMemo(
    () => ({
      // ML Kit's head-angle estimation is materially better in accurate mode,
      // and the look-* prompts live or die on it. Throttled to DETECT_FPS
      // below, so the extra cost is bounded.
      performanceMode: isLookPrompt(prompt) ? 'accurate' : 'fast',
      classificationMode: 'all',
      contourMode: 'none',
      landmarkMode: 'none',
      trackingEnabled: false,
    }),
    [prompt],
  );

  const { detectFaces } = useFaceDetector(detectorOptions);

  const frameProcessor = useFrameProcessor(
    (frame: any) => {
      'worklet';
      const process = () => {
        'worklet';
        try {
          if (!reportSample) return;
          const faces = detectFaces(frame);
          const count = faces ? faces.length : 0;
          if (count !== 1) {
            // Exactly one face, or nothing counts. A second face in shot (a
            // bystander, a photo on a screen) must not drive the state machine.
            reportSample({
              ok: false,
              reason: count > 1 ? 'multi' : 'none',
              smile: NO_PROB,
              leftEye: NO_PROB,
              rightEye: NO_PROB,
              yaw: NO_ANGLE,
              pitch: NO_ANGLE,
              sizeRatio: -1,
            });
            return;
          }

          const f = faces[0];
          let sizeRatio = -1;
          const b = f.bounds;
          if (b && frame.width > 0 && frame.height > 0 && b.height > 0) {
            const shortEdge = frame.width < frame.height ? frame.width : frame.height;
            if (shortEdge > 0) sizeRatio = b.height / shortEdge;
          }

          reportSample({
            ok: true,
            reason: 'ok',
            smile: typeof f.smilingProbability === 'number' ? f.smilingProbability : NO_PROB,
            leftEye: typeof f.leftEyeOpenProbability === 'number' ? f.leftEyeOpenProbability : NO_PROB,
            rightEye: typeof f.rightEyeOpenProbability === 'number' ? f.rightEyeOpenProbability : NO_PROB,
            yaw: typeof f.yawAngle === 'number' ? f.yawAngle : NO_ANGLE,
            pitch: typeof f.pitchAngle === 'number' ? f.pitchAngle : NO_ANGLE,
            sizeRatio,
          });
        } catch (e) {
          // swallow — frame processor errors should not crash the app
        }
      };

      if (runAtTargetFps) runAtTargetFps(DETECT_FPS, process);
      else process();
    },
    [detectFaces, reportSample],
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

  const hint =
    ui.status === 'multi'
      ? 'Only one face in the frame, please'
      : ui.status === 'far'
      ? 'Move a little closer'
      : ui.status === 'baseline'
      ? BASELINE_TEXT[prompt]
      : ui.status === 'action'
      ? PROMPT_TEXT[prompt]
      : 'Hold your face inside the frame';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{PROMPT_TEXT[prompt]}</Text>
      <View style={styles.cameraFrame}>
        <Camera
          style={styles.camera}
          device={device}
          isActive={!finished}
          frameProcessor={frameProcessor}
          pixelFormat="yuv"
        />
      </View>
      <View style={styles.bar}>
        <View
          style={[styles.barFill, { width: `${ui.progress * 100}%`, backgroundColor: colors.accent || '#00f3ff' }]}
        />
      </View>
      <Text style={[styles.sub, { color: colors.textSecondary || colors.textPrimary }]}>{hint}</Text>
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
