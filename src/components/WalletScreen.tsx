import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService, HDWallet, HDAccount } from '../services/EnhancedWalletService';
import { NetworkService } from '../services/NetworkService';
import { Transaction, TrustLevel, User } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import { StakingPill } from './StakingPill';
import { applyFontScaling } from '../utils/fontScaling';

const { width } = Dimensions.get('window');

interface WalletScreenProps {
  navigation: any;
}

// ─── Skeleton shimmer ────────────────────────────────────────────────────────
const SkeletonBox: React.FC<{ style?: any }> = ({ style }) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <Animated.View style={[styles.skeletonBase, { opacity }, style]} />
  );
};

const WalletSkeleton: React.FC = () => (
  <>
    {/* Header skeleton */}
    <LinearGradient colors={['#667eea', '#764ba2']} style={styles.walletHeader}>
      <View style={styles.balanceContainer}>
        <SkeletonBox style={{ width: 100, height: 16, borderRadius: 8, marginBottom: 10 }} />
        <SkeletonBox style={{ width: 180, height: 40, borderRadius: 8, marginBottom: 6 }} />
        <SkeletonBox style={{ width: 50, height: 18, borderRadius: 8 }} />
      </View>
      <View style={styles.trustContainer}>
        <SkeletonBox style={{ width: 140, height: 28, borderRadius: 16 }} />
      </View>
      <View style={styles.addressContainer}>
        <SkeletonBox style={{ width: 80, height: 14, borderRadius: 6, marginBottom: 6 }} />
        <SkeletonBox style={{ width: 220, height: 18, borderRadius: 6 }} />
      </View>
    </LinearGradient>

    {/* Action buttons skeleton */}
    <View style={styles.actionContainer}>
      {[0, 1, 2].map(i => (
        <View key={i} style={styles.actionButton}>
          <SkeletonBox style={{ height: 72, borderRadius: 12 }} />
        </View>
      ))}
    </View>

    {/* Transactions skeleton */}
    <View style={[styles.transactionsContainer, { marginTop: 8 }]}>
      <SkeletonBox style={{ width: 160, height: 20, borderRadius: 6, marginBottom: 16 }} />
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.transactionItem, { alignItems: 'center' }]}>
          <SkeletonBox style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox style={{ width: '60%', height: 14, borderRadius: 6 }} />
            <SkeletonBox style={{ width: '40%', height: 12, borderRadius: 6 }} />
          </View>
          <SkeletonBox style={{ width: 70, height: 18, borderRadius: 6 }} />
        </View>
      ))}
    </View>
  </>
);
// ─────────────────────────────────────────────────────────────────────────────

