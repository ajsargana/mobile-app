import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NetworkService } from '../services/NetworkService';
import { P2PConnection, NetworkStats } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

interface NetworkScreenProps {
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
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  return <Animated.View style={[{ backgroundColor: '#ccc', borderRadius: 4 }, { opacity }, style]} />;
};

const NetworkSkeleton: React.FC = () => (
  <>
    <View style={{ backgroundColor: '#7F8C8D', padding: 24, alignItems: 'center' }}>
      <SkeletonBox style={{ width: 40, height: 40, borderRadius: 20, marginBottom: 10 }} />
      <SkeletonBox style={{ width: 200, height: 20, borderRadius: 8, marginBottom: 6 }} />
      <SkeletonBox style={{ width: 120, height: 14, borderRadius: 6 }} />
    </View>
    <View style={{ backgroundColor: '#FFF', margin: 16, borderRadius: 12, padding: 16 }}>
      <SkeletonBox style={{ width: 140, height: 20, borderRadius: 6, marginBottom: 16 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{ width: '48%', backgroundColor: '#F8F9FA', borderRadius: 8, padding: 16, marginBottom: 12, alignItems: 'center' }}>
            <SkeletonBox style={{ width: 30, height: 30, borderRadius: 15, marginBottom: 8 }} />
            <SkeletonBox style={{ width: 60, height: 18, borderRadius: 6, marginBottom: 4 }} />
            <SkeletonBox style={{ width: 80, height: 12, borderRadius: 6 }} />
          </View>
        ))}
      </View>
    </View>
  </>
);
// ─────────────────────────────────────────────────────────────────────────────

