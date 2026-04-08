import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import BlockExplorerService, { Transaction, PaginatedResponse } from '../services/BlockExplorerService';

interface BlockTransactionsScreenProps {
  navigation: any;
  route: any;
}

export const BlockTransactionsScreen: React.FC<BlockTransactionsScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const { blockId } = route.params;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const LIMIT = 20;

  useFocusEffect(
    useCallback(() => {
      loadTransactions(0);
    }, [blockId])
  );

  const loadTransactions = async (newOffset: number) => {
    try {
      if (newOffset === 0) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const explorer = BlockExplorerService.getInstance();
      const result: PaginatedResponse<Transaction> = await explorer.getBlockTransactions(blockId, LIMIT, newOffset);

      if (newOffset === 0) {
        setTransactions(result.items);
      } else {
        setTransactions(prev => [...prev, ...result.items]);
      }

      setOffset(newOffset);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      Alert.alert('Error', 'Failed to load transactions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      loadTransactions(offset + LIMIT);
    }
  };

  const getTransactionIcon = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'mining':
        return 'trending-up';
      case 'referral':
        return 'people';
      case 'transfer':
        return 'swap-horizontal';
      default:
        return 'swap-horizontal';
    }
  };

  const TransactionItem = ({ tx }: { tx: Transaction }) => (
    <TouchableOpacity
      style={[styles.txItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
      onPress={() => navigation.navigate('TransactionDetail', { txId: tx.id })}
    >
      <View style={styles.txLeft}>
        <View style={[styles.txIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EEF2FF' }]}>
          <Ionicons name={getTransactionIcon(tx.type)} size={16} color={colors.accent} />
        </View>
        <View style={styles.txInfo}>
          <Text style={[styles.txType, { color: colors.text }]} numberOfLines={1}>
            {tx.type || 'Unknown'}
          </Text>
          <Text style={[styles.txId, { color: colors.textMuted }]} numberOfLines={1}>
            {tx.from ? tx.from.substring(0, 12) + '...' : 'Unknown'} → {tx.to ? tx.to.substring(0, 12) + '...' : 'Unknown'}
          </Text>
        </View>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: colors.accent }]}>{tx.amount || '0'}</Text>
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
        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: colors.text }]}>Block Transactions</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{total} transaction{total !== 1 ? 's' : ''}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {transactions.length > 0 ? (
        <FlatList
          data={transactions}
          renderItem={({ item }) => <TransactionItem tx={item} />}
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
              <Text style={[styles.endText, { color: colors.textMuted }]}>No more transactions</Text>
            ) : null
          }
          scrollIndicatorInsets={{ right: 1 }}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="swap-horizontal-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No transactions found</Text>
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
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  txInfo: {
    flex: 1,
  },
  txType: {
    fontSize: 13,
    fontWeight: '600',
  },
  txId: {
    fontSize: 11,
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 13,
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

export default BlockTransactionsScreen;