export const WalletScreen: React.FC<WalletScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [hdWallet, setHdWallet] = useState<HDWallet | null>(null);
  const [currentAccount, setCurrentAccount] = useState<HDAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [networkConnected, setNetworkConnected] = useState(false);

  const mountedRef = useRef(true);
  const walletService = EnhancedWalletService.getInstance();
  const networkService = NetworkService.getInstance();

  useEffect(() => {
    mountedRef.current = true;
    loadWalletData();

    // Delay interval — only start after mount, not during it
    const networkInterval = setInterval(() => {
      if (mountedRef.current) {
        setNetworkConnected(networkService.isNetworkConnected());
      }
    }, 5000);

    return () => {
      mountedRef.current = false;
      clearInterval(networkInterval);
    };
  }, []);

  const loadWalletData = useCallback(async () => {
    try {
      if (!isRefreshing) setIsLoading(true);

      // ── Phase 1: Load wallet (fast, local) ──────────────────────────────
      const loadedWallet = await walletService.loadHDWallet();

      if (!mountedRef.current) return;

      let wallet: HDWallet;
      if (!loadedWallet) {
        wallet = await walletService.createWallet();
        Alert.alert(
          'New HD Wallet Created',
          'A new AURA5O HD wallet has been created. Please backup your seed phrase.',
          [{ text: 'OK' }]
        );
      } else {
        wallet = loadedWallet;
      }

      // Show whatever we have immediately — remove the loading state early
      const account = walletService.getCurrentAccount();
      if (mountedRef.current) {
        setHdWallet(wallet);
        setCurrentAccount(account);
        setIsLoading(false); // ← unblock UI before network calls
      }

      // ── Phase 2: Parallel network sync (doesn't block UI) ───────────────
      const [syncResult, txResult] = await Promise.all([
        walletService.syncBalanceFromBackend().catch(err => {
          console.warn('Balance sync failed:', err);
          return { success: false, balance: null, error: err.message };
        }),
        walletService.syncTransactionsFromBackend(20).catch(err => {
          console.warn('Transaction sync failed:', err);
          return { success: false, transactions: [] as Transaction[] };
        }),
      ]);

      if (!mountedRef.current) return;

      // Update balance
      if (syncResult.success) {
        const updatedAccount = walletService.getCurrentAccount();
        setCurrentAccount(updatedAccount);
      }

      // Update transactions — API result → account cache → AsyncStorage cache
      if (txResult.success && txResult.transactions?.length) {
        setTransactions(txResult.transactions);
      } else if (account?.transactions?.length) {
        setTransactions(account.transactions);
      } else {
        // Last resort: read from shared AsyncStorage cache written by EnhancedWalletService / TransactionHistoryScreen
        try {
          const walletAddress = account?.address;
          const cached =
            (walletAddress ? await AsyncStorage.getItem(`@aura50_cached_transactions_${walletAddress}`) : null) ||
            await AsyncStorage.getItem('@aura50_cached_transactions') ||
            await AsyncStorage.getItem('@aura50_transaction_cache');
          if (cached && mountedRef.current) {
            const parsed: Transaction[] = JSON.parse(cached).map((tx: any) => ({
              ...tx,
              timestamp: new Date(tx.timestamp),
            }));
            if (parsed.length > 0) setTransactions(parsed);
          }
        } catch (_) {}
      }

    } catch (error) {
      console.error('Failed to load wallet:', error);
      if (mountedRef.current) {
        setIsLoading(false);
        Alert.alert('Error', 'Failed to load wallet data');
      }
    }
  }, [isRefreshing]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadWalletData();
    setIsRefreshing(false);
  }, [loadWalletData]);

  const handleSend = useCallback(() => navigation.navigate('SendTransaction'), [navigation]);
  const handleReceive = useCallback(() => navigation.navigate('ReceiveTransaction'), [navigation]);

  const trustInfo = useMemo(() => {
    const user = walletService.getUser();
    if (!user) return { level: TrustLevel.NEW, color: '#FF6B6B', text: 'New User' };
    const trustLevel = walletService.calculateTrustLevel(user);
    switch (trustLevel) {
      case TrustLevel.LEGEND:    return { level: trustLevel, color: '#FFD700', text: 'Legend (0.001% fees)' };
      case TrustLevel.VETERAN:   return { level: trustLevel, color: '#9B59B6', text: 'Veteran (0.01% fees)' };
      case TrustLevel.ESTABLISHED: return { level: trustLevel, color: '#3498DB', text: 'Established (0.05% fees)' };
      default: return { level: trustLevel, color: '#95A5A6', text: 'New (0.1% fees)' };
    }
  }, [currentAccount]);

  const formatBalance = useCallback((balance: string): string => {
    const num = parseFloat(balance);
    return num.toFixed(8);
  }, []);

  const formatAddress = useCallback((address: string): string => {
    if (!address) return 'Loading...';
    return `${address.slice(0, 12)}...${address.slice(-12)}`;
  }, []);

  const getTransactionIcon = useCallback((tx: Transaction) => {
    if (tx.type === 'mining' || tx.type === 'mining_reward' || tx.type === 'participation') return 'hammer-outline';
    if (tx.type === 'referral' || tx.type === 'referral_bonus') return 'gift-outline';
    if (tx.status === 'offline') return 'cloud-offline-outline';
    if (tx.status === 'pending') return 'time-outline';
    if (tx.status === 'confirmed' || tx.status === 'completed') return 'checkmark-circle-outline';
    return 'close-circle-outline';
  }, []);

  const getTransactionColor = useCallback((tx: Transaction) => {
    if (tx.type === 'mining' || tx.type === 'mining_reward' || tx.type === 'participation') return '#F59E0B';
    if (tx.type === 'referral' || tx.type === 'referral_bonus') return '#8B5CF6';
    if (tx.status === 'offline') return '#FFA500';
    if (tx.status === 'pending') return '#3498DB';
    if (tx.status === 'confirmed' || tx.status === 'completed') return '#27AE60';
    return '#E74C3C';
  }, []);

  const getTransactionLabel = useCallback((tx: Transaction) => {
    if (tx.typeLabel) return tx.typeLabel;
    if (tx.type === 'mining' || tx.type === 'mining_reward') return 'Block Credit';
    if (tx.type === 'participation') return 'Block Participation';
    if (tx.type === 'referral' || tx.type === 'referral_bonus') return 'Referral Bonus';
    if (tx.direction === 'sent') return 'Sent';
    if (tx.direction === 'received') return 'Received';
    if (currentAccount && tx.from === currentAccount.address) return 'Sent';
    return 'Received';
  }, [currentAccount]);

  const isPositiveTransaction = useCallback((tx: Transaction) => {
    if (tx.type && ['mining', 'mining_reward', 'participation', 'referral', 'referral_bonus'].includes(tx.type)) return true;
    if (tx.direction === 'received') return true;
    if (tx.direction === 'sent') return false;
    return currentAccount && tx.to === currentAccount.address;
  }, [currentAccount]);

  // Show skeleton while loading (instant paint — no blank screen)
  if (isLoading) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
        <WalletSkeleton />
      </ScrollView>
    );
  }

  if (!hdWallet || !currentAccount) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.bg }]}>
        <Text style={styles.errorText}>Failed to load wallet</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadWalletData}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Network Status Banner */}
      {!networkConnected && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#FFF" />
          <Text style={styles.offlineText}>Offline Mode - Transactions will sync when connected</Text>
        </View>
      )}

      {/* Wallet Header */}
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.walletHeader}>
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>A50 Balance</Text>
          <Text style={styles.balanceAmount}>{formatBalance(currentAccount.balance)}</Text>
          <Text style={styles.balanceCurrency}>A50</Text>
        </View>

        <View style={styles.trustContainer}>
          <View style={[styles.trustBadge, { backgroundColor: trustInfo.color }]}>
            <Text style={styles.trustText}>{trustInfo.text}</Text>
          </View>
        </View>

        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Wallet Address</Text>
          <TouchableOpacity onPress={() => {}}>
            <Text style={styles.addressText}>{formatAddress(currentAccount.address)}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        {/* Stake Button with Staking Pill Animation */}
        <View style={styles.actionButton}>
          <StakingPill
            onPress={() => navigation.navigate('Staking')}
          />
        </View>

        <TouchableOpacity style={styles.actionButton} onPress={handleSend}>
          <LinearGradient colors={['#FF6B6B', '#FF8E8E']} style={styles.actionGradient}>
            <Ionicons name="arrow-up-outline" size={24} color="#FFF" />
            <Text style={styles.actionText}>Send</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleReceive}>
          <LinearGradient colors={['#4ECDC4', '#7FDBDA']} style={styles.actionGradient}>
            <Ionicons name="arrow-down-outline" size={24} color="#FFF" />
            <Text style={styles.actionText}>Receive</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Multiple Accounts Notice */}
      {hdWallet.accounts.length > 1 && (
        <View style={styles.accountsNotice}>
          <Ionicons name="wallet-outline" size={20} color="#3498DB" />
          <Text style={styles.accountsText}>
            Account {currentAccount.index + 1} of {hdWallet.accounts.length} (Tap to switch)
          </Text>
        </View>
      )}

      {/* Recent Transactions */}
      <ThemedCard style={styles.transactionsContainer}>
        <View style={styles.transactionsHeader}>
          <Text style={[styles.transactionsTitle, { color: colors.textPrimary }]}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => navigation.navigate('TransactionHistory')}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.noTransactionsContainer}>
            <Ionicons name="receipt-outline" size={48} color="#BDC3C7" />
            <Text style={styles.noTransactionsText}>No transactions yet</Text>
            <Text style={styles.noTransactionsSubtext}>
              Start forging or receive A50 to see transactions here
            </Text>
          </View>
        ) : (
          transactions.filter((tx, i, arr) => arr.findIndex(t => t.id === tx.id) === i).slice(0, 5).map((tx) => {
            const isPositive = isPositiveTransaction(tx);
            const label = getTransactionLabel(tx);
            const isReward = tx.type && ['mining', 'mining_reward', 'participation', 'referral', 'referral_bonus'].includes(tx.type);

            return (
              <View key={tx.id} style={styles.transactionItem}>
                <View style={styles.transactionIcon}>
                  <Ionicons name={getTransactionIcon(tx) as any} size={20} color={getTransactionColor(tx)} />
                </View>
                <View style={styles.transactionDetails}>
                  <Text style={[styles.transactionType, { color: colors.textPrimary }]}>{label}</Text>
                  {!isReward && (
                    <Text style={styles.transactionAddress}>
                      {tx.from === currentAccount.address ? 'To: ' : 'From: '}
                      {formatAddress(tx.from === currentAccount.address ? tx.to : tx.from)}
                    </Text>
                  )}
                  <Text style={styles.transactionDate}>
                    {new Date(tx.timestamp).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.transactionAmount}>
                  <Text style={[styles.transactionAmountText, { color: isPositive ? '#27AE60' : '#E74C3C' }]}>
                    {isPositive ? '+' : '-'}{formatBalance(tx.amount)}
                  </Text>
                  <Text style={styles.transactionCurrency}>A50</Text>
                </View>
              </View>
            );
          })
        )}
      </ThemedCard>
    </ScrollView>
  );
};

