import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { SybilResistanceService } from '../services/SybilResistanceService';
import SecurityCircleService from '../services/SecurityCircleService';
import { useTheme } from '../contexts/ThemeContext';
import { TrustLevel, User } from '../types';
import ThemedCard from './ThemedCard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrustLevelInfo {
  level: TrustLevel;
  label: string;
  feeRate: string;
  rewardMultiplier: string;
  color: string;
  gradientColors: [string, string];
  icon: string;
  description: string;
  daysRequired: number;
}

interface TrustScreenData {
  user: User | null;
  currentLevel: TrustLevel;
  daysSinceCreation: number;
  sybilScore: number;
  sybilRisk: string;
  canValidate: boolean;
  circleActive: number;
  circleTotal: number;
  walletUnlocked: boolean;
}

// ── Trust level definitions ───────────────────────────────────────────────────

const TRUST_LEVEL_DATA: Record<TrustLevel, TrustLevelInfo> = {
  [TrustLevel.NEW]: {
    level: TrustLevel.NEW,
    label: 'New',
    feeRate: '0.1%',
    rewardMultiplier: '1.0x',
    color: '#95A5A6',
    gradientColors: ['#636E72', '#95A5A6'],
    icon: 'person-outline',
    description: 'Welcome to AURA50! Build your reputation by mining regularly and inviting trusted members.',
    daysRequired: 0,
  },
  [TrustLevel.ESTABLISHED]: {
    level: TrustLevel.ESTABLISHED,
    label: 'Established',
    feeRate: '0.05%',
    rewardMultiplier: '1.5x',
    color: '#3498DB',
    gradientColors: ['#2980B9', '#3498DB'],
    icon: 'shield-half-outline',
    description: 'You are an established member! Your fees are halved and rewards boosted 1.5x.',
    daysRequired: 30,
  },
  [TrustLevel.VETERAN]: {
    level: TrustLevel.VETERAN,
    label: 'Veteran',
    feeRate: '0.01%',
    rewardMultiplier: '2.0x',
    color: '#9B59B6',
    gradientColors: ['#8E44AD', '#9B59B6'],
    icon: 'shield-checkmark-outline',
    description: 'Veteran status earned! You enjoy near-zero fees and double mining rewards.',
    daysRequired: 365,
  },
  [TrustLevel.LEGEND]: {
    level: TrustLevel.LEGEND,
    label: 'Legend',
    feeRate: '0.001%',
    rewardMultiplier: '3.0x',
    color: '#FFD700',
    gradientColors: ['#F39C12', '#FFD700'],
    icon: 'trophy-outline',
    description: 'You are a Legend of AURA50! Maximum rewards, minimum fees — the highest honour.',
    daysRequired: 1095,
  },
};

const TRUST_ORDER: TrustLevel[] = [
  TrustLevel.NEW,
  TrustLevel.ESTABLISHED,
  TrustLevel.VETERAN,
  TrustLevel.LEGEND,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntilNext(current: TrustLevel, daysSince: number): number | null {
  const idx = TRUST_ORDER.indexOf(current);
  if (idx >= TRUST_ORDER.length - 1) return null;
  const next = TRUST_ORDER[idx + 1];
  return Math.max(0, TRUST_LEVEL_DATA[next].daysRequired - daysSince);
}

function formatDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  const rem = days % 30;
  if (rem === 0) return `${months} month${months > 1 ? 's' : ''}`;
  return `${months}mo ${rem}d`;
}

// ── Animated progress bar ─────────────────────────────────────────────────────

