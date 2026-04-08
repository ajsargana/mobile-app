import React, { useRef, useEffect, useMemo } from 'react';
import { StyleSheet, View, Animated, ViewStyle } from 'react-native';
import { useDeviceCapability } from '../contexts/DeviceCapabilityContext';

// Lazy-load BlurView only on full mode to avoid OOM on 2GB devices
let BlurViewComponent: any = null;
function getBlurView() {
  if (BlurViewComponent) return BlurViewComponent;
  try {
    BlurViewComponent = require('expo-blur').BlurView;
  } catch {
    BlurViewComponent = View; // fallback if expo-blur fails
  }
  return BlurViewComponent;
}

type NeonColor = 'cyan' | 'blue' | 'purple' | 'pink' | 'green';

const NEON: Record<NeonColor, string> = {
  cyan:   '#00f3ff',
  blue:   '#0080ff',
  purple: '#8b00ff',
  pink:   '#ff00c8',
  green:  '#00ff87',
};

interface Props {
  children: React.ReactNode;
  neon?: NeonColor;
  blurIntensity?: number;
  animated?: boolean;
  style?: ViewStyle;
}

export default function GlassCard({
  children,
  neon,
  blurIntensity = 20,
  animated = false,
  style,
}: Props) {
  const { isLowEnd } = useDeviceCapability();
  const accentColor = neon ? NEON[neon] : 'rgba(255,255,255,0.15)';

  // Always created — hooks cannot be conditional
  const opacity    = useRef(new Animated.Value(animated && !isLowEnd ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(animated && !isLowEnd ? 16 : 0)).current;

  useEffect(() => {
    if (!animated || isLowEnd) return;
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Lite mode: flat card, zero GPU-intensive effects ─────────────────────────
  if (isLowEnd) {
    return (
      <View style={[styles.flatOuter, style]}>
        <View style={[styles.flatInner, { borderColor: accentColor }]}>
          {children}
        </View>
      </View>
    );
  }

  // ── Full mode: glassmorphism + optional entrance animation ───────────────────
  const BlurView = useMemo(() => getBlurView(), []);
  const card = (
    <BlurView intensity={blurIntensity} tint="dark" style={[styles.blur, style]}>
      <View style={[styles.inner, { borderColor: accentColor }]}>
        {neon && (
          <View style={[styles.glowRing, { shadowColor: accentColor }]} pointerEvents="none" />
        )}
        {children}
      </View>
    </BlurView>
  );

  if (!animated) return card;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {card}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flatOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(10, 30, 50, 0.85)',
  },
  flatInner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  blur: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  inner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
});
