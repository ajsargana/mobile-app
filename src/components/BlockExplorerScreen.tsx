import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Line, Text as SvgText, Circle } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import BlockExplorerService, { NetworkStats, Block } from '../services/BlockExplorerService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
const CHART_HEIGHT = 80;
const CHART_PAD = { left: 4, right: 4, top: 8, bottom: 8 };

interface ChartData {
  blockTimes: Array<{ height: number; time: number }>;
  transactionVolume: Array<{ date: string; count: number; volume: number }>;
  difficultyTrend: Array<{ height: number; difficulty: number; timestamp: string }>;
}

interface BlockExplorerScreenProps {
  navigation: any;
}

// ─── Sparkline chart (block times or difficulty) ─────────────────────────────
const Sparkline: React.FC<{
  data: number[];
  color: string;
  label: string;
  unit?: string;
  accentColor: string;
  textColor: string;
}> = ({ data, color, label, unit = '', accentColor, textColor }) => {
  if (!data || data.length < 2) return null;

  const valid = data.filter(v => v > 0);
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;

  const innerW = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
  const step = innerW / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = CHART_PAD.left + i * step;
      const y = CHART_PAD.top + innerH - ((v - min) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Last point for dot
  const lastIdx = data.length - 1;
  const lastX = CHART_PAD.left + lastIdx * step;
  const lastY = CHART_PAD.top + innerH - ((data[lastIdx] - min) / range) * innerH;

  const latestValue = data[lastIdx];
  const avgValue = valid.reduce((a, b) => a + b, 0) / valid.length;

  return (
    <View style={{ marginTop: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: textColor, fontWeight: '500' }}>{label}</Text>
        <Text style={{ fontSize: 12, color: accentColor, fontWeight: '700' }}>
          {latestValue.toFixed(1)}{unit}
          <Text style={{ color: textColor, fontWeight: '400' }}>
            {' '}avg {avgValue.toFixed(1)}{unit}
          </Text>
        </Text>
      </View>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT} style={{ borderRadius: 8 }}>
        {/* Grid line */}
        <Line
          x1={CHART_PAD.left}
          y1={CHART_PAD.top + innerH / 2}
          x2={CHART_PAD.left + innerW}
          y2={CHART_PAD.top + innerH / 2}
          stroke="rgba(128,128,128,0.15)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <Polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={lastX} cy={lastY} r="4" fill={color} />
        <Circle cx={lastX} cy={lastY} r="7" fill={color} fillOpacity={0.2} />
      </Svg>
    </View>
  );
};

