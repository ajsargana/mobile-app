import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import BlockExplorerService, { Block, PaginatedResponse } from '../services/BlockExplorerService';

interface BlocksListScreenProps {
  navigation: any;
}

export const BlocksListScreen: React.FC<BlocksListScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const LIMIT = 20;

  useFocusEffect(
    useCallback(() => {
      loadBlocks(0);
    }, [])
  );

  const loadBlocks = async (newOffset: number) => {
    try {
      if (newOffset === 0) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const explorer = BlockExplorerService.getInstance();
      const result = await explorer.getBlocks(LIMIT, newOffset);

      if (newOffset === 0) {
        setBlocks(result.items);
      } else {
        setBlocks(prev => [...prev, ...result.items]);
      }

      setOffset(newOffset);
      setHasMore(result.pagination.hasMore);
    } catch (error) {
      console.error('Failed to load blocks:', error);
      Alert.alert('Error', 'Failed to load blocks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      loadBlocks(offset + LIMIT);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const BlockItem = ({ block }: { block: Block }) => (
    <TouchableOpacity
      style={[styles.blockItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
      onPress={() => navigation.navigate('BlockDetail', { blockId: block.id })}
    >
      <View style={styles.blockLeft}>
        <View style={[styles.blockIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EEF2FF' }]}>
          <Ionicons name="cube" size={18} color={colors.accent} />
        </View>
        <View style={styles.blockInfo}>
          <View style={styles.blockTitleRow}>
            <Text style={[styles.blockHeight, { color: colors.text }]} numberOfLines={1}>
              Block #{block.height}
            </Text>
            {(block.transactionCount ?? 0) > 0 && (
              <View style={[styles.txBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.txBadgeText]}>
                  {block.transactionCount} tx
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.blockTime, { color: colors.textMuted }]}>
            {formatDate(block.timestamp)}
          </Text>
        </View>
      </View>
      <View style={styles.blockRight}>
        <Text style={[styles.blockReward, { color: colors.accent }]}>
          {block.totalReward === '0' ? 'Pending' : `+${block.totalReward}`}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Blocks</Text>
        <View style={{ width: 24 }} />
      </View>

      {blocks.length > 0 ? (
        <FlatList
          data={blocks}
          renderItem={({ item }) => <BlockItem block={item} />}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : !hasMore ? (
              <Text style={[styles.endText, { color: colors.textMuted }]}>No more blocks</Text>
            ) : null
          }
          scrollIndicatorInsets={{ right: 1 }}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No blocks found</Text>
        </View>
      )}
    </View>
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
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
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  blockInfo: {
    flex: 1,
  },
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blockHeight: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  txBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  txBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  blockMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  blockTime: {
    fontSize: 12,
  },
  blockSeparator: {
    marginHorizontal: 6,
  },
  blockTxCount: {
    fontSize: 12,
  },
  blockRight: {
    alignItems: 'flex-end',
  },
  blockReward: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  loadingContainer: {
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endText: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    marginTop: 8,
  },
});

export default BlocksListScreen;
