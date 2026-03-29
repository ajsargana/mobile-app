// Must be first - ESM and crypto polyfills for React Native
import './metro.shim';
import './crypto-polyfill';
// Register background mining task definition before any component mounts
import './src/tasks/BackgroundMiningTask';

import React, { useState, useEffect } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Alert, DeviceEventEmitter, View, Text, TextInput } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from './src/services/EnhancedWalletService';
import { User, TrustLevel } from './src/types';
import UpdateCheckerService, { UpdateInfo } from './src/services/UpdateCheckerService';
import { UpdateModal } from './src/components/UpdateModal';

// Theme
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import NotificationService from './src/services/NotificationService';
import { soundService } from './src/services/SoundService';

// Components
import { AuthScreen } from './src/components/AuthScreen';
import { NewWalletScreen } from './src/components/NewWalletScreen';
import { MiningScreen } from './src/components/MiningScreen';
import { NetworkScreen } from './src/components/NetworkScreen';
import { SettingsScreen } from './src/components/SettingsScreen';
import { SendTransactionScreen } from './src/components/SendTransactionScreen';
import { ReceiveTransactionScreen } from './src/components/ReceiveTransactionScreen';
import { TransactionHistoryScreen } from './src/components/TransactionHistoryScreen';
import { TrustLevelScreen } from './src/components/TrustLevelScreen';
import { MiningHistoryScreen } from './src/components/MiningHistoryScreen';
import { EpochRewardsScreen } from './src/components/EpochRewardsScreen';
import { PINEntryScreen } from './src/components/PINEntryScreen';
import { WalletSetupScreen } from './src/components/WalletSetupScreen';
import { WalletRestoreScreen } from './src/components/WalletRestoreScreen';
import { SeedPhraseScreen } from './src/components/SeedPhraseScreen';
import { NodeScreen } from './src/components/NodeScreen';
import { MobileReferralScreen } from './src/components/MobileReferralScreen';
import { LeaderboardScreen } from './src/components/LeaderboardScreen';
import { InsurancePoolScreen } from './src/components/InsurancePoolScreen';
import { ProfileEditScreen } from './src/components/ProfileEditScreen';
import { TransactionSuccessScreen } from './src/components/TransactionSuccessScreen';
import { NotificationsScreen } from './src/components/NotificationsScreen';
import { HelpScreen } from './src/components/HelpScreen';
import { SplashVideoScreen } from './src/components/SplashVideoScreen';