// ─── Bar chart for tx volume ──────────────────────────────────────────────────
const TxVolumeChart: React.FC<{
  data: Array<{ date: string; count: number }>;
  accentColor: string;
  textColor: string;
  mutedColor: string;
}> = ({ data, accentColor, textColor, mutedColor }) => {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map(d => d.count), 1);
  const innerW = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
  const barW = Math.max(4, (innerW / data.length) - 4);

  return (
    <View style={{ marginTop: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: textColor, fontWeight: '500' }}>TX Volume (7d)</Text>
        <Text style={{ fontSize: 12, color: accentColor, fontWeight: '700' }}>
          {data.reduce((s, d) => s + d.count, 0)} txs
        </Text>
      </View>
      <View style={{ height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        {data.map((d, i) => {
          const h = Math.max(4, (d.count / max) * (CHART_HEIGHT - 20));
          const isLast = i === data.length - 1;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <View
                style={{
                  width: '80%',
                  height: h,
                  backgroundColor: isLast ? accentColor : `${accentColor}66`,
                  borderRadius: 3,
                }}
              />
              <Text style={{ fontSize: 8, color: mutedColor, marginTop: 2 }}>
                {d.date.slice(5)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ─── Formatted hash rate ──────────────────────────────────────────────────────
function formatHashRate(h: number): string {
  if (h >= 1e12) return (h / 1e12).toFixed(2) + ' TH/s';
  if (h >= 1e9) return (h / 1e9).toFixed(2) + ' GH/s';
  if (h >= 1e6) return (h / 1e6).toFixed(2) + ' MH/s';
  if (h >= 1e3) return (h / 1e3).toFixed(2) + ' KH/s';
  return h.toFixed(0) + ' H/s';
}

function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.floor(m / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export const BlockExplorerScreen: React.FC<BlockExplorerScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [recentBlocks, setRecentBlocks] = useState<Block[]>([]);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newBlockBanner, setNewBlockBanner] = useState(false);

  const bannerAnim = useRef(new Animated.Value(0)).current;
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blocksIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topBlockHeightRef = useRef<number>(0);
  const explorer = BlockExplorerService.getInstance();

  // ── Load all data ─────────────────────────────────────────────────────────
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsData, blocksData, charts] = await Promise.allSettled([
        explorer.getNetworkStats(),
        explorer.getBlocks(10, 0),
        explorer.getChartData(),
      ]);

      if (statsData.status === 'fulfilled' && statsData.value) {
        setStats(statsData.value);
        await explorer.cacheNetworkStats(statsData.value);
      }

      if (blocksData.status === 'fulfilled' && blocksData.value?.items) {
        const newBlocks = blocksData.value.items;
        setRecentBlocks(newBlocks);
        if (newBlocks.length > 0) {
          topBlockHeightRef.current = newBlocks[0].height;
        }
      }

      if (charts.status === 'fulfilled' && charts.value) {
        setChartData(charts.value as ChartData);
      }
    } catch (e) {
      // load cached stats as fallback
      const cached = await explorer.getCachedNetworkStats();
      if (cached) setStats(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Poll stats every 10 s ─────────────────────────────────────────────────
  const pollStats = useCallback(async () => {
    try {
      const s = await explorer.getNetworkStats();
      setStats(s);
    } catch { /* keep last known */ }
  }, []);

  // ── Poll blocks every 5 s, show banner on new block ───────────────────────
  const pollBlocks = useCallback(async () => {
    try {
      const result = await explorer.getBlocks(10, 0);
      if (!result?.items?.length) return;
      const topHeight = result.items[0].height;
      if (topHeight > topBlockHeightRef.current && topBlockHeightRef.current > 0) {
        // New block detected
        topBlockHeightRef.current = topHeight;
        setRecentBlocks(result.items);
        showNewBlockBanner();
      } else if (topBlockHeightRef.current === 0) {
        topBlockHeightRef.current = topHeight;
        setRecentBlocks(result.items);
      }
    } catch { /* keep last known */ }
  }, []);

  const showNewBlockBanner = () => {
    setNewBlockBanner(true);
    Animated.sequence([
      Animated.timing(bannerAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(bannerAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setNewBlockBanner(false));
  };

  useEffect(() => {
    loadData();

    statsIntervalRef.current = setInterval(pollStats, 10_000);
    blocksIntervalRef.current = setInterval(pollBlocks, 5_000);

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      if (blocksIntervalRef.current) clearInterval(blocksIntervalRef.current);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  // ── Stat card ─────────────────────────────────────────────────────────────
  const StatCard = ({ label, value, icon }: { label: string; value: string | number; icon: string }) => (
    <View style={[s.statCard, { backgroundColor: isDark ? 'rgba(93,173,226,0.1)' : '#EEF2FF' }]}>
      <Ionicons name={icon as any} size={18} color={colors.accent} style={{ marginBottom: 4 }} />
      <Text style={[s.statValue, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
      <Text style={[s.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );

  // ── Block row ─────────────────────────────────────────────────────────────
  const BlockItem = ({ block, isFirst }: { block: Block; isFirst: boolean }) => {
    const reward = block.totalReward === '0' ? 'Pending' : `+${block.totalReward}`;
    const txCount = block.transactionCount ?? 0;
    const ptCount = block.participantCount ?? 0;

    return (
      <TouchableOpacity
        style={[
          s.blockItem,
          { borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' },
          isFirst && { borderTopWidth: 0 },
        ]}
        onPress={() => navigation.navigate('BlockDetail', { blockId: block.id })}
        activeOpacity={0.7}
      >
        <View style={[s.blockIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EEF2FF' }]}>
          <Ionicons name="cube" size={15} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.blockHeight, { color: colors.textPrimary }]}>Block #{block.height}</Text>
          <Text style={[s.blockTime, { color: colors.textMuted }]}>{timeAgo(block.timestamp)}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
            {txCount > 0 && (
              <View style={[s.pill, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6' }]}>
                <Ionicons name="swap-horizontal" size={10} color={colors.textMuted} />
                <Text style={[s.pillText, { color: colors.textMuted }]}>{txCount} tx</Text>
              </View>
            )}
            {ptCount > 0 && (
              <View style={[s.pill, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6' }]}>
                <Ionicons name="people" size={10} color={colors.textMuted} />
                <Text style={[s.pillText, { color: colors.textMuted }]}>{ptCount}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={[s.blockReward, { color: colors.accent }]}>{reward}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  const s = makeStyles(colors, isDark);

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[s.loadingText, { color: colors.textMuted }]}>Loading explorer…</Text>
      </View>
    );
  }

  const blockTimesData = chartData?.blockTimes?.map(b => b.time).filter(t => t > 0) ?? [];
  const difficultyData = chartData?.difficultyTrend?.map(b => b.difficulty) ?? [];
  const txVolumeData = chartData?.transactionVolume ?? [];

  const bannerTranslateY = bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-48, 0] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* New block banner */}
      {newBlockBanner && (
        <Animated.View
          style={[
            s.newBlockBanner,
            { transform: [{ translateY: bannerTranslateY }], top: insets.top },
          ]}
        >
          <Ionicons name="cube" size={14} color="#fff" />
          <Text style={s.newBlockBannerText}>New block mined</Text>
        </Animated.View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={[s.title, { color: colors.textPrimary }]}>Block Explorer</Text>
          <TouchableOpacity style={s.searchBtn} onPress={() => navigation.navigate('ExplorerSearch')}>
            <Ionicons name="search" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Live indicator */}
        <View style={s.liveRow}>
          <View style={s.liveDot} />
          <Text style={[s.liveText, { color: colors.textMuted }]}>Live · updates every 5s</Text>
        </View>

        {/* ── Stats grid ─────────────────────────────────────────────────── */}
        {stats && (
          <ThemedCard style={s.section} padding={16}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Network</Text>
            <View style={s.statsGrid}>
              <StatCard label="Block Height" value={stats.network.blockHeight.toLocaleString()} icon="layers" />
              <StatCard label="Avg Block Time" value={`${stats.network.avgBlockTime.toFixed(0)}s`} icon="timer" />
              <StatCard label="Peers" value={stats.network.peerCount} icon="wifi" />
              <StatCard label="Hash Rate" value={formatHashRate(stats.network.hashRate)} icon="flash" />
              <StatCard label="Difficulty" value={formatNumber(stats.network.difficulty)} icon="barbell" />
              <StatCard label="Active Users" value={stats.blockchain.totalUsers} icon="people" />
              <StatCard label="Total Blocks" value={formatNumber(stats.blockchain.totalBlocks)} icon="cube" />
              <StatCard label="Total TXs" value={formatNumber(stats.blockchain.totalTransactions)} icon="swap-horizontal" />
            </View>

            <View style={[s.divider, { backgroundColor: colors.cardBorder }]} />

            {/* Economics */}
            <Text style={[s.sectionTitle, { color: colors.textPrimary, marginBottom: 10 }]}>Economics</Text>
            <View style={[s.econCard, { backgroundColor: isDark ? 'rgba(93,173,226,0.05)' : '#F9FAFB' }]}>
              {[
                ['Circulating Supply', stats.economics.circulatingSupply, colors.accent],
                ['Total Supply', stats.economics.totalSupply, colors.textPrimary],
                ['Max Supply', stats.economics.maxSupply, colors.textPrimary],
                ['Block Reward', `${stats.economics.currentBlockReward} A50`, colors.textPrimary],
              ].map(([label, value, color]) => (
                <View key={label as string} style={s.econRow}>
                  <Text style={[s.econLabel, { color: colors.textMuted }]}>{label}</Text>
                  <Text style={[s.econValue, { color: color as string }]}>{value}</Text>
                </View>
              ))}
            </View>
          </ThemedCard>
        )}

        {/* ── Charts ─────────────────────────────────────────────────────── */}
        {(blockTimesData.length > 1 || txVolumeData.length > 0 || difficultyData.length > 1) && (
          <ThemedCard style={s.section} padding={16}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Analytics</Text>

            {blockTimesData.length > 1 && (
              <View style={s.chartBox}>
                <Sparkline
                  data={blockTimesData}
                  color={colors.accent}
                  label="Block Time (last 20 blocks)"
                  unit="s"
                  accentColor={colors.accent}
                  textColor={colors.textSecondary}
                />
              </View>
            )}

            {difficultyData.length > 1 && (
              <View style={[s.chartBox, { marginTop: 16 }]}>
                <Sparkline
                  data={difficultyData}
                  color="#a855f7"
                  label="Difficulty Trend"
                  accentColor="#a855f7"
                  textColor={colors.textSecondary}
                />
              </View>
            )}

            {txVolumeData.length > 0 && (
              <View style={[s.chartBox, { marginTop: 16 }]}>
                <TxVolumeChart
                  data={txVolumeData}
                  accentColor={colors.accent}
                  textColor={colors.textSecondary}
                  mutedColor={colors.textMuted}
                />
              </View>
            )}
          </ThemedCard>
        )}

        {/* ── Recent Blocks ───────────────────────────────────────────────── */}
        <ThemedCard style={s.section} padding={16}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Recent Blocks</Text>
            <TouchableOpacity onPress={() => navigation.navigate('BlocksList')}>
              <Text style={[s.viewAll, { color: colors.accent }]}>View All</Text>
            </TouchableOpacity>
          </View>

          {recentBlocks.length > 0 ? (
            recentBlocks.map((block, i) => (
              <BlockItem key={block.id} block={block} isFirst={i === 0} />
            ))
          ) : (
            <Text style={[s.emptyText, { color: colors.textMuted }]}>No blocks yet</Text>
          )}
        </ThemedCard>

        {/* ── Quick Links ─────────────────────────────────────────────────── */}
        <ThemedCard style={s.section} padding={16}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Explore</Text>

          {[
            { label: 'Top Miners', icon: 'podium', screen: 'TopMiners' },
            { label: 'Recent Transactions', icon: 'swap-horizontal', screen: 'RecentTransactions' },
            { label: 'All Blocks', icon: 'cube', screen: 'BlocksList' },
          ].map(({ label, icon, screen }) => (
            <TouchableOpacity
              key={screen}
              style={[s.quickLink, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]}
              onPress={() => navigation.navigate(screen)}
              activeOpacity={0.7}
            >
              <View style={[s.quickLinkIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.1)' : '#EEF2FF' }]}>
                <Ionicons name={icon as any} size={18} color={colors.accent} />
              </View>
              <Text style={[s.quickLinkText, { color: colors.textPrimary }]}>{label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ThemedCard>
      </ScrollView>
    </View>
  );
};

const makeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    title: { fontSize: 28, fontWeight: 'bold' },
    searchBtn: { padding: 8 },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginBottom: 8 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
    liveText: { fontSize: 12 },
    newBlockBanner: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 99,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#22c55e',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 6,
    },
    newBlockBannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    section: { marginHorizontal: 16, marginTop: 12 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
    viewAll: { fontSize: 14, fontWeight: '600' },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    statCard: {
      width: '22%',
      flexGrow: 1,
      borderRadius: 12,
      padding: 10,
      alignItems: 'center',
      minWidth: 72,
    },
    statValue: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
    statLabel: { fontSize: 10, textAlign: 'center', marginTop: 2 },
    divider: { height: 1, marginVertical: 14 },
    econCard: { borderRadius: 12, padding: 12 },
    econRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
    econLabel: { fontSize: 13, fontWeight: '500' },
    econValue: { fontSize: 13, fontWeight: '600' },
    chartBox: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      borderRadius: 12,
      padding: 12,
    },
    blockItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderTopWidth: 1,
    },
    blockIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    blockHeight: { fontSize: 14, fontWeight: '600' },
    blockTime: { fontSize: 12, marginTop: 1 },
    blockReward: { fontSize: 13, fontWeight: '700' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    pillText: { fontSize: 10, fontWeight: '500' },
    quickLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderTopWidth: 1,
    },
    quickLinkIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickLinkText: { fontSize: 15, fontWeight: '500', flex: 1 },
    emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  });

export default BlockExplorerScreen;
