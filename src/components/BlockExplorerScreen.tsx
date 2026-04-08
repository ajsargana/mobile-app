import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import BlockExplorerService, { NetworkStats, Block } from '../services/BlockExplorerService';

interface BlockExplorerScreenProps {
  navigation: any;
}

export const BlockExplorerScreen: React.FC<BlockExplorerScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [recentBlocks, setRecentBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const explorer = BlockExplorerService.getInstance();

      // Load stats and blocks in parallel with proper error handling
      const [statsData, blocksData] = await Promise.all([
        explorer.getNetworkStats().catch(err => {
          console.warn('Failed to fetch network stats:', err);
          return null;
        }),
        explorer.getBlocks(10, 0).catch(err => {
          console.warn('Failed to fetch blocks:', err);
          return { items: [], pagination: { limit: 10, offset: 0, total: 0, hasMore: false } };
        })
      ]);

      if (statsData) {
        setStats(statsData);
        await explorer.cacheNetworkStats(statsData);
      } else {
        console.warn('Network stats unavailable - Block Explorer API may not be configured');
      }

      if (blocksData?.items) {
        setRecentBlocks(blocksData.items);
      }
    } catch (error) {
      console.error('Failed to load explorer data:', error);
      Alert.alert(
        'Warning',
        'Block Explorer API is not available. Please ensure the backend Block Explorer endpoints are configured at ' +
        (require('../config/environment').default.baseUrl || 'the configured server')
      );
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatNumber = (num: number | string): string => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    return n.toFixed(2);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  };

  const StatCard = ({ label, value, icon }: { label: string; value: string | number; icon: string }) => (
    <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(93,173,226,0.1)' : '#EEF2FF' }]}>
      <View style={styles.statIcon}>
        <Ionicons name={icon as any} size={20} color={colors.accent} />
      </View>
      <View style={styles.statContent}>
        <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );

  const BlockItem = ({ block }: { block: Block }) => {
    // Ensure we have valid data
    const blockId = block?.id || 'unknown';
    const height = block?.height || 0;
    const timestamp = block?.timestamp ? formatDate(block.timestamp) : 'Unknown';
    const reward = block?.totalReward ? (block.totalReward === '0' ? 'Pending' : `+${block.totalReward}`) : 'Pending';

    return (
      <TouchableOpacity
        style={[styles.blockItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
        onPress={() => navigation.navigate('BlockDetail', { blockId: blockId })}
      >
        <View style={styles.blockLeft}>
          <View style={[styles.blockIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EEF2FF' }]}>
            <Ionicons name="cube" size={16} color={colors.accent} />
          </View>
          <View style={styles.blockInfo}>
            <Text style={[styles.blockHeight, { color: colors.text }]}>Block #{height}</Text>
            <Text style={[styles.blockTime, { color: colors.textMuted }]}>
              {timestamp}
            </Text>
          </View>
        </View>
        <View style={styles.blockRight}>
          <Text style={[styles.blockReward, { color: colors.accent }]}>
            {reward}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Block Explorer</Text>
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => navigation.navigate('ExplorerSearch')}
        >
          <Ionicons name="search" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Network Stats Section */}
      {stats && (
        <>
          <ThemedCard style={styles.statsSection} padding={16}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Network Overview</Text>

            <View style={styles.statsGrid}>
              <StatCard
                label="Block Height"
                value={stats.network.blockHeight}
                icon="layers"
              />
              <StatCard
                label="Avg Block Time"
                value={`${stats.network.avgBlockTime.toFixed(0)}s`}
                icon="timer"
              />
              <StatCard
                label="Peers"
                value={stats.network.peerCount}
                icon="people"
              />
            </View>

            <View style={styles.divider} />

            <Text style={[styles.sectionSubtitle, { color: colors.text }]} className="mt-4">
              Blockchain Statistics
            </Text>

            <View style={styles.statsGrid}>
              <StatCard
                label="Total Blocks"
                value={stats.blockchain.totalBlocks}
                icon="cube"
              />
              <StatCard
                label="Total Transactions"
                value={formatNumber(stats.blockchain.totalTransactions)}
                icon="swap-horizontal"
              />
              <StatCard
                label="Active Users"
                value={stats.blockchain.totalUsers}
                icon="people-circle"
              />
            </View>

            <View style={styles.divider} />

            <Text style={[styles.sectionSubtitle, { color: colors.text }]} className="mt-4">
              Economics
            </Text>

            <View style={[styles.economicsCard, { backgroundColor: isDark ? 'rgba(93,173,226,0.05)' : '#F9FAFB' }]}>
              <View style={styles.economicsRow}>
                <Text style={[styles.economicsLabel, { color: colors.textMuted }]}>Circulating</Text>
                <Text style={[styles.economicsValue, { color: colors.accent }]}>
                  {stats.economics.circulatingSupply}
                </Text>
              </View>
              <View style={styles.economicsRow}>
                <Text style={[styles.economicsLabel, { color: colors.textMuted }]}>Max Supply</Text>
                <Text style={[styles.economicsValue, { color: colors.text }]}>
                  {stats.economics.maxSupply}
                </Text>
              </View>
              <View style={styles.economicsRow}>
                <Text style={[styles.economicsLabel, { color: colors.textMuted }]}>Block Reward</Text>
                <Text style={[styles.economicsValue, { color: colors.text }]}>
                  {stats.economics.currentBlockReward} A50
                </Text>
              </View>
            </View>
          </ThemedCard>
        </>
      )}

      {/* Recent Blocks */}
      <ThemedCard style={styles.blocksSection} padding={16}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Blocks</Text>
          <TouchableOpacity onPress={() => navigation.navigate('BlocksList')}>
            <Text style={[styles.viewAll, { color: colors.accent }]}>View All</Text>
          </TouchableOpacity>
        </View>

        {recentBlocks.length > 0 ? (
          recentBlocks.map(block => (
            <BlockItem key={block.id} block={block} />
          ))
        ) : (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No blocks available</Text>
        )}
      </ThemedCard>

      {/* Quick Links */}
      <ThemedCard style={styles.linksSection} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Links</Text>

        <TouchableOpacity
          style={[styles.quickLink, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
          onPress={() => navigation.navigate('TopMiners')}
        >
          <Ionicons name="podium" size={20} color={colors.accent} />
          <Text style={[styles.quickLinkText, { color: colors.text }]}>Top Miners</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickLink, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
          onPress={() => navigation.navigate('RecentTransactions')}
        >
          <Ionicons name="swap-horizontal" size={20} color={colors.accent} />
          <Text style={[styles.quickLinkText, { color: colors.text }]}>Recent Transactions</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </ThemedCard>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  searchButton: {
    padding: 8,
  },
  statsSection: {
    marginTop: 8,
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 4,
  },
  viewAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCard: {
    width: '48%',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statIcon: {
    marginRight: 8,
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginVertical: 12,
  },
  economicsCard: {
    borderRadius: 12,
    padding: 12,
  },
  economicsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  economicsLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  economicsValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  blocksSection: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  blockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  blockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  blockIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  blockInfo: {
    flex: 1,
  },
  blockHeight: {
    fontSize: 14,
    fontWeight: '600',
  },
  blockTime: {
    fontSize: 12,
    marginTop: 2,
  },
  blockRight: {
    alignItems: 'flex-end',
  },
  blockReward: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  linksSection: {
    marginTop: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  quickLinkText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
});

export default BlockExplorerScreen;
