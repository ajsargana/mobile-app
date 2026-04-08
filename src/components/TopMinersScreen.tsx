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
import BlockExplorerService, { Miner } from '../services/BlockExplorerService';

interface TopMinersScreenProps {
  navigation: any;
}

export const TopMinersScreen: React.FC<TopMinersScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [miners, setMiners] = useState<Miner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'all' | '24h' | '7d' | '30d'>('all');

  useFocusEffect(
    useCallback(() => {
      loadMiners(period);
    }, [period])
  );

  const loadMiners = async (selectedPeriod: 'all' | '24h' | '7d' | '30d' = 'all') => {
    try {
      setLoading(true);
      const explorer = BlockExplorerService.getInstance();
      const data = await explorer.getTopMinersWithPeriod(50, selectedPeriod);
      setMiners(data);
    } catch (error) {
      console.error('Failed to load top miners:', error);
      Alert.alert('Error', 'Failed to load top miners');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMiners(period);
    setRefreshing(false);
  };

  const handlePeriodChange = (selectedPeriod: 'all' | '24h' | '7d' | '30d') => {
    setPeriod(selectedPeriod);
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return '#FFD700'; // Gold
    if (rank === 2) return '#C0C0C0'; // Silver
    if (rank === 3) return '#CD7F32'; // Bronze
    return colors.textMuted;
  };

  const MinerItem = ({ miner }: { miner: Miner }) => (
    <TouchableOpacity
      style={[styles.minerItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
      onPress={() => miner.address && navigation.navigate('AddressDetail', { address: miner.address })}
      disabled={!miner.address}
    >
      <View style={styles.rankContainer}>
        <Text style={[styles.rank, { color: getRankColor(miner.rank) }]}>
          #{miner.rank}
        </Text>
      </View>

      <View style={styles.minerInfo}>
        <Text style={[styles.minerName, { color: colors.text }]} numberOfLines={1}>
          {miner.username || 'Unknown'}
        </Text>
        <Text style={[styles.minerAddress, { color: colors.textMuted }]} numberOfLines={1}>
          {miner.address ? miner.address.substring(0, 12) + '...' : 'N/A'}
        </Text>
      </View>

      <View style={styles.minerStats}>
        <View style={styles.statColumn}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Blocks</Text>
          <Text style={[styles.statValue, { color: colors.accent }]}>
            {miner.blocksMinedCount || parseFloat(miner.totalMined).toFixed(0)}
          </Text>
        </View>
        {miner.miningStreak !== undefined && (
          <View style={styles.statColumn}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Streak</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {miner.miningStreak}d
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const PeriodFilter = () => (
    <View style={styles.periodContainer}>
      {(['all', '24h', '7d', '30d'] as const).map(p => (
        <TouchableOpacity
          key={p}
          style={[
            styles.periodTab,
            period === p && [styles.activePeriodTab, { backgroundColor: colors.accent }]
          ]}
          onPress={() => handlePeriodChange(p)}
        >
          <Text style={[styles.periodText, { color: period === p ? '#FFF' : colors.text }]}>
            {p === 'all' ? 'All Time' : p === '24h' ? '24h' : p === '7d' ? '7d' : '30d'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Top Miners</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Period Filter */}
      <PeriodFilter />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : miners.length > 0 ? (
        <FlatList
          data={miners}
          renderItem={({ item }) => <MinerItem miner={item} />}
          keyExtractor={(item, index) => `${item.address}-${index}`}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          scrollIndicatorInsets={{ right: 1 }}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="podium-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No miners found</Text>
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
  periodContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
  },
  activePeriodTab: {
    borderColor: 'transparent',
  },
  periodText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  minerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  rankContainer: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rank: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  minerInfo: {
    flex: 1,
    marginLeft: 8,
  },
  minerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  minerAddress: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  minerStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statColumn: {
    alignItems: 'flex-end',
    minWidth: 50,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 12,
    fontWeight: 'bold',
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

export default TopMinersScreen;
