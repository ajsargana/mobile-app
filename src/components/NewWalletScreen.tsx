import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';

const SCREEN_H = Dimensions.get('window').height;
const SCREEN_W = Dimensions.get('window').width;
import { Svg, Polyline, Line, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { Transaction } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { DISPLAY_NAME_KEY, PROFILE_PIC_KEY } from './ProfileEditScreen';
import AchievementService from '../services/AchievementService';
import AchievementsSheet from './AchievementsSheet';
import NotificationService from '../services/NotificationService';
import { useFocusEffect } from '@react-navigation/native';
import ThemedCard from './ThemedCard';

// ── Constants ─────────────────────────────────────────────────────────────────
const CONTACTS_KEY   = '@aura50_contacts';
const COINS_KEY      = '@aura50_market_coins';
const MARKET_POLL_MS = 60_000;
const DEFAULT_COINS  = ['bitcoin', 'ethereum'];

const marketUrl = (ids: string[]) =>
  `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&order=market_cap_desc&per_page=${ids.length}&page=1&sparkline=true&price_change_percentage=24h`;

const COINGECKO_SEARCH = 'https://api.coingecko.com/api/v3/search?query=';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Contact { id: string; name: string; address: string }

interface MarketCoin {
  id: string; name: string; symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
  image?: string;
  sparkline_in_7d?: { price: number[] };
}

interface SearchResult { id: string; name: string; symbol: string; thumb?: string }

interface NewWalletScreenProps { navigation: any }

// ── Sparkline helpers ─────────────────────────────────────────────────────────
function buildPoints(prices: number[], maxPts: number) {
  const step = Math.max(1, Math.floor(prices.length / maxPts));
  const s    = prices.filter((_, i) => i % step === 0).slice(0, maxPts);
  const min  = Math.min(...s), max = Math.max(...s), range = max - min || 1;
  const pts  = s.map((p, i) => `${(i / (s.length - 1)) * 100},${50 - ((p - min) / range) * 45}`).join(' ');
  return { pts, min, max };
}

const InlineSparkline: React.FC<{ prices: number[]; isUp: boolean }> = ({ prices, isUp }) => {
  if (!prices || prices.length < 2) return null;
  const { pts } = buildPoints(prices, 14);
  return (
    <Svg width={56} height={28} viewBox="0 0 100 50">
      <Polyline points={pts} fill="none" stroke={isUp ? '#16A34A' : '#DC2626'}
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

const FullChart: React.FC<{ prices: number[]; isUp: boolean }> = ({ prices, isUp }) => {
  if (!prices || prices.length < 2) return null;
  const { pts, min, max } = buildPoints(prices, 40);
  const color = isUp ? '#16A34A' : '#DC2626';
  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(n < 1 ? 4 : 2)}`;
  return (
    <Svg width="100%" height={160} viewBox="-4 0 112 60">
      {[0, 25, 50].map(y => <Line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#E5E7EB" strokeWidth="0.5" />)}
      <Polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <SvgText x="102" y="52" fontSize="5" fill="#9CA3AF">{fmt(min)}</SvgText>
      <SvgText x="102" y="7"  fontSize="5" fill="#9CA3AF">{fmt(max)}</SvgText>
    </Svg>
  );
};

// ── Time-based greeting ───────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export const NewWalletScreen: React.FC<NewWalletScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();

  // Wallet
  const [showBalance, setShowBalance]   = useState(true);
  const [balance, setBalance]           = useState('0.00000000');
  const [walletAddress, setWalletAddress] = useState('');
  const [userName, setUserName]         = useState('');
  const [notificationCount, setNotificationCount] = useState(0);
  const [trustLabel, setTrustLabel]     = useState('New User');

  // Profile
  const [profileUri, setProfileUri]     = useState<string | null>(null);

  // Contacts
  const [contacts, setContacts]             = useState<Contact[]>([]);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newName, setNewName]               = useState('');
  const [newAddr, setNewAddr]               = useState('');

  // Payments
  const [recentPayments, setRecentPayments] = useState<Transaction[]>([]);

  // Market
  const [coinIds, setCoinIds]           = useState<string[]>(DEFAULT_COINS);
  const [marketData, setMarketData]     = useState<MarketCoin[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<MarketCoin | null>(null);
  const [editingMarket, setEditingMarket] = useState(false);

  // Coin search
  const [addCoinOpen, setAddCoinOpen]       = useState(false);
  const [coinQuery, setCoinQuery]           = useState('');
  const [searchResults, setSearchResults]   = useState<SearchResult[]>([]);
  const [searching, setSearching]           = useState(false);

  // General
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Achievements
  const [achievementsOpen,  setAchievementsOpen]  = useState(false);
  const [unlockedCount,     setUnlockedCount]     = useState(0);
  const [totalAchievements, setTotalAchievements] = useState(0);

  // ── Onboarding (8-step guided tour) ──────────────────────────────────────
  const ONBOARDING_STEP_KEY = '@aura50_onboarding_v2_step';
  const MARKET_HINT_KEY     = '@aura50_market_hint_seen'; // legacy compat

  const [onboardingStep, setOnboardingStep] = useState(-1); // -1 = not loaded

  // Step 1: Hero card
  const heroCardRef  = useRef<View>(null);
  const [heroTop,    setHeroTop]    = useState(0);
  const [heroHeight, setHeroHeight] = useState(0);
  const [heroReady,  setHeroReady]  = useState(false);
  const heroBounce = useRef(new Animated.Value(0)).current;

  // Step 2: Avatar
  const avatarRef = useRef<View>(null);
  const [avatarTop,  setAvatarTop]  = useState(0);
  const [avatarLeft, setAvatarLeft] = useState(0);
  const [avatarSz,   setAvatarSz]   = useState(40);
  const [avatarReady, setAvatarReady] = useState(false);
  const avatarBounce = useRef(new Animated.Value(0)).current;
  const waitingForProfileReturn = useRef(false);

  // Step 3: Market card
  const [marketReady, setMarketReady]     = useState(false);
  const hintBounce    = useRef(new Animated.Value(0)).current;
  const marketCardRef = useRef<View>(null);
  const scrollRef     = useRef<ScrollView>(null);
  const [marketTop,    setMarketTop]    = useState(SCREEN_H + 100);
  const [marketHeight, setMarketHeight] = useState(0);
  const [marketLayoutY, setMarketLayoutY] = useState(0);

  // Step 4: Forge button (tab bar)
  const [forgeHintReady, setForgeHintReady] = useState(false);
  const forgeBounce = useRef(new Animated.Value(0)).current;

  // ── Transaction Tour ──────────────────────────────────────────────────────
  const TX_TOUR_KEY = '@aura50_tour_tx_step';
  const [txStep, setTxStep] = useState(-1);
  const [sendBtnTop, setSendBtnTop] = useState(0);
  const [sendBtnLeft, setSendBtnLeft] = useState(0);
  const [sendBtnW, setSendBtnW] = useState(0);
  const [sendBtnH, setSendBtnH] = useState(0);
  const [sendReady, setSendReady] = useState(false);
  const sendBtnRef = useRef<View>(null);
  const receiveBtnRef = useRef<View>(null);
  const [receiveBtnTop, setReceiveBtnTop] = useState(0);
  const [receiveBtnLeft, setReceiveBtnLeft] = useState(0);
  const [receiveBtnW, setReceiveBtnW] = useState(0);
  const [receiveReady, setReceiveReady] = useState(false);
  const txBounce = useRef(new Animated.Value(0)).current;
  const waitingForTxReturn = useRef(false);

  const mountedRef     = useRef(true);
  const marketTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walletService  = EnhancedWalletService.getInstance();

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    loadCoins().then(() => loadAllData());
    marketTimer.current = setInterval(() => { if (mountedRef.current) fetchMarket(coinIds); }, MARKET_POLL_MS);
    // Load onboarding step (migrate from legacy keys)
    AsyncStorage.multiGet([ONBOARDING_STEP_KEY, MARKET_HINT_KEY, '@aura50_mining_hint_seen']).then(
      ([[, newStep], [, mktSeen], [, miningSeen]]) => {
        if (!mountedRef.current) return;
        if (newStep !== null) {
          setOnboardingStep(parseInt(newStep, 10));
        } else if (miningSeen) {
          // Legacy: both old hints completed — skip onboarding
          setOnboardingStep(8);
          AsyncStorage.setItem(ONBOARDING_STEP_KEY, '8');
        } else if (mktSeen) {
          // Legacy: market hint done, mining hint not — start at step 4
          setOnboardingStep(4);
          AsyncStorage.setItem(ONBOARDING_STEP_KEY, '4');
        } else {
          setOnboardingStep(0); // fresh install — start from step 1
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      mountedRef.current = false;
      if (marketTimer.current) clearInterval(marketTimer.current);
      if (searchTimer.current)  clearTimeout(searchTimer.current);
    };
  }, []);

  const advanceOnboarding = useCallback((fromStep: number) => {
    const next = fromStep + 1;
    setOnboardingStep(next);
    AsyncStorage.setItem(ONBOARDING_STEP_KEY, String(next)).catch(() => {});
  }, []);

  // Step 1: measure hero card after 1.5 s delay
  useEffect(() => {
    if (onboardingStep !== 0) return;
    const t = setTimeout(() => {
      heroCardRef.current?.measureInWindow((_x, y, _w, h) => {
        if (mountedRef.current) { setHeroTop(y); setHeroHeight(h); setHeroReady(true); }
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [onboardingStep]);

  useEffect(() => {
    if (!heroReady) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(heroBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
      Animated.timing(heroBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [heroReady]);

  // Step 2: measure avatar
  useEffect(() => {
    if (onboardingStep !== 1) return;
    const t = setTimeout(() => {
      avatarRef.current?.measureInWindow((x, y, w, h) => {
        if (mountedRef.current) {
          setAvatarLeft(x); setAvatarTop(y); setAvatarSz(Math.max(w, h, 40));
          setAvatarReady(true);
        }
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [onboardingStep]);

  useEffect(() => {
    if (!avatarReady) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(avatarBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
      Animated.timing(avatarBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [avatarReady]);

  // Step 3: market card — scroll then measure (1s delay before scroll, 1.9s before measure)
  useEffect(() => {
    if (onboardingStep !== 2 || marketLayoutY === 0) return;
    const t1 = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, marketLayoutY - 24), animated: true });
    }, 1000);
    const t2 = setTimeout(() => {
      marketCardRef.current?.measureInWindow((_x, y, _w, h) => {
        if (mountedRef.current) { setMarketTop(y); setMarketHeight(h); setMarketReady(true); }
      });
    }, 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onboardingStep, marketLayoutY]);

  useEffect(() => {
    if (!marketReady) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(hintBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
      Animated.timing(hintBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [marketReady]);

  // Step 4: forge button hint (tab bar)
  useEffect(() => {
    if (onboardingStep !== 3) return;
    const t = setTimeout(() => { if (mountedRef.current) setForgeHintReady(true); }, 1000);
    return () => clearTimeout(t);
  }, [onboardingStep]);

  useEffect(() => {
    if (!forgeHintReady) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(forgeBounce, { toValue: 8, duration: 500, useNativeDriver: true }),
      Animated.timing(forgeBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [forgeHintReady]);

  // TX tour step 0: measure Send button
  useEffect(() => {
    if (txStep !== 0) return;
    const t = setTimeout(() => {
      sendBtnRef.current?.measureInWindow((x, y, w, h) => {
        if (mountedRef.current) { setSendBtnLeft(x); setSendBtnTop(y); setSendBtnW(w); setSendBtnH(h); setSendReady(true); }
      });
    }, 800);
    return () => clearTimeout(t);
  }, [txStep]);

  // TX tour step 1: measure Receive button
  useEffect(() => {
    if (txStep !== 1) return;
    const t = setTimeout(() => {
      receiveBtnRef.current?.measureInWindow((x, y, w, h) => {
        if (mountedRef.current) { setReceiveBtnLeft(x); setReceiveBtnTop(y); setReceiveBtnW(w); setReceiveReady(true); }
      });
    }, 800);
    return () => clearTimeout(t);
  }, [txStep]);

  // TX bounce
  useEffect(() => {
    if (!sendReady && !receiveReady && txStep < 2) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(txBounce, { toValue: 6, duration: 500, useNativeDriver: true }),
      Animated.timing(txBounce, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [sendReady, receiveReady, txStep]);

  const dismissMarketHint = useCallback(() => {
    if (onboardingStep !== 2) return; // guard: only advance during step 3
    setMarketReady(false);
    advanceOnboarding(2); // → step 3 active (forge button)
  }, [onboardingStep, advanceOnboarding]);

  const measureMarket = useCallback(() => {
    if (onboardingStep !== 2) return;
    marketCardRef.current?.measureInWindow((_x, y, _w, h) => {
      if (mountedRef.current && y > 0) { setMarketTop(y); setMarketHeight(h); }
    });
  }, [onboardingStep]);

  // Re-fetch market whenever coinIds changes
  useEffect(() => {
    if (coinIds.length) fetchMarket(coinIds);
    // Reset polling interval
    if (marketTimer.current) clearInterval(marketTimer.current);
    marketTimer.current = setInterval(() => { if (mountedRef.current) fetchMarket(coinIds); }, MARKET_POLL_MS);
  }, [coinIds]);

  const loadAchievements = useCallback(async () => {
    const all = await AchievementService.getInstance().getAllWithStatus();
    setUnlockedCount(all.filter(a => a.unlocked).length);
    setTotalAchievements(all.length);
  }, []);

  const loadAllData = useCallback(async () => {
    await Promise.all([loadWallet(), loadContacts(), loadProfile(), loadAchievements()]);
  }, [loadAchievements]);

  // ── Profile ─────────────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    try {
      const [name, pic] = await Promise.all([
        AsyncStorage.getItem(DISPLAY_NAME_KEY),
        AsyncStorage.getItem(PROFILE_PIC_KEY),
      ]);
      if (name && mountedRef.current) setUserName(name);
      if (pic  && mountedRef.current) setProfileUri(pic);
    } catch {}
  }, []);

  // ── Wallet ──────────────────────────────────────────────────────────────────
  const loadWallet = useCallback(async () => {
    try {
      const user = walletService.getUser();
      if (user && mountedRef.current) {
        // Only set userName from server if user hasn't set a local display name
        const localName = await AsyncStorage.getItem(DISPLAY_NAME_KEY);
        if (!localName && mountedRef.current) {
          setUserName(user.firstName || user.username || '');
        }
        setTrustLabel(user.trustLevel
          ? user.trustLevel.charAt(0).toUpperCase() + user.trustLevel.slice(1)
          : 'New User');
      }

      let wallet = await walletService.loadHDWallet();
      if (!wallet) wallet = await walletService.createWallet();
      const account = walletService.getCurrentAccount();
      if (account && mountedRef.current) {
        setBalance(account.balance || '0.00000000');
        setWalletAddress(account.address || '');
      }

      const [, txResult] = await Promise.all([
        walletService.syncBalanceFromBackend().catch(() => null),
        walletService.syncTransactionsFromBackend(5).catch(() => null),
      ]);
      if (!mountedRef.current) return;

      const updated = walletService.getCurrentAccount();
      if (updated) { setBalance(updated.balance || '0.00000000'); setWalletAddress(updated.address || ''); }

      const txs: Transaction[] = txResult?.success && txResult.transactions?.length
        ? txResult.transactions : updated?.transactions ?? [];
      setRecentPayments(txs.slice(0, 3));

      // Detect new incoming transactions and store as notifications
      const walletAddr = updated?.address ?? '';
      if (walletAddr) {
        const ns = NotificationService.getInstance();
        const existingNotifs = await ns.getNotifications();
        const existingIds = new Set(existingNotifs.map(n => n.data?.txId).filter(Boolean));
        const newIncoming = txs.filter(t =>
          t.direction === 'received' &&
          t.to === walletAddr &&
          t.id && !existingIds.has(t.id) &&
          (t.status === 'confirmed' || t.status === 'completed' || t.status === 'final' || t.status === 'included')
        );
        for (const tx of newIncoming) {
          await ns.triggerCoinReceivedNotification(tx.amount, tx.from, tx.id);
        }
      }

      // Badge = unread notification count
      const ns = NotificationService.getInstance();
      const unread = await ns.getUnreadCount();
      setNotificationCount(unread);
    } catch (err) { console.warn('Wallet load error:', err); }
  }, []);

  // ── Contacts ────────────────────────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(CONTACTS_KEY);
      if (raw && mountedRef.current) setContacts(JSON.parse(raw));
    } catch {}
  }, []);

  const saveContact = useCallback(async () => {
    if (!newName.trim() || !newAddr.trim()) {
      Alert.alert('Missing fields', 'Enter both name and wallet address.');
      return;
    }
    const c: Contact = { id: Date.now().toString(), name: newName.trim(), address: newAddr.trim() };
    const next = [...contacts, c];
    setContacts(next);
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
    setAddContactOpen(false); setNewName(''); setNewAddr('');
  }, [contacts, newName, newAddr]);

  // ── Market ──────────────────────────────────────────────────────────────────
  const loadCoins = async () => {
    try {
      const raw = await AsyncStorage.getItem(COINS_KEY);
      if (raw) {
        const parsed: string[] = JSON.parse(raw);
        if (parsed.length) setCoinIds(parsed);
      }
    } catch {}
  };

  const saveCoins = async (ids: string[]) => {
    await AsyncStorage.setItem(COINS_KEY, JSON.stringify(ids));
  };

  const fetchMarket = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const res = await fetch(marketUrl(ids), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MarketCoin[] = await res.json();
      // Preserve user's order
      const ordered = ids.map(id => data.find(c => c.id === id)).filter(Boolean) as MarketCoin[];
      if (mountedRef.current) {
        setMarketData(ordered);
        setMarketLoading(false);
        setSelectedCoin(prev => prev ? (ordered.find(c => c.id === prev.id) ?? prev) : null);
      }
    } catch { if (mountedRef.current) setMarketLoading(false); }
  }, []);

  const removeCoin = useCallback(async (id: string) => {
    const next = coinIds.filter(c => c !== id);
    setCoinIds(next);
    await saveCoins(next);
  }, [coinIds]);

  const moveCoin = useCallback(async (id: string, dir: 'up' | 'down') => {
    const idx = coinIds.indexOf(id);
    if (idx === -1) return;
    const next = [...coinIds];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setCoinIds(next);
    await saveCoins(next);
  }, [coinIds]);

  // Coin search (debounced 500ms)
  const onCoinQueryChange = useCallback((q: string) => {
    setCoinQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${COINGECKO_SEARCH}${encodeURIComponent(q.trim())}`, { headers: { Accept: 'application/json' } });
        const data = await res.json();
        if (mountedRef.current) setSearchResults((data.coins ?? []).slice(0, 8));
      } catch {}
      finally { if (mountedRef.current) setSearching(false); }
    }, 500);
  }, []);

  const addCoin = useCallback(async (result: SearchResult) => {
    if (coinIds.includes(result.id)) {
      Alert.alert('Already added', `${result.name} is already in your list.`);
      return;
    }
    const next = [...coinIds, result.id];
    setCoinIds(next);
    await saveCoins(next);
    setAddCoinOpen(false); setCoinQuery(''); setSearchResults([]);
  }, [coinIds]);

  // Re-load profile + achievements when screen comes into focus
  // useFocusEffect works across nested navigators (e.g. returning from root stack screens)
  useFocusEffect(useCallback(() => {
    loadProfile();
    loadAchievements();
    NotificationService.getInstance().getUnreadCount().then(unread => {
      setNotificationCount(unread);
    });
    // Step 2: advance when returning from ProfileEdit (1s delay)
    if (waitingForProfileReturn.current) {
      waitingForProfileReturn.current = false;
      setTimeout(() => {
        AsyncStorage.getItem(ONBOARDING_STEP_KEY).then(step => {
          if (step === '1' && mountedRef.current) advanceOnboarding(1);
        });
      }, 1000);
    }
    // Load tx tour step
    AsyncStorage.getItem(TX_TOUR_KEY).then(step => {
      if (step !== null && mountedRef.current) {
        setTxStep(parseInt(step, 10));
      }
    });
    // Advance tx tour when returning from Send/Receive screens
    if (waitingForTxReturn.current) {
      waitingForTxReturn.current = false;
      AsyncStorage.getItem(TX_TOUR_KEY).then(step => {
        if (step !== null && mountedRef.current) {
          const n = parseInt(step, 10);
          if (n < 3) {
            const next = n + 1;
            setTimeout(() => {
              setTxStep(next);
              AsyncStorage.setItem(TX_TOUR_KEY, String(next));
            }, 1000);
          }
        }
      });
    }
  }, [loadProfile, loadAchievements, advanceOnboarding]));

  // ── Refresh ─────────────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadAllData(), fetchMarket(coinIds)]);
    setIsRefreshing(false);
  }, [loadAllData, coinIds]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatBalance = (b: string) => { const n = parseFloat(b || '0'); return isNaN(n) ? '0.00000000' : n.toFixed(8); };
  const shortAddr     = (a: string) => a ? `${a.slice(0, 8)}...${a.slice(-6)}` : '';
  const fmtUsd        = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isPositiveTx = (tx: Transaction) => {
    if (tx.type && ['mining','mining_reward','participation','referral','referral_bonus'].includes(tx.type)) return true;
    if (tx.direction === 'received') return true;
    if (tx.direction === 'sent') return false;
    return walletAddress ? tx.to === walletAddress : false;
  };

  const getTxLabel = (tx: Transaction) => {
    if (tx.typeLabel) return tx.typeLabel;
    if (tx.type === 'mining' || tx.type === 'mining_reward') return 'Block Credit';
    if (tx.type === 'referral' || tx.type === 'referral_bonus') return 'Referral Bonus';
    return tx.direction === 'sent' ? 'Sent' : 'Received';
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
    <AchievementsSheet
      visible={achievementsOpen}
      onClose={() => { setAchievementsOpen(false); loadAchievements(); }}
    />
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 12 }]}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      showsVerticalScrollIndicator={false}
      onScroll={measureMarket}
      scrollEventThrottle={32}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* Avatar — tap to open ProfileEditScreen */}
          <View ref={avatarRef}>
          <TouchableOpacity
            style={[styles.avatarCircle, { backgroundColor: isDark ? 'rgba(93,173,226,0.18)' : '#DBEAFE' }]}
            onPress={() => {
              if (onboardingStep === 1) waitingForProfileReturn.current = true;
              navigation.navigate('ProfileEdit');
            }}
            activeOpacity={0.8}
          >
            {profileUri ? (
              <Image key={profileUri} source={{ uri: profileUri }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-outline" size={20} color={colors.accent} />
            )}
          </TouchableOpacity>
          </View>
          <Text style={[styles.greetingText, { color: colors.textPrimary }]}>
            {getGreeting()}{userName ? `, ${userName}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle} activeOpacity={0.7}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.bellWrapper}>
          <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
          {notificationCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Physical Card ── */}
      <View ref={heroCardRef} style={styles.cardWrapper}>
        <LinearGradient
          colors={['#0f0c29', '#302b63', '#24243e']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.physicalCard}
        >
          {/* Decorative circles */}
          <View style={styles.cardCircle1} />
          <View style={styles.cardCircle2} />

          {/* Top row: logo + chip */}
          <View style={styles.cardTopRow}>
            <View>
              <Text style={styles.cardLogoText}>AURA 50</Text>
              <Text style={styles.cardLogoSub}>Blockchain Wallet</Text>
            </View>
            {/* EMV chip */}
            <View style={styles.chip}>
              <View style={styles.chipH} /><View style={styles.chipH} /><View style={styles.chipH} />
              <View style={styles.chipV} />
            </View>
          </View>

          {/* Balance + eye inline */}
          <View style={styles.balanceRow}>
            <Text style={styles.balanceText} adjustsFontSizeToFit numberOfLines={1}>
              {showBalance ? formatBalance(balance) : '****.****.**'}
            </Text>
            <TouchableOpacity onPress={() => setShowBalance(v => !v)} style={styles.eyeBtn}>
              <Ionicons name={showBalance ? 'eye-outline' : 'eye-off-outline'} size={17} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
          <Text style={styles.balanceCurrency}>A50</Text>

          {/* Wallet address */}
          {walletAddress ? (
            <TouchableOpacity onPress={() => navigation.navigate('ReceiveTransaction')}>
              <Text style={styles.cardAddress}>{shortAddr(walletAddress)}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Bottom: name + trophy + trust badge */}
          <View style={styles.cardBottom}>
            <Text style={styles.cardHolderName}>{(userName || 'AURA50 USER').toUpperCase()}</Text>
            <View style={styles.cardBottomRight}>
              {/* Trophy achievement button */}
              <TouchableOpacity
                onPress={() => setAchievementsOpen(true)}
                style={styles.trophyBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="trophy" size={13} color="#F1C40F" />
                <Text style={styles.trophyCount}>{unlockedCount}/{totalAchievements}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('TrustLevel')} style={styles.trustBadge}>
                <Text style={styles.trustBadgeText}>{trustLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* ── Capsule Action Buttons (3 only) ── */}
      <View style={styles.actionRow}>
        {[
          { label: 'Send',    icon: 'arrow-up-circle-outline',   color: colors.sendColor,    bg: colors.sendBg,    route: 'SendTransaction' },
          { label: 'Receive', icon: 'arrow-down-circle-outline',  color: colors.receiveColor, bg: colors.receiveBg, route: 'ReceiveTransaction' },
          { label: 'Seed',    icon: 'key-outline',               color: colors.seedColor,    bg: colors.seedBg,    route: 'SeedPhrase' },
        ].map(({ label, icon, color, bg, route }) => {
          const btnRef = label === 'Send' ? sendBtnRef : label === 'Receive' ? receiveBtnRef : null;
          return (
            <View ref={btnRef} key={label} style={{ flex: 1 }}>
              <TouchableOpacity
                style={[styles.capsuleBtn, {
                  backgroundColor: isDark ? colors.card2 : colors.card,
                  borderColor: colors.cardBorder,
                }]}
                onPress={() => {
                  if ((label === 'Send' || label === 'Receive') && txStep >= 0 && txStep < 2) {
                    waitingForTxReturn.current = true;
                  }
                  navigation.navigate(route);
                }}
              >
                <Ionicons name={icon as any} size={18} color={color} />
                <Text style={[styles.capsuleLabel, { color }]}>{label}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* ── Top Contacts ── */}
      <ThemedCard style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top Contacts</Text>
          <TouchableOpacity onPress={() => Alert.alert('Contacts', `${contacts.length} saved contact(s).`)}>
            <Text style={[styles.viewAllText, { color: colors.accent }]}>View All {'>'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {contacts.map(c => (
            <TouchableOpacity key={c.id} style={styles.contactItem}
              onPress={() => navigation.navigate('SendTransaction', { toAddress: c.address })}>
              <View style={[styles.contactAvatar, { backgroundColor: colors.contactAvatarBg }]}>
                <Text style={[styles.contactInitial, { color: colors.contactInitial }]}>{c.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={[styles.contactName, { color: colors.textMuted }]} numberOfLines={1}>{c.name}</Text>
            </TouchableOpacity>
          ))}
          {/* Add contact card */}
          <TouchableOpacity style={[styles.addContactCard, { backgroundColor: colors.addContactCardBg, borderColor: colors.addContactBorder }]}
            onPress={() => setAddContactOpen(true)}>
            <Ionicons name="person-add-outline" size={20} color={colors.accent} />
            <Text style={[styles.addContactText, { color: colors.accent }]}>Add</Text>
          </TouchableOpacity>
        </ScrollView>
      </ThemedCard>

      {/* ── Recent Payments ── */}
      <ThemedCard style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Payments</Text>
          <TouchableOpacity onPress={() => navigation.navigate('TransactionHistory')}>
            <Text style={[styles.viewAllText, { color: colors.accent }]}>View All {'>'}</Text>
          </TouchableOpacity>
        </View>
        {recentPayments.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={36} color={colors.emptyIcon} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No recent payments</Text>
          </View>
        ) : recentPayments.map(tx => {
          const positive = isPositiveTx(tx);
          return (
            <View key={tx.id} style={[styles.txRow, { borderBottomColor: colors.marketRowBorder }]}>
              <View style={[styles.txIcon, { backgroundColor: positive ? colors.txPosBg : colors.txNegBg }]}>
                <Ionicons name={positive ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                  size={20} color={positive ? colors.success : colors.danger} />
              </View>
              <View style={styles.txDetails}>
                <Text style={[styles.txLabel, { color: colors.textPrimary }]}>{getTxLabel(tx)}</Text>
                <Text style={[styles.txDate, { color: colors.textMuted }]}>{new Date(tx.timestamp).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.txAmount, { color: positive ? colors.success : colors.danger }]}>
                {positive ? '+' : '-'}{parseFloat(tx.amount || '0').toFixed(5)} A50
              </Text>
            </View>
          );
        })}
      </ThemedCard>

      {/* ── Market ── */}
      <View
        ref={marketCardRef}
        onLayout={(e) => setMarketLayoutY(e.nativeEvent.layout.y)}
      >
      <ThemedCard style={[styles.sectionCard, styles.lastCard]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Market</Text>
          <View style={styles.marketActions}>
            <TouchableOpacity style={[styles.marketActionBtn, { backgroundColor: colors.marketActionBtnBg }]}
              onPress={() => setEditingMarket(v => !v)}>
              <Ionicons name={editingMarket ? 'checkmark' : 'pencil-outline'} size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.marketActionBtn, { backgroundColor: colors.marketActionBtnBg, marginLeft: 6 }]}
              onPress={() => setAddCoinOpen(true)}>
              <Ionicons name="add" size={16} color={colors.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {marketLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Loading prices…</Text>
          </View>
        ) : marketData.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No coins — tap + to add</Text>
          </View>
        ) : marketData.map(coin => {
          const pct  = coin.price_change_percentage_24h ?? 0;
          const isUp = pct >= 0;
          return (
            <TouchableOpacity key={coin.id} style={[styles.marketRow, { borderBottomColor: colors.marketRowBorder }]}
              onPress={() => { dismissMarketHint(); setSelectedCoin(coin); }} activeOpacity={0.75}>
              {/* Left: icon + name */}
              <View style={styles.marketLeft}>
                {coin.image ? (
                  <Image source={{ uri: coin.image }} style={styles.coinIcon} />
                ) : (
                  <View style={[styles.coinIconFallback, { backgroundColor: colors.coinIconFallbackBg }]}>
                    <Text style={[styles.coinIconLetter, { color: colors.coinIconLetter }]}>{coin.symbol.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View>
                  <Text style={[styles.coinName, { color: colors.coinName }]}>{coin.name}</Text>
                  <Text style={[styles.coinSymbol, { color: colors.coinSymbol }]}>{coin.symbol.toUpperCase()}</Text>
                </View>
              </View>

              {/* Right: sparkline + price (or edit controls) */}
              {editingMarket ? (
                <View style={styles.editControls}>
                  <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.editBtnBg }]} onPress={() => moveCoin(coin.id, 'up')}>
                    <Ionicons name="chevron-up" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.editBtnBg }]} onPress={() => moveCoin(coin.id, 'down')}>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.editDelBg }]}
                    onPress={() => removeCoin(coin.id)}>
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.marketRight}>
                  <InlineSparkline prices={coin.sparkline_in_7d?.price ?? []} isUp={isUp} />
                  <View style={styles.priceBlock}>
                    <Text style={[styles.coinPrice, { color: colors.coinPrice }]}>${fmtUsd(coin.current_price)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={11} color={isUp ? colors.success : colors.danger} />
                      <Text style={[styles.coinChange, { color: isUp ? colors.success : colors.danger }]}>
                        {Math.abs(pct).toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ThemedCard>
      </View>

      {/* ═══════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════ */}

      {/* ── Add Contact ── */}
      <Modal visible={addContactOpen} transparent animationType="slide" onRequestClose={() => setAddContactOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setAddContactOpen(false)}>
            <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.card }]}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Add Contact</Text>

              <Text style={[styles.inputLabel, { color: colors.textLabel }]}>Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                placeholder="e.g., John Doe" placeholderTextColor={colors.placeholder}
                value={newName} onChangeText={setNewName} autoFocus />

              <Text style={[styles.inputLabel, { color: colors.textLabel }]}>Wallet Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                placeholder="0x123...abc" placeholderTextColor={colors.placeholder}
                value={newAddr} onChangeText={setNewAddr} autoCapitalize="none" autoCorrect={false} />

              <View style={styles.sheetBtns}>
                <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.pillBg }]} onPress={() => setAddContactOpen(false)}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.accent }]} onPress={saveContact}>
                  <Text style={styles.confirmBtnText}>Add Contact</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Coin ── */}
      <Modal visible={addCoinOpen} transparent animationType="slide" onRequestClose={() => setAddCoinOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setAddCoinOpen(false)}>
            <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.card, maxHeight: '75%' }]}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Add Coin</Text>

              <View style={[styles.searchRow, { backgroundColor: colors.pillBg }]}>
                <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  placeholder="Search by name or symbol…"
                  placeholderTextColor={colors.placeholder}
                  value={coinQuery}
                  onChangeText={onCoinQueryChange}
                  autoFocus autoCapitalize="none" autoCorrect={false}
                />
                {searching && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 8 }} />}
              </View>

              <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled">
                {searchResults.map(r => (
                  <TouchableOpacity key={r.id} style={[styles.searchResult, { borderBottomColor: colors.marketRowBorder }]} onPress={() => addCoin(r)}>
                    {r.thumb ? (
                      <Image source={{ uri: r.thumb }} style={styles.resultIcon} />
                    ) : (
                      <View style={[styles.resultIconFallback, { backgroundColor: colors.coinIconFallbackBg }]}>
                        <Text style={[styles.resultIconLetter, { color: colors.coinIconLetter }]}>{r.symbol.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: colors.textPrimary }]}>{r.name}</Text>
                      <Text style={[styles.resultSymbol, { color: colors.textMuted }]}>{r.symbol.toUpperCase()}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
                  </TouchableOpacity>
                ))}
                {coinQuery.trim() && !searching && searchResults.length === 0 && (
                  <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: 20 }]}>No results for "{coinQuery}"</Text>
                )}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Market Chart Popup ── */}
      <Modal visible={!!selectedCoin} transparent animationType="slide" onRequestClose={() => setSelectedCoin(null)}>
        <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setSelectedCoin(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.chartBg, paddingBottom: 32 }]}>
            {selectedCoin && (() => {
              const pct  = selectedCoin.price_change_percentage_24h ?? 0;
              const isUp = pct >= 0;
              const prices = selectedCoin.sparkline_in_7d?.price ?? [];
              return (
                <>
                  <View style={styles.chartHeader}>
                    <View style={styles.chartHeaderLeft}>
                      {selectedCoin.image
                        ? <Image source={{ uri: selectedCoin.image }} style={styles.chartCoinIcon} />
                        : <View style={[styles.chartCoinIcon, { backgroundColor: colors.coinIconFallbackBg, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.coinIconLetter }}>{selectedCoin.symbol.charAt(0).toUpperCase()}</Text>
                          </View>}
                      <View>
                        <Text style={[styles.chartCoinName, { color: colors.chartCoinName }]}>{selectedCoin.name}</Text>
                        <Text style={[styles.chartCoinSymbol, { color: colors.chartCoinSymbol }]}>{selectedCoin.symbol.toUpperCase()} · 7-day</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedCoin(null)} style={[styles.chartCloseBtn, { backgroundColor: colors.chartCloseBtn }]}>
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.chartPriceRow}>
                    <Text style={[styles.chartPrice, { color: colors.chartPrice }]}>${fmtUsd(selectedCoin.current_price)}</Text>
                    <View style={[styles.changeBadge, { backgroundColor: isUp ? colors.txPosBg : colors.txNegBg }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={11} color={isUp ? colors.success : colors.danger} />
                        <Text style={[styles.changePct, { color: isUp ? colors.success : colors.danger }]}>
                          {Math.abs(pct).toFixed(2)}%
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.chartArea, { backgroundColor: colors.chartAreaBg }]}>
                    {prices.length >= 2
                      ? <FullChart prices={prices} isUp={isUp} />
                      : <Text style={[styles.emptyText, { color: colors.textMuted }]}>No chart data</Text>}
                  </View>

                  <Text style={[styles.chartFootnote, { color: colors.chartFootnote }]}>Live · auto-refreshes every 60 s</Text>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>

    {/* ════════════════════════════════════════════════════════════════
        ONBOARDING MODALS (steps 1-4 live on this screen)
    ════════════════════════════════════════════════════════════════ */}

    {/* ── Step 1: Hero card highlight ── */}
    <Modal visible={onboardingStep === 0 && heroReady} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      {/* Re-render card at measured position */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { setHeroReady(false); advanceOnboarding(0); }}
        style={{
          position: 'absolute',
          top: heroTop + 12, left: 16, right: 16,
          borderRadius: 20, overflow: 'hidden',
          elevation: 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4, shadowRadius: 16,
        }}
      >
        <LinearGradient colors={['#0f0c29', '#302b63', '#24243e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.physicalCard}>
          <View style={styles.cardCircle1} /><View style={styles.cardCircle2} />
          <View style={styles.cardTopRow}>
            <View>
              <Text style={styles.cardLogoText}>AURA 50</Text>
              <Text style={styles.cardLogoSub}>Blockchain Wallet</Text>
            </View>
            <View style={styles.chip}>
              <View style={styles.chipH} /><View style={styles.chipH} /><View style={styles.chipH} />
              <View style={styles.chipV} />
            </View>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceText} adjustsFontSizeToFit numberOfLines={1}>
              {showBalance ? formatBalance(balance) : '****.****.**'}
            </Text>
          </View>
          <Text style={styles.balanceCurrency}>A50</Text>
          <View style={styles.cardBottom}>
            <Text style={styles.cardHolderName}>{(userName || 'AURA50 USER').toUpperCase()}</Text>
            <View style={styles.cardBottomRight}>
              <View style={styles.trophyBtn}>
                <Ionicons name="trophy" size={13} color="#F1C40F" />
                <Text style={styles.trophyCount}>{unlockedCount}/{totalAchievements}</Text>
              </View>
              <View style={styles.trustBadge}>
                <Text style={styles.trustBadgeText}>{trustLabel}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
      {/* Hint badge below card */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', top: heroTop + 12 + heroHeight + 14,
        left: 24, right: 24, alignItems: 'center',
        transform: [{ translateY: heroBounce }],
      }}>
        <View style={styles.hintBadge}>
          <Ionicons name="trophy-outline" size={14} color="rgba(255,220,120,0.85)" />
          <Text style={styles.hintBadgeText}>See your balance and trophy here · tap to continue</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── Step 2: Avatar / profile icon highlight ── */}
    <Modal visible={onboardingStep === 1 && avatarReady} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      {/* Re-render avatar at measured position */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: avatarTop + 12, left: avatarLeft,
          width: avatarSz, height: avatarSz, borderRadius: avatarSz / 2,
          backgroundColor: isDark ? 'rgba(93,173,226,0.18)' : '#DBEAFE',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          elevation: 24,
        }}
        onPress={() => {
          setAvatarReady(false);
          waitingForProfileReturn.current = true;
          navigation.navigate('ProfileEdit');
        }}
        activeOpacity={0.85}
      >
        {profileUri
          ? <Image source={{ uri: profileUri }} style={{ width: avatarSz, height: avatarSz, borderRadius: avatarSz / 2 }} />
          : <Ionicons name="person-outline" size={20} color={colors.accent} />
        }
      </TouchableOpacity>
      {/* Hint badge below avatar */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', top: avatarTop + 12 + avatarSz + 10,
        left: 16, right: 16, alignItems: 'flex-start',
        paddingLeft: Math.max(0, avatarLeft - 16),
        transform: [{ translateY: avatarBounce }],
      }}>
        <View style={styles.hintBadge}>
          <Ionicons name="person-outline" size={14} color="rgba(100,200,255,0.85)" />
          <Text style={styles.hintBadgeText}>Set your name and Photo · tap to open</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── Step 3: Market card highlight ── */}
    <Modal visible={onboardingStep === 2 && marketReady} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      <View style={{
        position: 'absolute', top: marketTop + 12, left: 16, right: 16,
        backgroundColor: colors.card, borderRadius: 16, padding: 16,
        elevation: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4, shadowRadius: 16,
      }}>
        <View style={[styles.sectionHeader, { marginBottom: 10 }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Market</Text>
        </View>
        {marketData.map(coin => {
          const pct  = coin.price_change_percentage_24h ?? 0;
          const isUp = pct >= 0;
          return (
            <TouchableOpacity key={coin.id}
              style={[styles.marketRow, { borderBottomColor: colors.marketRowBorder }]}
              onPress={() => { dismissMarketHint(); setSelectedCoin(coin); }}
              activeOpacity={0.75}
            >
              <View style={styles.marketLeft}>
                {coin.image
                  ? <Image source={{ uri: coin.image }} style={styles.coinIcon} />
                  : <View style={[styles.coinIconFallback, { backgroundColor: colors.coinIconFallbackBg }]}>
                      <Text style={[styles.coinIconLetter, { color: colors.coinIconLetter }]}>{coin.symbol.charAt(0).toUpperCase()}</Text>
                    </View>}
                <View>
                  <Text style={[styles.coinName, { color: colors.coinName }]}>{coin.name}</Text>
                  <Text style={[styles.coinSymbol, { color: colors.coinSymbol }]}>{coin.symbol.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.marketRight}>
                <InlineSparkline prices={coin.sparkline_in_7d?.price ?? []} isUp={isUp} />
                <View style={styles.priceBlock}>
                  <Text style={[styles.coinPrice, { color: colors.coinPrice }]}>${fmtUsd(coin.current_price)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={11} color={isUp ? colors.success : colors.danger} />
                    <Text style={[styles.coinChange, { color: isUp ? colors.success : colors.danger }]}>
                      {Math.abs(pct).toFixed(1)}%
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Animated.View pointerEvents="none" style={[
        styles.marketHintContainer,
        { top: Math.max(insets.top + 10, marketTop + 12 - 50) },
        { transform: [{ translateY: hintBounce }] },
      ]}>
        <View style={styles.marketHintBadge}>
          <Ionicons name="bar-chart-outline" size={14} color="rgba(255,220,120,0.85)" />
          <Text style={styles.marketHintText}>See trends · tap a coin to explore</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── Step 4: Forge (tab bar) button highlight ── */}
    <Modal visible={onboardingStep === 3 && forgeHintReady} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      {/* Re-render the Forge tab button at its approximate position */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: insets.bottom,
          left: (SCREEN_W / 5) * 1,
          width: SCREEN_W / 5,
          height: 60,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.tabBg,
          borderTopLeftRadius: 6, borderTopRightRadius: 6,
          elevation: 24,
        }}
        onPress={() => {
          setForgeHintReady(false);
          advanceOnboarding(3); // → step 4 (MiningScreen)
          navigation.navigate('Mining');
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="flash" size={24} color={colors.tabActive} />
        <Text style={{ color: colors.tabActive, fontSize: 10, marginTop: 2, fontWeight: '600' }}>Forge</Text>
      </TouchableOpacity>
      {/* Hint badge above the forge tab */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute',
        bottom: insets.bottom + 68,
        left: (SCREEN_W / 5) * 1 - 30,
        right: SCREEN_W - (SCREEN_W / 5) * 3,
        alignItems: 'center',
        transform: [{ translateY: forgeBounce }],
      }}>
        <View style={styles.hintBadge}>
          <Ionicons name="flash-outline" size={14} color="rgba(100,200,255,0.85)" />
          <Text style={styles.hintBadgeText}>Mine coins here</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── TX Tour Step 0: Send button highlight ── */}
    <Modal visible={txStep === 0 && sendReady} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: sendBtnTop + 12, left: sendBtnLeft,
          width: sendBtnW, height: sendBtnH,
          backgroundColor: isDark ? colors.card2 : colors.card,
          borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 6, elevation: 24,
        }}
        onPress={() => {
          setSendReady(false);
          waitingForTxReturn.current = true;
          navigation.navigate('SendTransaction');
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="arrow-up-circle-outline" size={18} color={colors.sendColor} />
        <Text style={[styles.capsuleLabel, { color: colors.sendColor }]}>Send</Text>
      </TouchableOpacity>
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', top: sendBtnTop + 12 + sendBtnH + 10,
        left: sendBtnLeft, right: sendBtnLeft,
        alignItems: 'center', transform: [{ translateY: txBounce }],
      }}>
        <View style={styles.hintBadge}>
          <Ionicons name="arrow-up-circle-outline" size={14} color="rgba(100,200,255,0.85)" />
          <Text style={styles.hintBadgeText}>Send A50 to anyone · tap to try</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── TX Tour Step 1: Receive button highlight ── */}
    <Modal visible={txStep === 1 && receiveReady} transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: receiveBtnTop + 12, left: receiveBtnLeft,
          width: receiveBtnW, height: sendBtnH,
          backgroundColor: isDark ? colors.card2 : colors.card,
          borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 6, elevation: 24,
        }}
        onPress={() => {
          setReceiveReady(false);
          waitingForTxReturn.current = true;
          navigation.navigate('ReceiveTransaction');
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="arrow-down-circle-outline" size={18} color={colors.receiveColor} />
        <Text style={[styles.capsuleLabel, { color: colors.receiveColor }]}>Receive</Text>
      </TouchableOpacity>
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', top: receiveBtnTop + 12 + sendBtnH + 10,
        left: receiveBtnLeft, right: receiveBtnLeft,
        alignItems: 'center', transform: [{ translateY: txBounce }],
      }}>
        <View style={styles.hintBadge}>
          <Ionicons name="arrow-down-circle-outline" size={14} color="rgba(100,200,255,0.85)" />
          <Text style={styles.hintBadgeText}>Share your address to receive A50 · tap to try</Text>
        </View>
      </Animated.View>
    </Modal>

    {/* ── TX Tour Step 2: View All hint ── */}
    <Modal visible={txStep === 2} transparent animationType="fade" statusBarTranslucent>
      <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => {
        setTxStep(3);
        AsyncStorage.setItem(TX_TOUR_KEY, '3');
      }} activeOpacity={1}>
        <View style={{ position: 'absolute', top: SCREEN_H / 2, left: 24, right: 24, alignItems: 'center' }}>
          <View style={styles.hintBadge}>
            <Ionicons name="receipt-outline" size={14} color="rgba(100,200,255,0.85)" />
            <Text style={styles.hintBadgeText}>Tap 'View All' under Recent Payments to see your full history · tap anywhere to continue</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
    </>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  contentContainer: { paddingBottom: 24 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10, overflow: 'hidden' },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  greetingText: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  themeToggle: { padding: 4, marginRight: 4 },
  bellWrapper: { position: 'relative', padding: 4 },
  notificationBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 },
  notificationText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  // Physical card
  cardWrapper: { marginHorizontal: 16, marginBottom: 14, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 10 },
  physicalCard: { borderRadius: 20, padding: 22, minHeight: 200, overflow: 'hidden' },
  cardCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)', top: -60, right: -60 },
  cardCircle2: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.03)', bottom: -30, left: -20 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  cardLogoText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },
  cardLogoSub: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2, letterSpacing: 0.5 },
  // EMV chip
  chip: { width: 36, height: 28, borderRadius: 5, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  chipH: { width: '90%', height: 1.5, backgroundColor: 'rgba(0,0,0,0.25)', marginVertical: 2.5 },
  chipV: { position: 'absolute', width: 1.5, height: '80%', backgroundColor: 'rgba(0,0,0,0.25)' },
  // Balance
  balanceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  balanceText: { color: '#FFF', fontSize: 28, fontWeight: '800', flex: 1, letterSpacing: 0.5 },
  eyeBtn: { marginLeft: 8, padding: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14 },
  balanceCurrency: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 10 },
  cardAddress: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'monospace', letterSpacing: 0.5, marginBottom: 16 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBottomRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHolderName: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  trophyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(241,196,15,0.18)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  trophyCount: { color: '#F1C40F', fontSize: 10, fontWeight: '700' },
  trustBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  trustBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },

  // Capsule actions
  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 14 },
  capsuleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1, gap: 6 },
  capsuleLabel: { fontSize: 13, fontWeight: '700' },

  // Section card
  sectionCard: { marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  lastCard: { marginBottom: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  viewAllText: { fontSize: 13, color: '#2563EB', fontWeight: '500' },

  // Contacts
  contactItem: { alignItems: 'center', marginRight: 14, width: 56 },
  contactAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  contactInitial: { fontSize: 18, fontWeight: '700', color: '#2563EB' },
  contactName: { fontSize: 11, color: '#6B7280', textAlign: 'center', fontWeight: '500' },
  addContactCard: { alignItems: 'center', justifyContent: 'center', width: 56, height: 70, borderRadius: 14, backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE', borderStyle: 'dashed', gap: 3 },
  addContactText: { fontSize: 11, color: '#2563EB', fontWeight: '600' },

  // Transactions
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  txIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txDetails: { flex: 1 },
  txLabel: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  txDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },

  // Market
  marketActions: { flexDirection: 'row', alignItems: 'center' },
  marketActionBtn: { padding: 6, backgroundColor: '#F3F4F6', borderRadius: 10 },
  marketRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  marketLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  coinIcon: { width: 34, height: 34, borderRadius: 17 },
  coinIconFallback: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  coinIconLetter: { fontSize: 14, fontWeight: '700', color: '#374151' },
  // Generic onboarding hint badge
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

  // Market hint
  marketHintContainer: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  marketHintBadge: {
    backgroundColor: 'rgba(20,20,20,0.72)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(232,160,32,0.35)',
  },
  marketHintText: { color: 'rgba(255,255,255,0.78)', fontWeight: '500', fontSize: 13 },

  coinName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  coinSymbol: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  marketRight: { flexDirection: 'row', alignItems: 'center' },
  priceBlock: { marginLeft: 8, alignItems: 'flex-end' },
  coinPrice: { fontSize: 13, fontWeight: '700', color: '#1F2937' },
  coinChange: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  // Edit controls
  editControls: { flexDirection: 'row', gap: 6 },
  editBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { color: '#9CA3AF', fontSize: 14, marginTop: 8, textAlign: 'center' },

  // Overlay / sheet (shared)
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 18 },
  inputLabel: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 14 },
  sheetBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, gap: 10 },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F3F4F6' },
  cancelBtnText: { color: '#374151', fontWeight: '600' },
  confirmBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563EB' },
  confirmBtnText: { color: '#FFF', fontWeight: '600' },

  // Add coin search
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 8 },
  searchResult: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 10 },
  resultIcon: { width: 32, height: 32, borderRadius: 16 },
  resultIconFallback: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  resultIconLetter: { fontSize: 13, fontWeight: '700', color: '#374151' },
  resultName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  resultSymbol: { fontSize: 12, color: '#6B7280' },

  // Chart popup
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chartCoinIcon: { width: 40, height: 40, borderRadius: 20 },
  chartCoinName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  chartCoinSymbol: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  chartCloseBtn: { padding: 6, backgroundColor: '#F3F4F6', borderRadius: 14 },
  chartPriceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  chartPrice: { fontSize: 26, fontWeight: '800', color: '#111827' },
  changeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  changePct: { fontSize: 14, fontWeight: '700' },
  chartArea: { borderRadius: 12, backgroundColor: '#F9FAFB', padding: 12, marginBottom: 10, overflow: 'hidden' },
  chartFootnote: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
});