export const NetworkScreen: React.FC<NetworkScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [networkStats, setNetworkStats] = useState<NetworkStats>({
    connectedPeers: 0,
    totalPeers: 0,
    blockHeight: 0,
    hashRate: 0,
    difficulty: 1000,
    networkVersion: '1.0.0',
    syncStatus: 'offline'
  });
  const [connections, setConnections] = useState<P2PConnection[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const mountedRef = useRef(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const networkService = NetworkService.getInstance();

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      await loadNetworkData();
      if (!mountedRef.current) return;
      setIsInitializing(false);

      // Start interval only AFTER first render
      intervalRef.current = setInterval(() => {
        if (mountedRef.current) loadNetworkData();
      }, 5000);
    };

    init();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const loadNetworkData = useCallback(async () => {
    try {
      const [stats, conns] = await Promise.all([
        networkService.getNetworkStats(),
        Promise.resolve(networkService.getConnections()),
      ]);
      if (mountedRef.current) {
        setNetworkStats(stats);
        setConnections(conns);
        setIsConnected(networkService.isNetworkConnected());
      }
    } catch (error) {
      console.error('Failed to load network data:', error);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadNetworkData();
    setIsRefreshing(false);
  }, [loadNetworkData]);

  const handleConnectToNetwork = useCallback(async () => {
    try {
      Alert.alert('Connecting to Network', 'Attempting to connect to AURA5O P2P network...');
      await networkService.connectToBootstrapNodes();
      await loadNetworkData();
    } catch (error) {
      Alert.alert('Connection Failed', 'Unable to connect to the network. Please check your internet connection.');
    }
  }, [loadNetworkData]);

  const getSyncStatusColor = (): string => {
    switch (networkStats.syncStatus) {
      case 'synced': return '#27AE60';
      case 'syncing': return '#F39C12';
      case 'offline': return '#E74C3C';
      default: return '#95A5A6';
    }
  };

  const getSyncStatusText = (): string => {
    switch (networkStats.syncStatus) {
      case 'synced': return 'Synchronized';
      case 'syncing': return 'Synchronizing...';
      case 'offline': return 'Offline';
      default: return 'Unknown';
    }
  };

  const formatHashRate = (hashRate: number): string => {
    if (hashRate < 1000) return `${hashRate} H/s`;
    if (hashRate < 1000000) return `${(hashRate / 1000).toFixed(1)} KH/s`;
    if (hashRate < 1000000000) return `${(hashRate / 1000000).toFixed(1)} MH/s`;
    return `${(hashRate / 1000000000).toFixed(1)} GH/s`;
  };

  const getConnectionStatusColor = (status: string): string => {
    switch (status) {
      case 'connected': return '#27AE60';
      case 'connecting': return '#F39C12';
      case 'disconnected': return '#E74C3C';
      default: return '#95A5A6';
    }
  };

  const formatLatency = (latency: number): string => {
    return `${Math.round(latency)}ms`;
  };

  const getNetworkTypeIcon = (): string => {
    return isConnected ? 'wifi' : 'wifi-off';
  };

  if (isInitializing) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
        <NetworkSkeleton />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {/* Network Status Header */}
      <LinearGradient
        colors={isConnected ? ['#4ECDC4', '#44A08D'] : ['#95A5A6', '#7F8C8D']}
        style={styles.statusHeader}
      >
        <View style={styles.statusContainer}>
          <Ionicons name={getNetworkTypeIcon()} size={32} color="#FFF" />
          <Text style={styles.statusTitle}>
            {isConnected ? 'Connected to AURA5O Network' : 'Offline Mode'}
          </Text>
          <Text style={styles.statusSubtitle}>
            {isConnected
              ? `${networkStats.connectedPeers} peers connected`
              : 'Transactions queued for sync'
            }
          </Text>
        </View>

        {!isConnected && (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={handleConnectToNetwork}
          >
            <Text style={styles.connectButtonText}>Connect to Network</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* Network Statistics */}
      <ThemedCard style={styles.statsContainer}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Network Statistics</Text>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="cube" size={24} color="#3498DB" />
            <Text style={styles.statValue}>{networkStats.blockHeight.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Block Height</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="people" size={24} color="#27AE60" />
            <Text style={styles.statValue}>
              {networkStats.connectedPeers}/{networkStats.totalPeers}
            </Text>
            <Text style={styles.statLabel}>Peers</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="flash" size={24} color="#E67E22" />
            <Text style={styles.statValue}>{formatHashRate(networkStats.hashRate)}</Text>
            <Text style={styles.statLabel}>Network Speed</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="shield" size={24} color="#9B59B6" />
            <Text style={styles.statValue}>{networkStats.difficulty.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Difficulty</Text>
          </View>
        </View>

        {/* Sync Status */}
        <View style={styles.syncStatusContainer}>
          <View style={styles.syncStatusHeader}>
            <Ionicons name="sync" size={20} color={getSyncStatusColor()} />
            <Text style={[styles.syncStatusText, { color: getSyncStatusColor() }]}>
              {getSyncStatusText()}
            </Text>
          </View>

          {networkStats.syncStatus === 'syncing' && (
            <View style={styles.syncProgress}>
              <View style={styles.syncProgressBar}>
                <View style={[styles.syncProgressFill, { width: '75%' }]} />
              </View>
              <Text style={styles.syncProgressText}>Syncing blocks...</Text>
            </View>
          )}
        </View>
      </ThemedCard>

      {/* Peer Connections */}
      <ThemedCard style={styles.peersContainer}>
        <View style={styles.peersHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Peer Connections</Text>
          <TouchableOpacity onPress={() => navigation.navigate('PeerDetails')}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        {connections.length === 0 ? (
          <View style={styles.noPeersContainer}>
            <Ionicons name="globe-outline" size={48} color="#BDC3C7" />
            <Text style={styles.noPeersText}>No peer connections</Text>
            <Text style={styles.noPeersSubtext}>
              {isConnected
                ? 'Connecting to network...'
                : 'Connect to internet to discover peers'
              }
            </Text>
          </View>
        ) : (
          connections.slice(0, 5).map((connection) => (
            <View key={connection.peerId} style={styles.peerItem}>
              <View style={styles.peerInfo}>
                <View style={styles.peerHeader}>
                  <Text style={styles.peerAddress}>
                    {connection.multiaddr.slice(0, 30)}...
                  </Text>
                  <View style={[
                    styles.peerStatus,
                    { backgroundColor: getConnectionStatusColor(connection.status) }
                  ]}>
                    <Text style={styles.peerStatusText}>
                      {connection.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.peerMetrics}>
                  <View style={styles.peerMetric}>
                    <Ionicons name="time" size={12} color="#7F8C8D" />
                    <Text style={styles.peerMetricText}>
                      {formatLatency(connection.latency)}
                    </Text>
                  </View>

                  <View style={styles.peerMetric}>
                    <Ionicons name="star" size={12} color="#7F8C8D" />
                    <Text style={styles.peerMetricText}>
                      {connection.reputation}/100
                    </Text>
                  </View>

                  <View style={styles.peerMetric}>
                    <Ionicons name="calendar" size={12} color="#7F8C8D" />
                    <Text style={styles.peerMetricText}>
                      {new Date(connection.lastSeen).toLocaleTimeString()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ThemedCard>

      {/* Network Information */}
      <ThemedCard style={styles.infoContainer}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Network Information</Text>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Network Version</Text>
          <Text style={styles.infoValue}>{networkStats.networkVersion}</Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Protocol</Text>
          <Text style={styles.infoValue}>AURA5O P2P</Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Compression</Text>
          <Text style={styles.infoValue}>Temporal-Spatial (31M-fold)</Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Mobile Optimized</Text>
          <Text style={styles.infoValue}>Yes (2G+ compatible)</Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Offline Support</Text>
          <Text style={styles.infoValue}>Full transaction queuing</Text>
        </View>
      </ThemedCard>

      {/* Network Tools */}
      <ThemedCard style={styles.toolsContainer}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Network Tools</Text>

        <TouchableOpacity
          style={styles.toolButton}
          onPress={() => navigation.navigate('NetworkDiagnostics')}
        >
          <Ionicons name="analytics" size={20} color="#3498DB" />
          <Text style={styles.toolButtonText}>Network Diagnostics</Text>
          <Ionicons name="chevron-forward" size={16} color="#BDC3C7" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolButton}
          onPress={() => navigation.navigate('BlockExplorer')}
        >
          <Ionicons name="cube" size={20} color="#27AE60" />
          <Text style={styles.toolButtonText}>Block Explorer</Text>
          <Ionicons name="chevron-forward" size={16} color="#BDC3C7" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolButton}
          onPress={() => navigation.navigate('PeerDiscovery')}
        >
          <Ionicons name="search" size={20} color="#E67E22" />
          <Text style={styles.toolButtonText}>Peer Discovery</Text>
          <Ionicons name="chevron-forward" size={16} color="#BDC3C7" />
        </TouchableOpacity>
      </ThemedCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusHeader: {
    padding: 24,
    alignItems: 'center',
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 8,
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  connectButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  connectButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsContainer: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
    textAlign: 'center',
  },
  syncStatusContainer: {
    borderTopWidth: 1,
    borderTopColor: '#ECF0F1',
    paddingTop: 16,
  },
  syncStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  syncStatusText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  syncProgress: {
    marginTop: 8,
  },
  syncProgressBar: {
    height: 4,
    backgroundColor: '#ECF0F1',
    borderRadius: 2,
    overflow: 'hidden',
  },
  syncProgressFill: {
    height: '100%',
    backgroundColor: '#F39C12',
  },
  syncProgressText: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
  },
  peersContainer: {
    margin: 16,
  },
  peersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllText: {
    color: '#3498DB',
    fontSize: 14,
  },
  noPeersContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noPeersText: {
    fontSize: 16,
    color: '#7F8C8D',
    marginTop: 16,
  },
  noPeersSubtext: {
    fontSize: 14,
    color: '#BDC3C7',
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 32,
  },
  peerItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
    paddingVertical: 12,
  },
  peerInfo: {
    flex: 1,
  },
  peerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  peerAddress: {
    fontSize: 14,
    color: '#2C3E50',
    fontFamily: 'monospace',
    flex: 1,
  },
  peerStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  peerStatusText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  peerMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  peerMetric: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peerMetricText: {
    fontSize: 12,
    color: '#7F8C8D',
    marginLeft: 4,
  },
  infoContainer: {
    margin: 16,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  infoLabel: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  infoValue: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '500',
  },
  toolsContainer: {
    margin: 16,
    marginBottom: 32,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  toolButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#2C3E50',
    marginLeft: 12,
  },
});