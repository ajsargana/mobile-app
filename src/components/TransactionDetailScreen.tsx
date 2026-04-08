import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import BlockExplorerService, { TransactionDetail } from '../services/BlockExplorerService';

interface TransactionDetailScreenProps {
  navigation: any;
  route: any;
}

export const TransactionDetailScreen: React.FC<TransactionDetailScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const { txId } = route.params;
  const [transaction, setTransaction] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransaction();
  }, [txId]);

  const loadTransaction = async () => {
    try {
      setLoading(true);
      const explorer = BlockExplorerService.getInstance();
      const data = await explorer.getTransactionDetail(txId);
      setTransaction(data);
    } catch (error) {
      console.error('Failed to load transaction:', error);
      Alert.alert('Error', 'Failed to load transaction details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    Alert.alert('Copied', text);
  };

  const AddressDisplay = ({ label, address }: { label: string; address: string }) => (
    <TouchableOpacity
      style={[styles.addressRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
      onPress={() => {
        if (address && address !== 'N/A') {
          navigation.navigate('AddressDetail', { address });
        }
      }}
    >
      <Text style={[styles.addressLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.addressValue}>
        <Text style={[styles.addressText, { color: colors.accent }]} numberOfLines={1}>
          {address && address.length > 20 ? address.substring(0, 16) + '...' : (address || 'N/A')}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.accent} />
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

  if (!transaction) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textMuted }]}>Failed to load transaction</Text>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'final':
        return '#4CAF50';
      case 'pending':
        return '#FFC107';
      case 'failed':
        return '#E74C3C';
      default:
        return colors.textMuted;
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Transaction</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Status Badge */}
      <View style={styles.statusContainer}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(transaction.status) }]}>
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={styles.statusText}>{transaction.status.toUpperCase()}</Text>
        </View>
      </View>

      {/* Amount */}
      <ThemedCard style={styles.amountCard} padding={16}>
        <View style={styles.amountContent}>
          <Text style={[styles.amountLabel, { color: colors.textMuted }]}>Amount</Text>
          <Text style={[styles.amountValue, { color: colors.accent }]}>{transaction.amount} A50</Text>
          {transaction.fee && (
            <Text style={[styles.feeText, { color: colors.textMuted }]}>Fee: {transaction.fee} A50</Text>
          )}
        </View>
      </ThemedCard>

      {/* Transaction Details */}
      <ThemedCard style={styles.card} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Details</Text>

        <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Type</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {transaction.type.replace(/_/g, ' ').toUpperCase()}
          </Text>
        </View>

        <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Time</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {new Date(transaction.timestamp).toLocaleString()}
          </Text>
        </View>

        <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Transaction ID</Text>
          <TouchableOpacity onPress={() => copyToClipboard(transaction.id)}>
            <Text style={[styles.infoValue, { color: colors.accent }]} numberOfLines={1}>
              {transaction.id ? transaction.id.substring(0, 16) + '...' : 'N/A'}
            </Text>
          </TouchableOpacity>
        </View>
      </ThemedCard>

      {/* From/To */}
      <ThemedCard style={styles.card} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Parties</Text>
        <AddressDisplay label="From" address={transaction.from} />
        <AddressDisplay label="To" address={transaction.to} />
      </ThemedCard>

      {/* Gas and Advanced Data */}
      {((transaction as any).gasUsed || (transaction as any).gasLimit || (transaction as any).contractAddress) && (
        <ThemedCard style={styles.card} padding={16}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Advanced</Text>

          {(transaction as any).gasUsed && (
            <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Gas Used</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{(transaction as any).gasUsed}</Text>
            </View>
          )}

          {(transaction as any).gasLimit && (
            <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Gas Limit</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{(transaction as any).gasLimit}</Text>
            </View>
          )}

          {(transaction as any).contractAddress && (
            <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Contract</Text>
              <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
                {(transaction as any).contractAddress.substring(0, 12) + '...'}
              </Text>
            </View>
          )}
        </ThemedCard>
      )}

      {/* Metadata */}
      {(transaction as any).metadata && Object.keys((transaction as any).metadata).length > 0 && (
        <ThemedCard style={styles.card} padding={16}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Metadata</Text>
          {Object.entries((transaction as any).metadata).map(([key, value], idx) => (
            <View key={idx} style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {String(key)}
              </Text>
              <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
                {String(value)}
              </Text>
            </View>
          ))}
        </ThemedCard>
      )}

      {/* Block Information */}
      {transaction.block && (
        <ThemedCard style={styles.card} padding={16}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Block</Text>

          <TouchableOpacity
            style={[styles.blockRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
            onPress={() => navigation.navigate('BlockDetail', { blockId: transaction.block!.id })}
          >
            <View style={styles.blockInfo}>
              <Text style={[styles.blockLabel, { color: colors.textMuted }]}>Block #{transaction.block.height}</Text>
              <Text style={[styles.blockHash, { color: colors.accent }]} numberOfLines={1}>
                {transaction.block.hash ? transaction.block.hash.substring(0, 20) + '...' : 'N/A'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Confirmed</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {new Date(transaction.block.timestamp).toLocaleString()}
            </Text>
          </View>
        </ThemedCard>
      )}

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
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  amountCard: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  amountContent: {
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  feeText: {
    fontSize: 12,
  },
  card: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 140,
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  addressLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  addressValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressText: {
    fontSize: 12,
    fontFamily: 'monospace',
    maxWidth: 120,
  },
  blockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  blockInfo: {
    flex: 1,
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  blockHash: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  errorText: {
    textAlign: 'center',
    paddingVertical: 32,
    fontSize: 16,
  },
});

export default TransactionDetailScreen;