interface ProgressBarProps {
  progress: number;
  color: string;
  trackColor: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, color, trackColor }) => {
  const anim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(1, Math.max(0, progress)),
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  return (
    <View style={[barStyles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          barStyles.fill,
          {
            backgroundColor: color,
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
};

const barStyles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden', flex: 1 },
  fill:  { height: '100%', borderRadius: 4 },
});

// ── Main Component ────────────────────────────────────────────────────────────

interface TrustLevelScreenProps {
  navigation?: any;
}

export const TrustLevelScreen: React.FC<TrustLevelScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<TrustScreenData>({
    user: null,
    currentLevel: TrustLevel.NEW,
    daysSinceCreation: 0,
    sybilScore: 0,
    sybilRisk: 'high',
    canValidate: false,
    circleActive: 0,
    circleTotal: 3,
    walletUnlocked: false,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const walletService = EnhancedWalletService.getInstance();
  const sybilService = SybilResistanceService.getInstance();
  const circleService = SecurityCircleService.getInstance();

  const load = useCallback(async () => {
    try {
      const user = walletService.getUser();
      let daysSince = 0;
      let currentLevel = TrustLevel.NEW;

      if (user) {
        daysSince = Math.floor(
          (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        currentLevel = walletService.calculateTrustLevel(user);
      }

      let sybilScore = 0;
      let sybilRisk = 'high';
      let canValidate = false;
      try {
        const score = await sybilService.calculateSybilScore();
        sybilScore = score.overallScore;
        sybilRisk = score.riskLevel;
        canValidate = score.canValidate;
      } catch { /* keep defaults */ }

      let circleActive = 0;
      let walletUnlocked = false;
      try {
        if (user) {
          const progress = await circleService.getCircleProgress(user.id);
          circleActive = progress.active ?? 0;
          walletUnlocked = progress.walletStatus === 'unlocked';
        }
      } catch { /* keep defaults */ }

      setData({ user, currentLevel, daysSinceCreation: daysSince, sybilScore, sybilRisk, canValidate, circleActive, circleTotal: 3, walletUnlocked });
    } catch (err) {
      console.error('TrustLevelScreen load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.centeredFull, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading trust profile…</Text>
      </View>
    );
  }

  const currentInfo = TRUST_LEVEL_DATA[data.currentLevel];
  const currentIdx  = TRUST_ORDER.indexOf(data.currentLevel);
  const isLegend    = data.currentLevel === TrustLevel.LEGEND;
  const daysLeft    = daysUntilNext(data.currentLevel, data.daysSinceCreation);

  let tierProgress = 1;
  if (!isLegend) {
    const nextLevel   = TRUST_ORDER[currentIdx + 1];
    const nextReq     = TRUST_LEVEL_DATA[nextLevel].daysRequired;
    const prevReq     = TRUST_LEVEL_DATA[data.currentLevel].daysRequired;
    const span        = nextReq - prevReq;
    const gained      = data.daysSinceCreation - prevReq;
    tierProgress      = Math.min(1, Math.max(0, gained / span));
  }

  const getRiskColor = (risk: string): string => {
    switch (risk) {
      case 'low':      return '#27AE60';
      case 'medium':   return '#F39C12';
      case 'high':     return '#E67E22';
      case 'critical': return '#E74C3C';
      default:         return '#95A5A6';
    }
  };

  const getRiskIcon = (risk: string): 'checkmark-circle' | 'warning' | 'alert-circle' | 'close-circle' => {
    switch (risk) {
      case 'low':    return 'checkmark-circle';
      case 'medium': return 'warning';
      case 'high':   return 'alert-circle';
      default:       return 'close-circle';
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* ── Hero ── */}
      <LinearGradient
        colors={['#0A1628', '#0A3D62', '#141E28']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 20 }]}
      >
        {navigation && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        <View style={[styles.badgeRing, { borderColor: currentInfo.color + '55' }]}>
          <LinearGradient
            colors={currentInfo.gradientColors}
            style={styles.badgeInner}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name={currentInfo.icon as any} size={36} color="white" />
          </LinearGradient>
        </View>

        <Text style={styles.heroLevel}>{currentInfo.label}</Text>
        <Text style={styles.heroLabel}>Trust Level</Text>
        {data.user && <Text style={styles.heroUsername}>@{data.user.username}</Text>}

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{data.daysSinceCreation}</Text>
            <Text style={styles.heroStatLabel}>Days Active</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, { color: currentInfo.color }]}>{currentInfo.rewardMultiplier}</Text>
            <Text style={styles.heroStatLabel}>Reward Boost</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{currentInfo.feeRate}</Text>
            <Text style={styles.heroStatLabel}>Tx Fee</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Description ── */}
      <View style={styles.section}>
        <ThemedCard padding={16}>
          <View style={styles.descRow}>
            <View style={[styles.descDot, { backgroundColor: currentInfo.color + '22', borderColor: currentInfo.color + '55' }]}>
              <Ionicons name={currentInfo.icon as any} size={20} color={currentInfo.color} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.descTitle, { color: colors.textPrimary }]}>{currentInfo.label} Member</Text>
              <Text style={[styles.descText, { color: colors.textMuted }]}>{currentInfo.description}</Text>
            </View>
          </View>
        </ThemedCard>
      </View>

      {/* ── Progress ── */}
      {!isLegend && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Progress to Next Level</Text>
          <ThemedCard padding={16}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressFrom, { color: colors.textMuted }]}>{currentInfo.label}</Text>
              <Text style={[styles.progressArrow, { color: colors.accent }]}>{Math.round(tierProgress * 100)}%</Text>
              <Text style={[styles.progressTo, { color: TRUST_LEVEL_DATA[TRUST_ORDER[currentIdx + 1]].color }]}>
                {TRUST_LEVEL_DATA[TRUST_ORDER[currentIdx + 1]].label}
              </Text>
            </View>
            <ProgressBar
              progress={tierProgress}
              color={TRUST_LEVEL_DATA[TRUST_ORDER[currentIdx + 1]].color}
              trackColor={isDark ? 'rgba(255,255,255,0.07)' : '#E5E7EB'}
            />
            {daysLeft !== null && daysLeft > 0 && (
              <Text style={[styles.progressHint, { color: colors.textMuted }]}>
                {formatDays(daysLeft)} remaining to reach {TRUST_LEVEL_DATA[TRUST_ORDER[currentIdx + 1]].label}
              </Text>
            )}
            {daysLeft === 0 && (
              <Text style={[styles.progressHint, { color: '#27AE60' }]}>Level up happening soon — keep mining!</Text>
            )}
          </ThemedCard>
        </View>
      )}

      {isLegend && (
        <View style={styles.section}>
          <ThemedCard padding={16}>
            <View style={styles.legendBadge}>
              <Ionicons name="trophy" size={20} color="#FFD700" />
              <Text style={[styles.legendText, { color: colors.textPrimary }]}>
                Maximum trust level reached. You are a Legend of AURA50!
              </Text>
            </View>
          </ThemedCard>
        </View>
      )}

      {/* ── Trust Ladder ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Trust Ladder</Text>
        <ThemedCard padding={0}>
          {TRUST_ORDER.map((level, idx) => {
            const info       = TRUST_LEVEL_DATA[level];
            const isActive   = level === data.currentLevel;
            const isUnlocked = TRUST_ORDER.indexOf(level) <= currentIdx;
            const isLast     = idx === TRUST_ORDER.length - 1;

            return (
              <View
                key={level}
                style={[
                  styles.ladderRow,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
                  isActive && { backgroundColor: isDark ? `${info.color}18` : `${info.color}10` },
                ]}
              >
                <View style={[
                  styles.ladderIcon,
                  {
                    backgroundColor: isUnlocked ? `${info.color}22` : (isDark ? 'rgba(255,255,255,0.04)' : '#F3F4F6'),
                    borderColor: isUnlocked ? `${info.color}55` : colors.cardBorder,
                  },
                ]}>
                  <Ionicons
                    name={isUnlocked ? (info.icon as any) : 'lock-closed-outline'}
                    size={18}
                    color={isUnlocked ? info.color : colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.ladderNameRow}>
                    <Text style={[styles.ladderName, { color: isUnlocked ? colors.textPrimary : colors.textMuted }]}>
                      {info.label}
                    </Text>
                    {isActive && (
                      <View style={[styles.activePill, { backgroundColor: info.color }]}>
                        <Text style={styles.activePillText}>Current</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.ladderSub, { color: colors.textMuted }]}>
                    {info.daysRequired === 0 ? 'From day 1' : `After ${info.daysRequired} days`}
                    {'  ·  '}{info.feeRate} fee{'  ·  '}{info.rewardMultiplier} rewards
                  </Text>
                </View>
                {isUnlocked && (
                  <Ionicons
                    name={isActive ? 'radio-button-on' : 'checkmark-circle'}
                    size={18}
                    color={isActive ? info.color : '#27AE60'}
                  />
                )}
              </View>
            );
          })}
        </ThemedCard>
      </View>

      {/* ── Security Profile ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Security Profile</Text>
        <ThemedCard padding={16}>
          {/* Sybil score */}
          <View style={styles.secRow}>
            <View style={[styles.secIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EFF6FF' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.secLabel, { color: colors.textPrimary }]}>Sybil Resistance Score</Text>
              <View style={[styles.secBarRow, { marginTop: 6 }]}>
                <ProgressBar
                  progress={data.sybilScore / 100}
                  color={getRiskColor(data.sybilRisk)}
                  trackColor={isDark ? 'rgba(255,255,255,0.07)' : '#E5E7EB'}
                />
                <Text style={[styles.secScore, { color: colors.textPrimary }]}>{data.sybilScore}</Text>
              </View>
            </View>
            <View style={styles.riskBadge}>
              <Ionicons name={getRiskIcon(data.sybilRisk)} size={14} color={getRiskColor(data.sybilRisk)} />
              <Text style={[styles.riskText, { color: getRiskColor(data.sybilRisk) }]}>
                {data.sybilRisk.charAt(0).toUpperCase() + data.sybilRisk.slice(1)}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

          {/* Validator eligibility */}
          <View style={styles.secRow}>
            <View style={[styles.secIcon, {
              backgroundColor: data.canValidate
                ? (isDark ? 'rgba(39,174,96,0.12)' : '#F0FDF4')
                : (isDark ? 'rgba(231,76,60,0.12)' : '#FEF2F2'),
            }]}>
              <Ionicons
                name={data.canValidate ? 'checkmark-done-outline' : 'close-outline'}
                size={18}
                color={data.canValidate ? '#27AE60' : '#E74C3C'}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.secLabel, { color: colors.textPrimary }]}>Validator Eligibility</Text>
              <Text style={[styles.secSub, { color: colors.textMuted }]}>
                {data.canValidate
                  ? 'You are eligible to participate as a validator'
                  : 'Reach a Sybil score of 50+ to validate blocks'}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

          {/* Security circle */}
          <View style={styles.secRow}>
            <View style={[styles.secIcon, {
              backgroundColor: data.walletUnlocked
                ? (isDark ? 'rgba(39,174,96,0.12)' : '#F0FDF4')
                : (isDark ? 'rgba(93,173,226,0.12)' : '#EFF6FF'),
            }]}>
              <Ionicons
                name={data.walletUnlocked ? 'lock-open-outline' : 'lock-closed-outline'}
                size={18}
                color={data.walletUnlocked ? '#27AE60' : colors.accent}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.secLabel, { color: colors.textPrimary }]}>Security Circle</Text>
              <Text style={[styles.secSub, { color: colors.textMuted }]}>
                {data.circleActive}/{data.circleTotal} active members · {data.walletUnlocked ? 'Wallet unlocked' : 'Wallet locked'}
              </Text>
            </View>
            {navigation && (
              <TouchableOpacity
                style={styles.secLink}
                onPress={() => navigation.navigate('Leaderboard', { scrollToInvite: true })}
              >
                <Text style={[styles.secLinkText, { color: colors.accent }]}>Manage</Text>
              </TouchableOpacity>
            )}
          </View>
        </ThemedCard>
      </View>

      {/* ── Benefits Table ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Level Benefits</Text>
        <ThemedCard padding={0}>
          <View style={[styles.tableHeader, { borderBottomColor: colors.cardBorder }]}>
            <Text style={[styles.tableHeaderCell, { color: colors.textMuted, flex: 2 }]}>Level</Text>
            <Text style={[styles.tableHeaderCell, { color: colors.textMuted }]}>Fee</Text>
            <Text style={[styles.tableHeaderCell, { color: colors.textMuted }]}>Rewards</Text>
            <Text style={[styles.tableHeaderCell, { color: colors.textMuted }]}>Days</Text>
          </View>
          {TRUST_ORDER.map((level, idx) => {
            const info       = TRUST_LEVEL_DATA[level];
            const isActive   = level === data.currentLevel;
            const isUnlocked = TRUST_ORDER.indexOf(level) <= currentIdx;
            const isLast     = idx === TRUST_ORDER.length - 1;

            return (
              <View
                key={level}
                style={[
                  styles.tableRow,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
                  isActive && { backgroundColor: isDark ? `${info.color}14` : `${info.color}08` },
                ]}
              >
                <View style={[styles.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center' }]}>
                  <View style={[styles.levelDot, { backgroundColor: info.color }]} />
                  <Text style={[styles.tableCellText, {
                    color: isUnlocked ? colors.textPrimary : colors.textMuted,
                    fontWeight: isActive ? '700' : '500',
                  }]}>
                    {info.label}
                  </Text>
                </View>
                <Text style={[styles.tableCell, styles.tableCellText, { color: isUnlocked ? '#27AE60' : colors.textMuted }]}>
                  {info.feeRate}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellText, {
                  color: isUnlocked ? info.color : colors.textMuted,
                  fontWeight: isActive ? '700' : '400',
                }]}>
                  {info.rewardMultiplier}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellText, { color: colors.textMuted }]}>
                  {info.daysRequired === 0 ? '—' : `${info.daysRequired}+`}
                </Text>
              </View>
            );
          })}
        </ThemedCard>
      </View>

      {/* ── How to level up ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>How to Level Up</Text>
        <ThemedCard padding={16}>
          {[
            { icon: 'flash-outline',          color: '#F39C12', tip: 'Mine daily to accumulate active days and build mining proof.' },
            { icon: 'person-add-outline',      color: '#3498DB', tip: 'Invite 3 trusted members to complete your Security Circle.' },
            { icon: 'shield-checkmark-outline', color: '#9B59B6', tip: 'Pass device attestation to raise your Sybil resistance score.' },
            { icon: 'time-outline',            color: '#27AE60', tip: 'Trust levels advance automatically with account age — keep going!' },
          ].map(({ icon, color, tip }, i) => (
            <View key={i} style={[styles.tipRow, i > 0 && { marginTop: 12 }]}>
              <View style={[styles.tipIcon, { backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
                <Ionicons name={icon as any} size={16} color={color} />
              </View>
              <Text style={[styles.tipText, { color: colors.textMuted }]}>{tip}</Text>
            </View>
          ))}
        </ThemedCard>
      </View>
    </ScrollView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centeredFull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, marginTop: 8 },

  hero: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  backBtn: { position: 'absolute', top: 20, left: 16, padding: 4 },
  badgeRing: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 16,
  },
  badgeInner: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  heroLevel:    { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  heroLabel:    { fontSize: 13, color: 'rgba(255,255,255,0.50)', marginTop: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  heroUsername: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 6 },
  heroStats: {
    flexDirection: 'row', alignItems: 'center', marginTop: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  heroStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },
  heroDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.10)' },

  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 },

  descRow: { flexDirection: 'row', alignItems: 'flex-start' },
  descDot: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  descTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  descText: { fontSize: 13, lineHeight: 19 },

  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  progressFrom:  { fontSize: 12, fontWeight: '600' },
  progressArrow: { fontSize: 14, fontWeight: '800' },
  progressTo:    { fontSize: 12, fontWeight: '600' },
  progressHint:  { fontSize: 12, marginTop: 8, textAlign: 'center', fontStyle: 'italic' },

  legendBadge: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendText:  { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },

  ladderRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  ladderIcon:   { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ladderNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  ladderName:   { fontSize: 14, fontWeight: '700' },
  activePill:   { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  activePillText:{ fontSize: 10, color: 'white', fontWeight: '700' },
  ladderSub:    { fontSize: 11, lineHeight: 16 },

  secRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  secIcon:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  secLabel:  { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  secSub:    { fontSize: 11, lineHeight: 16 },
  secBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secScore:  { fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },
  riskBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  riskText:  { fontSize: 11, fontWeight: '700' },
  secLink:   { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  secLinkText:{ fontSize: 13, fontWeight: '700' },
  divider:   { height: 1, marginVertical: 12 },

  tableHeader:     { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  tableHeaderCell: { flex: 1, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:        { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
  tableCell:       { flex: 1 },
  tableCellText:   { fontSize: 12, fontWeight: '500' },
  levelDot:        { width: 8, height: 8, borderRadius: 4, marginRight: 6 },

  tipRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tipIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19, paddingTop: 6 },
});

export default TrustLevelScreen;
