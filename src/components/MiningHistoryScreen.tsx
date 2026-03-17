import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity
} from 'react-native';
import { MiningService } from '../services/MiningService';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

interface BlockHistoryItem {
  id: string;
  height: number;
  status: string;
  reward: string;
  timestamp: string;
  hash?: string;
  participantCount?: number;
}

export const MiningHistoryScreen = () => {
  const { colors, isDark } = useTheme();
  const [history, setHistory] = useState<BlockHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const miningService = MiningService.getInstance();
      const blocks = await miningService.getMiningHistory();

      setHistory(blocks);
    } catch (err) {
      console.error('Failed to load mining history:', err);
      setError('Failed to load mining history');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);

      const miningService = MiningService.getInstance();
      const result = await miningService.syncMiningHistory();

      if (result.success) {
        const blocks = await miningService.getMiningHistory();
        setHistory(blocks);
        console.log('✅ Mining history refreshed:', result.blockCount, 'blocks');
      } else {
        setError(result.error || 'Failed to sync history');
      }
    } catch (err) {
      console.error('Failed to refresh mining history:', err);
      setError('Failed to refresh history');
    } finally {
      setRefreshing(false);
    }
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const formatReward = (reward: string): string => {
    const rewardNum = parseFloat(reward);
    if (isNaN(rewardNum)) return '0.00 A50';

    if (rewardNum >= 1000000) {
      return `${(rewardNum / 1000000).toFixed(2)}M A50`;
    } else if (rewardNum >= 1000) {
      return `${(rewardNum / 1000).toFixed(2)}K A50`;
    } else if (rewardNum >= 1) {
      return `${rewardNum.toFixed(2)} A50`;
    } else {
      return `${rewardNum.toFixed(4)} A50`;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'settled':
        return '#10b981'; // green
      case 'pending':
      case 'active':
        return '#f59e0b'; // amber
      case 'rejected':
      case 'invalid':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'settled':
        return '✓';
      case 'pending':
      case 'active':
        return '⏳';
      case 'rejected':
      case 'invalid':
        return '✗';
      default:
        return '•';
    }
  };

  const renderBlockItem = ({ item }: { item: BlockHistoryItem }) => (
    <ThemedCard style={styles.blockCard}>
      <View style={styles.blockHeader}>
        <View style={styles.blockInfo}>
          <Text style={[styles.blockHeight, { color: colors.textPrimary }]}>Block #{item.height}</Text>
          <Text style={[styles.blockTime, { color: colors.textMuted }]}>{formatDate(item.timestamp)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusIcon}>{getStatusIcon(item.status)}</Text>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.blockDetails}>
        <View style={styles.rewardRow}>
          <Text style={[styles.rewardLabel, { color: colors.textMuted }]}>Credit:</Text>
          <Text style={styles.rewardAmount}>{formatReward(item.reward)}</Text>
        </View>

        {item.participantCount !== undefined && (
          <View style={styles.participantRow}>
            <Text style={[styles.participantLabel, { color: colors.textMuted }]}>Participants:</Text>
            <Text style={styles.participantCount}>{item.participantCount}</Text>
          </View>
        )}

        {item.hash && (
          <View style={styles.hashRow}>
            <Text style={[styles.hashLabel, { color: colors.textMuted }]}>Hash:</Text>
            <Text style={[styles.hashValue, { color: colors.textMuted }]} numberOfLines={1} ellipsizeMode="middle">
              {item.hash}
            </Text>
          </View>
        )}
      </View>
    </ThemedCard>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>⚡</Text>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Sessions Yet</Text>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        Start participating to see your block history here
      </Text>
      <TouchableOpacity style={[styles.refreshButton, { backgroundColor: colors.accent }]} onPress={handleRefresh}>
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorTitle}>Error Loading History</Text>
      <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
      <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.accent }]} onPress={loadHistory}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading session history...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Session History</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {history.length} block{history.length !== 1 ? 's' : ''} participated
        </Text>
      </View>

      {error && !loading ? (
        renderError()
      ) : (
        <FlatList
          data={history}
          renderItem={renderBlockItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            history.length === 0 && styles.listContentEmpty
          ]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  listContent: {
    padding: 16,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  blockCard: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  blockInfo: {
    flex: 1,
  },
  blockHeight: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  blockTime: {
    fontSize: 13,
    color: '#6b7280',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusIcon: {
    fontSize: 12,
    color: '#fff',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  blockDetails: {
    gap: 8,
  },
  rewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rewardLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  rewardAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  participantLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  participantCount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  hashLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  hashValue: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6b7280',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  refreshButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
