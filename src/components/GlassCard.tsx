/**
 * GlassCard — reusable glassmorphism card for futuristic UI
 *
 * Usage:
 *   <GlassCard>
 *     <Text className="text-neon-cyan">Hello</Text>
 *   </GlassCard>
 *
 *   <GlassCard neon="cyan" animated>
 *     ...
 *   </GlassCard>
 */
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';

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
  /** Neon border/glow accent color */
  neon?: NeonColor;
  /** Blur intensity 0-100 (default 20) */
  blurIntensity?: number;
  /** Animate card floating in on mount */
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
  const accentColor = neon ? NEON[neon] : 'rgba(255,255,255,0.15)';

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
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500 }}
    >
      {card}
    </MotiView>
  );
}

const styles = StyleSheet.create({
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
