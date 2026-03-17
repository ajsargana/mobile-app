import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_KEY = '@aura50_onboarding_done';

const { width } = Dimensions.get('window');

interface OnboardingTourProps {
  onDone: () => void;
}

const slides = [
  { icon: 'wallet-outline' as const, title: 'Your Wallet', body: 'Store and manage your A50 coins. Send, receive, and track your balance — fully self-custodied.' },
  { icon: 'flash-outline' as const, title: 'Forge Coins', body: "Use your phone's processor to solve cryptographic puzzles and earn A50 coins. Go to the Forge tab to start." },
  { icon: 'trophy-outline' as const, title: 'Leaderboard', body: 'Compete with other forgers. The more you contribute to the network, the higher you rank.' },
  { icon: 'people-outline' as const, title: 'Pioneer Program', body: 'Invite trusted people to join the network and earn Pioneer rewards for growing the community.' },
  { icon: 'shield-checkmark-outline' as const, title: 'Security Circle', body: 'Build trust by adding verified contacts. A stronger circle means higher mining multipliers.' },
];

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onDone }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goTo = (index: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setCurrentIndex(index);
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) goTo(currentIndex + 1);
    else handleDone();
  };

  const handleDone = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onDone();
  };

  const slide = slides[currentIndex];
  const isLast = currentIndex === slides.length - 1;

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <TouchableOpacity style={styles.skipButton} onPress={handleDone}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
          <View style={styles.iconContainer}>
            <Ionicons name={slide.icon} size={56} color="#5DADE2" />
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
            ))}
          </View>
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
            <Ionicons name={isLast ? 'checkmark-outline' : 'arrow-forward-outline'} size={18} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#1C2833', borderRadius: 20, padding: 32, width: width - 48, alignItems: 'center' },
  skipButton: { alignSelf: 'flex-end', marginBottom: 8 },
  skipText: { color: '#566573', fontSize: 14 },
  iconContainer: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(93,173,226,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, color: '#AEB6BF', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  dots: { flexDirection: 'row', marginBottom: 28, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2C3E50' },
  dotActive: { backgroundColor: '#5DADE2', width: 24 },
  nextButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#5DADE2', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, gap: 8 },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default OnboardingTour;
