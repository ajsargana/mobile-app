// AURA5O iOS App - React Native Interface
// Revolutionary mobile-first blockchain app for iOS with native UI

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  StatusBar,
  ActivityIndicator,
  Switch,
  SafeAreaView,
} from 'react-native';
import { NativeAURA5OMobileApp, MobileAppFactory } from '../NativeMobileApp';

interface AppState {
  app: NativeAURA5OMobileApp | null;
  balance: string;
  trustLevel: string;
  miningActive: boolean;
  peerCount: number;
  syncStatus: string;
  isLoading: boolean;
  notifications: any[];
}

export default function AURA5OiOSApp() {
  const [state, setState] = useState<AppState>({
    app: null,
    balance: '0.00000000',
    trustLevel: 'new',
    miningActive: false,
    peerCount: 0,
    syncStatus: 'offline',
    isLoading: true,
    notifications: [],
  });

  const [offlineMode, setOfflineMode] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(true);

  // Initialize app on component mount
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Create mobile app (smartphone by default)
      const app = MobileAppFactory.createForSmartphone('ios_device_' + Date.now());

      // Start the app
      const startResult = await app.startApp();

      if (startResult.success) {
        const appStatus = app.getAppStatus();

        setState(prev => ({
          ...prev,
          app,
          balance: appStatus.appState.balance,
          trustLevel: appStatus.appState.trustLevel,
          miningActive: appStatus.appState.miningActive,
          peerCount: appStatus.appState.peerCount,
          syncStatus: appStatus.appState.syncStatus,
          isLoading: false,
        }));

        // iOS style alert
        Alert.alert(
          'AURA5O Ready ✅',
          'Your blockchain app is ready to use!',
          [{ text: 'OK', style: 'default' }]
        );
      } else {
        throw new Error('Failed to start app');
      }
    } catch (error) {
      Alert.alert(
        'Initialization Error ❌',
        'Failed to initialize AURA5O app',
        [{ text: 'Retry', onPress: initializeApp }, { text: 'Cancel', style: 'cancel' }]
      );
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const refreshStatus = async () => {
    if (!state.app) return;

    const appStatus = state.app.getAppStatus();
    const notifications = state.app.getNotifications();

    setState(prev => ({
      ...prev,
      balance: appStatus.appState.balance,
      trustLevel: appStatus.appState.trustLevel,
      miningActive: appStatus.appState.miningActive,
      peerCount: appStatus.appState.peerCount,
      syncStatus: appStatus.appState.syncStatus,
      notifications: notifications.slice(0, 5), // Show last 5
    }));
  };

  const startMining = async () => {
    if (!state.app) return;

    // iOS style confirmation
    Alert.alert(
      'Start Forging? ⚡',
      'This will use battery and data to contribute to the network.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Forging',
          style: 'default',
          onPress: async () => {
            try {
              setState(prev => ({ ...prev, isLoading: true }));

              const miningResult = await state.app!.startMining();

              if (miningResult.success) {
                Alert.alert(
                  'Forging Started! ⚡',
                  `Estimated credit: ${miningResult.estimatedReward} DIG\nTrust bonus: ${miningResult.trustBonus.toFixed(1)}%\nBattery optimized: ${miningResult.batteryOptimized ? 'Yes' : 'No'}`,
                  [{ text: 'OK', style: 'default' }]
                );

                setState(prev => ({ ...prev, miningActive: true, isLoading: false }));
                refreshStatus();
              } else {
                throw new Error('Mining failed to start');
              }
            } catch (error) {
              Alert.alert(
                'Forging Error ❌',
                'Failed to start participating. Please check your network connection.',
                [{ text: 'OK', style: 'default' }]
              );
              setState(prev => ({ ...prev, isLoading: false }));
            }
          }
        }
      ]
    );
  };

  const stopMining = async () => {
    Alert.alert(
      'Stop Forging? ⏹️',
      'This will stop earning DIG credits.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop Forging',
          style: 'destructive',
          onPress: async () => {
            try {
              const stopResult = await state.app!.stopMining();

              Alert.alert(
                'Forging Stopped ⏹️',
                `Credit earned: ${stopResult.rewardEarned} DIG\nBattery used: ${stopResult.batteryUsed.toFixed(1)}%\nDuration: ${(stopResult.miningDuration / 1000 / 60).toFixed(1)} minutes`,
                [{ text: 'OK', style: 'default' }]
              );

              setState(prev => ({ ...prev, miningActive: false }));
              refreshStatus();
            } catch (error) {
              Alert.alert('Error ❌', 'Failed to stop mining');
            }
          }
        }
      ]
    );
  };

  const sendTransaction = () => {
    Alert.prompt(
      'Send DIG 💸',
      'Enter recipient address and amount (separated by space)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async (input) => {
            if (!input || !state.app) return;

            const [recipient, amount] = input.split(' ');
            if (!recipient || !amount) {
              Alert.alert(
                'Invalid Input ❌',
                'Please enter: recipient_address amount\nExample: user123 10.5'
              );
              return;
            }

            try {
              const txResult = await state.app.sendTransaction(recipient, amount);

              if (txResult.success) {
                Alert.alert(
                  'Transaction Sent! ✅',
                  `Amount: ${amount} DIG\nFee: ${txResult.fee} DIG\nRecipient: ${recipient}\nConfirmation time: ${txResult.estimatedConfirmation}s\nOffline capable: ${txResult.canSendOffline ? 'Yes' : 'No'}`,
                  [{ text: 'OK', style: 'default' }]
                );
                refreshStatus();
              } else {
                Alert.alert(
                  'Transaction Failed ❌',
                  'Please check your balance and try again.',
                  [{ text: 'OK', style: 'default' }]
                );
              }
            } catch (error) {
              Alert.alert('Transaction Error ❌', 'Transaction failed to process');
            }
          }
        }
      ],
      'plain-text',
      '',
      'default'
    );
  };

  const syncNetwork = async () => {
    if (!state.app) return;

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const syncResult = await state.app.syncWithNetwork();

      Alert.alert(
        'Sync Complete 🔄',
        `Blocks synced: ${syncResult.blocksSynced}\nTransactions processed: ${syncResult.transactionsProcessed}\nData compression saved: ${syncResult.compressionSaved} bytes\nTrust level updated: ${syncResult.trustLevelUpdated ? 'Yes' : 'No'}`,
        [{ text: 'OK', style: 'default' }]
      );

      setState(prev => ({ ...prev, isLoading: false }));
      refreshStatus();
    } catch (error) {
      Alert.alert(
        'Sync Failed ❌',
        'Unable to sync with the network. Please check your connection.',
        [{ text: 'OK', style: 'default' }]
      );
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const getTrustLevelEmoji = (level: string) => {
    switch (level) {
      case 'new': return '🆕';
      case 'established': return '⭐';
      case 'veteran': return '🏆';
      case 'legend': return '👑';
      default: return '❓';
    }
  };

  const getTrustLevelColor = (level: string) => {
    switch (level) {
      case 'new': return '#FF3B30';
      case 'established': return '#34C759';
      case 'veteran': return '#007AFF';
      case 'legend': return '#FF9500';
      default: return '#8E8E93';
    }
  };

  const getSyncStatusEmoji = (status: string) => {
    switch (status) {
      case 'synced': return '✅';
      case 'syncing': return '🔄';
      case 'offline': return '📴';
      default: return '❓';
    }
  };

  if (state.isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Initializing AURA5O...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AURA5O</Text>
        <Text style={styles.headerSubtitle}>Mobile Blockchain</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Balance Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Balance</Text>
          <Text style={styles.balanceText}>{state.balance} DIG</Text>
          <View style={styles.trustRow}>
            <Text style={styles.trustLabel}>Trust Level</Text>
            <View style={styles.trustBadge}>
              <Text style={styles.trustEmoji}>{getTrustLevelEmoji(state.trustLevel)}</Text>
              <Text style={[styles.trustValue, { color: getTrustLevelColor(state.trustLevel) }]}>
                {state.trustLevel.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Network Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🌐 Network Status</Text>
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <Text style={styles.statusValue}>{state.peerCount}</Text>
              <Text style={styles.statusLabel}>Peers</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusEmoji}>{getSyncStatusEmoji(state.syncStatus)}</Text>
              <Text style={styles.statusLabel}>{state.syncStatus}</Text>
            </View>
          </View>
        </View>

        {/* Mining Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⛏️ Mining</Text>
          <View style={styles.miningStatusContainer}>
            <Text style={styles.miningStatus}>
              {state.miningActive ? '🟢 CONTRIBUTING' : '🔴 INACTIVE'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, state.miningActive ? styles.stopButton : styles.startButton]}
            onPress={state.miningActive ? stopMining : startMining}
          >
            <Text style={styles.primaryButtonText}>
              {state.miningActive ? '⏹️ Stop Forging' : '⚡ Start Forging'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💸 Quick Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.actionButton} onPress={sendTransaction}>
              <Text style={styles.actionEmoji}>💸</Text>
              <Text style={styles.actionText}>Send DIG</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={syncNetwork}>
              <Text style={styles.actionEmoji}>🔄</Text>
              <Text style={styles.actionText}>Sync</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={refreshStatus}>
              <Text style={styles.actionEmoji}>📊</Text>
              <Text style={styles.actionText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚙️ Settings</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>📴 Offline Mode</Text>
              <Text style={styles.settingDescription}>Work without internet</Text>
            </View>
            <Switch
              value={offlineMode}
              onValueChange={setOfflineMode}
              thumbColor={offlineMode ? '#007AFF' : '#F2F2F7'}
              trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
              ios_backgroundColor="#E5E5EA"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>🔒 Face ID / Touch ID</Text>
              <Text style={styles.settingDescription}>Secure transactions</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometricEnabled}
              thumbColor={biometricEnabled ? '#007AFF' : '#F2F2F7'}
              trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
              ios_backgroundColor="#E5E5EA"
            />
          </View>
        </View>

        {/* Notifications Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔔 Recent Activity</Text>
          {state.notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No recent activity</Text>
            </View>
          ) : (
            state.notifications.map((notif, index) => (
              <View key={index} style={styles.notification}>
                <View style={styles.notificationHeader}>
                  <Text style={styles.notificationTitle}>{notif.title}</Text>
                  <Text style={styles.notificationTime}>
                    {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.notificationMessage}>{notif.message}</Text>
                {notif.amount && (
                  <Text style={styles.notificationAmount}>{notif.amount} DIG</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 20,
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#000000',
    padding: 20,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#007AFF',
    fontSize: 16,
    marginTop: 4,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
  },
  balanceText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trustLabel: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trustEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  trustValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    alignItems: 'center',
  },
  statusValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statusEmoji: {
    fontSize: 24,
  },
  statusLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  miningStatusContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  miningStatus: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  primaryButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#34C759',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  actionEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  settingDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyStateText: {
    color: '#8E8E93',
    fontSize: 16,
    fontStyle: 'italic',
  },
  notification: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  notificationTime: {
    fontSize: 14,
    color: '#8E8E93',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  notificationAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
});