import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  AppState,
  Animated,
  ScrollView,
  InteractionManager,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { MiningService } from '../services/MiningService';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { NetworkService } from '../services/NetworkService';
import {
  enableBackgroundMining,
  disableBackgroundMining,
  wasMiningBeforeBackground,
} from '../tasks/BackgroundMiningTask';
import {
  startForegroundMiningService,
  stopForegroundMiningService,
  updateForegroundNotification,
} from '../services/MiningForegroundService';
import { TrustLevel, DeviceMetrics } from '../types';
import config from '../config/environment';
import { useTheme } from '../contexts/ThemeContext';
import StreakService from '../services/StreakService';
import AchievementService from '../services/AchievementService';
import NotificationService from '../services/NotificationService';
import { soundService } from '../services/SoundService';
import StreakCard from './StreakCard';
import DailyCheckInCard from './DailyCheckInCard';
import AchievementsSheet from './AchievementsSheet';

const { height, width: SCREEN_W } = Dimensions.get('window');
const BTN_SIZE = 104;

interface MiningScreenProps {
  navigation: any;
}

// ── Ripple ring ───────────────────────────────────────────────────────────────
const RippleRing = React.memo(({ delay }: { delay: number }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.9] });
  const opacity = anim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.45, 0.2, 0] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: BTN_SIZE, height: BTN_SIZE,
        borderRadius: BTN_SIZE / 2,
        borderWidth: 1.5, borderColor: '#3498DB',
        transform: [{ scale }], opacity,
      }}
    />
  );
});
// ─────────────────────────────────────────────────────────────────────────────

