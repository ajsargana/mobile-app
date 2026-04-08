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
import BlockExplorerService, { BlockDetail } from '../services/BlockExplorerService';

interface BlockDetailScreenProps {
  navigation: any;
  route: any;
}

export const BlockDetailScreen: React.FC<BlockDetailScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const { blockId } = route.params;
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBlock();
  }, [blockId]);

  const loadBlock = async () => {
    try {
      setLoading(true);
      const explorer = BlockExplorerService.getInstance();
      console.log(`Loading block detail for: ${blockId}`);
      const data = await explorer.getBlockDetail(blockId);
      console.log('Block loaded successfully:', data);
      if (!data) {
        throw new Error('Block data is null or undefined');
      }
      setBlock(data);
    } catch (error) {
      console.error('Failed to load block:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert(
        'Error',
        `Failed to load block details: ${errorMessage}\n\nPlease check if the Block Explorer API is available at the configured server.`
      );
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    // Implementation would use expo-clipboard
    Alert.alert('Copied', text);
  };

  const HashDisplay = ({ label, value }: { label: string; value?: string }) => {
    const shortValue = value ? value.substring(0, 16) + '...' : 'N/A';
    return (
      <View style={[styles.hashRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
        <Text style={[styles.hashLabel, { color: colors.textMuted }]}>{label}</Text>
        <TouchableOpacity
          onPress={() => value && copyToClipboard(value)}
          style={styles.hashValue}
        >
          <Text style={[styles.hashText, { color: colors.accent }]} numberOfLines={1}>
            {shortValue}
          </Text>
          {value && <Ionicons name="copy" size={14} color={colors.accent} />}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!block) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textMuted }]}>Failed to load block</Text>
      </View>
    );
  }

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
        <Text style={[styles.title, { color: colors.text }]}>Block Details</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Block Info */}
      <ThemedCard style={styles.card} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Block Information</Text>

        <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Block Height</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{block.height || 'N/A'}</Text>
        </View>

        <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Status</Text>
          <View style={[styles.statusBadge, { backgroundColor: block.status === 'final' ? '#4CAF50' : (block.status === 'confirmed' ? '#2196F3' : '#FFC107') }]}>
            <Text style={styles.statusText}>{(block.status || 'UNKNOWN').toUpperCase()}</Text>
          </View>
        </View>

        <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Timestamp</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {block.timestamp ? new Date(block.timestamp).toLocaleString() : 'N/A'}
          </Text>
        </View>

        <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Total Reward</Text>
          <Text style={[styles.infoValue, { color: colors.accent }]}>{block.totalReward || '0'} A50</Text>
        </View>

        {block.participantCount !== undefined && (
          <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Participants</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{block.participantCount}</Text>
          </View>
        )}

        {block.difficulty !== undefined && (
          <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Difficulty</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{block.difficulty.toLocaleString()}</Text>
          </View>
        )}

        {block.nonce !== undefined && (
          <View style={[styles.infoRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Nonce</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{block.nonce}</Text>
          </View>
        )}
      </ThemedCard>

      {/* Hashes and Merkle */}
      <ThemedCard style={styles.card} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Cryptographic Data</Text>
        <HashDisplay label="Block Hash" value={block.hash} />
        {block.prevHash && <HashDisplay label="Previous Hash" value={block.prevHash} />}
        {block.merkleRoot && <HashDisplay label="Merkle Root" value={block.merkleRoot} />}
      </ThemedCard>

      {/* Participants */}
      {block.participants && block.participants.length > 0 && (
        <ThemedCard style={styles.card} padding={16}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Participants ({block.participants.length})
          </Text>
          {block.participants.map((p, idx) => (
            <View
              key={idx}
              style={[styles.participantRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
            >
              <View style={styles.participantInfo}>
                <Text style={[styles.participantName, { color: colors.text }]}>{p.username || 'Unknown'}</Text>
                <Text style={[styles.participantShares, { color: colors.textMuted }]}>
                  {p.shares || 0} share{p.shares !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={[styles.participantReward, { color: colors.accent }]}>{p.reward || '0'}</Text>
            </View>
          ))}
        </ThemedCard>
      )}

      {/* Transactions */}
      {block.transactions && block.transactions.length > 0 && (
        <ThemedCard style={styles.card} padding={16}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Transactions ({block.transactions.length})
          </Text>
          {block.transactions.slice(0, 5).map((tx, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.txRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
              onPress={() => tx.id && navigation.navigate('TransactionDetail', { txId: tx.id })}
            >
              <View style={styles.txInfo}>
                <Text style={[styles.txType, { color: colors.text }]}>{tx.type || 'Unknown'}</Text>
                <Text style={[styles.txId, { color: colors.textMuted }]} numberOfLines={1}>
                  {tx.id ? tx.id.substring(0, 16) + '...' : 'N/A'}
                </Text>
              </View>
              <Text style={[styles.txAmount, { color: colors.accent }]}>{tx.amount || '0'}</Text>
            </TouchableOpacity>
          ))}
          {block.transactions.length > 5 && (
            <TouchableOpacity
              style={styles.viewMore}
              onPress={() => navigation.navigate('BlockTransactions', { blockId: block.id })}
            >
              <Text style={[styles.viewMoreText, { color: colors.accent }]}>
                View all {block.transactions.length} transactions
              </Text>
            </TouchableOpacity>
          )}
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
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  hashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  hashLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  hashValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hashText: {
    fontSize: 12,
    fontFamily: 'monospace',
    maxWidth: 120,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 13,
    fontWeight: '600',
  },
  participantShares: {
    fontSize: 12,
    marginTop: 2,
  },
  participantReward: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
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
    fontFamily: 'monospace',
  },
  txAmount: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  viewMore: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  viewMoreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    textAlign: 'center',
    paddingVertical: 32,
    fontSize: 16,
  },
});

export default BlockDetailScreen;
