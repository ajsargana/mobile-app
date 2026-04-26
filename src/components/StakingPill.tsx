import React, { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  Animated,
  View,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

interface StakingPillProps {
  onPress: () => void;
  stakingBoost?: number;
  style?: any;
}

export const StakingPill: React.FC<StakingPillProps> = ({ onPress, stakingBoost, style }) => {
  const { colors } = useTheme();

  // Animations
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const shineAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    // Sequence: scale up → shake → hold
    Animated.sequence([
      // Scale up
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      // Shake (left-right vibration)
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: -6,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 6,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -6,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 6,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 80,
          useNativeDriver: true,
        }),
      ]),
      // Hold forever (stays visible)
      Animated.delay(2000),
    ]).start();
  }, [scaleAnim, shakeAnim]);

  // Premium shine animation (continuous loop)
  useEffect(() => {
    const shineLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shineAnim, {
          toValue: width + 40,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(shineAnim, {
          toValue: -120,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    shineLoop.start();
    return () => shineLoop.stop();
  }, [shineAnim]);

  const animatedStyle = {
    transform: [
      { scale: scaleAnim },
      { translateX: shakeAnim },
    ],
    opacity: scaleAnim.interpolate({
      inputRange: [0, 0.1],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    }),
  };

  return (
    <Animated.View style={[animatedStyle, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
      <TouchableOpacity
        onPress={onPress}
        style={[
          {
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(93,173,226,0.12)',
            borderColor: 'rgba(93,173,226,0.30)',
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            overflow: 'hidden',
          },
          style,
        ]}
      >
        {/* Premium glossy shine effect - full width gradient */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '120%',
            transform: [{ translateX: shineAnim }],
          }}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0)',
              'rgba(255,255,255,0.1)',
              'rgba(255,255,255,0.3)',
              'rgba(255,255,255,0.1)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Ionicons
          name="flash"
          size={20}
          color={colors.accent}
          style={{ marginBottom: 4 }}
        />
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
          Stake
        </Text>
        {stakingBoost && stakingBoost > 1.0 && (
          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2 }}>
            +{((stakingBoost - 1) * 100).toFixed(1)}%
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};
