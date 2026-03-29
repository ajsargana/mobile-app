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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const { height } = Dimensions.get('window');
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

  // Mining hint (step 2 of onboarding — shown after market hint is completed)
  const MINING_HINT_KEY = '@aura50_mining_hint_seen';
  const [showMiningHint, setShowMiningHint] = useState(false);
  const [miningBtnTop,    setMiningBtnTop]    = useState(0);
  const [miningBtnHeight, setMiningBtnHeight] = useState(BTN_SIZE);
  const miningHintBounce = useRef(new Animated.Value(0)).current;
  const miningBtnRef     = useRef<View>(null);

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

    // Show mining hint (step 2) if market hint was completed but mining hint not yet seen
    AsyncStorage.multiGet(['@aura50_market_hint_seen', MINING_HINT_KEY]).then(([[, market], [, mining]]) => {
      if (market && !mining && mountedRef.current) {
        // Delay so the screen finishes animating in before we show the overlay
        setTimeout(() => {
          miningBtnRef.current?.measureInWindow((_x, y, _w, h) => {
            if (mountedRef.current) {
              setMiningBtnTop(y);
              setMiningBtnHeight(h);
              setShowMiningHint(true);
            }
          });
        }, 500);
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

  // Mining hint bounce
  useEffect(() => {
    if (!showMiningHint) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(miningHintBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
        Animated.timing(miningHintBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showMiningHint]);

  const dismissMiningHint = useCallback(() => {
    setShowMiningHint(false);
    AsyncStorage.setItem(MINING_HINT_KEY, 'true').catch(() => {});
  }, []);

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
      if (user && walletService.calculateTrustLevel(user) === TrustLevel.NEW) {
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
  }, [isMining, canStartMining]);

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
              if (mountedRef.current) { setMiningBtnTop(y); setMiningBtnHeight(h); }
            });
          }}>
          <TouchableOpacity onPress={() => { dismissMiningHint(); handlePress(); }} activeOpacity={1}>
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

        {/* ── Streak & Check-In ── */}
        <StreakCard
          refreshKey={streakRefreshKey}
          onPress={() => setAchievementsOpen(true)}
        />

        <DailyCheckInCard
          onCheckin={(count) => { setStreakCount(count); setStreakRefreshKey(k => k + 1); }}
          onNewBadges={(ids) => { setAchieveRefreshKey(k => k + 1); showAchievementToast(ids[0]); }}
        />

        {/* ── Mining History button ── */}
        <TouchableOpacity
          style={[styles.historyBtn, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            borderColor: isDark ? 'rgba(52,152,219,0.15)' : 'rgba(37,99,235,0.12)',
          }]}
          onPress={() => navigation.navigate('MiningHistory')}
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
          onPress={() => navigation.navigate('EpochRewards')}
          activeOpacity={0.75}
        >
          <Ionicons name="layers-outline" size={18} color="#27AE60" />
          <Text style={[styles.historyBtnText, { color: '#27AE60' }]}>Pending &amp; Claimable</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.labelBottom} />
        </TouchableOpacity>

      </View>
      </ScrollView>

      {/* ── Mining Hint Backdrop (step 2 of onboarding) ── */}
      {showMiningHint && miningBtnTop > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Top dim */}
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: Math.max(0, miningBtnTop - 28),
            backgroundColor: 'rgba(0,0,0,0.65)',
          }} />
          {/* Bottom dim */}
          <View style={{
            position: 'absolute',
            top: miningBtnTop + miningBtnHeight + 28,
            left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
          }} />
          {/* Hint badge above button */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: Math.max(40, miningBtnTop - 56),
              left: 24, right: 24,
              alignItems: 'center',
              transform: [{ translateY: miningHintBounce }],
            }}
          >
            <View style={{
              backgroundColor: 'rgba(20,20,20,0.75)',
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              borderWidth: 1,
              borderColor: 'rgba(93,173,226,0.35)',
            }}>
              <Ionicons name="flash-outline" size={14} color="rgba(100,200,255,0.8)" />
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '500', fontSize: 13 }}>
                Tap to start forging A50
              </Text>
            </View>
          </Animated.View>
        </View>
      )}
    </LinearGradient>
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
