import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { NetworkService } from '../services/NetworkService';
import { Transaction } from '../types';
import { getApiUrl } from '../config/environment';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TransactionFilter = 'all' | 'sent' | 'received' | 'mining';

interface TransactionResponse {
  success: boolean;
  transactions: EnhancedTransaction[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  blockchain: {
    currentHeight: number;
    syncStatus: 'synced' | 'offline' | 'error';
    connectedPeers: number;
  };
  user: {
    trustLevel: string;
    feeRate: number;
    walletAddress: string;
  };
}

interface EnhancedTransaction extends Transaction {
  confirmations?: number;
  confirmationStatus?: 'pending' | 'included' | 'confirmed' | 'final';
  isVerified?: boolean;
  isFinal?: boolean;
  typeLabel?: string; // Human-readable label from backend
}

interface NetworkStatus {
  isOnline: boolean;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'error';
  connectedPeers: number;
  currentHeight: number;
}

// Defined outside component so it is never recreated on re-renders
const DetailRow = memo(({
  label,
  value,
  copyable,
  valueColor,
  highlight,
  highlightText,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  valueColor?: string;
  highlight?: boolean;
  highlightText?: string;
}) => {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.detailValueContainer}>
        <Text
          style={[
            styles.detailValue,
            { color: colors.textPrimary },
            valueColor ? { color: valueColor } : null,
          ]}
          numberOfLines={label === 'Transaction ID' || label === 'From' || label === 'To' ? 1 : undefined}
        >
          {value}
        </Text>
        {highlight && highlightText && (
          <View style={[styles.trustBadge, { backgroundColor: isDark ? 'rgba(124,58,237,0.2)' : '#ede9fe' }]}>
            <Text style={styles.trustBadgeText}>{highlightText}</Text>
          </View>
        )}
      </View>
    </View>
  );
});

