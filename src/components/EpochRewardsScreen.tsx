import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import config from '../config/environment';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EpochEntry {
  epochId: number;
  status: 'pending' | 'finalized' | 'not_found';
  totalReward: string;
  participantCount: number;
  challengeWindowEnd: number | null;
}

interface PendingRewardsData {
  currentEpoch: {
    id: number;
    endsAt: number;
    msRemaining: number;
    epochReward: string;
    status: string;
  };
  claimableBalance: string;
  recentEpochs: EpochEntry[];
}

// ── Countdown component ───────────────────────────────────────────────────────

const Countdown = ({ endsAt }: { endsAt: number }) => {
  const [ms, setMs] = useState(Math.max(0, endsAt - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = Math.max(0, endsAt - Date.now());
      setMs(remaining);
      if (remaining === 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return (
    <Text style={styles.countdown}>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </Text>
  );
};

// ── Challenge window countdown ────────────────────────────────────────────────

const ChallengeCountdown = ({ windowEnd }: { windowEnd: number }) => {
  const [ms, setMs] = useState(Math.max(0, windowEnd - Date.now()));
  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, windowEnd - Date.now());
      setMs(r);
      if (r === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [windowEnd]);
  if (ms <= 0) return <Text style={styles.challengeLabel}>Finalizing…</Text>;
  const mins = Math.ceil(ms / 60000);
  return <Text style={styles.challengeLabel}>{mins}m challenge window</Text>;
};

// ── Main screen ───────────────────────────────────────────────────────────────

interface Props {
  navigation: any;
}

export const EpochRewardsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [data, setData]         = useState<PendingRewardsData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const token = await AsyncStorage.getItem('@aura50_auth_token');
      if (!token) { setError('Not authenticated'); return; }

      const res = await fetch(`${config.baseUrl}/api/mining/pending-rewards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PendingRewardsData = await res.json();
      if (mountedRef.current) setData(json);
    } catch (e: any) {
      if (mountedRef.current) setError('Could not load rewards data');
    } finally {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    // Refresh every 30 s to keep epoch countdown in sync
    const id = setInterval(() => fetchData(true), 30_000);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [fetchData]);

  const handleRefresh = () => { setRefreshing(true); fetchData(true); };

  const epochRewardDisplay = data
    ? parseFloat(data.currentEpoch.epochReward).toFixed(2)
    : '—';

  const claimableDisplay = data
    ? parseFloat(data.claimableBalance).toFixed(4)
    : '—';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={isDark ? ['#141E28', '#1C2833', '#17202A'] : ['#F0F4F8', '#E8EEF4', '#FFFFFF']}
      style={styles.fill}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Epoch Rewards</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.loadingWrap}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
          <TouchableOpacity onPress={() => fetchData()} style={[styles.retryBtn, { borderColor: colors.accent }]}>
            <Text style={[styles.retryBtnText, { color: colors.accent }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Dual-unit cards ── */}
          <View style={styles.dualRow}>

            {/* PENDING card */}
            <View style={[styles.dualCard, {
              backgroundColor: isDark ? 'rgba(93,173,226,0.08)' : 'rgba(52,152,219,0.07)',
              borderColor: 'rgba(93,173,226,0.25)',
            }]}>
              <View style={styles.cardBadgeRow}>
                <View style={[styles.badge, { backgroundColor: 'rgba(93,173,226,0.18)' }]}>
                  <Ionicons name="time-outline" size={11} color="#5DADE2" />
                  <Text style={[styles.badgeText, { color: '#5DADE2' }]}>PENDING</Text>
                </View>
              </View>

              <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Current Epoch</Text>
              <Text style={[styles.epochId, { color: colors.textSecondary }]}>
                #{data?.currentEpoch.id ?? '—'}
              </Text>

              <Text style={[styles.cardLabel, { color: colors.textMuted, marginTop: 12 }]}>Total Pool</Text>
              <Text style={[styles.rewardAmount, { color: colors.accent }]}>
                {epochRewardDisplay} <Text style={styles.unit}>A50</Text>
              </Text>

              <Text style={[styles.cardLabel, { color: colors.textMuted, marginTop: 12 }]}>Closes in</Text>
              {data ? <Countdown endsAt={data.currentEpoch.endsAt} /> : <Text style={styles.countdown}>—:——</Text>}

              <Text style={[styles.pendingNote, { color: colors.textMuted }]}>
                Mining → your share credited after the 1h challenge window
              </Text>
            </View>

            {/* CLAIMABLE card */}
            <View style={[styles.dualCard, {
              backgroundColor: isDark ? 'rgba(39,174,96,0.08)' : 'rgba(39,174,96,0.07)',
              borderColor: 'rgba(39,174,96,0.25)',
            }]}>
              <View style={styles.cardBadgeRow}>
                <View style={[styles.badge, { backgroundColor: 'rgba(39,174,96,0.18)' }]}>
                  <Ionicons name="checkmark-circle-outline" size={11} color="#27AE60" />
                  <Text style={[styles.badgeText, { color: '#27AE60' }]}>CLAIMABLE</Text>
                </View>
              </View>

              <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Settled Balance</Text>
              <Text style={[styles.claimableAmount, { color: '#27AE60' }]}>
                {claimableDisplay}
              </Text>
              <Text style={[styles.unit, { color: colors.textMuted, marginTop: 2 }]}>A50</Text>

              <Text style={[styles.pendingNote, { color: colors.textMuted, marginTop: 16 }]}>
                Auto-credited after each epoch finalizes. Already yours.
              </Text>
            </View>

          </View>

          {/* ── How it works ── */}
          <View style={[styles.infoCard, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
          }]}>
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>How it works</Text>
            {[
              ['flash-outline',          '#5DADE2', 'Mine', 'Submit shares during the 2-min epoch window.'],
              ['hourglass-outline',      '#F39C12', 'Wait', '1-hour challenge window to detect fraud.'],
              ['checkmark-done-outline', '#27AE60', 'Earn', 'A50 auto-credited to your balance.'],
            ].map(([icon, color, title, desc]) => (
              <View key={title as string} style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: `${color}22` }]}>
                  <Ionicons name={icon as any} size={16} color={color as string} />
                </View>
                <View style={styles.infoText}>
                  <Text style={[styles.infoStep, { color: colors.textPrimary }]}>{title as string}</Text>
                  <Text style={[styles.infoDesc, { color: colors.textMuted }]}>{desc as string}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Recent epochs ── */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Recent Epochs</Text>

          {data?.recentEpochs.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No recent epochs yet</Text>
          ) : (
            data?.recentEpochs.map((epoch) => (
              <EpochRow key={epoch.epochId} epoch={epoch} colors={colors} isDark={isDark} />
            ))
          )}

        </ScrollView>
      )}
    </LinearGradient>
  );
};

// ── Epoch row ─────────────────────────────────────────────────────────────────

const EpochRow = ({
  epoch,
  colors,
  isDark,
}: {
  epoch: EpochEntry;
  colors: any;
  isDark: boolean;
}) => {
  const isFinalized  = epoch.status === 'finalized';
  const isPending    = epoch.status === 'pending';
  const statusColor  = isFinalized ? '#27AE60' : isPending ? '#F39C12' : colors.textMuted;
  const statusLabel  = isFinalized ? 'Finalized' : isPending ? 'Challenge' : 'Not found';
  const statusIcon   = isFinalized ? 'checkmark-circle' : isPending ? 'hourglass' : 'remove-circle-outline';

  return (
    <View style={[styles.epochRow, {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
      borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
    }]}>
      <View style={styles.epochRowLeft}>
        <Text style={[styles.epochRowId, { color: colors.textPrimary }]}>#{epoch.epochId}</Text>
        {isPending && epoch.challengeWindowEnd ? (
          <ChallengeCountdown windowEnd={epoch.challengeWindowEnd} />
        ) : (
          <Text style={[styles.epochRowParticipants, { color: colors.textMuted }]}>
            {epoch.participantCount} miner{epoch.participantCount !== 1 ? 's' : ''}
          </Text>
        )}
      </View>
      <View style={styles.epochRowRight}>
        <Text style={[styles.epochRowReward, { color: colors.accent }]}>
          {parseFloat(epoch.totalReward || '0').toFixed(2)} A50
        </Text>
        <View style={styles.epochStatusRow}>
          <Ionicons name={statusIcon as any} size={12} color={statusColor} />
          <Text style={[styles.epochStatusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 36, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  errorText:   { fontSize: 14, textAlign: 'center' },
  retryBtn:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, marginTop: 4 },
  retryBtnText:{ fontSize: 14, fontWeight: '600' },

  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  // ── Dual cards ──
  dualRow:  { flexDirection: 'row', gap: 10, marginBottom: 14 },
  dualCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  cardBadgeRow: { marginBottom: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },

  cardLabel:    { fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  epochId:      { fontSize: 14, fontWeight: '700' },
  rewardAmount: { fontSize: 20, fontWeight: '800' },
  claimableAmount: { fontSize: 28, fontWeight: '800', color: '#27AE60' },
  unit:         { fontSize: 11, fontWeight: '600', opacity: 0.7 },
  countdown:    { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], color: '#5DADE2' },
  pendingNote:  { fontSize: 10, lineHeight: 15, marginTop: 8 },

  // ── How it works ──
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  infoRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoText:  { flex: 1, gap: 2 },
  infoStep:  { fontSize: 13, fontWeight: '700' },
  infoDesc:  { fontSize: 11, lineHeight: 16 },

  // ── Section title ──
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  emptyText:    { fontSize: 13, textAlign: 'center', paddingVertical: 20 },

  // ── Epoch row ──
  epochRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  epochRowLeft:         { gap: 3 },
  epochRowId:           { fontSize: 14, fontWeight: '700' },
  epochRowParticipants: { fontSize: 11 },
  challengeLabel:       { fontSize: 11, color: '#F39C12', fontWeight: '600' },
  epochRowRight:        { alignItems: 'flex-end', gap: 4 },
  epochRowReward:       { fontSize: 14, fontWeight: '700' },
  epochStatusRow:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  epochStatusText:      { fontSize: 11, fontWeight: '600' },
});
