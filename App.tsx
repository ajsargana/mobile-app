// Must be first - ESM and crypto polyfills for React Native
import './metro.shim';
import './crypto-polyfill';
// Register background mining task definition before any component mounts
import './src/tasks/BackgroundMiningTask';
// Initialize i18n
import './src/i18n';

import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Alert, DeviceEventEmitter, View, Text, TextInput, Linking, PanResponder, Animated, Dimensions, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from './src/services/EnhancedWalletService';
import { User, TrustLevel } from './src/types';
import UpdateCheckerService, { UpdateInfo } from './src/services/UpdateCheckerService';
import { UpdateModal } from './src/components/UpdateModal';

// Theme
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
// Device Capability
import { DeviceCapabilityProvider } from './src/contexts/DeviceCapabilityContext';
// Internationalization
import { LanguageProvider, useLanguage } from './src/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
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
import { BlockExplorerScreen } from './src/components/BlockExplorerScreen';
import { BlocksListScreen } from './src/components/BlocksListScreen';
import { BlockDetailScreen } from './src/components/BlockDetailScreen';
import { BlockTransactionsScreen } from './src/components/BlockTransactionsScreen';
import { TopMinersScreen } from './src/components/TopMinersScreen';
import { RecentTransactionsScreen } from './src/components/RecentTransactionsScreen';
import { TransactionDetailScreen } from './src/components/TransactionDetailScreen';
import { AddressDetailScreen } from './src/components/AddressDetailScreen';
import { ExplorerSearchScreen } from './src/components/ExplorerSearchScreen';
import { LanguageSelectionScreen } from './src/components/LanguageSelectionScreen';

// ── Android font-scale fix ────────────────────────────────────────────────────
// Android respects the system font-size setting (often 1.15×+); iOS ignores it.
// Disabling globally keeps every card, button, and hero section pixel-identical
// across platforms regardless of the user's Android accessibility font setting.
(Text as any).defaultProps = { ...((Text as any).defaultProps ?? {}), allowFontScaling: false };
(TextInput as any).defaultProps = { ...((TextInput as any).defaultProps ?? {}), allowFontScaling: false };

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Tab Navigator (consumes theme) ────────────────────────────────────────────
const MainTabNavigator = () => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

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
      <Tab.Screen name="Home" component={NewWalletScreen} options={{ title: t('nav.home') }} />
      <Tab.Screen name="Mining" component={MiningScreen} options={{ title: t('nav.forge') }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: t('nav.leaderboard') }} />
      <Tab.Screen name="Insurance" component={InsurancePoolScreen} options={{ title: t('nav.insurance') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
    </Tab.Navigator>
  );
};

// ── Floating Refer & Earn capsule (persists across all screens) ───────────────
const FloatingReferCapsule = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const capsuleX = useRef(new Animated.Value(SCREEN_W * 0.52)).current;
  const capsuleY = useRef(new Animated.Value(SCREEN_H * 0.30)).current;
  const isDragging = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        isDragging.current = false;
        capsuleX.setOffset((capsuleX as any)._value);
        capsuleY.setOffset((capsuleY as any)._value);
        capsuleX.setValue(0);
        capsuleY.setValue(0);
      },
      onPanResponderMove: (_, gs) => {
        isDragging.current = true;
        (capsuleX as any).setValue(gs.dx);
        (capsuleY as any).setValue(gs.dy);
      },
      onPanResponderRelease: () => {
        capsuleX.flattenOffset();
        capsuleY.flattenOffset();
      },
    })
  ).current;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        zIndex: 999,
        left: capsuleX,
        top: capsuleY,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(6,182,212,0.35)',
        elevation: 10,
        shadowColor: '#06b6d4',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      }}
      {...pan.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => { if (!isDragging.current) navigation.navigate('Leaderboard', { scrollToInvite: true }); }}
      >
        <LinearGradient
          colors={['rgba(6,182,212,0.22)', 'rgba(2,132,199,0.22)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 14 }}
        >
          <Ionicons name="people-outline" size={15} color="#06b6d4" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#06b6d4', letterSpacing: 0.3 }}>
            {t('home.referAndEarn')}
          </Text>
          <Ionicons name="chevron-forward" size={13} color="rgba(6,182,212,0.7)" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
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
      <Stack.Screen name="BlockExplorer"     component={BlockExplorerScreen}        options={{ headerShown: false }} />
      <Stack.Screen name="BlocksList"        component={BlocksListScreen}           options={{ headerShown: false }} />
      <Stack.Screen name="BlockDetail"       component={BlockDetailScreen}          options={{ headerShown: false }} />
      <Stack.Screen name="BlockTransactions" component={BlockTransactionsScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="TopMiners"         component={TopMinersScreen}            options={{ headerShown: false }} />
      <Stack.Screen name="RecentTransactions" component={RecentTransactionsScreen}  options={{ headerShown: false }} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="AddressDetail"     component={AddressDetailScreen}        options={{ headerShown: false }} />
      <Stack.Screen name="ExplorerSearch"    component={ExplorerSearchScreen}       options={{ headerShown: false }} />
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
  const { isLoading: isLanguageLoading } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [showLanguageSelection, setShowLanguageSelection] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('logout', () => handleLogout());
    return () => subscription.remove();
  }, []);

  // Capture referral code from deep link on cold start
  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (!url) return;
      const match = url.match(/[?&]ref=([^&]+)/);
      if (match?.[1]) {
        AsyncStorage.setItem('@aura50_pending_referral_code', decodeURIComponent(match[1])).catch(() => {});
      }
    }).catch(() => {});

    const sub = Linking.addEventListener('url', ({ url }) => {
      const match = url.match(/[?&]ref=([^&]+)/);
      if (match?.[1]) {
        AsyncStorage.setItem('@aura50_pending_referral_code', decodeURIComponent(match[1])).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('Services ready for lazy initialization');
      // Check if language has been selected
      const savedLanguage = await AsyncStorage.getItem('@aura50_language');
      if (!savedLanguage) {
        setShowLanguageSelection(true);
        setIsLoading(false);
        return;
      }

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

  if (showLanguageSelection) {
    return (
      <LanguageSelectionScreen
        isModal={false}
        onComplete={() => {
          setShowLanguageSelection(false);
          setIsLoading(true);
          initializeApp();
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {!isLoading && (
        <NavigationContainer
          key={isAuthenticated ? 'app-nav' : 'auth-nav'}
          theme={navTheme}
        >
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {isAuthenticated
            ? (
              <>
                <AppNavigator />
                <FloatingReferCapsule />
              </>
            )
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
    <LanguageProvider>
      <ThemeProvider>
        <DeviceCapabilityProvider>
          <SafeAreaProvider>
            <AppShell />
          </SafeAreaProvider>
        </DeviceCapabilityProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