export const TransactionHistoryScreen = ({ route }: any) => {
  const { colors, isDark } = useTheme();
  // If opened from a notification tap, auto-open that tx's detail modal
  const autoOpenTxId: string | undefined = route?.params?.txId;

  // State
  const [transactions, setTransactions] = useState<EnhancedTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<EnhancedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<EnhancedTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: true,
    syncStatus: 'synced',
    connectedPeers: 0,
    currentHeight: 0,
  });
  const [userTrustLevel, setUserTrustLevel] = useState<string>('new');

  // Refs for cleanup and animations
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;   // content fade — starts at 1
  const slideAnim = useRef(new Animated.Value(50)).current;
  const shimmerAnim = useRef(new Animated.Value(0.4)).current; // separate skeleton shimmer
  const shimmerLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Start skeleton shimmer loop independently of fadeAnim
  useEffect(() => {
    shimmerLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    shimmerLoopRef.current.start();
    return () => {
      shimmerLoopRef.current?.stop();
      shimmerLoopRef.current = null;
    };
  }, []);

  // Stop shimmer and slide in content when loading finishes
  useEffect(() => {
    if (!loading) {
      shimmerLoopRef.current?.stop();
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  // Load transactions on mount with cleanup
  useEffect(() => {
    isMountedRef.current = true;
    loadTransactions();

    // Delta-driven refresh: re-fetch when a block settles so new mining rewards
    // appear immediately without the user having to pull-to-refresh
    const onBlockSettled = () => {
      if (isMountedRef.current) loadTransactions();
    };
    NetworkService.getInstance().on('blockSettled', onBlockSettled);

    return () => {
      // Cleanup: prevent state updates after unmount
      isMountedRef.current = false;
      NetworkService.getInstance().off('blockSettled', onBlockSettled);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Apply filters when dependencies change
  useEffect(() => {
    applyFilters();
  }, [transactions, filter, searchQuery]);

  // Auto-open detail modal when navigated from a notification
  useEffect(() => {
    if (!autoOpenTxId || transactions.length === 0) return;
    const tx = transactions.find(t => t.id === autoOpenTxId);
    if (tx) setSelectedTx(tx);
  }, [autoOpenTxId, transactions]);

  const loadTransactions = async () => {
    // Abort previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Helper to safely set state only if mounted
    const safeSetState = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T | ((prev: T) => T)) => {
      if (isMountedRef.current) {
        setter(value as any);
      }
    };

    try {
      safeSetState(setLoading, true);
      safeSetState(setError, null);

      const walletService = EnhancedWalletService.getInstance();
      // getCurrentAccount() returns null if the wallet service hasn't been
      // initialised yet in this navigation context — load it first.
      let wallet = walletService.getCurrentAccount();
      if (!wallet) {
        await walletService.loadHDWallet();
        wallet = walletService.getCurrentAccount();
      }

      if (!wallet) {
        safeSetState(setError, 'No wallet found. Please create or restore a wallet.');
        safeSetState(setLoading, false);
        return;
      }

      // Try to fetch from server
      const token = await AsyncStorage.getItem('@aura50_auth_token');
      if (!token) {
        // No auth - load local transactions only
        await loadLocalTransactions(wallet);
        safeSetState(setNetworkStatus, prev => ({ ...prev, syncStatus: 'offline', isOnline: false }));
        return;
      }

      try {
        const response = await fetch(getApiUrl('/api/transactions/history'), {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache',
          },
          signal: abortControllerRef.current.signal,
        });

        if (!isMountedRef.current) return; // Check after async operation

        if (response.ok) {
          const data: TransactionResponse = await response.json();

          if (data.success && isMountedRef.current) {
            // Map, enhance, and deduplicate by id
            const seen = new Set<string>();
            const enhancedTxs = data.transactions
              .map(tx => ({ ...tx, timestamp: new Date(tx.timestamp), fee: tx.fee || '0' }))
              .filter(tx => { if (seen.has(tx.id)) return false; seen.add(tx.id); return true; });

            safeSetState(setTransactions, enhancedTxs);
            safeSetState(setNetworkStatus, {
              isOnline: true,
              syncStatus: data.blockchain.syncStatus,
              connectedPeers: data.blockchain.connectedPeers,
              currentHeight: data.blockchain.currentHeight,
            });
            safeSetState(setUserTrustLevel, data.user.trustLevel);

            // Cache transactions for offline use — both keys in parallel
            if (enhancedTxs.length > 0) {
              const serialized = JSON.stringify(enhancedTxs);
              const cacheKey = `@aura50_cached_transactions_${wallet.address}`;
              await Promise.all([
                AsyncStorage.setItem(cacheKey, serialized),
                AsyncStorage.setItem('@aura50_cached_transactions', serialized),
              ]);
            }
          }
        } else if (response.status === 401) {
          // Auth expired - show message but still load local
          safeSetState(setError, 'Session expired. Showing cached transactions.');
          await loadLocalTransactions(wallet);
          safeSetState(setNetworkStatus, prev => ({ ...prev, syncStatus: 'offline', isOnline: false }));
        } else {
          throw new Error(`Server error: ${response.status}`);
        }
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
          return; // Request was cancelled, don't update state
        }

        console.warn('Failed to fetch from server, using cached data:', fetchError.message);
        safeSetState(setError, 'Could not connect to network. Showing cached transactions.');
        await loadLocalTransactions(wallet);
        safeSetState(setNetworkStatus, prev => ({ ...prev, syncStatus: 'offline', isOnline: false }));
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      safeSetState(setError, 'Failed to load transactions. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const loadLocalTransactions = async (wallet: any) => {
    try {
      // Fetch both cache keys in parallel, pick first non-null result
      const userCacheKey = `@aura50_cached_transactions_${wallet.address}`;
      const [userCached, legacyCached] = await Promise.all([
        AsyncStorage.getItem(userCacheKey),
        AsyncStorage.getItem('@aura50_cached_transactions'),
      ]);
      let cached = userCached || legacyCached;

      // Check if still mounted after async operation
      if (!isMountedRef.current) return;

      if (cached) {
        const seenCache = new Set<string>();
        const parsedTxs = JSON.parse(cached)
          .map((tx: any) => ({ ...tx, timestamp: new Date(tx.timestamp) }))
          .filter((tx: any) => { if (seenCache.has(tx.id)) return false; seenCache.add(tx.id); return true; });
        if (isMountedRef.current && parsedTxs.length > 0) {
          setTransactions(parsedTxs);
        }
        return;
      }

      // Fall back to wallet transactions
      if (wallet.transactions && wallet.transactions.length > 0) {
        const seenWallet = new Set<string>();
        const sorted = [...wallet.transactions]
          .filter((tx: any) => { if (seenWallet.has(tx.id)) return false; seenWallet.add(tx.id); return true; })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (isMountedRef.current) {
          setTransactions(sorted);
        }
      }
    } catch (error) {
      console.error('Failed to load local transactions:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    if (!isMountedRef.current) return;
    setRefreshing(true);
    await loadTransactions();
    if (isMountedRef.current) {
      setRefreshing(false);
    }
  }, []);

  const applyFilters = () => {
    const walletService = EnhancedWalletService.getInstance();
    const wallet = walletService.getCurrentAccount();
    if (!wallet) return;

    let filtered = [...transactions];

    // Apply type filter using direction field from server
    if (filter === 'sent') {
      // Only show actual user-initiated transfers that were sent
      filtered = filtered.filter(tx =>
        tx.direction === 'sent' &&
        tx.type === 'transfer'
      );
    } else if (filter === 'received') {
      // Show transfers received from other users (not system rewards)
      filtered = filtered.filter(tx =>
        tx.direction === 'received' &&
        tx.type === 'transfer' &&
        tx.from !== 'SYSTEM'
      );
    } else if (filter === 'mining') {
      // Show all reward types: mining, referral, bonuses
      filtered = filtered.filter(tx =>
        tx.type === 'mining' ||
        tx.type === 'mining_reward' ||
        tx.type === 'participation' ||
        tx.type === 'referral' ||
        tx.type === 'referral_bonus'
      );
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(tx =>
        tx.id.toLowerCase().includes(query) ||
        tx.from.toLowerCase().includes(query) ||
        tx.to.toLowerCase().includes(query) ||
        String(tx.amount).includes(query) ||
        (tx.type && tx.type.toLowerCase().includes(query))
      );
    }

    setFilteredTransactions(filtered);
  };

  const getTransactionType = (tx: EnhancedTransaction): string => {
    // Use backend typeLabel if available (human-readable)
    if (tx.typeLabel) return tx.typeLabel;

    // Use backend type field when available
    if (tx.type === 'mining' || tx.type === 'mining_reward') return 'Block Credit';
    if (tx.type === 'participation') return 'Block Participation';
    if (tx.type === 'referral' || tx.type === 'referral_bonus') return 'Referral Bonus';
    if (tx.type === 'transfer') {
      // Use direction field from server (compares userId correctly)
      if (tx.direction === 'sent') return 'Sent';
      if (tx.direction === 'received') return 'Received';
      // Fallback: check wallet address
      const walletService = EnhancedWalletService.getInstance();
      const wallet = walletService.getCurrentAccount();
      if (wallet && (tx.from === wallet.address || tx.from === wallet.userId)) return 'Sent';
      return 'Received';
    }

    // Fall back to direction for other types
    if (tx.direction === 'sent') return 'Sent';
    if (tx.direction === 'received') return 'Received';

    return 'Received';
  };

  const getTransactionIcon = (tx: EnhancedTransaction): string => {
    // Check type directly for more accurate icons
    if (tx.type === 'mining' || tx.type === 'mining_reward' || tx.type === 'participation') {
      return '⛏️';
    }
    if (tx.type === 'referral' || tx.type === 'referral_bonus') {
      return '🎁';
    }
    const type = getTransactionType(tx);
    switch (type) {
      case 'Block Credit':
      case 'Block Participation':
        return '⚡';
      case 'Referral Bonus':
        return '🎁';
      case 'Sent':
        return '↗️';
      case 'Received':
        return '↙️';
      default:
        return '💫';
    }
  };

  const getStatusColor = (tx: EnhancedTransaction): string => {
    // Normalize status values
    const status = tx.confirmationStatus || tx.status;

    switch (status) {
      case 'final':
        return '#059669'; // Deep green for finality
      case 'confirmed':
      case 'completed':
        return '#10b981'; // Green
      case 'included':
        return '#3b82f6'; // Blue
      case 'pending':
        return '#f59e0b'; // Amber
      case 'failed':
        return '#ef4444'; // Red
      case 'offline':
        return '#6b7280'; // Gray
      default:
        return '#6b7280';
    }
  };

  const getStatusText = (tx: EnhancedTransaction): string => {
    if (tx.confirmationStatus === 'final' || tx.isFinal) {
      return 'Final';
    }
    if (tx.confirmations !== undefined && tx.confirmations > 0) {
      return `${tx.confirmations} conf${tx.confirmations > 1 ? 's' : ''}`;
    }
    // Normalize status display
    const status = tx.status === 'completed' ? 'confirmed' : tx.status;
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const txDate = new Date(date);
    const diffMs = now.getTime() - txDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return txDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: txDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const formatAmount = (amount: string | number, isPositive: boolean): string => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const formatted = numAmount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
    return `${isPositive ? '+' : '-'}${formatted}`;
  };

  // Render Network Status Banner
  const renderNetworkBanner = () => {
    // Hide banner entirely when the device can reach the server and there is no error
    if (networkStatus.isOnline && !error) return null;

    // isOffline = device genuinely cannot reach the server (not just blockchain sync lag)
    const isOffline = !networkStatus.isOnline;
    const backgroundColor = isOffline ? '#fef3c7' : '#dbeafe';
    const textColor = isOffline ? '#92400e' : '#1e40af';
    const icon = isOffline ? '📡' : '🔄';
    const message = error || (isOffline
      ? 'Offline mode - showing cached transactions'
      : 'Syncing with blockchain...');

    return (
      <Animated.View
        style={[
          styles.networkBanner,
          { backgroundColor, opacity: fadeAnim },
        ]}
      >
        <Text style={styles.networkBannerIcon}>{icon}</Text>
        <Text style={[styles.networkBannerText, { color: textColor }]}>
          {message}
        </Text>
        {isOffline && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadTransactions}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  // Render Loading Skeleton with shimmer animation
  const renderSkeleton = () => {
    const skeletonBg = isDark ? '#2C3E50' : '#e5e7eb';
    return (
      <View style={styles.skeletonContainer}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmerAnim, backgroundColor: colors.card }]}>
            <View style={[styles.skeletonIcon, { backgroundColor: skeletonBg }]} />
            <View style={styles.skeletonContent}>
              <View style={[styles.skeletonTitle, { backgroundColor: skeletonBg }]} />
              <View style={[styles.skeletonSubtitle, { backgroundColor: skeletonBg }]} />
            </View>
            <View style={[styles.skeletonAmount, { backgroundColor: skeletonBg }]} />
          </Animated.View>
        ))}
      </View>
    );
  };

  // Render Transaction Card — memoized so FlatList only re-renders changed rows
  const renderTransaction = useCallback(({ item }: { item: EnhancedTransaction }) => {
    const type = getTransactionType(item);
    const isPositive = type !== 'Sent';
    const icon = getTransactionIcon(item);

    return (
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <ThemedCard style={styles.transactionCard}>
          <TouchableOpacity
            style={styles.transactionCardInner}
            onPress={() => setSelectedTx(item)}
            activeOpacity={0.7}
          >
            {/* Icon */}
            <View style={[
              styles.transactionIcon,
              { backgroundColor: isPositive ? (isDark ? 'rgba(5,150,105,0.2)' : '#ecfdf5') : (isDark ? 'rgba(220,38,38,0.2)' : '#fef2f2') }
            ]}>
              <Text style={styles.transactionIconText}>{icon}</Text>
            </View>

            {/* Info */}
            <View style={styles.transactionInfo}>
              <View style={styles.transactionHeader}>
                <Text style={[styles.transactionType, { color: colors.textPrimary }]}>{type}</Text>
                {item.isFinal && (
                  <View style={styles.finalBadge}>
                    <Text style={styles.finalBadgeText}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.transactionDate, { color: colors.textMuted }]}>{formatDate(item.timestamp)}</Text>
              {type === 'Sent' && item.to && (
                <Text style={[styles.transactionAddress, { color: colors.textMuted }]} numberOfLines={1}>
                  To: {item.to ? item.to.substring(0, 12) : 'N/A'}...
                </Text>
              )}
              {type === 'Received' && item.from && (
                <Text style={[styles.transactionAddress, { color: colors.textMuted }]} numberOfLines={1}>
                  From: {item.from ? item.from.substring(0, 12) : 'N/A'}...
                </Text>
              )}
            </View>

            {/* Amount & Status */}
            <View style={styles.transactionRight}>
              <Text style={[
                styles.transactionAmount,
                { color: isPositive ? '#059669' : '#dc2626' }
              ]}>
                {formatAmount(item.amount, isPositive)} A50
              </Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(item) + '20' }
              ]}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: getStatusColor(item) }
                ]} />
                <Text style={[
                  styles.statusText,
                  { color: getStatusColor(item) }
                ]}>
                  {getStatusText(item)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </ThemedCard>
      </Animated.View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // helpers are pure — safe with empty deps; re-create only on mount

  // Render Transaction Detail Modal
  const renderDetailsModal = () => {
    if (!selectedTx) return null;

    const type = getTransactionType(selectedTx);
    const isPositive = type !== 'Sent';

    return (
      <Modal
        visible={!!selectedTx}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedTx(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {/* Fixed Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Text style={styles.modalIcon}>{getTransactionIcon(selectedTx)}</Text>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Transaction Details</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedTx(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.modalClose, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable body — ensures all details are reachable on small screens */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Amount Highlight */}
              <View style={[
                styles.amountHighlight,
                { backgroundColor: isPositive ? (isDark ? 'rgba(5,150,105,0.15)' : '#ecfdf5') : (isDark ? 'rgba(220,38,38,0.15)' : '#fef2f2') }
              ]}>
                <Text style={[
                  styles.amountHighlightText,
                  { color: isPositive ? '#059669' : '#dc2626' }
                ]}>
                  {formatAmount(selectedTx.amount, isPositive)} A50
                </Text>
                <Text style={[styles.amountHighlightLabel, { color: colors.textMuted }]}>{type}</Text>
              </View>

              {/* Blockchain Verification */}
              {selectedTx.confirmations !== undefined && (
                <View style={styles.confirmationSection}>
                  <View style={styles.confirmationBar}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <View
                        key={i}
                        style={[
                          styles.confirmationBlock,
                          {
                            backgroundColor: i <= (selectedTx.confirmations || 0)
                              ? (selectedTx.confirmations || 0) >= 6 ? '#059669' : '#3b82f6'
                              : (isDark ? '#2C3E50' : '#e5e7eb')
                          }
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.confirmationText, { color: colors.textMuted }]}>
                    {selectedTx.confirmations || 0}/6 Confirmations
                    {selectedTx.isFinal && ' (Final)'}
                  </Text>
                </View>
              )}

              {/* Details */}
              <View style={[styles.detailsSection, { borderTopColor: colors.cardBorder }]}>
                <DetailRow label="Transaction ID" value={selectedTx.id} copyable />
                <DetailRow label="Type" value={type} />
                <DetailRow
                  label="Fee"
                  value={`${selectedTx.fee || '0'} A50`}
                  highlight={userTrustLevel !== 'new'}
                  highlightText={`${userTrustLevel} rate`}
                />
                <DetailRow
                  label="Status"
                  value={getStatusText(selectedTx)}
                  valueColor={getStatusColor(selectedTx)}
                />
                <DetailRow label="From" value={selectedTx.from} copyable />
                <DetailRow label="To" value={selectedTx.to} copyable />
                <DetailRow
                  label="Timestamp"
                  value={new Date(selectedTx.timestamp).toLocaleString()}
                />
                {selectedTx.blockHeight && (
                  <DetailRow
                    label="Block Height"
                    value={`#${selectedTx.blockHeight.toLocaleString()}`}
                  />
                )}
              </View>
            </ScrollView>

            {/* Fixed Actions at bottom */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: colors.card2 }]}
                onPress={() => setSelectedTx(null)}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // Render Empty State
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>
        {filter === 'mining' ? '⛏️' : filter === 'sent' ? '↗️' : filter === 'received' ? '↙️' : '📋'}
      </Text>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        {searchQuery ? 'No results found' : `No ${filter === 'all' ? '' : filter + ' '}transactions yet`}
      </Text>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        {searchQuery
          ? 'Try adjusting your search or filters'
          : filter === 'mining'
            ? 'Participate in blocks to earn A50 credits'
            : filter === 'sent'
              ? 'Send A50 to another wallet to see transactions here'
              : filter === 'received'
                ? 'Receive A50 from others or earn block credits'
                : 'Your transaction history will appear here'}
      </Text>
      {!searchQuery && filter === 'all' && (
        <TouchableOpacity style={[styles.emptyAction, { backgroundColor: colors.accent }]}>
          <Text style={styles.emptyActionText}>Start Participating</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Loading State — skeleton only (no spinner blocking the layout)
  if (loading && transactions.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {renderNetworkBanner()}
        {renderSkeleton()}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Network Status Banner */}
      {renderNetworkBanner()}

      {/* Header Stats */}
      <View style={[styles.headerStats, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{filteredTransactions.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Transactions</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{networkStatus.currentHeight.toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Block Height</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />
        <View style={styles.statItem}>
          <View style={[styles.trustLevelBadge, { backgroundColor: isDark ? 'rgba(124,58,237,0.2)' : '#ede9fe' }]}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>{userTrustLevel}</Text>
          </View>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Trust Level</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
        <View style={[styles.searchInputWrapper, { backgroundColor: colors.card2 }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search by address, amount, or ID..."
            placeholderTextColor={colors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.clearSearch, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        {(['all', 'sent', 'received', 'mining'] as TransactionFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, { backgroundColor: colors.card2 }, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, { color: colors.textMuted }, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : f === 'mining' ? 'Credits' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Transaction List */}
      {filteredTransactions.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={filteredTransactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Transaction Details Modal */}
      {renderDetailsModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  // Network Banner
  networkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  networkBannerIcon: {
    fontSize: 16,
  },
  networkBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  // Header Stats
  headerStats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'capitalize',
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },
  trustLevelBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  // Search
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  clearSearch: {
    fontSize: 16,
    color: '#9ca3af',
    padding: 4,
  },
  // Filters
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  filterTabActive: {
    backgroundColor: '#667eea',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterTextActive: {
    color: '#fff',
  },
  // List
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  // Transaction Card
  transactionCard: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  transactionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionIconText: {
    fontSize: 22,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  transactionType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  finalBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  finalBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
  transactionDate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  transactionAddress: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 4,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 20,
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },
  // Skeleton
  skeletonContainer: {
    padding: 16,
  },
  skeletonCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    marginRight: 12,
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonTitle: {
    height: 16,
    width: '60%',
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonSubtitle: {
    height: 12,
    width: '40%',
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
  },
  skeletonAmount: {
    height: 20,
    width: 80,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalClose: {
    fontSize: 24,
    color: '#9ca3af',
    padding: 4,
  },
  // Amount Highlight
  amountHighlight: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  amountHighlightText: {
    fontSize: 32,
    fontWeight: '700',
  },
  amountHighlightLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  // Confirmation
  confirmationSection: {
    marginBottom: 20,
  },
  confirmationBar: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  confirmationBlock: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  confirmationText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Details
  detailsSection: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16,
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  trustBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trustBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7c3aed',
    textTransform: 'capitalize',
  },
  // Modal Actions
  modalActions: {
    marginTop: 8,
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
});