export const MiningScreen: React.FC<MiningScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [isMining,        setIsMining]       = useState(false);
  const [isInitializing,  setIsInitializing] = useState(true);
  const [deviceMetrics,   setDeviceMetrics]  = useState<DeviceMetrics>({
    batteryLevel: 100, isCharging: false, networkType: '4G',
    storageUsed: 0, memoryUsage: 0, cpuUsage: 0,
  });
  const [miningStats, setMiningStats] = useState({
    isActive: false, hashRate: 0, sessionDuration: 0,
    totalHashes: 0, estimatedReward: '0',
  });
  // Participation progress
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(20);

  // Engagement state
  const [streakCount,       setStreakCount]       = useState(0);
  const [streakRefreshKey,  setStreakRefreshKey]   = useState(0);
  const [achievementsOpen,  setAchievementsOpen]  = useState(false);
  const [achieveRefreshKey, setAchieveRefreshKey] = useState(0);
  const [toastText,         setToastText]         = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;

  // ── Onboarding state (steps 5-7 live on this screen) ─────────────────────
  const ONBOARDING_STEP_KEY = '@aura50_onboarding_v2_step';
  const MINING_HINT_KEY     = '@aura50_mining_hint_seen'; // legacy compat

  const [onboardingStep, setOnboardingStep] = useState(-1);

  // Step 5: Mining button
  const [showMiningHint, setShowMiningHint] = useState(false);
  const [miningBtnX,      setMiningBtnX]      = useState(0);
  const [miningBtnTop,    setMiningBtnTop]    = useState(0);
  const [miningBtnHeight, setMiningBtnHeight] = useState(BTN_SIZE);
  const miningHintBounce = useRef(new Animated.Value(0)).current;
  const miningBtnRef     = useRef<View>(null);

  // Step 6: Participation limit card
  const limitCardRef = useRef<View>(null);
  const [limitCardTop,    setLimitCardTop]    = useState(0);
  const [limitCardHeight, setLimitCardHeight] = useState(0);
  const [limitCardReady,  setLimitCardReady]  = useState(false);
  const limitBounce = useRef(new Animated.Value(0)).current;

  // Step 7: History & Rewards buttons
  const historyAreaRef = useRef<View>(null);
  const [historyAreaTop, setHistoryAreaTop] = useState(0);
  const [historyAreaHeight, setHistoryAreaHeight] = useState(0);
  const [historyHintReady, setHistoryHintReady] = useState(false);
  const historyBounce = useRef(new Animated.Value(0)).current;
  const waitingForHistoryReturn = useRef(false);

  // Step 8: Leaderboard tab button
  const [leaderHintReady, setLeaderHintReady] = useState(false);
  const leaderBounce = useRef(new Animated.Value(0)).current;

  const mountedRef      = useRef(true);
  const pollingInFlight = useRef(false);
  const btnScale        = useRef(new Animated.Value(1)).current;
  const miningNotifId   = useRef<string | null>(null);
  // Ref mirrors isMining so AppState callbacks always read the current value
  const isMiningRef     = useRef(false);

  const showAchievementToast = (badgeId: string) => {
    const defs = AchievementService.getInstance().getDefinitions();
    const def  = defs.find(d => d.id === badgeId);
    if (!def) return;
    setToastText(`${def.icon} ${def.label} unlocked!`);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const miningService  = MiningService.getInstance();
  const walletService  = EnhancedWalletService.getInstance();
  const networkService = NetworkService.getInstance();

  // ── Fetch participation stats from backend ──────────────────────────────
  const fetchParticipation = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('@aura50_auth_token');
      if (!token) return;
      const res = await fetch(`${config.baseUrl}/api/participation/can-participate`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) {
        setDailyCount(data.dailyCount ?? 0);
        setDailyLimit(data.dailyLimit ?? 20);
      }
    } catch (_) {}
  }, []);

  // ── Button press bounce ─────────────────────────────────────────────────
  const pressBounce = () => {
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.91, duration: 75,  useNativeDriver: true }),
      Animated.spring(btnScale,  { toValue: 1,    useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    mountedRef.current = true;

    // Load onboarding step (initial mount)
    AsyncStorage.getItem(ONBOARDING_STEP_KEY).then(step => {
      if (mountedRef.current) {
        setOnboardingStep(step !== null ? parseInt(step, 10) : -1);
      }
    });

    // Defer heavy init until after the navigation animation completes
    const handle = InteractionManager.runAfterInteractions(async () => {
      const active  = miningService.isActiveMining();
      const stats   = miningService.getMiningStats();
      const metrics = await miningService.getDeviceMetrics();
      if (!mountedRef.current) return;
      setIsMining(active);
      setMiningStats(stats);
      setDeviceMetrics(metrics);
      setIsInitializing(false);
      fetchParticipation();

      // Load streak
      const sd = await StreakService.getInstance().getStreak();
      if (mountedRef.current) setStreakCount(sd.count);
    });

    // ── WS delta: device metrics checked once per block round (blockPending) ──
    // Battery and memory only need checking when a new block starts, not on a timer.
    const onBlockPending = async () => {
      if (!mountedRef.current || pollingInFlight.current) return;
      pollingInFlight.current = true;
      try {
        const m = await miningService.getDeviceMetrics();
        if (mountedRef.current) setDeviceMetrics(m);
      } catch (_) {
      } finally {
        pollingInFlight.current = false;
      }
    };

    // ── WS delta: mining stats updated when a block settles (sound only) ──
    // fetchParticipation is NOT called here — the daily count only resets at UTC
    // midnight, so polling it on every 2-min block is unnecessary churn.
    const onBlockSettled = () => {
      if (!mountedRef.current) return;
      setMiningStats(miningService.getMiningStats());
      soundService.playCoinSound();
    };

    networkService.on('blockPending', onBlockPending);
    networkService.on('blockSettled', onBlockSettled);

    // ── UTC midnight reset timer ─────────────────────────────────────────────
    // Re-fetch participation exactly once when the UTC day rolls over, so the
    // "Daily limit reached" state clears at midnight and not a block early/late.
    let midnightTimer: ReturnType<typeof setTimeout>;
    const scheduleMidnightReset = () => {
      const now = Date.now();
      const nextMidnightUTC = Date.UTC(
        new Date(now).getUTCFullYear(),
        new Date(now).getUTCMonth(),
        new Date(now).getUTCDate() + 1,
      );
      const delay = nextMidnightUTC - now;
      midnightTimer = setTimeout(() => {
        if (mountedRef.current) fetchParticipation();
        scheduleMidnightReset(); // reschedule for the next day
      }, delay);
    };
    scheduleMidnightReset();

    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        fetchParticipation();
        // Returned to foreground — if we were mining and it stopped, restart
        if (isMiningRef.current && !miningService.isMiningActive()) {
          console.log('[MiningScreen] App foregrounded; mining was active but stopped — restarting');
          const restarted = await miningService.startMining();
          if (restarted && !miningNotifId.current) {
            miningNotifId.current = await Notifications.scheduleNotificationAsync({
              content: {
                title: 'AURA50 Mining Active',
                body: 'Tap to return to the app',
                sticky: true,
                autoDismiss: false,
              },
              trigger: null,
            });
          }
        }
      } else if (state === 'background' || state === 'inactive') {
        if (isMiningRef.current) {
          // On Android the Foreground Service notification is authoritative —
          // update it directly instead of spawning a duplicate expo-notification.
          updateForegroundNotification(
            'AURA50 Mining Active',
            'Mining in background — tap to open'
          ).catch(() => {});

          // iOS / fallback: update the expo-notification as before
          if (miningNotifId.current) {
            await Notifications.dismissNotificationAsync(miningNotifId.current);
            miningNotifId.current = await Notifications.scheduleNotificationAsync({
              content: {
                title: 'AURA50 Mining Active',
                body: 'Running in background — tap to return',
                sticky: true,
                autoDismiss: false,
              },
              trigger: null,
            });
          }
        }
      }
    });

    return () => {
      mountedRef.current = false;
      handle.cancel();
      sub?.remove();
      clearTimeout(midnightTimer);
      networkService.off('blockPending', onBlockPending);
      networkService.off('blockSettled', onBlockSettled);
      // Release keep-awake and dismiss mining notification on unmount
      deactivateKeepAwake('mining');
      if (miningNotifId.current) {
        Notifications.dismissNotificationAsync(miningNotifId.current).catch(() => {});
        miningNotifId.current = null;
      }
    };
  }, []);

  // Re-read onboarding step when screen gains focus
  // Only advances (Math.max) to prevent stale reads from going backwards
  // Skips entirely once onboarding is complete (step >= 9)
  useFocusEffect(useCallback(() => {
    // Re-read step — only advance, never go back
    AsyncStorage.getItem(ONBOARDING_STEP_KEY).then(step => {
      if (!mountedRef.current || step === null) return;
      const n = parseInt(step, 10);
      if (n >= 9) { setOnboardingStep(9); return; }
      setOnboardingStep(prev => (prev < 0 || n > prev) ? n : prev);
    });
    // Step 7: advance when returning from MiningHistory or EpochRewards
    if (waitingForHistoryReturn.current) {
      waitingForHistoryReturn.current = false;
      AsyncStorage.getItem(ONBOARDING_STEP_KEY).then(step => {
        if (step === '6' && mountedRef.current) {
          setTimeout(() => advanceOnboarding(6), 1000);
        }
      });
    }
  }, [advanceOnboarding]));

  // Step 5: measure mining button when step is active
  useEffect(() => {
    if (onboardingStep !== 4) return;
    const t = setTimeout(() => {
      miningBtnRef.current?.measureInWindow((_x, y, _w, h) => {
        if (mountedRef.current) {
          setMiningBtnX(_x); setMiningBtnTop(y + 2); setMiningBtnHeight(h); setShowMiningHint(true);
        }
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [onboardingStep]);

  // Step 5 bounce
  useEffect(() => {
    if (!showMiningHint) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(miningHintBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
      Animated.timing(miningHintBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [showMiningHint]);

  // Step 6: measure participation card
  useEffect(() => {
    if (onboardingStep !== 5) return;
    const t = setTimeout(() => {
      limitCardRef.current?.measureInWindow((_x, y, _w, h) => {
        if (mountedRef.current) { setLimitCardTop(y); setLimitCardHeight(h); setLimitCardReady(true); }
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [onboardingStep]);

  // Step 6 bounce
  useEffect(() => {
    if (!limitCardReady) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(limitBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
      Animated.timing(limitBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [limitCardReady]);

  // Step 7: measure history/rewards area
  useEffect(() => {
    if (onboardingStep !== 6) return;
    const t = setTimeout(() => {
      historyAreaRef.current?.measureInWindow((_x, y, _w, h) => {
        if (mountedRef.current) { setHistoryAreaTop(y); setHistoryAreaHeight(h); setHistoryHintReady(true); }
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [onboardingStep]);

  // Step 7 bounce
  useEffect(() => {
    if (!historyHintReady) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(historyBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
      Animated.timing(historyBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [historyHintReady]);

  // Step 8: leaderboard tab hint
  useEffect(() => {
    if (onboardingStep !== 7) return;
    const t = setTimeout(() => { if (mountedRef.current) setLeaderHintReady(true); }, 1000);
    return () => clearTimeout(t);
  }, [onboardingStep]);

  // Step 8 bounce
  useEffect(() => {
    if (!leaderHintReady) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(leaderBounce, { toValue: -8, duration: 500, useNativeDriver: true }),
      Animated.timing(leaderBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [leaderHintReady]);

  const advanceOnboarding = useCallback((fromStep: number) => {
    const next = fromStep + 1;
    setOnboardingStep(next);
    AsyncStorage.setItem(ONBOARDING_STEP_KEY, String(next)).catch(() => {});
  }, []);

  const dismissMiningHint = useCallback(() => {
    setShowMiningHint(false);
    AsyncStorage.setItem(MINING_HINT_KEY, 'true').catch(() => {});
    // Step 6 advances when isMining becomes true (useEffect below)
  }, []);

  // Advance from step 5 to step 6 only when mining is actually running
  useEffect(() => {
    if (onboardingStep !== 4 || !isMining) return;
    const t = setTimeout(() => { if (mountedRef.current) advanceOnboarding(4); }, 1000);
    return () => clearTimeout(t);
  }, [isMining, onboardingStep, advanceOnboarding]);

  const dismissLimitHint = useCallback(() => {
    setLimitCardReady(false);
    advanceOnboarding(5); // → step 6 (participation limit card)
  }, [advanceOnboarding]);

  // ── Guards ───────────────────────────────────────────────────────────────
  const canStartMining = useCallback((): boolean => {
    if (deviceMetrics.batteryLevel < 20 && !deviceMetrics.isCharging) {
      Alert.alert('Low Battery', 'Block participation is paused when battery is below 20% and not charging.');
      return false;
    }
    if (deviceMetrics.memoryUsage > 90) {
      Alert.alert('High Memory Usage', 'Device memory usage is too high. Close some apps and try again.');
      return false;
    }
    if (!walletService.isWalletCreated()) {
      Alert.alert('No Wallet', 'Please create a wallet first to start participating.');
      navigation.navigate('Wallet');
      return false;
    }
    return true;
  }, [deviceMetrics, navigation]);

  const performStartMining = useCallback(async () => {
    const success = await miningService.startMining();
    if (success) {
      setIsMining(true);
      isMiningRef.current = true;
      // Keep screen and JS thread alive while mining
      await activateKeepAwakeAsync('mining');
      // Start Android Foreground Service — keeps JS thread alive when backgrounded
      startForegroundMiningService().catch(e => console.warn('[FGService] start:', e));
      // Register background fetch task (iOS fallback / Android doze recovery)
      enableBackgroundMining().catch(e => console.warn('[BGMining] enable:', e));
      miningNotifId.current = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AURA50 Mining Active',
          body: 'Tap to return to the app',
          sticky: true,
          autoDismiss: false,
        },
        trigger: null,
      });
      fetchParticipation();

      // Record streak + session
      const [streakResult, totalSessions] = await Promise.all([
        StreakService.getInstance().recordActivity(),
        AchievementService.getInstance().incrementSessions(),
      ]);
      if (streakResult.isNew) {
        setStreakCount(streakResult.count);
        setStreakRefreshKey(k => k + 1);
      }

      const checkinCount = await AchievementService.getInstance().getCheckinCount();
      const newBadges    = await AchievementService.getInstance().checkAndUnlock({
        streakCount:  streakResult.count,
        totalSessions,
        checkinCount,
      });
      if (newBadges.length > 0) {
        setAchieveRefreshKey(k => k + 1);
        showAchievementToast(newBadges[0]);
      }

      // Schedule streak warning
      NotificationService.getInstance().isEnabled().then(enabled => {
        if (enabled) NotificationService.getInstance().scheduleStreakWarning(new Date());
      });
    } else {
      Alert.alert('Could Not Join Block', 'Unable to start participating. Check your connection and device status.');
    }
  }, []);

  const stopMiningKeepAwake = useCallback(async () => {
    isMiningRef.current = false;
    deactivateKeepAwake('mining');
    if (miningNotifId.current) {
      await Notifications.dismissNotificationAsync(miningNotifId.current);
      miningNotifId.current = null;
    }
    // Stop Android Foreground Service
    stopForegroundMiningService().catch(e => console.warn('[FGService] stop:', e));
    // Remove background fetch task so OS doesn't restart mining after user stopped it
    disableBackgroundMining().catch(e => console.warn('[BGMining] disable:', e));
  }, []);

  const handlePress = useCallback(async () => {
    pressBounce();
    if (isMining) {
      try {
        await miningService.stopMining();
        setIsMining(false);
        await stopMiningKeepAwake();
        fetchParticipation();
      } catch (_) {
        Alert.alert('Error', 'Failed to leave block properly.');
      }
      return;
    }
    try {
      if (!canStartMining()) return;
      const user = walletService.getUser();
      if (onboardingStep !== 4 && user && walletService.calculateTrustLevel(user) === TrustLevel.NEW) {
        Alert.alert(
          'Block Participation',
          "Your device will contribute lightweight consensus work to the network.",
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Start', onPress: performStartMining }]
        );
      } else {
        await performStartMining();
      }
    } catch (_) {
      Alert.alert('Error', 'Failed to start participation. Please try again.');
    }
  }, [isMining, canStartMining, onboardingStep]);

  // ── Derived values (memoized — don't recalculate on unrelated renders) ───
  const {
    lowBattery, progressFraction, limitReached,
    gradientColors, btnColor, iconName, labelTop,
  } = useMemo(() => ({
    lowBattery:      deviceMetrics.batteryLevel < 20 && !deviceMetrics.isCharging,
    progressFraction: dailyLimit > 0 ? Math.min(1, dailyCount / dailyLimit) : 0,
    limitReached:    dailyCount >= dailyLimit,
    gradientColors:  isMining ? colors.miningActive : colors.miningIdle,
    btnColor:        isMining ? colors.miningBtnActive : colors.miningBtn,
    iconName:        (isMining ? 'stop-circle-outline' : 'flash-outline') as 'stop-circle-outline' | 'flash-outline',
    labelTop:        isMining ? 'CONTRIBUTING' : 'READY TO FORGE',
  }), [deviceMetrics.batteryLevel, deviceMetrics.isCharging, dailyCount, dailyLimit, isMining, colors]);

  // ── Loading placeholder ───────────────────────────────────────────────────
  if (isInitializing) {
    return (
      <LinearGradient colors={colors.miningIdle} style={styles.fill}>
        <View style={[styles.btnWrap, { marginTop: height * 0.18, opacity: 0.35 }]}>
          <View style={[styles.btnCircle, { backgroundColor: colors.miningBtn }]} />
        </View>
      </LinearGradient>
    );
  }

  // Achievement toast slide-in from top
  const toastTranslate = toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] });

  return (
    <>
    <LinearGradient colors={gradientColors} style={styles.fill}>

      {/* ── Achievement toast ── */}
      {toastText !== '' && (
        <Animated.View style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastTranslate }] }]}>
          <Text style={styles.toastText}>{toastText}</Text>
        </Animated.View>
      )}

      {/* ── Achievements sheet ── */}
      <AchievementsSheet
        visible={achievementsOpen}
        onClose={() => setAchievementsOpen(false)}
        refreshKey={achieveRefreshKey}
      />

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

      {/* ── Button section (upper portion) ── */}
      <View style={styles.buttonSection}>

        <Text style={[styles.labelTop, { color: isMining ? colors.labelTopActive : colors.labelTop }]}>
          {labelTop}
        </Text>

        {/* Button + ripple rings */}
        <View style={styles.btnWrap}>
          {isMining && (
            <>
              <RippleRing delay={0} />
              <RippleRing delay={600} />
              <RippleRing delay={1200} />
            </>
          )}
          <View ref={miningBtnRef} onLayout={() => {
            miningBtnRef.current?.measureInWindow((_x, y, _w, h) => {
              if (mountedRef.current) { setMiningBtnX(_x); setMiningBtnTop(y + 2); setMiningBtnHeight(h); }
            });
          }}>
          <TouchableOpacity onPress={handlePress} activeOpacity={1}>
            <Animated.View style={[styles.btnCircle, { backgroundColor: btnColor, transform: [{ scale: btnScale }] }]}>
              <Ionicons name={iconName as any} size={42} color="#FFFFFF" />
            </Animated.View>
          </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.labelBottom, { color: colors.labelBottom }]}>
          {isMining ? 'Tap to stop' : 'Tap to start'}
        </Text>

        {lowBattery && (
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={14} color={colors.danger} />
            <Text style={[styles.warningText, { color: colors.danger }]}> Battery too low to mine</Text>
          </View>
        )}
      </View>

      {/* ── Divider ── */}
      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      {/* ── Participation progress ── */}
      <View style={styles.bottomSection}>

        <View ref={limitCardRef}>
        <View style={[styles.participationCard, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          borderColor: isDark ? 'rgba(52,152,219,0.15)' : 'rgba(37,99,235,0.12)',
        }]}>
          <View style={styles.participationRow}>
            <Text style={[styles.participationLabel, { color: colors.participationLabel }]}>PARTICIPATED TODAY</Text>
            <Text style={[styles.participationValue, { color: limitReached ? colors.danger : colors.participationValue }]}>
              {dailyCount} / {dailyLimit}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.progressTrack }]}>
            <View style={[styles.progressFill, {
              width: `${progressFraction * 100}%` as any,
              backgroundColor: limitReached ? colors.danger : colors.accentAlt,
            }]} />
          </View>

          {limitReached && (
            <Text style={[styles.limitNote, { color: colors.danger }]}>Daily limit reached — resets at UTC midnight</Text>
          )}
        </View>
        </View>

        {/* ── Streak & Check-In ── */}
        <StreakCard
          refreshKey={streakRefreshKey}
          onPress={() => setAchievementsOpen(true)}
        />

        <DailyCheckInCard
          onCheckin={(count) => { setStreakCount(count); setStreakRefreshKey(k => k + 1); }}
          onNewBadges={(ids) => { setAchieveRefreshKey(k => k + 1); showAchievementToast(ids[0]); }}
        />

        {/* ── History & Rewards (wrapped for onboarding step 7) ── */}
        <View ref={historyAreaRef}>

        {/* ── Mining History button ── */}
        <TouchableOpacity
          style={[styles.historyBtn, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            borderColor: isDark ? 'rgba(52,152,219,0.15)' : 'rgba(37,99,235,0.12)',
          }]}
          onPress={() => {
            if (onboardingStep === 6 && historyHintReady) {
              setHistoryHintReady(false);
              waitingForHistoryReturn.current = true;
            }
            navigation.navigate('MiningHistory');
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="time-outline" size={18} color={colors.historyBtn} />
          <Text style={[styles.historyBtnText, { color: colors.historyBtnText }]}>Session History</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.labelBottom} />
        </TouchableOpacity>

        {/* ── Epoch Rewards button ── */}
        <TouchableOpacity
          style={[styles.historyBtn, {
            backgroundColor: isDark ? 'rgba(39,174,96,0.06)' : 'rgba(39,174,96,0.05)',
            borderColor: isDark ? 'rgba(39,174,96,0.2)' : 'rgba(39,174,96,0.15)',
          }]}
          onPress={() => {
            if (onboardingStep === 6 && historyHintReady) {
              setHistoryHintReady(false);
              waitingForHistoryReturn.current = true;
            }
            navigation.navigate('EpochRewards');
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="layers-outline" size={18} color="#27AE60" />
          <Text style={[styles.historyBtnText, { color: '#27AE60' }]}>Pending &amp; Claimable</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.labelBottom} />
        </TouchableOpacity>
        </View>

      </View>
      </ScrollView>

    </LinearGradient>

    {/* ════════════════════════════════════════════════════════════════
        ONBOARDING MODALS (steps 5-7 live on this screen)
    ════════════════════════════════════════════════════════════════ */}

    {/* ── Step 5: Mining button highlight ── */}
    <Modal visible={showMiningHint && miningBtnTop > 0} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      {/* Re-render the circular mining button at its exact screen position */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: miningBtnTop,
          left: miningBtnX > 0 ? miningBtnX : SCREEN_W / 2 - BTN_SIZE / 2,
          width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2,
          backgroundColor: colors.miningBtn,
          alignItems: 'center', justifyContent: 'center',
          elevation: 24,
          shadowColor: '#3498DB', shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4, shadowRadius: 14,
        }}
        onPress={dismissMiningHint}
        activeOpacity={0.85}
      >
        <Ionicons name="flash-outline" size={42} color="#FFFFFF" />
      </TouchableOpacity>
      {/* Hint badge above button */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute',
        top: Math.max(40, miningBtnTop - 58),
        left: 24, right: 24, alignItems: 'center',
        transform: [{ translateY: miningHintBounce }],
      }}>
        <View style={mStyles.hintBadge}>
          <Ionicons name="flash-outline" size={14} color="rgba(100,200,255,0.85)" />
          <Text style={mStyles.hintBadgeText}>Tap to start mining</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── Step 6: Participation limit card highlight ── */}
    <Modal visible={onboardingStep === 5 && limitCardReady} transparent animationType="fade" statusBarTranslucent>
      <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} onPress={dismissLimitHint} activeOpacity={1} />
      {/* Re-render the card at measured position */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: limitCardTop, left: 24, right: 24,
          backgroundColor: isDark ? 'rgba(30,40,55,0.97)' : 'rgba(240,248,255,0.97)',
          borderRadius: 14, borderWidth: 1,
          borderColor: isDark ? 'rgba(52,152,219,0.3)' : 'rgba(37,99,235,0.2)',
          padding: 16, elevation: 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35, shadowRadius: 12,
        }}
        onPress={dismissLimitHint}
        activeOpacity={0.9}
      >
        <View style={styles.participationRow}>
          <Text style={[styles.participationLabel, { color: colors.participationLabel }]}>PARTICIPATED TODAY</Text>
          <Text style={[styles.participationValue, { color: limitReached ? colors.danger : colors.participationValue }]}>
            {dailyCount} / {dailyLimit}
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.progressTrack, marginTop: 8 }]}>
          <View style={[styles.progressFill, {
            width: `${progressFraction * 100}%` as any,
            backgroundColor: limitReached ? colors.danger : colors.accentAlt,
          }]} />
        </View>
      </TouchableOpacity>
      {/* Hint badge above card */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute',
        top: Math.max(50, limitCardTop - 58),
        left: 24, right: 24, alignItems: 'center',
        transform: [{ translateY: limitBounce }],
      }}>
        <View style={mStyles.hintBadge}>
          <Ionicons name="trophy-outline" size={14} color="rgba(255,220,100,0.85)" />
          <Text style={mStyles.hintBadgeText}>Daily limit · achieve Trophy to Increase · tap to continue</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── Step 7: History & Rewards buttons highlight ── */}
    <Modal visible={onboardingStep === 6 && historyHintReady} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      {/* Re-render the two buttons at measured position */}
      <View style={{
        position: 'absolute',
        top: historyAreaTop, left: 24, right: 24,
        gap: 12, elevation: 24,
      }}>
        {/* Session History */}
        <TouchableOpacity
          style={[styles.historyBtn, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            borderColor: isDark ? 'rgba(52,152,219,0.25)' : 'rgba(37,99,235,0.15)',
          }]}
          onPress={() => {
            setHistoryHintReady(false);
            waitingForHistoryReturn.current = true;
            navigation.navigate('MiningHistory');
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="time-outline" size={18} color={colors.historyBtn} />
          <Text style={[styles.historyBtnText, { color: colors.historyBtnText }]}>Session History</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.labelBottom} />
        </TouchableOpacity>
        {/* Epoch Rewards */}
        <TouchableOpacity
          style={[styles.historyBtn, {
            backgroundColor: isDark ? 'rgba(39,174,96,0.08)' : 'rgba(39,174,96,0.05)',
            borderColor: isDark ? 'rgba(39,174,96,0.3)' : 'rgba(39,174,96,0.2)',
          }]}
          onPress={() => {
            setHistoryHintReady(false);
            waitingForHistoryReturn.current = true;
            navigation.navigate('EpochRewards');
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="layers-outline" size={18} color="#27AE60" />
          <Text style={[styles.historyBtnText, { color: '#27AE60' }]}>Pending & Claimable</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.labelBottom} />
        </TouchableOpacity>
      </View>
      {/* Hint badge above buttons */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute',
        top: Math.max(50, historyAreaTop - 58),
        left: 24, right: 24, alignItems: 'center',
        transform: [{ translateY: historyBounce }],
      }}>
        <View style={mStyles.hintBadge}>
          <Ionicons name="time-outline" size={14} color="rgba(100,200,255,0.85)" />
          <Text style={mStyles.hintBadgeText}>View your sessions & pending rewards · tap to explore</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── Step 8: Leaderboard tab button highlight ── */}
    <Modal visible={onboardingStep === 7 && leaderHintReady} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      {/* Re-render the Leaderboard tab at its approximate position (index 2 of 5) */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: insets.bottom,
          left: (SCREEN_W / 5) * 2,
          width: SCREEN_W / 5, height: 60,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.tabBg,
          borderTopLeftRadius: 6, borderTopRightRadius: 6,
          elevation: 24,
        }}
        onPress={() => {
          setLeaderHintReady(false);
          advanceOnboarding(7); // → step 8 (LeaderboardScreen)
          navigation.navigate('Leaderboard');
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="trophy-outline" size={24} color={colors.tabInactive} />
        <Text style={{ color: colors.tabInactive, fontSize: 10, marginTop: 2, fontWeight: '500' }}>Leaderboard</Text>
      </TouchableOpacity>
      {/* Hint badge above */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute',
        bottom: insets.bottom + 68,
        left: (SCREEN_W / 5) * 2 - 40,
        right: SCREEN_W - (SCREEN_W / 5) * 4,
        alignItems: 'center',
        transform: [{ translateY: leaderBounce }],
      }}>
        <View style={mStyles.hintBadge}>
          <Ionicons name="trophy-outline" size={14} color="rgba(255,220,100,0.85)" />
          <Text style={mStyles.hintBadgeText}>Check the Leaderboard</Text>
        </View>
      </Animated.View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Achievement toast
  toast: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,40,55,0.95)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 12,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Upper section: button
  buttonSection: {
    alignItems: 'center',
    paddingTop: height * 0.1,
    gap: 18,
  },

  labelTop: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3.5,
    color: '#566573',
  },
  labelTopActive: {
    color: '#5DADE2',
  },

  btnWrap: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCircle: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3498DB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },

  labelBottom: {
    fontSize: 13,
    color: '#4A6274',
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningText: {
    fontSize: 12,
    color: '#E74C3C',
    fontWeight: '600',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(52, 152, 219, 0.12)',
    marginHorizontal: 24,
    marginTop: 32,
  },

  // Lower section: stats + history
  bottomSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
  },

  // Participation card
  participationCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.15)',
    padding: 16,
    gap: 10,
  },
  participationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participationLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#566573',
  },
  participationValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  limitReachedText: {
    color: '#E74C3C',
  },
  progressTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  limitNote: {
    fontSize: 11,
    color: '#E74C3C',
    opacity: 0.8,
  },

  // History button
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  historyBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#85B8D5',
  },
});

// Hint badge styles for onboarding Modals
const mStyles = StyleSheet.create({
  hintBadge: {
    backgroundColor: 'rgba(15,15,15,0.78)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(93,173,226,0.35)',
  },
  hintBadgeText: { color: 'rgba(255,255,255,0.82)', fontWeight: '500', fontSize: 13 },
});
