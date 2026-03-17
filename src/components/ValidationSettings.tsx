/**
 * Validation Settings Component
 *
 * User interface for configuring background validation behavior
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  BackgroundValidationService,
  BackgroundValidationConfig,
  DeviceState,
  BackgroundStats,
} from '../services/BackgroundValidationService';

export const ValidationSettings: React.FC = () => {
  const [config, setConfig] = useState<BackgroundValidationConfig | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [stats, setStats] = useState<BackgroundStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();

    // Refresh every 5 seconds
    const interval = setInterval(loadSettings, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const service = BackgroundValidationService.getInstance();
      const currentConfig = service.getConfig();
      const currentState = service.getDeviceState();
      const currentStats = service.getStats();

      setConfig(currentConfig);
      setDeviceState(currentState);
      setStats(currentStats);
      setLoading(false);
    } catch (error) {
      console.error('Error loading validation settings:', error);
      setLoading(false);
    }
  };

  const updateSetting = async (key: keyof BackgroundValidationConfig, value: any) => {
    try {
      const service = BackgroundValidationService.getInstance();
      await service.updateConfig({ [key]: value });
      await loadSettings();
    } catch (error) {
      console.error('Error updating setting:', error);
      Alert.alert('Error', 'Failed to update setting');
    }
  };

  if (loading || !config || !deviceState || !stats) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  const getBatteryColor = (level: number): string => {
    if (level >= 80) return '#4CAF50';
    if (level >= 50) return '#FFC107';
    if (level >= 20) return '#FF9800';
    return '#F44336';
  };

  const getConnectionIcon = (type: string): string => {
    if (type === 'wifi') return '📶';
    if (type === 'cellular') return '📱';
    return '❌';
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>⚙️ Validation Settings</Text>

      {/* Device Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Status</Text>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Battery:</Text>
            <View style={styles.statusValue}>
              <Text style={[styles.statusText, { color: getBatteryColor(deviceState.batteryLevel) }]}>
                {deviceState.batteryLevel}%
              </Text>
              {deviceState.isCharging && <Text style={styles.chargingIndicator}>⚡</Text>}
            </View>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Network:</Text>
            <Text style={styles.statusText}>
              {getConnectionIcon(deviceState.connectionType)} {deviceState.connectionType}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Power Save:</Text>
            <Text style={styles.statusText}>
              {deviceState.isPowerSaveMode ? '🔋 On' : '✅ Off'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>App State:</Text>
            <Text style={styles.statusText}>{deviceState.appState}</Text>
          </View>
        </View>
      </View>

      {/* Validation Statistics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistics</Text>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.totalValidations}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#4CAF50' }]}>
              {stats.successfulValidations}
            </Text>
            <Text style={styles.statLabel}>Success</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#F44336' }]}>
              {stats.failedValidations}
            </Text>
            <Text style={styles.statLabel}>Failed</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#FF9800' }]}>
              {stats.skippedValidations}
            </Text>
            <Text style={styles.statLabel}>Skipped</Text>
          </View>
        </View>

        <View style={styles.detailStats}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Battery Used:</Text>
            <Text style={styles.detailValue}>{stats.totalBatteryUsed.toFixed(2)}%</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Avg. Time:</Text>
            <Text style={styles.detailValue}>
              {(stats.averageValidationTime / 1000).toFixed(1)}s
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Uptime:</Text>
            <Text style={styles.detailValue}>
              {Math.floor(stats.uptime / 60000)}m
            </Text>
          </View>
        </View>
      </View>

      {/* Charging Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Charging Settings</Text>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Validate When Charging</Text>
            <Text style={styles.settingDescription}>
              Run validation when device is charging
            </Text>
          </View>
          <Switch
            value={config.validateWhenCharging}
            onValueChange={(value) => updateSetting('validateWhenCharging', value)}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
          />
        </View>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Minimum Charge Level</Text>
            <Text style={styles.settingDescription}>
              Don't validate below {config.minChargeLevel}% battery
            </Text>
          </View>
          <Text style={styles.settingValue}>{config.minChargeLevel}%</Text>
        </View>
      </View>

      {/* Network Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network Settings</Text>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>WiFi Only</Text>
            <Text style={styles.settingDescription}>
              Only validate when connected to WiFi
            </Text>
          </View>
          <Switch
            value={config.wifiOnly}
            onValueChange={(value) => updateSetting('wifiOnly', value)}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
          />
        </View>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Allow Cellular</Text>
            <Text style={styles.settingDescription}>
              Allow validation on mobile data (if WiFi only is off)
            </Text>
          </View>
          <Switch
            value={config.allowCellular}
            onValueChange={(value) => updateSetting('allowCellular', value)}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
            disabled={config.wifiOnly}
          />
        </View>
      </View>

      {/* Battery Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Battery Settings</Text>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Minimum Battery Level</Text>
            <Text style={styles.settingDescription}>
              Don't validate below {config.minBatteryLevel}%
            </Text>
          </View>
          <Text style={styles.settingValue}>{config.minBatteryLevel}%</Text>
        </View>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Pause on Low Battery</Text>
            <Text style={styles.settingDescription}>
              Pause validation in power save mode
            </Text>
          </View>
          <Switch
            value={config.pauseOnLowBattery}
            onValueChange={(value) => updateSetting('pauseOnLowBattery', value)}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
          />
        </View>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Max Battery Drain</Text>
            <Text style={styles.settingDescription}>
              Stop if draining more than {config.maxBatteryDrainPerHour}% per hour
            </Text>
          </View>
          <Text style={styles.settingValue}>{config.maxBatteryDrainPerHour}%/hr</Text>
        </View>
      </View>

      {/* Schedule Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule Settings</Text>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Validation Interval</Text>
            <Text style={styles.settingDescription}>
              Validate every {config.validationInterval} minutes
            </Text>
          </View>
          <Text style={styles.settingValue}>{config.validationInterval}min</Text>
        </View>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Adaptive Scheduling</Text>
            <Text style={styles.settingDescription}>
              Automatically adjust frequency based on conditions
            </Text>
          </View>
          <Switch
            value={config.adaptiveScheduling}
            onValueChange={(value) => updateSetting('adaptiveScheduling', value)}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
          />
        </View>

        <View style={styles.setting}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Quiet Hours</Text>
            <Text style={styles.settingDescription}>
              Don't validate from {config.quietHoursStart}:00 to {config.quietHoursEnd}:00
            </Text>
          </View>
          <Switch
            value={config.quietHoursEnabled}
            onValueChange={(value) => updateSetting('quietHoursEnabled', value)}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
          />
        </View>
      </View>

      {/* Help Text */}
      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>💡 Tips for Optimal Validation</Text>
        <Text style={styles.helpText}>
          • Keep "Validate When Charging" ON for best results
        </Text>
        <Text style={styles.helpText}>
          • WiFi only mode saves mobile data
        </Text>
        <Text style={styles.helpText}>
          • Validation uses {'<'}2% battery per hour when optimized
        </Text>
        <Text style={styles.helpText}>
          • Enable quiet hours to avoid validations while sleeping
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    padding: 20,
    textAlign: 'center',
    backgroundColor: '#fff',
  },
  section: {
    marginVertical: 8,
    backgroundColor: '#fff',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },

  // Device Status
  statusCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  statusValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },
  chargingIndicator: {
    fontSize: 16,
    marginLeft: 4,
  },

  // Statistics
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4A90E2',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailStats: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },

  // Settings
  setting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#999',
  },
  settingValue: {
    fontSize: 16,
    color: '#4A90E2',
    fontWeight: 'bold',
  },

  // Help Section
  helpSection: {
    margin: 16,
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    marginVertical: 2,
  },
});

export default ValidationSettings;
