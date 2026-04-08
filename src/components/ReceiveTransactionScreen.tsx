import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  FlatList,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { Transaction } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

export const ReceiveTransactionScreen = () => {
  const { colors, isDark } = useTheme();
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    try {
      setLoading(true);
      setError(null);

      const walletService = EnhancedWalletService.getInstance();
      const wallet = walletService.getCurrentAccount();

      if (wallet) {
        setWalletAddress(wallet.address);

        // Get recent incoming transactions (last 10)
        const allTransactions = wallet.transactions || [];
        const incoming = allTransactions
          .filter(tx => tx.to === wallet.address)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 10);

        setRecentTransactions(incoming);
      } else {
        setError('Wallet not found');
      }
    } catch (err) {
      console.error('Failed to load wallet data:', err);
      setError('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async () => {
    try {
      await Clipboard.setStringAsync(walletAddress);
      Alert.alert('Copied', 'Wallet address copied to clipboard');
    } catch (err) {
      console.error('Failed to copy address:', err);
      Alert.alert('Error', 'Failed to copy address');
    }
  };

  const handleShareAddress = async () => {
    try {
      await Share.share({
        message: `My AURA50 Wallet Address:\n\n${walletAddress}`,
        title: 'AURA50 Wallet Address',
      });
    } catch (err) {
      console.error('Failed to share address:', err);
    }
  };

  const formatAddress = (address: string, short: boolean = false): string => {
    if (!address) return '';
    if (short) {
      return `${address.substring(0, 10)}...${address.substring(address.length - 8)}`;
    }
    return address;
  };

  const formatDate = (timestamp: Date | string): string => {
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
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const formatAmount = (amount: string): string => {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0.00000000';
    return num.toFixed(8);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'confirmed':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'failed':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'confirmed':
        return '✓';
      case 'pending':
        return '⏳';
      case 'failed':
        return '✗';
      default:
        return '•';
    }
  };

  const renderTransactionItem = ({ item }: { item: Transaction }) => (
    <ThemedCard style={styles.transactionCard}>
      <View style={styles.transactionHeader}>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionAmount}>+{formatAmount(item.amount)} A50</Text>
          <Text style={[styles.transactionFrom, { color: colors.textMuted }]}>
            From: {formatAddress(item.from, true)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusIcon}>{getStatusIcon(item.status)}</Text>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.transactionFooter}>
        <Text style={[styles.transactionTime, { color: colors.textMuted }]}>{formatDate(item.timestamp)}</Text>
        {item.hash && (
          <Text style={[styles.transactionHash, { color: colors.textMuted }]} numberOfLines={1}>
            {item.hash ? item.hash.substring(0, 16) + '...' : 'N/A'}
          </Text>
        )}
      </View>
    </ThemedCard>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading wallet...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.bg }]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.accent }]} onPress={loadWalletData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Receive A50</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Share your wallet address to receive payments</Text>
      </View>

      {/* QR Code Card */}
      <ThemedCard style={styles.qrCard} padding={24}>
        <View style={styles.qrContainer}>
          {walletAddress ? (
            <QRCode
              value={walletAddress}
              size={200}
              backgroundColor="#ffffff"
              color="#111827"
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              <Text>QR Code</Text>
            </View>
          )}
        </View>
        <Text style={[styles.qrLabel, { color: colors.textMuted }]}>Scan to pay</Text>
      </ThemedCard>

      {/* Wallet Address Card */}
      <ThemedCard style={styles.addressCard}>
        <Text style={[styles.addressLabel, { color: colors.textMuted }]}>Your Wallet Address</Text>
        <View style={[styles.addressBox, { backgroundColor: colors.card2, borderColor: colors.cardBorder }]}>
          <Text style={[styles.addressText, { color: colors.textPrimary }]} numberOfLines={2} ellipsizeMode="middle">
            {walletAddress}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.copyButton]}
            onPress={handleCopyAddress}
          >
            <Text style={styles.actionButtonIcon}>📋</Text>
            <Text style={styles.actionButtonText}>Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.shareButton]}
            onPress={handleShareAddress}
          >
            <Text style={styles.actionButtonIcon}>📤</Text>
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </ThemedCard>

      {/* Recent Transactions */}
      <View style={styles.transactionsSection}>
        <View style={styles.transactionsHeader}>
          <Text style={[styles.transactionsTitle, { color: colors.textPrimary }]}>Recent Received</Text>
          <Text style={[styles.transactionsCount, { color: colors.textMuted }]}>
            {recentTransactions.length} transaction{recentTransactions.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {recentTransactions.length === 0 ? (
          <ThemedCard style={styles.emptyState} padding={32}>
            <Text style={styles.emptyIcon}>💰</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Transactions Yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              You haven't received any A50 coins yet. Share your address to receive payments!
            </Text>
          </ThemedCard>
        ) : (
          <FlatList
            data={recentTransactions}
            renderItem={renderTransactionItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.transactionsList}
          />
        )}
      </View>

      {/* Info Card */}
      <View style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#dbeafe' }]}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={[styles.infoText, { color: isDark ? '#60A5FA' : '#1e40af' }]}>
          Share your wallet address or QR code with anyone who wants to send you A50 coins.
          Your address is safe to share publicly.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollContent: {
    padding: 20,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f9fafb',
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
  header: {
    marginBottom: 24,
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
  qrCard: {
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  qrLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  addressCard: {
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  addressBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addressText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#111827',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 6,
  },
  copyButton: {
    backgroundColor: '#3b82f6',
  },
  shareButton: {
    backgroundColor: '#10b981',
  },
  actionButtonIcon: {
    fontSize: 16,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  transactionsSection: {
    marginBottom: 20,
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  transactionsCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  transactionsList: {
    gap: 12,
  },
  transactionCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 4,
  },
  transactionFrom: {
    fontSize: 13,
    color: '#6b7280',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusIcon: {
    fontSize: 10,
    color: '#fff',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  transactionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  transactionHash: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#9ca3af',
    maxWidth: 120,
  },
  emptyState: {
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  infoIcon: {
    fontSize: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
});