// ── Android font-scale fix ────────────────────────────────────────────────────
// Android respects the system font-size setting (often 1.15×+); iOS ignores it.
// Disabling globally keeps every card, button, and hero section pixel-identical
// across platforms regardless of the user's Android accessibility font setting.
(Text as any).defaultProps = { ...((Text as any).defaultProps ?? {}), allowFontScaling: false };
(TextInput as any).defaultProps = { ...((TextInput as any).defaultProps ?? {}), allowFontScaling: false };

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ── Tab Navigator (consumes theme) ────────────────────────────────────────────
const MainTabNavigator = () => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Mining') {
            iconName = focused ? 'flash' : 'flash-outline';
          } else if (route.name === 'Leaderboard') {
            iconName = focused ? 'trophy' : 'trophy-outline';
          } else if (route.name === 'Insurance') {
            iconName = focused ? 'heart' : 'heart-outline';
          } else if (route.name === 'Referrals') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          } else {
            iconName = 'ellipse-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopWidth: isDark ? 0 : 1,
          borderTopColor: isDark ? 'transparent' : '#E5E7EB',
          elevation: isDark ? 0 : 4,
          shadowOpacity: isDark ? 0 : 0.08,
          shadowOffset: { width: 0, height: isDark ? 0 : -2 },
          paddingBottom: Platform.OS === 'ios' ? 20 : insets.bottom + 5,
          height: Platform.OS === 'ios' ? 85 : 60 + insets.bottom,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={NewWalletScreen} />
      <Tab.Screen name="Mining" component={MiningScreen} options={{ title: 'Forge' }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Insurance" component={InsurancePoolScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

// ── Stack Navigator ───────────────────────────────────────────────────────────
const AppNavigator = () => {
  const { colors, isDark } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: isDark ? '#0A3D62' : '#FFFFFF',
        },
        headerTintColor: isDark ? '#fff' : '#111827',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="SendTransaction"      component={SendTransactionScreen}     options={{ title: 'Send A50' }} />
      <Stack.Screen name="ReceiveTransaction"   component={ReceiveTransactionScreen}  options={{ title: 'Receive A50' }} />
      <Stack.Screen name="TransactionHistory"   component={TransactionHistoryScreen}  options={{ title: 'Transaction History' }} />
      <Stack.Screen name="TrustLevel"           component={TrustLevelScreen}          options={{ title: 'Trust Level' }} />
      <Stack.Screen name="MiningHistory"        component={MiningHistoryScreen}       options={{ title: 'Session History' }} />
      <Stack.Screen name="EpochRewards"         component={EpochRewardsScreen}         options={{ headerShown: false }} />
      <Stack.Screen name="SeedPhrase"           component={SeedPhraseScreen}          options={{ title: 'Seed Phrase' }} />
      <Stack.Screen name="ProfileEdit"          component={ProfileEditScreen}         options={{ headerShown: false }} />
      <Stack.Screen name="WalletRestore">
        {(props) => <WalletRestoreScreen {...props} onWalletRestored={() => props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })} />}
      </Stack.Screen>
      <Stack.Screen name="PINEntry"            component={PINEntryScreen}            options={{ title: 'Change PIN' }} />
      <Stack.Screen name="TransactionSuccess"  component={TransactionSuccessScreen}  options={{ headerShown: false }} />
      <Stack.Screen name="Notifications"       component={NotificationsScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="Help"               component={HelpScreen}                options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

// ── Auth Stack ────────────────────────────────────────────────────────────────
const AuthNavigator = ({ onAuthenticated }: { onAuthenticated: () => void }) => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth">
        {(props) => <AuthScreen {...props} onAuthenticated={onAuthenticated} />}
      </Stack.Screen>
      <Stack.Screen name="PINEntry" component={PINEntryScreen} />
      <Stack.Screen name="WalletSetup">
        {(props) => <WalletSetupScreen {...props} onWalletCreated={onAuthenticated} />}
      </Stack.Screen>
      <Stack.Screen name="WalletRestore">
        {(props) => <WalletRestoreScreen {...props} onWalletRestored={onAuthenticated} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

// ── App shell (inside ThemeProvider so it can read colors) ────────────────────
function AppShell() {
  const { isDark, colors } = useTheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => { initializeApp(); }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('logout', () => handleLogout());
    return () => subscription.remove();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('Services ready for lazy initialization');
      await checkAuthenticationState();
      await checkWalletState();
      // Set up notification channel + request permission (non-blocking)
      NotificationService.getInstance().requestPermission().catch(() => {});
      // Preload sounds (non-blocking)
      soundService.loadSounds().catch(() => {});
      // Check for app updates (non-blocking — never delays startup)
      UpdateCheckerService.check().then((info) => {
        if (info.hasUpdate) setUpdateInfo(info);
      }).catch(() => {});
    } catch (error) {
      console.error('App initialization error:', error);
      Alert.alert('Initialization Error', 'Failed to initialize the app. Please restart.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAndEnsureUser = async () => {
    try {
      const walletService = EnhancedWalletService.getInstance();
      if (walletService.getUser()) return;

      const wallet = await walletService.loadHDWallet();
      if (!wallet) return;

      const account = walletService.getCurrentAccount();
      if (!account) return;

      walletService.setUser({
        id: account.address,
        username: account.address.substring(0, 12),
        email: `${account.address.substring(0, 10)}@aura50.local`,
        firstName: 'Mobile',
        lastName: 'User',
        createdAt: new Date(),
        trustLevel: TrustLevel.NEW,
        coinBalance: account.balance || '0',
        totalMined: '0',
        miningStreak: 0,
        dailyMined: '0',
        referralCode: '',
        nodeAddress: account.address,
        publicKey: account.publicKey || '',
      } as User);
    } catch (_) {}
  };

  const checkAuthenticationState = async () => {
    try {
      const lastAuth = await SecureStore.getItemAsync('last_auth');
      const authTimeout = 5 * 60 * 1000;
      if (lastAuth) {
        const timeSinceAuth = Date.now() - parseInt(lastAuth);
        if (timeSinceAuth < authTimeout) { setIsAuthenticated(true); await loadAndEnsureUser(); return; }
      }
      const isFirstLaunch = await SecureStore.getItemAsync('first_launch');
      if (!isFirstLaunch) await SecureStore.setItemAsync('first_launch', 'false');
    } catch (error) { console.error('Authentication state check error:', error); }
  };

  const checkWalletState = async () => {
    try {
      const mnemonic = await SecureStore.getItemAsync('wallet_mnemonic');
      setHasWallet(!!mnemonic);
    } catch (error) { setHasWallet(false); }
  };

  const handleAuthentication = async () => {
    setIsAuthenticated(true);
    await checkWalletState();
    await loadAndEnsureUser();
  };

  const handleLogout = async () => {
    try {
      await SecureStore.deleteItemAsync('last_auth');
      setIsAuthenticated(false);
    } catch (error) { console.error('Logout error:', error); }
  };

  // Navigation theme matches app theme
  const navTheme = isDark
    ? { ...DarkTheme,    colors: { ...DarkTheme.colors,    background: colors.bg, card: colors.card } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.card } };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {!isLoading && (
        <NavigationContainer
          key={isAuthenticated ? 'app-nav' : 'auth-nav'}
          theme={navTheme}
        >
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {isAuthenticated
            ? <AppNavigator />
            : <AuthNavigator onAuthenticated={handleAuthentication} />}
          {updateInfo !== null && (
            <UpdateModal
              updateInfo={updateInfo}
              onDismiss={() => setUpdateInfo(null)}
            />
          )}
        </NavigationContainer>
      )}
      {showSplash && (
        <SplashVideoScreen onFinished={() => setShowSplash(false)} />
      )}
    </View>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
