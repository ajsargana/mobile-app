import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Dimensions,
  RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MobileNodeService, { NodeStats } from '../services/MobileNodeService';

const { width } = Dimensions.get('window');

interface NodeScreenProps {
  navigation: any;
}

export const NodeScreen: React.FC<NodeScreenProps> = ({ navigation }) => {
  const [nodeService] = useState(() => MobileNodeService.getInstance());
  const [isNodeRunning, setIsNodeRunning] = useState(false);
  const [nodeStats, setNodeStats] = useState<NodeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [config, setConfig] = useState({
    wifiOnly: false,
    backgroundSync: true,
    validationLevel: 'light' as 'light' | 'full'
  });

  useEffect(() => {
    loadNodeData();
    const interval = setInterval(loadNodeData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadNodeData = async () => {
    try {
      setIsLoading(true);

      // Check if node is running
      const running = nodeService.isNodeRunning();
      setIsNodeRunning(running);

      // Load node configuration
      const nodeConfig = nodeService.getConfig();
      setConfig({
        wifiOnly: nodeConfig.wifiOnly,
        backgroundSync: nodeConfig.backgroundSync,
        validationLevel: nodeConfig.validationLevel
      });

      // Load node statistics if running
      if (running) {
        const stats = await nodeService.getNodeStats();
        setNodeStats(stats);
      } else {
        setNodeStats(null);
      }

    } catch (error) {
      console.error('Failed to load node data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadNodeData();
    setIsRefreshing(false);
  };

  const handleStartNode = async () => {
    try {
      setIsLoading(true);
      await nodeService.startNode();
      await loadNodeData();

      Alert.alert(
        'Node Started',
        'Your mobile node is now participating in the AURA5O network!',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Failed to Start Node',
        `Error: ${error}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopNode = async () => {
    Alert.alert(
      'Stop Node',
      'Are you sure you want to stop your mobile node? You will stop earning credits.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await nodeService.stopNode();
              await loadNodeData();
            } catch (error) {
              Alert.alert('Error', `Failed to stop node: ${error}`);
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleConfigChange = async (key: string, value: any) => {
    try {
      const newConfig = { ...config, [key]: value };
      setConfig(newConfig);

      await nodeService.updateConfig(newConfig);

      if (isNodeRunning) {
        Alert.alert(
          'Configuration Updated',
          'Node configuration has been updated. Restart the node to apply changes.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert('Error', `Failed to update configuration: ${error}`);
    }
  };

  const formatUptime = (uptime: number): string => {
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const formatRewards = (rewards: string): string => {
    const num = parseFloat(rewards);
    return num.toFixed(8);
  };

  const getTrustLevelColor = (score: number): string => {
    if (score >= 80) return '#FFD700'; // Gold for legend
    if (score >= 60) return '#9B59B6'; // Purple for veteran
    if (score >= 40) return '#3498DB'; // Blue for established
    return '#95A5A6'; // Gray for new
  };

  const getTrustLevelText = (score: number): string => {
    if (score >= 80) return 'Legend';
    if (score >= 60) return 'Veteran';
    if (score >= 40) return 'Established';
    return 'New';
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Node Status...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {/* Node Status Header */}
      <LinearGradient
        colors={isNodeRunning ? ['#27AE60', '#2ECC71'] : ['#E74C3C', '#C0392B']}
        style={styles.statusHeader}
      >
        <View style={styles.statusContainer}>
          <Ionicons
            name={isNodeRunning ? 'globe' : 'globe-outline'}
            size={48}
            color="#FFF"
          />
          <Text style={styles.statusTitle}>
            {isNodeRunning ? 'Node Online' : 'Node Offline'}
          </Text>
          <Text style={styles.statusSubtitle}>
            {isNodeRunning
              ? 'Participating in AURA5O Network'
              : 'Start node to earn credits'
            }
          </Text>
        </View>

        {/* Node Control Button */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={isNodeRunning ? handleStopNode : handleStartNode}
        >
          <Text style={styles.controlButtonText}>
            {isNodeRunning ? 'Stop Node' : 'Start Node'}
          </Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Node Statistics */}
      {isNodeRunning && nodeStats && (
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Node Statistics</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={24} color="#3498DB" />
              <Text style={styles.statValue}>{formatUptime(nodeStats.uptime)}</Text>
              <Text style={styles.statLabel}>Uptime</Text>
            </View>

            <View style={styles.statItem}>
              <Ionicons name="people-outline" size={24} color="#9B59B6" />
              <Text style={styles.statValue}>{nodeStats.peersConnected}</Text>
              <Text style={styles.statLabel}>Peers</Text>
            </View>

            <View style={styles.statItem}>
              <Ionicons name="checkmark-circle-outline" size={24} color="#27AE60" />
              <Text style={styles.statValue}>{nodeStats.transactionsValidated}</Text>
              <Text style={styles.statLabel}>Validations</Text>
            </View>

            <View style={styles.statItem}>
              <Ionicons name="cube-outline" size={24} color="#E67E22" />
              <Text style={styles.statValue}>{nodeStats.blocksStored}</Text>
              <Text style={styles.statLabel}>Blocks</Text>
            </View>
          </View>

          {/* Trust Score */}
          <View style={styles.trustContainer}>
            <View style={styles.trustHeader}>
              <Text style={styles.trustTitle}>Trust Score</Text>
              <View style={[
                styles.trustBadge,
                { backgroundColor: getTrustLevelColor(nodeStats.trustScore) }
              ]}>
                <Text style={styles.trustBadgeText}>
                  {getTrustLevelText(nodeStats.trustScore)}
                </Text>
              </View>
            </View>

            <View style={styles.trustProgressContainer}>
              <View style={styles.trustProgressBar}>
                <View
                  style={[
                    styles.trustProgress,
                    {
                      width: `${nodeStats.trustScore}%`,
                      backgroundColor: getTrustLevelColor(nodeStats.trustScore)
                    }
                  ]}
                />
              </View>
              <Text style={styles.trustScore}>{nodeStats.trustScore}/100</Text>
            </View>
          </View>

          {/* Rewards */}
          <View style={styles.rewardsContainer}>
            <View style={styles.rewardsHeader}>
              <Ionicons name="diamond-outline" size={24} color="#FFD700" />
              <Text style={styles.rewardsTitle}>Node Credits</Text>
            </View>
            <Text style={styles.rewardsAmount}>
              {formatRewards(nodeStats.rewardsEarned)} A50
            </Text>
            <Text style={styles.rewardsSubtext}>
              Earned from validation and network participation
            </Text>
          </View>
        </View>
      )}

      {/* Node Configuration */}
      <View style={styles.configContainer}>
        <Text style={styles.sectionTitle}>Node Configuration</Text>

        <View style={styles.configItem}>
          <View style={styles.configHeader}>
            <Ionicons name="wifi-outline" size={20} color="#3498DB" />
            <Text style={styles.configLabel}>WiFi Only Mode</Text>
          </View>
          <Switch
            value={config.wifiOnly}
            onValueChange={(value) => handleConfigChange('wifiOnly', value)}
            trackColor={{ false: '#BDC3C7', true: '#3498DB' }}
            thumbColor={config.wifiOnly ? '#FFF' : '#FFF'}
          />
        </View>

        <View style={styles.configItem}>
          <View style={styles.configHeader}>
            <Ionicons name="sync-outline" size={20} color="#27AE60" />
            <Text style={styles.configLabel}>Background Sync</Text>
          </View>
          <Switch
            value={config.backgroundSync}
            onValueChange={(value) => handleConfigChange('backgroundSync', value)}
            trackColor={{ false: '#BDC3C7', true: '#27AE60' }}
            thumbColor={config.backgroundSync ? '#FFF' : '#FFF'}
          />
        </View>

        <View style={styles.configItem}>
          <View style={styles.configHeader}>
            <Ionicons name="speedometer-outline" size={20} color="#E67E22" />
            <Text style={styles.configLabel}>Validation Level</Text>
          </View>
          <TouchableOpacity
            style={styles.configButton}
            onPress={() => {
              const newLevel = config.validationLevel === 'light' ? 'full' : 'light';
              handleConfigChange('validationLevel', newLevel);
            }}
          >
            <Text style={styles.configButtonText}>
              {config.validationLevel === 'light' ? 'Light' : 'Full'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Node Benefits */}
      <View style={styles.benefitsContainer}>
        <Text style={styles.sectionTitle}>Node Benefits</Text>

        <View style={styles.benefitItem}>
          <Ionicons name="diamond-outline" size={20} color="#FFD700" />
          <Text style={styles.benefitText}>Earn A50 credits for validation</Text>
        </View>

        <View style={styles.benefitItem}>
          <Ionicons name="trending-up-outline" size={20} color="#27AE60" />
          <Text style={styles.benefitText}>Trust score increases over time</Text>
        </View>

        <View style={styles.benefitItem}>
          <Ionicons name="shield-outline" size={20} color="#3498DB" />
          <Text style={styles.benefitText}>Strengthen network security</Text>
        </View>

        <View style={styles.benefitItem}>
          <Ionicons name="globe-outline" size={20} color="#9B59B6" />
          <Text style={styles.benefitText}>Support global decentralization</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    fontSize: 18,
    color: '#7F8C8D',
  },
  statusHeader: {
    padding: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 12,
  },
  statusSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  controlButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsContainer: {
    backgroundColor: '#FFF',
    margin: 16,
    borderRadius: 12,
    padding: 16,
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
    marginBottom: 20,
  },
  statItem: {
    width: (width - 64) / 2,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
  },
  trustContainer: {
    marginBottom: 20,
  },
  trustHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trustTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  trustBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trustBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  trustProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trustProgressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#ECF0F1',
    borderRadius: 4,
    marginRight: 12,
  },
  trustProgress: {
    height: 8,
    borderRadius: 4,
  },
  trustScore: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  rewardsContainer: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  rewardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rewardsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginLeft: 8,
  },
  rewardsAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  rewardsSubtext: {
    fontSize: 12,
    color: '#7F8C8D',
    textAlign: 'center',
  },
  configContainer: {
    backgroundColor: '#FFF',
    margin: 16,
    borderRadius: 12,
    padding: 16,
  },
  configItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
  },
  configHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  configLabel: {
    fontSize: 16,
    color: '#2C3E50',
    marginLeft: 8,
  },
  configButton: {
    backgroundColor: '#3498DB',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  configButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  benefitsContainer: {
    backgroundColor: '#FFF',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  benefitText: {
    fontSize: 14,
    color: '#2C3E50',
    marginLeft: 12,
  },
});

export default NodeScreen;