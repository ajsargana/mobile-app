import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import BlockExplorerService, { Transaction } from '../services/BlockExplorerService';

interface RecentTransactionsScreenProps {
  navigation: any;
}

export const RecentTransactionsScreen: React.FC<RecentTransactionsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [])
  );

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const explorer = BlockExplorerService.getInstance();
      const data = await explorer.getRecentTransactions(50);
      setTransactions(data);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      Alert.alert('Error', 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'mining_reward':
        return { icon: 'flash', color: '#FFD700' };
      case 'transfer':
        return { icon: 'swap-horizontal', color: colors.accent };
      case 'referral':
        return { icon: 'people', color: '#4CAF50' };
      default:
        return { icon: 'swap-horizontal', color: colors.accent };
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const formatAddress = (address: string | undefined): string => {
    if (!address) return 'N/A';
    if (address === 'SYSTEM') return 'SYSTEM';
    if (address.length > 16) {
      return address.substring(0, 8) + '...' + address.substring(address.length - 4);
    }
    return address;
  };

  const TransactionItem = ({ tx }: { tx: Transaction }) => {
    const txIcon = getTransactionIcon(tx.type);
    const typeLabel = tx.type === 'mining_reward' ? 'Mining' : tx.type === 'referral' ? 'Referral' : 'Transfer';

    return (
      <TouchableOpacity
        style={[styles.txItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
        onPress={() => navigation.navigate('TransactionDetail', { txId: tx.id })}
      >
        <View
          style={[
            styles.txIcon,
            { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EEF2FF' }
          ]}
        >
          <Ionicons name={txIcon.icon as any} size={16} color={txIcon.color} />
        </View>

        <View style={styles.txInfo}>
          <Text style={[styles.txType, { color: colors.text }]}>{typeLabel}</Text>
          <View style={styles.txAddressRow}>
            <Text style={[styles.txAddress, { color: colors.textMuted }]} numberOfLines={1}>
              {formatAddress(tx.from)} → {formatAddress(tx.to)}
            </Text>
            <Text style={[styles.txTime, { color: colors.textMuted }]}>
              {formatDate(tx.timestamp)}
            </Text>
          </View>
        </View>

        <View style={styles.txRight}>
          <Text style={[styles.txAmount, { color: colors.accent }]}>+{tx.amount}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Recent Transactions</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : transactions.length > 0 ? (
        <FlatList
          data={transactions}
          renderItem={({ item }) => <TransactionItem tx={item} />}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txType: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  txAddressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txAddress: {
    fontSize: 11,
    flex: 1,
  },
  txTime: {
    fontSize: 11,
    marginLeft: 8,
  },
  txRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  txDate: {
    fontSize: 11,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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

export default RecentTransactionsScreen;
