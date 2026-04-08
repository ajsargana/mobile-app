import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  DeviceEventEmitter,
  Linking,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { AppConfig, NotificationConfig, BiometricConfig } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useDeviceCapability, type OverrideSetting } from '../contexts/DeviceCapabilityContext';
import { languages } from '../i18n/languages';
import NotificationService from '../services/NotificationService';
import AchievementsSheet from './AchievementsSheet';
import ThemePickerModal from './ThemePickerModal';
import ThemedCard from './ThemedCard';
import { LanguagePickerModal } from './LanguageSelectionScreen';

interface SettingsScreenProps {
  navigation: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors, isDark, toggleTheme } = useTheme();
  const { currentLanguage } = useLanguage();
  const { perfTier, overrideSetting, overrideTier } = useDeviceCapability();
  const [config, setConfig] = useState<AppConfig>({
    nodeEndpoint: 'wss://bootstrap.AURA5O.network',
    p2pBootstrapNodes: [
      'AURA5O-bootstrap-us.example.com:8334',
      'AURA5O-bootstrap-eu.example.com:8334',
    ],
    miningEnabled: true,
    offlineMode: false,
    biometric: {
      enabled: false,
      type: 'fingerprint',
      enrollmentRequired: false,
    },
    dataCompression: true,
    lowBandwidthMode: false,
  });

  const [notifications, setNotifications] = useState<NotificationConfig>({
    mining: true,
    transactions: true,
    network: false,
    security: true,
    marketing: false,
  });

  const [dailyNotifsEnabled, setDailyNotifsEnabled] = useState(false);
  const [achievementsOpen,   setAchievementsOpen]   = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  useEffect(() => {
    loadSettings();
    NotificationService.getInstance().isEnabled().then(setDailyNotifsEnabled);
  }, []);

  const loadSettings = async () => {
    try {
      // Load app config
      const savedConfig = await SecureStore.getItemAsync('app_config');
      if (savedConfig) {
        setConfig(JSON.parse(savedConfig));
      }

      // Load notification config
      const savedNotifications = await SecureStore.getItemAsync('notification_config');
      if (savedNotifications) {
        setNotifications(JSON.parse(savedNotifications));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveConfig = async (newConfig: AppConfig) => {
    try {
      await SecureStore.setItemAsync('app_config', JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error('Failed to save config:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const saveNotifications = async (newNotifications: NotificationConfig) => {
    try {
      await SecureStore.setItemAsync('notification_config', JSON.stringify(newNotifications));
      setNotifications(newNotifications);
    } catch (error) {
      console.error('Failed to save notifications:', error);
      Alert.alert('Error', 'Failed to save notification settings');
    }
  };

  const toggleMining = (enabled: boolean) => {
    saveConfig({ ...config, miningEnabled: enabled });
  };

  const toggleOfflineMode = (enabled: boolean) => {
    saveConfig({ ...config, offlineMode: enabled });
  };

  const toggleDataCompression = (enabled: boolean) => {
    saveConfig({ ...config, dataCompression: enabled });
  };

  const toggleLowBandwidthMode = (enabled: boolean) => {
    saveConfig({ ...config, lowBandwidthMode: enabled });
    if (enabled) {
      Alert.alert(
        'Low Bandwidth Mode',
        'This mode reduces data usage and is optimized for 2G/3G networks. Some features may be limited.'
      );
    }
  };

  const toggleBiometric = (enabled: boolean) => {
    const newBiometric = { ...config.biometric, enabled };
    saveConfig({ ...config, biometric: newBiometric });
  };

  const toggleNotification = (type: keyof NotificationConfig, enabled: boolean) => {
    const newNotifications = { ...notifications, [type]: enabled };
    saveNotifications(newNotifications);
  };

  const toggleDailyNotifs = async (enabled: boolean) => {
    if (enabled) {
      await NotificationService.getInstance().enable();
      setDailyNotifsEnabled(true);
    } else {
      await NotificationService.getInstance().disable();
      setDailyNotifsEnabled(false);
    }
  };

  const handleBackupWallet = () => {
    navigation.navigate('SeedPhrase');
  };

  const handleRestoreWallet = () => {
    Alert.alert(
      'Restore Wallet',
      'This will replace your current wallet. Make sure you have a backup of your current wallet.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => navigation.navigate('WalletRestore') }
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear temporary files and cached data. Your wallet and settings will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', onPress: async () => {
          try {
            const cacheKeys = [
              'transaction_cache',
              'block_cache',
              'peer_list_cache',
              'network_stats_cache',
              'mining_history_cache',
            ];
            await Promise.all(
              cacheKeys.map(key => SecureStore.deleteItemAsync(key).catch(() => {}))
            );
            Alert.alert('Success', 'Cache cleared successfully');
          } catch (error) {
            Alert.alert('Error', 'Failed to clear cache');
          }
        }}
      ]
    );
  };

  const handleResetApp = () => {
    Alert.alert(
      'Reset Application',
      'This will delete ALL data including your wallet, settings, and transaction history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => {
          Alert.alert(
            'Final Confirmation',
            'Are you absolutely sure? Your wallet keys will be permanently deleted and cannot be recovered.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset Everything', style: 'destructive', onPress: async () => {
                try {
                  const allKeys = [
                    'app_config', 'notification_config',
                    'wallet_mnemonic', 'wallet_address', 'wallet_private_key',
                    'aura50_auth_token', 'last_auth', 'first_launch', 'user_pin',
                    'transaction_cache', 'block_cache', 'peer_list_cache',
                    'network_stats_cache', 'mining_history_cache',
                  ];
                  await Promise.all(
                    allKeys.map(key => SecureStore.deleteItemAsync(key).catch(() => {}))
                  );
                  DeviceEventEmitter.emit('logout');
                } catch (error) {
                  Alert.alert('Error', 'Failed to reset application');
                }
              }}
            ]
          );
        }}
      ]
    );
  };

  const SettingItem = ({
    title,
    subtitle,
    icon,
    onPress,
    rightComponent,
    showArrow = false
  }: {
    title: string;
    subtitle?: string;
    icon: string;
    onPress?: () => void;
    rightComponent?: React.ReactNode;
    showArrow?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.settingItem, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : '#EEF2FF' }]}>
          <Ionicons name={icon as any} size={20} color={colors.settingIcon} />
        </View>
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, { color: colors.settingTitle }]}>{title}</Text>
          {subtitle && <Text style={[styles.settingSubtitle, { color: colors.settingSubtitle }]}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.settingRight}>
        {rightComponent}
        {showArrow && <Ionicons name="chevron-forward" size={16} color={colors.settingArrow} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <>
    <AchievementsSheet visible={achievementsOpen} onClose={() => setAchievementsOpen(false)} />
    <ThemePickerModal visible={themePickerOpen} onClose={() => setThemePickerOpen(false)} />
    <Modal
      visible={languagePickerOpen}
      animationType="slide"
      onRequestClose={() => setLanguagePickerOpen(false)}
    >
      <LanguagePickerModal
        isModal={true}
        onComplete={() => setLanguagePickerOpen(false)}
      />
    </Modal>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.settingsBg }]}
      contentContainerStyle={{ paddingTop: insets.top + 8 }}
    >
      {/* App Settings */}
      <ThemedCard style={styles.sectionOuter} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Application Settings</Text>

        {/* Dark Mode toggle */}
        <SettingItem
          title="Dark Mode"
          subtitle="Follow Mining page color palette"
          icon="moon"
          rightComponent={
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
              thumbColor="#FFFFFF"
            />
          }
        />

        {/* Performance Mode selector */}
        <SettingItem
          title="Performance Mode"
          subtitle={
            overrideSetting === 'auto'
              ? `Auto-detected: ${perfTier}`
              : overrideSetting === 'lite' ? 'Lite mode' : 'Full mode'
          }
          icon="speedometer"
          rightComponent={
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {(['auto', 'full', 'lite'] as const).map(opt => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => overrideTier(opt)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: overrideSetting === opt
                      ? colors.accent
                      : (isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6'),
                  }}
                >
                  <Text style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: overrideSetting === opt ? '#FFF' : colors.textMuted,
                  }}>
                    {opt === 'auto' ? 'Auto' : opt === 'lite' ? 'Lite' : 'Full'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={async () => {
                  await AsyncStorage.removeItem('@aura50_perf_tier_override');
                  await overrideTier('auto');
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6',
                }}
              >
                <Text style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: colors.textMuted,
                }}>
                  Reset
                </Text>
              </TouchableOpacity>
            </View>
          }
        />

        <SettingItem
          title="Start Tour"
          subtitle="Guided walkthrough of all AURA50 features"
          icon="compass"
          onPress={async () => {
            await AsyncStorage.setItem('@aura50_onboarding_v2_step', '0');
            navigation.navigate('Home');
          }}
          showArrow
        />

        <SettingItem
          title="Achievements"
          subtitle="View your earned badges and milestones"
          icon="trophy"
          onPress={() => setAchievementsOpen(true)}
          showArrow
        />

        <SettingItem
          title="Help & FAQ"
          subtitle="Guides, tours and frequently asked questions"
          icon="help-circle"
          onPress={() => navigation.navigate('Help')}
          showArrow
        />

        <SettingItem
          title="Block Explorer"
          subtitle="View blockchain transactions and network stats"
          icon="search"
          onPress={() => navigation.navigate('BlockExplorer')}
          showArrow
        />

        {/* Language Selector */}
        {(() => {
          const currentLang = languages.find(l => l.code === currentLanguage);
          return (
            <SettingItem
              title={t('settings.language')}
              subtitle={currentLang?.nativeName}
              icon="globe"
              onPress={() => setLanguagePickerOpen(true)}
              showArrow
            />
          );
        })()}

        <SettingItem
          title="Block Participation"
          subtitle="Allow this device to contribute to block consensus"
          icon="flash"
          rightComponent={
            <Switch
              value={config.miningEnabled}
              onValueChange={toggleMining}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />

        <SettingItem
          title="Offline Mode"
          subtitle="Queue transactions when offline"
          icon="cloud-offline"
          rightComponent={
            <Switch
              value={config.offlineMode}
              onValueChange={toggleOfflineMode}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />

        <SettingItem
          title="Data Compression"
          subtitle="Enable temporal-spatial compression"
          icon="archive"
          rightComponent={
            <Switch
              value={config.dataCompression}
              onValueChange={toggleDataCompression}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />

        <SettingItem
          title="Low Bandwidth Mode"
          subtitle="Optimize for 2G/3G networks"
          icon="cellular"
          rightComponent={
            <Switch
              value={config.lowBandwidthMode}
              onValueChange={toggleLowBandwidthMode}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />
      </ThemedCard>

      {/* Security Settings */}
      <ThemedCard style={styles.sectionOuter} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Security</Text>

        <SettingItem
          title="Biometric Authentication"
          subtitle="Use fingerprint or face ID"
          icon="finger-print"
          rightComponent={
            <Switch
              value={config.biometric.enabled}
              onValueChange={toggleBiometric}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />

        <SettingItem
          title="Change PIN"
          subtitle="Update your security PIN"
          icon="keypad"
          onPress={() => navigation.navigate('PINEntry', { mode: 'change' })}
          showArrow
        />
      </ThemedCard>

      {/* Notifications */}
      <ThemedCard style={styles.sectionOuter} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Notifications</Text>

        <SettingItem
          title="Daily Streak Reminder"
          subtitle="Get reminded to keep your streak alive"
          icon="flame"
          rightComponent={
            <Switch
              value={dailyNotifsEnabled}
              onValueChange={toggleDailyNotifs}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
              thumbColor="#FFFFFF"
            />
          }
        />

        <SettingItem
          title="Participation Notifications"
          subtitle="Participation status and credits"
          icon="flash"
          rightComponent={
            <Switch
              value={notifications.mining}
              onValueChange={(enabled) => toggleNotification('mining', enabled)}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />

        <SettingItem
          title="Transaction Alerts"
          subtitle="Incoming and outgoing transactions"
          icon="swap-horizontal"
          rightComponent={
            <Switch
              value={notifications.transactions}
              onValueChange={(enabled) => toggleNotification('transactions', enabled)}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />

        <SettingItem
          title="Network Updates"
          subtitle="Connection and sync status"
          icon="globe"
          rightComponent={
            <Switch
              value={notifications.network}
              onValueChange={(enabled) => toggleNotification('network', enabled)}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />

        <SettingItem
          title="Security Alerts"
          subtitle="Login attempts and security issues"
          icon="shield"
          rightComponent={
            <Switch
              value={notifications.security}
              onValueChange={(enabled) => toggleNotification('security', enabled)}
              trackColor={{ false: colors.switchTrackFalse, true: colors.switchTrackTrue }}
            />
          }
        />
      </ThemedCard>

      {/* Wallet Management */}
      <ThemedCard style={styles.sectionOuter} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Wallet Management</Text>

        <SettingItem
          title="Backup Wallet"
          subtitle="Create encrypted backup"
          icon="shield-checkmark"
          onPress={handleBackupWallet}
          showArrow
        />

        <SettingItem
          title="Restore Wallet"
          subtitle="Restore from backup"
          icon="download"
          onPress={handleRestoreWallet}
          showArrow
        />

      </ThemedCard>

      {/* Maintenance */}
      <ThemedCard style={styles.sectionOuter} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Maintenance</Text>

        <SettingItem
          title="Clear Cache"
          subtitle="Free up storage space"
          icon="trash"
          onPress={handleClearCache}
          showArrow
        />

        <SettingItem
          title="Check for Updates"
          subtitle="Update to latest version"
          icon="download"
          onPress={() => Alert.alert('Updates', 'You are running the latest version')}
          showArrow
        />
      </ThemedCard>

      {/* About */}
      <ThemedCard style={styles.sectionOuter} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>About</Text>

        <SettingItem
          title="AURA50 Mobile"
          subtitle="Version 1.0.0 (Build 1)"
          icon="information-circle"
        />

        <SettingItem
          title="Privacy Policy"
          subtitle="How we protect your data"
          icon="document-text"
          onPress={() => Linking.openURL('https://aura50.org/privacy').catch(() => Alert.alert('Error', 'Unable to open link'))}
          showArrow
        />

        <SettingItem
          title="Terms of Service"
          subtitle="Usage terms and conditions"
          icon="document"
          onPress={() => Linking.openURL('https://aura50.org/terms').catch(() => Alert.alert('Error', 'Unable to open link'))}
          showArrow
        />

        <SettingItem
          title="Support"
          subtitle="Get help and report issues"
          icon="help-circle"
          onPress={() => Linking.openURL('https://aura50.org').catch(() => Alert.alert('Error', 'Unable to open link'))}
          showArrow
        />
      </ThemedCard>

      {/* Account Actions */}
      <ThemedCard style={styles.sectionOuter} padding={16}>
        <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Account</Text>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: colors.logoutBg }]}
          onPress={async () => {
            Alert.alert(
              'Logout',
              'Are you sure you want to logout? You will need your credentials to login again.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Logout',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // Clear auth tokens (keys must be alphanumeric with . - _ only)
                      await SecureStore.deleteItemAsync('aura50_auth_token');
                      await SecureStore.deleteItemAsync('last_auth');
                      // Signal App to switch to auth screen
                      DeviceEventEmitter.emit('logout');
                    } catch (error) {
                      console.error('Logout error:', error);
                      Alert.alert('Error', 'Failed to logout. Please try again.');
                    }
                  }
                }
              ]
            );
          }}
        >
          <Ionicons name="log-out" size={20} color={colors.logoutIcon} />
          <Text style={[styles.logoutButtonText, { color: colors.logoutText }]}>Logout</Text>
        </TouchableOpacity>
      </ThemedCard>

      {/* Danger Zone */}
      <View style={[styles.section, styles.dangerSection, { backgroundColor: colors.dangerBg }]}>
        <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>

        <TouchableOpacity style={styles.dangerButton} onPress={handleResetApp}>
          <Ionicons name="warning" size={20} color="#E74C3C" />
          <Text style={styles.dangerButtonText}>Reset Application</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.footerText }]}>
          AURA5O - World's First Mobile-Native Blockchain
        </Text>
      </View>
    </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor set inline via theme
  },
  section: {
    // backgroundColor set inline via theme
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionOuter: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    // color set inline via theme
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    // borderBottomColor set inline via theme
  },
  settingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    // backgroundColor set inline via theme
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    // color set inline via theme
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 14,
    // color set inline via theme
    marginTop: 2,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoItem: {
    width: '48%',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor set inline via theme
    borderColor: '#667eea',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  logoutButtonText: {
    // color set inline via theme
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  dangerSection: {
    borderColor: '#E74C3C',
    borderWidth: 1,
  },
  dangerTitle: {
    color: '#E74C3C',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderColor: '#E74C3C',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dangerButtonText: {
    color: '#E74C3C',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7F8C8D',
    textAlign: 'center',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#BDC3C7',
    textAlign: 'center',
    marginTop: 4,
  },
});