const styles = applyFontScaling(StyleSheet.create({
  container: { flex: 1 },
  skeletonBase: { backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 4 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 18, color: '#E74C3C', marginBottom: 20 },
  retryButton: { backgroundColor: '#3498DB', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#FFF', fontSize: 16 },
  offlineBanner: {
    backgroundColor: '#E67E22', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16,
  },
  offlineText: { color: '#FFF', fontSize: 12, marginLeft: 8 },
  walletHeader: { padding: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  balanceContainer: { alignItems: 'center', marginBottom: 20 },
  balanceLabel: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 16, marginBottom: 8 },
  balanceAmount: { color: '#FFF', fontSize: 36, fontWeight: 'bold' },
  balanceCurrency: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 18, marginTop: 4 },
  trustContainer: { alignItems: 'center', marginBottom: 20 },
  trustBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 },
  trustText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  addressContainer: { alignItems: 'center' },
  addressLabel: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, marginBottom: 4 },
  addressText: { color: '#FFF', fontSize: 16, fontFamily: 'monospace' },
  actionContainer: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingHorizontal: 24, paddingVertical: 20,
  },
  actionButton: { flex: 1, marginHorizontal: 8 },
  actionGradient: { alignItems: 'center', paddingVertical: 16, borderRadius: 12 },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  accountsNotice: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3F2FD',
    paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 16,
    borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#3498DB',
  },
  accountsText: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1976D2' },
  transactionsContainer: {
    marginHorizontal: 16, marginBottom: 20,
  },
  transactionsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  transactionsTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50' },
  viewAllText: { color: '#3498DB', fontSize: 14 },
  noTransactionsContainer: { alignItems: 'center', paddingVertical: 32 },
  noTransactionsText: { fontSize: 16, color: '#7F8C8D', marginTop: 16 },
  noTransactionsSubtext: {
    fontSize: 14, color: '#BDC3C7', textAlign: 'center', marginTop: 8, marginHorizontal: 32,
  },
  transactionItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#ECF0F1',
  },
  transactionIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8F9FA',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  transactionDetails: { flex: 1 },
  transactionType: { fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 2 },
  transactionAddress: { fontSize: 12, color: '#7F8C8D', fontFamily: 'monospace' },
  transactionDate: { fontSize: 12, color: '#7F8C8D', marginTop: 2 },
  transactionAmount: { alignItems: 'flex-end' },
  transactionAmountText: { fontSize: 16, fontWeight: 'bold' },
  transactionCurrency: { fontSize: 12, color: '#7F8C8D', marginTop: 2 },
}));
