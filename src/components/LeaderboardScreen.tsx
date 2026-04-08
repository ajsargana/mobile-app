import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Share,
  Alert,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import AsyncStorage from '@react-native-async-storage/async-storage';
import SecurityCircleService from '../services/SecurityCircleService';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { getApiUrl, API_ENDPOINTS } from '../config/environment';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import ThemedCard from './ThemedCard';

const { width: SW } = Dimensions.get('window');

// ─── Avatar presets ──────────────────────────────────────────────────────────

const PRESET_AVATARS = [
  { id: 'boy',       emoji: '👦', bg: '#60A5FA' },
  { id: 'girl',      emoji: '👧', bg: '#F472B6' },
  { id: 'man',       emoji: '👨', bg: '#34D399' },
  { id: 'woman',     emoji: '👩', bg: '#A78BFA' },
  { id: 'bearded',   emoji: '🧔', bg: '#6B7280' },
  { id: 'blond',     emoji: '👱', bg: '#FCD34D' },
  { id: 'oldman',    emoji: '👴', bg: '#9CA3AF' },
  { id: 'oldwoman',  emoji: '👵', bg: '#D1A37A' },
  { id: 'headscarf', emoji: '🧕', bg: '#2DD4BF' },
  { id: 'person',    emoji: '🧑', bg: '#FB923C' },
  { id: 'officer',   emoji: '👮', bg: '#3B82F6' },
  { id: 'techie',    emoji: '🧑‍💻', bg: '#667eea' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface CircleProgress {
  invited: number;
  registered: number;
  active: number;
  walletStatus: 'locked' | 'unlocked';
  requirements: string;
}

interface InviteLink {
  inviteCode: string;
  inviterId: string;
  createdAt: string;
  isUsed: boolean;
}

interface CircleMember {
  id: string;
  username?: string;
  invitedAt: string;
  isActive: boolean;
  status: string;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarId: string | null;
  verifiedReferrals: number;
  totalReferrals: number;
  prize: string | null;
  isCurrentUser: boolean;
}

interface LeaderboardResponse {
  period: { month: string; label: string };
  leaderboard: LeaderboardEntry[];
  userEntry: LeaderboardEntry | null;
  totalEntries: number;
}

// ─── Scope tabs ──────────────────────────────────────────────────────────────

const SCOPES = ['Region', 'National', 'Global'] as const;
type Scope = typeof SCOPES[number];

// Scope maps to how many top entries to display in the dropdown (backend sends same data)
const SCOPE_LIMIT: Record<Scope, number> = { Region: 5, National: 10, Global: 20 };

// ─── Rank ring colors ─────────────────────────────────────────────────────────

const RANK_RING: Record<number, { border: string; glow: string; crownSize: number }> = {
  1: { border: '#FFD700', glow: 'rgba(255,215,0,0.22)',  crownSize: 28 },
  2: { border: '#A8C0D6', glow: 'rgba(168,192,214,0.18)', crownSize: 20 },
  3: { border: '#CD7F32', glow: 'rgba(205,127,50,0.18)', crownSize: 17 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getAvatarById(id: string | null) {
  return PRESET_AVATARS.find(a => a.id === id) ?? null;
}

// ─── Module-level memo components (stable identity = no re-render on parent state changes) ─

interface AvatarCircleProps {
  avatarId: string | null;
  username: string;
  size: number;
  borderColor?: string;
  tappable?: boolean;
  onPress?: () => void;
}

const AvatarCircle = memo(({ avatarId, username, size, borderColor, tappable, onPress }: AvatarCircleProps) => {
  const av = getAvatarById(avatarId);
  const content = av
    ? <Text style={{ fontSize: size * 0.5 }}>{av.emoji}</Text>
    : <Text style={{ fontSize: size * 0.35, color: 'white', fontWeight: 'bold' }}>
        {(username || '?').slice(0, 2).toUpperCase()}
      </Text>;
  const circleStyle: any[] = [
    styles.avatarCircle,
    { width: size, height: size, borderRadius: size / 2, backgroundColor: av?.bg ?? '#667eea' },
    borderColor ? { borderWidth: 2.5, borderColor } : null,
  ];
  if (tappable && onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        <View style={circleStyle}>{content}</View>
        <View style={styles.editBadge}><Ionicons name="pencil" size={9} color="white" /></View>
      </TouchableOpacity>
    );
  }
  return <View style={circleStyle}>{content}</View>;
});

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  idx: number;
  isLast: boolean;
  isDark: boolean;
  colors: any;
  onAvatarPress: () => void;
}

const LeaderboardRow = memo(({ entry, idx, isLast, isDark, colors, onAvatarPress }: LeaderboardRowProps) => (
  <View
    style={[
      styles.dropRow,
      { borderBottomColor: colors.cardBorder },
      isLast && { borderBottomWidth: 0 },
      entry.isCurrentUser && {
        backgroundColor: isDark ? 'rgba(93,173,226,0.10)' : '#EFF6FF',
        borderLeftWidth: 3,
        borderLeftColor: '#5DADE2',
      },
    ]}
  >
    <View style={[
      styles.dropRankBadge,
      entry.rank <= 3 && { backgroundColor: RANK_RING[entry.rank].glow },
    ]}>
      <Text style={[
        styles.dropRankText,
        { color: entry.rank <= 3 ? RANK_RING[entry.rank].border : colors.textMuted },
      ]}>
        {entry.rank <= 3 ? ['', '1st', '2nd', '3rd'][entry.rank] : `#${entry.rank}`}
      </Text>
    </View>

    <View style={{ marginRight: 10 }}>
      <AvatarCircle
        avatarId={entry.avatarId}
        username={entry.username}
        size={34}
        borderColor={entry.rank <= 3 ? RANK_RING[entry.rank].border : undefined}
        tappable={entry.isCurrentUser}
        onPress={entry.isCurrentUser ? onAvatarPress : undefined}
      />
    </View>

    <Text style={[styles.dropName, { color: colors.textPrimary }]} numberOfLines={1}>
      {entry.username}{entry.isCurrentUser ? ' (You)' : ''}
    </Text>

    <Text style={[styles.dropRefs, { color: colors.textMuted }]}>
      {entry.verifiedReferrals} refs
    </Text>

    {entry.prize && (
      <View style={styles.prizePill}>
        <Text style={styles.prizePillText}>{entry.prize}</Text>
      </View>
    )}
  </View>
));

// ─── Component ───────────────────────────────────────────────────────────────

interface LeaderboardScreenProps {
  navigation: any;
  route?: any;
}

export function LeaderboardScreen({ navigation, route }: LeaderboardScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const inviteSectionY = useRef(0);

  // Security circle state
  const [progress, setProgress] = useState<CircleProgress>({
    invited: 0, registered: 0, active: 0,
    walletStatus: 'locked', requirements: 'Loading...',
  });
  const [members, setMembers]                 = useState<CircleMember[]>([]);
  const [inviteLinks, setInviteLinks]         = useState<InviteLink[]>([]);
  const [showQRCode, setShowQRCode]           = useState<string | null>(null);
  const [userBalance, setUserBalance]         = useState<number>(0);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

  // Leaderboard state
  const [leaderboard, setLeaderboard]               = useState<LeaderboardEntry[]>([]);
  const [userEntry, setUserEntry]                   = useState<LeaderboardEntry | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const currentMonth = getCurrentMonth();

  // Avatar state
  const [selectedAvatar, setSelectedAvatar]     = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarSaving, setAvatarSaving]         = useState(false);

  const [refreshing, setRefreshing]   = useState(false);
  const [activeScope, setActiveScope] = useState<Scope>('National');
  const [forgersOpen, setForgersOpen] = useState(false);

  // ── Onboarding step 8 ───────────────────────────────────────────────────
  const ONBOARDING_STEP_KEY = '@aura50_onboarding_v2_step';
  const [leaderHintReady, setLeaderHintReady] = useState(false);
  const [leaderSectionTop, setLeaderSectionTop] = useState(0);
  const leaderSectionRef = useRef<View>(null);
  const lBounce = useRef(new Animated.Value(0)).current;

  // ── Crown pulse animations (one per rank) ────────────────────────────────
  const crown1 = useRef(new Animated.Value(1)).current;
  const crown2 = useRef(new Animated.Value(1)).current;
  const crown3 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = (anim: Animated.Value, toValue: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue,   duration,     useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration,     useNativeDriver: true }),
          Animated.delay(400),
        ])
      ).start();

    pulse(crown1, 1.35, 650);
    pulse(crown2, 1.22, 850);
    pulse(crown3, 1.15, 1050);
  }, []);

  const crownAnims = [crown1, crown2, crown3];

  const securityCircleService = SecurityCircleService.getInstance();
  const walletService         = EnhancedWalletService.getInstance();

  // Stable callback passed to LeaderboardRow so memo comparison is stable
  const openAvatarPicker = useCallback(() => setShowAvatarPicker(true), []);

  useEffect(() => { loadAll(); }, []);

  // Step 8: show leaders hint when onboardingStep === 7
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STEP_KEY).then(step => {
      if (step === '8') {
        setTimeout(() => {
          leaderSectionRef.current?.measureInWindow((_x, y) => {
            setLeaderSectionTop(y);
            setLeaderHintReady(true);
          });
        }, 1000);
      }
    });
  }, []);

  useEffect(() => {
    if (!leaderHintReady) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(lBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
      Animated.timing(lBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [leaderHintReady]);

  const dismissLeaderHint = useCallback(() => {
    setLeaderHintReady(false);
    AsyncStorage.setItem(ONBOARDING_STEP_KEY, '9').catch(() => {});
  }, []);

  // Re-fetch leaderboard when scope changes (passes scope as query param)
  useEffect(() => { loadLeaderboard(); }, [activeScope]);

  // Auto-scroll to invite section when navigated from referral capsule
  useEffect(() => {
    if (route?.params?.scrollToInvite) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: inviteSectionY.current, animated: true });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [route?.params?.scrollToInvite]);

  const loadAll = async () => {
    await Promise.all([loadCircleData(), loadLeaderboard(), loadCurrentUser()]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  // ── Security circle (unchanged API paths) ────────────────────────────────

  const loadCircleData = async () => {
    try {
      const user = walletService.getUser();
      if (!user) return;
      const circleProgress = await securityCircleService.getCircleProgress(user.id);
      setProgress(circleProgress);
      const circleStatus = await securityCircleService.getSecurityCircleStatus(user.id);
      if (circleStatus) setMembers(circleStatus.members);
      const pendingInvites = await securityCircleService.getPendingInvites(user.id);
      setInviteLinks(pendingInvites);
      // Sync from backend first so the balance shown is the real server value
      await walletService.syncBalanceFromBackend();
      setUserBalance(parseFloat(walletService.getBalance()) || 0);
    } catch (error) {
      console.error('Failed to load circle data:', error);
    }
  };

  const handleGenerateInvite = async () => {
    try {
      setIsGeneratingInvite(true);
      const user = walletService.getUser();
      if (!user) throw new Error('User not authenticated');
      const inviteLink = await securityCircleService.generateInviteLink(user.id);
      await loadCircleData();
      shareInviteLink(inviteLink.inviteCode);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to generate invite link. Please try again.';
      Alert.alert('Unable to Generate Invite', msg);
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const copyInviteLink = async (inviteCode: string) => {
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert('Copied!', `Referral code "${inviteCode}" copied to clipboard`);
  };

  const shareInviteLink = async (inviteCode: string) => {
    try {
      const downloadUrl = `https://bit.ly/4diFeIj?ref=${inviteCode}`;
      await Share.share({
        message: `🚀 Don't miss out on AURA50 - The world's first mobile blockchain!\n\nStart earning A50 today. Early participants get the biggest Rewards 💰\n\n Use my referral code: ${inviteCode}\n\nDownload App: ${downloadUrl}\n\nCheck for more details: aura50.org`,
        title: 'Join My AURA50 Security Circle',
        url: downloadUrl,
      });
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const openInviteInstructions = () => {
    Alert.alert(
      'Security Circle',
      '1. Generate invite links for people you trust\n\n' +
      '2. They must register and complete their first mining session\n\n' +
      '3. Once all 3 invites are active, your wallet status upgrades\n\n' +
      'Choose trusted people — this protects against fake accounts!',
      [{ text: 'Got it!' }]
    );
  };

  // ── Leaderboard ───────────────────────────────────────────────────────────

  const loadLeaderboard = async () => {
    try {
      setLeaderboardLoading(true);
      const token = await AsyncStorage.getItem('@aura50_auth_token');
      // scope is applied client-side via SCOPE_LIMIT — not sent to backend
      const url = getApiUrl(`${API_ENDPOINTS.referralLeaderboard}?month=${currentMonth}`);
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Leaderboard responded ${res.status}`);
      const data: LeaderboardResponse = await res.json();
      setLeaderboard(data.leaderboard ?? []);
      setUserEntry(data.userEntry ?? null);
    } catch (error) {
      console.error('Leaderboard fetch error:', error);
      // Keep existing state so UI doesn't blank on transient errors
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // ── Avatar (unchanged API path) ───────────────────────────────────────────

  const loadCurrentUser = async () => {
    try {
      const token = await AsyncStorage.getItem('@aura50_auth_token');
      const res   = await fetch(getApiUrl(API_ENDPOINTS.user), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.profileImageUrl?.startsWith('preset:')) {
        setSelectedAvatar(data.profileImageUrl.replace('preset:', ''));
      }
    } catch (error) {
      console.error('User fetch error:', error);
    }
  };

  const selectAvatar = async (avatarId: string) => {
    setSelectedAvatar(avatarId);
    setShowAvatarPicker(false);
    try {
      setAvatarSaving(true);
      const token = await AsyncStorage.getItem('@aura50_auth_token');
      await fetch(getApiUrl(API_ENDPOINTS.userAvatar), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ avatarId }),
      });
    } catch (error) {
      console.error('Avatar save error:', error);
    } finally {
      setAvatarSaving(false);
    }
  };

  // Top 3 entries and the rest for dropdown
  const top3        = leaderboard.slice(0, 3);
  const dropdownTop = leaderboard.slice(0, SCOPE_LIMIT[activeScope]);

  // Visual order for the 3-circle row: 2nd | 1st | 3rd
  const circleOrder = [1, 0, 2]; // indices into top3

  const isUnlocked = progress.walletStatus === 'unlocked';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ paddingBottom: 36 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      {/* ── Header ── */}
      <LinearGradient
        colors={['#0A1628', '#0A3D62', '#141E28']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Community Center</Text>
            <Text style={styles.headerSubtitle}>Forging trust, together</Text>
          </View>
          <TouchableOpacity onPress={() => setShowAvatarPicker(true)} activeOpacity={0.8}>
            <AvatarCircle avatarId={selectedAvatar} username="Me" size={44} borderColor="#5DADE2" />
            {avatarSaving && (
              <ActivityIndicator size="small" color="#5DADE2" style={styles.avatarSpinner} />
            )}
          </TouchableOpacity>
        </View>

        {/* Scope tabs — each re-fetches with scope param */}
        <View style={styles.scopeTabs}>
          {SCOPES.map(scope => (
            <TouchableOpacity
              key={scope}
              style={[styles.scopeTab, activeScope === scope && styles.scopeTabActive]}
              onPress={() => setActiveScope(scope)}
              activeOpacity={0.8}
            >
              <Text style={[styles.scopeTabText, activeScope === scope && styles.scopeTabTextActive]}>
                {scope}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ── Top Forgers section ── */}
      <View ref={leaderSectionRef} style={styles.section}>

        {/* Tappable section header — opens/closes dropdown */}
        <TouchableOpacity
          style={styles.forgerHeaderRow}
          onPress={() => setForgersOpen(prev => !prev)}
          activeOpacity={0.8}
        >
          <View style={styles.forgerHeaderLeft}>
            <Ionicons name="trophy" size={16} color="#FFD700" />
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Top Forgers</Text>
            <View style={[styles.scopePill, { backgroundColor: isDark ? 'rgba(93,173,226,0.15)' : '#EFF6FF' }]}>
              <Text style={[styles.scopePillText, { color: '#5DADE2' }]}>{activeScope}</Text>
            </View>
          </View>
          <Animated.View style={{
            transform: [{
              rotate: forgersOpen ? '180deg' : '0deg',
            }],
          }}>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Animated.View>
        </TouchableOpacity>

        {/* ── 3-circle podium — always rendered ── */}
        <View style={styles.podiumArea}>
          {circleOrder.map((dataIdx, visualIdx) => {
            const entry     = top3[dataIdx];
            const isCenter  = visualIdx === 1;
            const circleD   = isCenter ? 84 : 66;
            const ring      = RANK_RING[dataIdx + 1] ?? RANK_RING[3];
            const crownAnim = crownAnims[dataIdx] ?? crownAnims[2];
            const rankLabel = ['1st', '2nd', '3rd'][dataIdx];

            return (
              <View key={`podium-${dataIdx}`} style={[styles.podiumCol, isCenter && styles.podiumColCenter]}>
                {/* Animated crown */}
                <Animated.Text
                  style={[
                    styles.crownText,
                    { fontSize: ring.crownSize, transform: [{ scale: crownAnim }] },
                  ]}
                >
                  {dataIdx === 0 ? '👑' : dataIdx === 1 ? '🎖️' : '🏅'}
                </Animated.Text>

                {/* Glow ring */}
                <View style={[
                  styles.glowRing,
                  {
                    width: circleD + 14,
                    height: circleD + 14,
                    borderRadius: (circleD + 14) / 2,
                    backgroundColor: ring.glow,
                  },
                ]}>
                  {/* Colored outline circle */}
                  <View style={[
                    styles.ringCircle,
                    {
                      width: circleD,
                      height: circleD,
                      borderRadius: circleD / 2,
                      borderColor: ring.border,
                      borderWidth: isCenter ? 3 : 2.5,
                    },
                  ]}>
                    {entry
                      ? <AvatarCircle
                          avatarId={entry.avatarId}
                          username={entry.username}
                          size={circleD - (isCenter ? 10 : 8)}
                          tappable={entry.isCurrentUser}
                          onPress={entry.isCurrentUser ? openAvatarPicker : undefined}
                        />
                      : (
                        /* Placeholder when no data yet */
                        <View style={[
                          styles.emptyCirclePlaceholder,
                          { width: circleD - (isCenter ? 10 : 8), height: circleD - (isCenter ? 10 : 8), borderRadius: circleD }
                        ]}>
                          <Ionicons name="person-outline" size={isCenter ? 26 : 20} color={ring.border} style={{ opacity: 0.4 }} />
                        </View>
                      )
                    }
                  </View>
                </View>

                <Text
                  style={[styles.podiumName, { color: entry ? colors.textPrimary : colors.textMuted, fontSize: isCenter ? 13 : 11 }]}
                  numberOfLines={1}
                >
                  {entry ? `${entry.username}${entry.isCurrentUser ? ' (You)' : ''}` : '—'}
                </Text>
                <Text style={[styles.podiumRefs, { color: colors.textMuted }]}>
                  {entry ? `${entry.verifiedReferrals} ref${entry.verifiedReferrals !== 1 ? 's' : ''}` : 'no entries yet'}
                </Text>

                {/* Rank pill */}
                <View style={[styles.rankPill, { borderColor: ring.border }]}>
                  <Text style={[styles.rankPillText, { color: ring.border }]}>{rankLabel}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Loading spinner overlay under podium */}
        {leaderboardLoading && (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color="#5DADE2" />
          </View>
        )}

        {/* ── User ribbon — shown whenever userEntry exists ── */}
        {userEntry && (
          <LinearGradient
            colors={isDark ? ['#0A2744', '#0E3660'] : ['#EFF6FF', '#DBEAFE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ribbon}
          >
            <View style={styles.ribbonLeft}>
              <View style={styles.ribbonDiamond}>
                <Text style={styles.ribbonDiamondText}>{userEntry.rank}</Text>
              </View>
              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.ribbonLabel, { color: isDark ? 'rgba(255,255,255,0.55)' : '#6B7280' }]}>
                  Your Position
                </Text>
                <Text style={[styles.ribbonValue, { color: isDark ? '#FFFFFF' : '#1F2937' }]}>
                  Rank #{userEntry.rank} · {userEntry.verifiedReferrals} verified referral{userEntry.verifiedReferrals !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <Ionicons name="ribbon-outline" size={22} color="#5DADE2" />
          </LinearGradient>
        )}

        {/* ── Dropdown: top N list ── */}
        {forgersOpen && !leaderboardLoading && (
          leaderboard.length === 0 ? (
            <ThemedCard style={[styles.emptyCard, { borderColor: colors.cardBorder }]} padding={32}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No referrals recorded this month yet.{'\n'}Share your invite code to climb!
              </Text>
            </ThemedCard>
          ) : (
            <ThemedCard style={[styles.dropdownList, { borderColor: colors.cardBorder }]} padding={0}>
              {dropdownTop.map((entry, idx) => (
                <LeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  idx={idx}
                  isLast={idx === dropdownTop.length - 1}
                  isDark={isDark}
                  colors={colors}
                  onAvatarPress={openAvatarPicker}
                />
              ))}
            </ThemedCard>
          )
        )}
      </View>

      {/* ── Security Circle section ── */}
      <View style={styles.section} onLayout={e => { inviteSectionY.current = e.nativeEvent.layout.y; }}>
        <View style={styles.sectionLabelRow}>
          <Ionicons name="shield-checkmark" size={16} color="#5DADE2" />
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Security Circle</Text>
          <TouchableOpacity onPress={openInviteInstructions} style={{ marginLeft: 6 }}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Lock dial + stats */}
        <ThemedCard style={[styles.circleCard, { borderColor: colors.cardBorder }]} padding={20}>
          <View style={styles.dialWrapper}>
            <View style={[styles.dialOuter, {
              borderColor: isDark ? 'rgba(93,173,226,0.18)' : '#E5E7EB',
            }]}>
              <View style={[styles.dialInner, {
                borderColor: isUnlocked ? '#10B981' : '#5DADE2',
                backgroundColor: isUnlocked ? 'rgba(16,185,129,0.08)' : 'rgba(93,173,226,0.08)',
              }]}>
                <Ionicons
                  name={isUnlocked ? 'checkmark-circle' : 'lock-closed'}
                  size={28}
                  color={isUnlocked ? '#10B981' : '#5DADE2'}
                />
                <Text style={[styles.dialStatus, { color: isUnlocked ? '#10B981' : '#5DADE2' }]}>
                  {isUnlocked ? 'OPEN' : 'LOCKED'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.circleStats}>
            {[
              { label: 'Invited',    value: progress.invited,    icon: 'person-add-outline'      as const, done: progress.invited    >= 3 },
              { label: 'Registered', value: progress.registered, icon: 'checkmark-circle-outline' as const, done: progress.registered >= 3 },
              { label: 'Mining',     value: progress.active,     icon: 'flash-outline'            as const, done: progress.active     >= 3 },
            ].map((step, idx, arr) => (
              <React.Fragment key={step.label}>
                <View style={styles.circleStatCol}>
                  <View style={[styles.circleStatDot, {
                    backgroundColor: step.done ? 'rgba(16,185,129,0.15)' : (isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'),
                    borderColor:     step.done ? '#10B981' : (isDark ? 'rgba(255,255,255,0.15)' : '#E5E7EB'),
                  }]}>
                    <Ionicons name={step.icon} size={16} color={step.done ? '#10B981' : colors.textMuted} />
                  </View>
                  <Text style={[styles.circleStatValue, { color: step.done ? '#10B981' : colors.textPrimary }]}>
                    {step.value}/3
                  </Text>
                  <Text style={[styles.circleStatLabel, { color: colors.textMuted }]}>{step.label}</Text>
                </View>
                {idx < arr.length - 1 && (
                  <View style={[styles.connector, {
                    backgroundColor: step.done ? '#10B981' : (isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB'),
                  }]} />
                )}
              </React.Fragment>
            ))}
          </View>

          <Text style={[styles.requirementsText, { color: colors.textMuted }]}>
            {progress.requirements}
          </Text>
        </ThemedCard>

        {/* Existing invite links */}
        {inviteLinks.length > 0 && (
          <ThemedCard style={[styles.inviteLinksCard, { borderColor: colors.cardBorder }]} padding={14}>
            <Text style={[styles.inviteLinksTitle, { color: colors.textPrimary }]}>Your Invite Codes</Text>
            {inviteLinks.map((invite, idx) => (
              <View
                key={idx}
                style={[styles.inviteRow, {
                  borderBottomColor: colors.cardBorder,
                  borderBottomWidth: idx < inviteLinks.length - 1 ? 1 : 0,
                }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inviteCode, { color: colors.textPrimary }]}>{invite.inviteCode}</Text>
                  <Text style={[styles.inviteDate, { color: colors.textMuted }]}>
                    {new Date(invite.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.inviteActions}>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: colors.pillBg }]}
                    onPress={() => copyInviteLink(invite.inviteCode)}
                  >
                    <Ionicons name="copy-outline" size={15} color="#5DADE2" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: colors.pillBg }]}
                    onPress={() => shareInviteLink(invite.inviteCode)}
                  >
                    <Ionicons name="share-outline" size={15} color="#5DADE2" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: colors.pillBg }]}
                    onPress={() => setShowQRCode(invite.inviteCode)}
                  >
                    <Ionicons name="qr-code-outline" size={15} color="#5DADE2" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ThemedCard>
        )}

        {/* Circle members */}
        {members.length > 0 && (
          <ThemedCard style={[styles.membersCard, { borderColor: colors.cardBorder }]} padding={14}>
            <Text style={[styles.membersTitle, { color: colors.textPrimary }]}>Circle Members</Text>
            {members.map((member, idx) => (
              <View
                key={idx}
                style={[styles.memberRow, {
                  borderBottomColor: colors.cardBorder,
                  borderBottomWidth: idx < members.length - 1 ? 1 : 0,
                }]}
              >
                <Ionicons
                  name={member.isActive ? 'checkmark-circle' : 'time-outline'}
                  size={18}
                  color={member.isActive ? '#10B981' : '#F59E0B'}
                />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                    {member.username || `Member ${idx + 1}`}
                  </Text>
                  <Text style={[styles.memberStatus, { color: colors.textMuted }]}>
                    {member.isActive ? 'Active miner' : 'Waiting to mine'}
                  </Text>
                </View>
                <Text style={[styles.memberDate, { color: colors.textMuted }]}>
                  {new Date(member.invitedAt).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </ThemedCard>
        )}

        {/* Stake requirement hint — shown when user has no invite yet */}
        {inviteLinks.length === 0 && progress.invited < 3 && (
          <View style={[styles.stakeHint, {
            backgroundColor: userBalance >= 10
              ? (isDark ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.08)')
              : (isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)'),
            borderColor: userBalance >= 10 ? '#10B981' : '#EF4444',
          }]}>
            <Ionicons
              name={userBalance >= 10 ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={15}
              color={userBalance >= 10 ? '#10B981' : '#EF4444'}
            />
            <Text style={[styles.stakeHintText, { color: userBalance >= 10 ? '#10B981' : '#EF4444' }]}>
              {userBalance >= 10
                ? `Ready to invite · ${userBalance.toFixed(2)} A50 available (10 A50 will be staked)`
                : `Need 10 A50 coins to stake for invite. Current balance: ${userBalance.toFixed(2)} A50`}
            </Text>
          </View>
        )}

        {/* Generate / Share Invite button */}
        {progress.invited < 3 && (
          <TouchableOpacity
            style={styles.generateBtn}
            onPress={() =>
              inviteLinks.length > 0
                ? shareInviteLink(inviteLinks[0].inviteCode)
                : handleGenerateInvite()
            }
            disabled={isGeneratingInvite}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#2E86C1', '#5DADE2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.generateBtnGradient}
            >
              <Ionicons name="link-outline" size={20} color="white" />
              <Text style={styles.generateBtnText}>
                {isGeneratingInvite
                  ? 'Generating...'
                  : inviteLinks.length > 0
                    ? 'Share Invite Code'
                    : 'Generate Invite Link'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Security note */}
        <View style={[styles.securityNote, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
          borderColor: colors.cardBorder,
        }]}>
          <Ionicons name="shield-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.securityNoteText, { color: colors.textMuted }]}>
            Security Circles prevent fake accounts — only real people can join the AURA50 network.
          </Text>
        </View>
      </View>

      {/* ── QR Modal ── */}
      <Modal
        visible={!!showQRCode}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQRCode(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.qrSheet, { backgroundColor: isDark ? '#1C2833' : 'white' }]}>
            <Text style={[styles.qrTitle, { color: isDark ? '#FFFFFF' : '#1F2937' }]}>Share QR Code</Text>
            <View style={styles.qrBox}>
              {showQRCode && (
                <QRCode value={showQRCode} size={190} backgroundColor="white" color="#1F2937" />
              )}
            </View>
            <Text style={[styles.qrCode, { color: colors.textMuted }]}>Code: {showQRCode}</Text>
            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setShowQRCode(null)}>
              <Text style={styles.qrCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Avatar Picker Modal ── */}
      <Modal
        visible={showAvatarPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAvatarPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAvatarPicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.avatarSheet, { backgroundColor: isDark ? '#1C2833' : 'white' }]}>
                <View style={[styles.sheetHandle, { backgroundColor: isDark ? '#2C3E50' : '#D1D5DB' }]} />
                <Text style={[styles.avatarSheetTitle, { color: isDark ? '#FFFFFF' : '#1F2937' }]}>Choose Avatar</Text>
                <Text style={[styles.avatarSheetSub, { color: colors.textMuted }]}>Tap to set your profile look</Text>
                <View style={styles.avatarGrid}>
                  {PRESET_AVATARS.map(av => (
                    <TouchableOpacity
                      key={av.id}
                      style={[
                        styles.avatarItem,
                        { backgroundColor: av.bg },
                        selectedAvatar === av.id && styles.avatarItemSelected,
                      ]}
                      onPress={() => selectAvatar(av.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.avatarEmoji}>{av.emoji}</Text>
                      {selectedAvatar === av.id && (
                        <View style={styles.avatarCheck}>
                          <Ionicons name="checkmark" size={10} color="white" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.avatarCancel, { backgroundColor: isDark ? '#2C3E50' : '#F3F4F6' }]}
                  onPress={() => setShowAvatarPicker(false)}
                >
                  <Text style={[styles.avatarCancelText, { color: isDark ? '#FFFFFF' : '#374151' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ScrollView>

    {/* ── Step 8: Leaders section highlight ── */}
    <Modal visible={leaderHintReady} transparent animationType="fade" statusBarTranslucent>
      <TouchableOpacity style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' }]} onPress={dismissLeaderHint} activeOpacity={1}>
        {/* Re-render the Top Forgers header at its position */}
        <TouchableOpacity
          style={{
            position: 'absolute',
            top: (leaderSectionTop > 0 ? leaderSectionTop : 200) + 12,
            left: 16, right: 16,
            backgroundColor: 'rgba(20,30,45,0.96)',
            borderRadius: 14, borderWidth: 1,
            borderColor: 'rgba(255,215,0,0.3)',
            paddingHorizontal: 16, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            elevation: 24,
          }}
          onPress={dismissLeaderHint}
          activeOpacity={0.9}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="trophy" size={18} color="#FFD700" />
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Top Forgers</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
        {/* Hint badge */}
        <Animated.View pointerEvents="none" style={{
          position: 'absolute',
          top: (leaderSectionTop > 0 ? leaderSectionTop : 200) + 74,
          left: 24, right: 24, alignItems: 'center',
          transform: [{ translateY: lBounce }],
        }}>
          <View style={{
            backgroundColor: 'rgba(15,15,15,0.78)', borderRadius: 20,
            paddingHorizontal: 14, paddingVertical: 9,
            flexDirection: 'row', alignItems: 'center', gap: 7,
            borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)',
          }}>
            <Ionicons name="star-outline" size={14} color="rgba(255,215,0,0.85)" />
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontWeight: '500', fontSize: 13 }}>
              Top the Board to Earn exciting Rewards
            </Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    marginTop: 2,
  },
  avatarSpinner: {
    position: 'absolute',
    bottom: -4,
    right: -4,
  },

  // ── Scope tabs ───────────────────────────────────────────────────────────────
  scopeTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 3,
  },
  scopeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  scopeTabActive: {
    backgroundColor: '#5DADE2',
  },
  scopeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
  },
  scopeTabTextActive: {
    color: '#FFFFFF',
  },

  // ── Section wrapper ──────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginLeft: 6,
  },

  // ── Forgers header (tappable) ────────────────────────────────────────────────
  forgerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingVertical: 2,
  },
  forgerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scopePill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  scopePillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Empty state ──────────────────────────────────────────────────────────────
  centered: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyCard: {
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },

  // ── 3-circle podium ──────────────────────────────────────────────────────────
  podiumArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 8,
  },
  podiumColCenter: {
    paddingBottom: 0,
    // center column is taller — achieved by not adding bottom padding
  },
  crownText: {
    marginBottom: 5,
  },
  glowRing: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  ringCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  podiumName: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  podiumRefs: {
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 6,
  },
  rankPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rankPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  emptyCirclePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  // ── User ribbon ──────────────────────────────────────────────────────────────
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  ribbonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ribbonDiamond: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#5DADE2',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  ribbonDiamondText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13,
    transform: [{ rotate: '-45deg' }],
  },
  ribbonLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ribbonValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },

  // ── Dropdown list ────────────────────────────────────────────────────────────
  dropdownList: {
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  dropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  dropRankBadge: {
    width: 38,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  dropRankText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dropName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  dropRefs: {
    fontSize: 11,
    marginRight: 6,
  },
  prizePill: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  prizePillText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
  },

  // ── Avatar circle ────────────────────────────────────────────────────────────
  avatarCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#5DADE2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },

  // ── Circle card ──────────────────────────────────────────────────────────────
  circleCard: {
    borderWidth: 1,
    marginBottom: 12,
  },
  dialWrapper: {
    alignItems: 'center',
    marginBottom: 20,
  },
  dialOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialStatus: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  circleStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  circleStatCol: {
    alignItems: 'center',
    width: 80,
  },
  connector: {
    flex: 1,
    height: 2,
    maxWidth: 24,
    marginBottom: 24,
  },
  circleStatDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  circleStatValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  circleStatLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  requirementsText: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // ── Invite links ─────────────────────────────────────────────────────────────
  inviteLinksCard: {
    borderWidth: 1,
    marginBottom: 12,
  },
  inviteLinksTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  inviteCode: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  inviteDate: {
    fontSize: 10,
    marginTop: 2,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Members ──────────────────────────────────────────────────────────────────
  membersCard: {
    borderWidth: 1,
    marginBottom: 12,
  },
  membersTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '600',
  },
  memberStatus: {
    fontSize: 11,
    marginTop: 1,
  },
  memberDate: {
    fontSize: 10,
  },

  // ── Stake hint ───────────────────────────────────────────────────────────────
  stakeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    gap: 8,
  },
  stakeHintText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  // ── Generate button ──────────────────────────────────────────────────────────
  generateBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  generateBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  generateBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // ── Security note ────────────────────────────────────────────────────────────
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  securityNoteText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },

  // ── Shared modal ─────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },

  // ── QR ───────────────────────────────────────────────────────────────────────
  qrSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  qrBox: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
  },
  qrCode: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 20,
  },
  qrCloseBtn: {
    backgroundColor: '#5DADE2',
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 12,
  },
  qrCloseBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },

  // ── Avatar sheet ─────────────────────────────────────────────────────────────
  avatarSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 36,
    paddingTop: 14,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  avatarSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  avatarSheetSub: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  avatarItem: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarItemSelected: {
    borderWidth: 3,
    borderColor: '#5DADE2',
  },
  avatarEmoji: { fontSize: 30 },
  avatarCheck: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#5DADE2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },
  avatarCancel: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  avatarCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default LeaderboardScreen;
