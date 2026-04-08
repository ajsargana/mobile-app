import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import BlockExplorerService, { Transaction } from '../services/BlockExplorerService';

interface AddressDetailScreenProps {
  navigation: any;
  route: any;
}

export const AddressDetailScreen: React.FC<AddressDetailScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const { address } = route.params;
  const [addressData, setAddressData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transactions' | 'mining'>('transactions');

  // Transaction pagination state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txOffset, setTxOffset] = useState(0);
  const [txHasMore, setTxHasMore] = useState(true);

  // Mining pagination state
  const [miningHistory, setMiningHistory] = useState<any[]>([]);
  const [miningLoading, setMiningLoading] = useState(false);
  const [miningOffset, setMiningOffset] = useState(0);
  const [miningHasMore, setMiningHasMore] = useState(true);

  const LIMIT = 20;

  useEffect(() => {
    loadAddress();
  }, [address]);

  const loadAddress = async () => {
    try {
      setLoading(true);
      const explorer = BlockExplorerService.getInstance();
      const data = await explorer.getAddressDetail(address);
      setAddressData(data.address);

      // Initialize with first batch of transactions and mining data
      if (data.address) {
        await loadTransactions(0, true);
        await loadMiningHistory(0, true);
      }
    } catch (error) {
      console.error('Failed to load address:', error);
      Alert.alert('Error', 'Failed to load address details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (offset: number, reset: boolean = false) => {
    try {
      setTxLoading(true);

      const explorer = BlockExplorerService.getInstance();
      const result = await explorer.getAddressTransactions(address, LIMIT, offset);

      if (reset) {
        setTransactions(result.items);
      } else {
        setTransactions(prev => [...prev, ...result.items]);
      }

      setTxOffset(offset);
      setTxHasMore(result.pagination.hasMore);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      Alert.alert('Error', 'Failed to load transactions');
    } finally {
      setTxLoading(false);
    }
  };

  const loadMiningHistory = async (offset: number, reset: boolean = false) => {
    try {
      setMiningLoading(true);

      const explorer = BlockExplorerService.getInstance();
      const result = await explorer.getAddressMiningHistory(address, LIMIT, offset);

      if (reset) {
        setMiningHistory(result.items);
      } else {
        setMiningHistory(prev => [...prev, ...result.items]);
      }

      setMiningOffset(offset);
      setMiningHasMore(result.pagination.hasMore);
    } catch (error) {
      console.error('Failed to load mining history:', error);
      Alert.alert('Error', 'Failed to load mining history');
    } finally {
      setMiningLoading(false);
    }
  };

  const loadMoreTransactions = () => {
    if (!txLoading && txHasMore) {
      loadTransactions(txOffset + LIMIT);
    }
  };

  const loadMoreMining = () => {
    if (!miningLoading && miningHasMore) {
      loadMiningHistory(miningOffset + LIMIT);
    }
  };

  const copyToClipboard = (text: string) => {
    Alert.alert('Copied', text);
  };

  const StatRow = ({ label, value, color }: { label: string; value: string | number; color?: string }) => (
    <View style={[styles.statRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: color || colors.text }]}>{value}</Text>
    </View>
  );

  const TransactionItem = ({ tx }: { tx: Transaction }) => (
    <TouchableOpacity
      style={[styles.txItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
      onPress={() => navigation.navigate('TransactionDetail', { txId: tx.id })}
    >
      <View style={styles.txLeft}>
        <View style={[styles.txIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EEF2FF' }]}>
          <Ionicons name="swap-horizontal" size={14} color={colors.accent} />
        </View>
        <View style={styles.txInfo}>
          <Text style={[styles.txType, { color: colors.text }]}>{tx.type}</Text>
          <Text style={[styles.txAddress, { color: colors.textMuted }]} numberOfLines={1}>
            {tx.from === address ? `To: ${tx.to ? tx.to.substring(0, 12) : 'Unknown'}...` : `From: ${tx.from ? tx.from.substring(0, 12) : 'Unknown'}...`}
          </Text>
        </View>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: tx.from === address ? colors.text : colors.accent }]}>
          {tx.from === address ? '-' : '+'}{tx.amount}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const MiningItem = ({ mining }: { mining: any }) => (
    <TouchableOpacity
      style={[styles.txItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
      onPress={() => navigation.navigate('BlockDetail', { blockId: mining.blockId })}
    >
      <View style={styles.txLeft}>
        <View style={[styles.txIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EEF2FF' }]}>
          <Ionicons name="flash" size={14} color="#FFD700" />
        </View>
        <View style={styles.txInfo}>
          <Text style={[styles.txType, { color: colors.text }]}>Block #{mining.height}</Text>
          <Text style={[styles.txAddress, { color: colors.textMuted }]}>
            {mining.shares} share{mining.shares !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: colors.accent }]}>+{mining.reward}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!addressData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textMuted }]}>Failed to load address</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {addressData.username || (address ? address.substring(0, 12) + '...' : 'Unknown')}
        </Text>
        <TouchableOpacity onPress={() => copyToClipboard(address)}>
          <Ionicons name="copy" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Address Info Card */}
      <ThemedCard style={styles.infoCard} padding={16}>
        <Text style={[styles.addressText, { color: colors.textMuted }]} numberOfLines={1}>
          {address}
        </Text>

        <View style={styles.statsContainer}>
          <StatRow label="Balance" value={addressData.balance} color={colors.accent} />
          <StatRow label="Total Mined" value={addressData.totalMined} color={colors.accent} />
          <StatRow label="Mining Streak" value={addressData.miningStreak} />
        </View>
      </ThemedCard>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'transactions' && [styles.activeTab, { borderBottomColor: colors.accent }]
          ]}
          onPress={() => setActiveTab('transactions')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'transactions' ? colors.accent : colors.textMuted }]}>
            Transactions
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'mining' && [styles.activeTab, { borderBottomColor: colors.accent }]
          ]}
          onPress={() => setActiveTab('mining')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'mining' ? colors.accent : colors.textMuted }]}>
            Mining History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'transactions' ? (
        <FlatList
          data={transactions}
          renderItem={({ item }) => <TransactionItem tx={item} />}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          contentContainerStyle={styles.listContent}
          scrollIndicatorInsets={{ right: 1 }}
          onEndReached={loadMoreTransactions}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            !txLoading ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No transactions</Text>
            ) : null
          }
          ListFooterComponent={
            txLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : !txHasMore && transactions.length > 0 ? (
              <Text style={[styles.endText, { color: colors.textMuted }]}>No more transactions</Text>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={miningHistory}
          renderItem={({ item }) => <MiningItem mining={item} />}
          keyExtractor={(item, idx) => `${item.blockId}-${idx}`}
          contentContainerStyle={styles.listContent}
          scrollIndicatorInsets={{ right: 1 }}
          onEndReached={loadMoreMining}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            !miningLoading ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No mining history</Text>
            ) : null
          }
          ListFooterComponent={
            miningLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : !miningHasMore && miningHistory.length > 0 ? (
              <Text style={[styles.endText, { color: colors.textMuted }]}>No more mining history</Text>
            ) : null
          }
        />
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
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginHorizontal: 12,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
  },
  addressText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  statsContainer: {
    gap: 0,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    marginTop: 12,
    marginHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
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
    width: 32,
    height: 32,
    borderRadius: 6,
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
  txAddress: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 14,
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
  errorText: {
    textAlign: 'center',
    paddingVertical: 32,
    fontSize: 16,
  },
});

export default AddressDetailScreen;
