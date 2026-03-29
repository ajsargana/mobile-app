import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

interface HelpScreenProps {
  navigation: any;
}

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'How does mining / forging work?',
    a: 'Tap the circular button on the Forge screen to start. Your device solves lightweight cryptographic puzzles to contribute to block consensus. You earn A50 coins for each valid participation.',
  },
  {
    q: 'What is the daily participation limit?',
    a: 'Each account can participate in up to 20 block rounds per day by default. Achieving higher Trust Levels or Trophy milestones can increase your limit.',
  },
  {
    q: 'How do I earn more A50?',
    a: 'Mine daily to build your streak, complete achievements, refer trusted people to your Security Circle, and reach higher leaderboard positions.',
  },
  {
    q: 'What is the Security Circle?',
    a: 'A verification system where you invite trusted contacts. Having real, active circle members increases your mining multiplier and Trust Level.',
  },
  {
    q: 'How do I restore my wallet on a new device?',
    a: 'Go to Settings → Restore Wallet and enter your 12-word seed phrase. Never share your seed phrase with anyone.',
  },
  {
    q: 'What is the Insurance Pool?',
    a: 'A community-funded reserve that protects honest miners from network attacks. Contributing to the pool earns you a share of redistribution rewards.',
  },
];

// ── Accordion Item ────────────────────────────────────────────────────────────
const FaqItem: React.FC<{ q: string; a: string }> = ({ q, a }) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={[faqStyles.item, { borderBottomColor: colors.cardBorder }]}>
      <TouchableOpacity
        style={faqStyles.question}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.75}
      >
        <Text style={[faqStyles.questionText, { color: colors.textPrimary }]}>{q}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </TouchableOpacity>
      {open && (
        <Text style={[faqStyles.answerText, { color: colors.textSecondary }]}>{a}</Text>
      )}
    </View>
  );
};

const faqStyles = StyleSheet.create({
  item: { borderBottomWidth: 1, paddingVertical: 2 },
  question: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  questionText: { flex: 1, fontSize: 14, fontWeight: '600' },
  answerText: { fontSize: 13, lineHeight: 20, paddingBottom: 12, paddingRight: 4 },
});

// ── Tour Card ─────────────────────────────────────────────────────────────────
interface TourCardProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  colors: any;
}

const TourCard: React.FC<TourCardProps> = ({ icon, title, subtitle, onPress, colors }) => (
  <TouchableOpacity
    style={[tourStyles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={[tourStyles.iconBadge, { backgroundColor: colors.card2 }]}>
      <Ionicons name={icon as any} size={22} color={colors.accent} />
    </View>
    <View style={tourStyles.cardText}>
      <Text style={[tourStyles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[tourStyles.cardSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
    </View>
    <Ionicons name="play-circle-outline" size={24} color={colors.accent} />
  </TouchableOpacity>
);

const tourStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 13,
    marginBottom: 10, gap: 12,
  },
  iconBadge: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export const HelpScreen: React.FC<HelpScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const resetAndNavigate = async (key: string, tab: string) => {
    await AsyncStorage.setItem(key, '0');
    // Navigate to the appropriate tab
    navigation.navigate('MainTabs', { screen: tab });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Help & FAQ</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section 1: Feature Tours ── */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Feature Tours</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          Replay guided walkthroughs to discover every feature
        </Text>

        <TourCard
          icon="map-outline"
          title="Main Tour"
          subtitle="9 steps — wallet, forge, leaderboard & more"
          onPress={() => resetAndNavigate('@aura50_onboarding_v2_step', 'Home')}
          colors={colors}
        />
        <TourCard
          icon="swap-horizontal-outline"
          title="Transaction Tour"
          subtitle="3 steps — send, receive & history"
          onPress={() => resetAndNavigate('@aura50_tour_tx_step', 'Home')}
          colors={colors}
        />
        <TourCard
          icon="shield-outline"
          title="Insurance Pool Tour"
          subtitle="2 steps — pool stats & contributions"
          onPress={() => resetAndNavigate('@aura50_tour_ins_step', 'Insurance')}
          colors={colors}
        />

        {/* ── Section 2: FAQ ── */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 28 }]}>FAQ</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          Tap a question to expand the answer
        </Text>

        <ThemedCard style={styles.faqCard} padding={4}>
          {FAQ_ITEMS.map((item, idx) => (
            <FaqItem key={idx} q={item.q} a={item.a} />
          ))}
        </ThemedCard>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  fill: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },

  content: { paddingHorizontal: 16, paddingTop: 24 },

  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, marginBottom: 16 },

  faqCard: { marginBottom: 8 },
});
