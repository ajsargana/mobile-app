import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import BlockExplorerService, { SearchResult } from '../services/BlockExplorerService';

interface ExplorerSearchScreenProps {
  navigation: any;
}

export const ExplorerSearchScreen: React.FC<ExplorerSearchScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      Alert.alert('Error', 'Please enter a search query');
      return;
    }

    try {
      setLoading(true);
      const explorer = BlockExplorerService.getInstance();
      const result = await explorer.search(query.trim());
      setResults(result);
      setSearched(true);
    } catch (error) {
      console.error('Search failed:', error);
      Alert.alert('Error', 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const ResultHeader = ({ title, count }: { title: string; count: number }) =>
    count > 0 ? (
      <Text style={[styles.resultHeader, { color: colors.text }]}>
        {title} ({count})
      </Text>
    ) : null;

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
        <Text style={[styles.title, { color: colors.text }]}>Search</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search Input */}
      <ThemedCard style={styles.searchCard} padding={12}>
        <View
          style={[
            styles.searchInput,
            { borderColor: colors.accent, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB' }
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            placeholder="Block height, hash, tx ID, address..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            style={[styles.input, { color: colors.text }]}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.searchButton, { backgroundColor: colors.accent }]}
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </ThemedCard>

      {/* Results */}
      {searched && results && (
        <>
          {/* Blocks */}
          {results.blocks.length > 0 && (
            <ThemedCard style={styles.resultsCard} padding={16}>
              <ResultHeader title="Blocks" count={results.blocks.length} />
              {results.blocks.map(block => (
                <TouchableOpacity
                  key={block.id}
                  style={[styles.resultItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
                  onPress={() => {
                    navigation.navigate('BlockDetail', { blockId: block.id });
                    setSearched(false);
                  }}
                >
                  <Ionicons name="cube" size={16} color={colors.accent} />
                  <View style={styles.resultContent}>
                    <Text style={[styles.resultTitle, { color: colors.text }]}>Block #{block.height}</Text>
                    <Text style={[styles.resultSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                      {block.hash ? block.hash.substring(0, 24) + '...' : 'N/A'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ThemedCard>
          )}

          {/* Transactions */}
          {results.transactions.length > 0 && (
            <ThemedCard style={styles.resultsCard} padding={16}>
              <ResultHeader title="Transactions" count={results.transactions.length} />
              {results.transactions.map(tx => (
                <TouchableOpacity
                  key={tx.id}
                  style={[styles.resultItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
                  onPress={() => {
                    navigation.navigate('TransactionDetail', { txId: tx.id });
                    setSearched(false);
                  }}
                >
                  <Ionicons name="swap-horizontal" size={16} color={colors.accent} />
                  <View style={styles.resultContent}>
                    <Text style={[styles.resultTitle, { color: colors.text }]}>{tx.type}</Text>
                    <Text style={[styles.resultSubtitle, { color: colors.textMuted }]}>
                      {tx.amount} A50
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ThemedCard>
          )}

          {/* Addresses */}
          {results.addresses.length > 0 && (
            <ThemedCard style={styles.resultsCard} padding={16}>
              <ResultHeader title="Addresses" count={results.addresses.length} />
              {results.addresses.map(address => (
                <TouchableOpacity
                  key={address.address}
                  style={[styles.resultItem, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}
                  onPress={() => {
                    navigation.navigate('AddressDetail', { address: address.address });
                    setSearched(false);
                  }}
                >
                  <Ionicons name="wallet" size={16} color={colors.accent} />
                  <View style={styles.resultContent}>
                    <Text style={[styles.resultTitle, { color: colors.text }]}>{address.username || 'Unknown'}</Text>
                    <Text style={[styles.resultSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                      {address.address ? address.address.substring(0, 24) + '...' : 'N/A'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ThemedCard>
          )}

          {/* No Results */}
          {results.blocks.length === 0 && results.transactions.length === 0 && results.addresses.length === 0 && (
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.noResultsText, { color: colors.textMuted }]}>
                No results for "{query}"
              </Text>
            </View>
          )}
        </>
      )}

      {!searched && (
        <View style={styles.helpText}>
          <Text style={[styles.helpTitle, { color: colors.textMuted }]}>Search Tips:</Text>
          <Text style={[styles.helpItem, { color: colors.textMuted }]}>• Block height or hash</Text>
          <Text style={[styles.helpItem, { color: colors.textMuted }]}>• Transaction ID</Text>
          <Text style={[styles.helpItem, { color: colors.textMuted }]}>• Wallet address or username</Text>
        </View>
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
  searchCard: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchButton: {
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  resultsCard: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  resultHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  noResultsText: {
    fontSize: 16,
    marginTop: 8,
  },
  helpText: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 12,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  helpItem: {
    fontSize: 13,
    marginVertical: 4,
  },
});

export default ExplorerSearchScreen;
