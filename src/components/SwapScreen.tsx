import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Polyline, Line, Circle, Defs, LinearGradient as SvgGrad, Stop, Path } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import AMMService, { type PoolReserves, type SwapQuote } from '../services/AMMService';
import { EnhancedWalletService } from '../services/EnhancedWalletService';

const { width: SW } = Dimensions.get('window');
const CHART_W = SW - 64;
const CHART_H = 120;
const PAD = { l: 4, r: 4, t: 10, b: 10 };

interface PricePoint { price: number; ts: number }

// ── Interactive price chart ───────────────────────────────────────────────────
const PriceChart: React.FC<{
  history: PricePoint[];
  accent: string;
  textColor: string;
  mutedColor: string;
  token0: string;
  token1: string;
}> = ({ history, accent, textColor, mutedColor, token0, token1 }) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const innerW = CHART_W - PAD.l - PAD.r;
  const innerH = CHART_H - PAD.t - PAD.b;

  const prices = history.map(p => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || minP * 0.01 || 0.0001;

  const pts = history.map((p, i) => {
    const x = PAD.l + (i / Math.max(history.length - 1, 1)) * innerW;
    const y = PAD.t + innerH - ((p.price - minP) / range) * innerH;
    return { x, y, ...p };
  });

  const polyPoints = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  // Area fill path
  const areaPath = pts.length > 1
    ? `M${pts[0].x.toFixed(2)},${PAD.t + innerH} ` +
      pts.map(p => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') +
      ` L${pts[pts.length - 1].x.toFixed(2)},${PAD.t + innerH} Z`
    : '';

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const localX = e.nativeEvent.locationX;
      const idx = Math.round((localX - PAD.l) / innerW * (history.length - 1));
      setSelectedIdx(Math.max(0, Math.min(history.length - 1, idx)));
    },
    onPanResponderMove: (e) => {
      const localX = e.nativeEvent.locationX;
      const idx = Math.round((localX - PAD.l) / innerW * (history.length - 1));
      setSelectedIdx(Math.max(0, Math.min(history.length - 1, idx)));
    },
    onPanResponderRelease: () => setTimeout(() => setSelectedIdx(null), 1500),
  }), [history.length, innerW]);

  const sel = selectedIdx !== null ? pts[selectedIdx] : null;
  const currentPrice = history.length > 0 ? history[history.length - 1].price : 0;
  const firstPrice = history.length > 0 ? history[0].price : 0;
  const pct = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0;
  const isUp = pct >= 0;

  return (
    <View style={{ marginTop: 4 }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
        <View>
          <Text style={{ fontSize: 11, color: mutedColor, fontWeight: '500' }}>
            {sel ? new Date(sel.ts).toLocaleTimeString() : `${token0} / ${token1}`}
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: textColor }}>
            {(sel ? sel.price : currentPrice).toFixed(6)}
          </Text>
        </View>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: isUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}>
          <Ionicons name={isUp ? 'trending-up' : 'trending-down'} size={14} color={isUp ? '#22c55e' : '#ef4444'} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: isUp ? '#22c55e' : '#ef4444' }}>
            {isUp ? '+' : ''}{pct.toFixed(2)}%
          </Text>
        </View>
      </View>

      {/* SVG chart */}
      <View {...panResponder.panHandlers} style={{ borderRadius: 12, overflow: 'hidden' }}>
        <Svg width={CHART_W} height={CHART_H}>
          <Defs>
            <SvgGrad id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0.02} />
            </SvgGrad>
          </Defs>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(f => (
            <Line
              key={f}
              x1={PAD.l} y1={PAD.t + innerH * f}
              x2={PAD.l + innerW} y2={PAD.t + innerH * f}
              stroke="rgba(128,128,128,0.12)"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
          ))}
          {/* Area fill */}
          {areaPath && <Path d={areaPath} fill="url(#areaGrad)" />}
          {/* Price line */}
          {pts.length > 1 && (
            <Polyline
              points={polyPoints}
              fill="none"
              stroke={isUp ? '#22c55e' : '#ef4444'}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {/* Selection crosshair */}
          {sel && (
            <>
              <Line
                x1={sel.x} y1={PAD.t}
                x2={sel.x} y2={PAD.t + innerH}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <Circle cx={sel.x} cy={sel.y} r={5} fill={isUp ? '#22c55e' : '#ef4444'} />
              <Circle cx={sel.x} cy={sel.y} r={9} fill={isUp ? '#22c55e' : '#ef4444'} fillOpacity={0.25} />
            </>
          )}
          {/* Current price dot */}
          {!sel && pts.length > 0 && (
            <>
              <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={isUp ? '#22c55e' : '#ef4444'} />
              <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={8} fill={isUp ? '#22c55e' : '#ef4444'} fillOpacity={0.2} />
            </>
          )}
        </Svg>
      </View>

      {/* Min/max labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 10, color: mutedColor }}>low {minP.toFixed(6)}</Text>
        <Text style={{ fontSize: 10, color: mutedColor }}>high {maxP.toFixed(6)}</Text>
      </View>
    </View>
  );
};

interface Props {
  navigation: any;
}

function fmt(n: number, dp = 4): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function SwapScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const amm    = AMMService.getInstance();

  const [direction, setDirection]     = useState<'a50_to_token1' | 'token1_to_a50'>('a50_to_token1');
  const [amountIn, setAmountIn]       = useState('');
  const [quote, setQuote]             = useState<SwapQuote | null>(null);
  const [reserves, setReserves]       = useState<PoolReserves | null>(null);
  const [lpBalance, setLpBalance]     = useState(0);
  const [isQuoting, setIsQuoting]     = useState(false);
  const [isSwapping, setIsSwapping]   = useState(false);
  const [slippage, setSlippage]       = useState(0.5); // %
  const [pendingTx, setPendingTx]     = useState<string | null>(null);
  const [configured, setConfigured]   = useState(amm.isConfigured());
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [showChart, setShowChart]       = useState(true);

  const quoteTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const flipAnim     = useRef(new Animated.Value(0)).current;

  const walletAddress = EnhancedWalletService.getInstance().getCurrentAccount()?.address ?? '';

  // ── Load pool data ──────────────────────────────────────────────────────────

  const snapshotPrice = useCallback((res: PoolReserves) => {
    if (res.reserve0 <= 0) return;
    const price = res.reserve1 / res.reserve0;
    setPriceHistory(prev => {
      const next = [...prev, { price, ts: Date.now() }];
      return next.length > 120 ? next.slice(-120) : next;
    });
  }, []);

  const loadPool = useCallback(async () => {
    setConfigured(amm.isConfigured());
    if (!amm.isConfigured()) return;
    try {
      const [res, lp] = await Promise.all([
        amm.getReserves(),
        amm.getUserLPBalance(walletAddress),
      ]);
      setReserves(res);
      setLpBalance(lp);
      snapshotPrice(res);
    } catch {
      // Pool unreachable — show last cached state
    }
  }, [walletAddress, snapshotPrice]);

  // Live price polling — 3s interval; uses cached reserves when still fresh (< 30s),
  // bypasses cache only on the first poll after cache expires to avoid RPC spam.
  const startPricePolling = useCallback(() => {
    if (priceTimer.current) clearInterval(priceTimer.current);
    if (!amm.isConfigured()) return;
    priceTimer.current = setInterval(async () => {
      try {
        const res = await amm.getReserves(); // respects 30s cache; no forceRefresh
        setReserves(res);
        snapshotPrice(res);
      } catch { /* keep last */ }
    }, 3000);
  }, [snapshotPrice]);

  useFocusEffect(useCallback(() => {
    loadPool().then(startPricePolling);
    return () => {
      if (priceTimer.current) clearInterval(priceTimer.current);
    };
  }, [loadPool, startPricePolling]));

  // ── Live quote ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    const parsed = parseFloat(amountIn);
    if (!parsed || parsed <= 0 || !amm.isConfigured()) {
      setQuote(null);
      return;
    }

    setIsQuoting(true);
    quoteTimer.current = setTimeout(async () => {
      try {
        const q = await amm.quoteSwap(parsed, direction);
        setQuote(q);
      } catch {
        setQuote(null);
      } finally {
        setIsQuoting(false);
      }
    }, 400);
  }, [amountIn, direction]);

  // ── Flip direction ──────────────────────────────────────────────────────────

  const flipDirection = () => {
    Animated.sequence([
      Animated.timing(flipAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
    setDirection(d => d === 'a50_to_token1' ? 'token1_to_a50' : 'a50_to_token1');
    setAmountIn('');
    setQuote(null);
  };

  // ── Execute swap ────────────────────────────────────────────────────────────

  const handleSwap = async () => {
    if (!quote || isSwapping) return;
    const minOut = quote.amountOut * (1 - slippage / 100);
    setIsSwapping(true);
    try {
      const { txId } = await amm.executeSwap(quote.amountIn, minOut, direction);
      setPendingTx(txId);
      setAmountIn('');
      setQuote(null);
      Alert.alert(
        'Swap Submitted',
        `Transaction ${txId.slice(0, 10)}… is pending. It will settle in the next block.`,
        [{ text: 'OK' }],
      );
      setTimeout(loadPool, 5000); // refresh after likely block time
    } catch (err) {
      Alert.alert('Swap Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSwapping(false);
    }
  };

  // ── Token labels ────────────────────────────────────────────────────────────

  const tokenIn  = direction === 'a50_to_token1' ? (reserves?.token0 ?? 'A50') : (reserves?.token1 ?? 'USDT');
  const tokenOut = direction === 'a50_to_token1' ? (reserves?.token1 ?? 'USDT') : (reserves?.token0 ?? 'A50');

  const rotateY = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const s = styles(colors, isDark);

  // ── Render: pool not configured ─────────────────────────────────────────────

  if (!configured) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#1a3a5c', '#0d1f33']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Swap</Text>
        </LinearGradient>

        <View style={s.emptyState}>
          <Ionicons name="swap-horizontal" size={56} color={colors.emptyIcon} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Pool Not Yet Deployed</Text>
          <Text style={[s.emptyBody, { color: colors.textSecondary }]}>
            The A50 liquidity pool contract has been written but is not yet deployed on-chain.
            Once the pool is live, swaps will be available here.
          </Text>
        </View>
      </View>
    );
  }

  // ── Render: main swap UI ────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <LinearGradient colors={['#1a3a5c', '#0d1f33']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Swap</Text>
          <TouchableOpacity style={s.refreshBtn} onPress={() => loadPool()}>
            <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Live price chart ── */}
          {reserves && priceHistory.length > 1 && (
            <ThemedCard style={s.statsCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Live Market</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>2s updates</Text>
                  <TouchableOpacity onPress={() => setShowChart(v => !v)} style={{ marginLeft: 8 }}>
                    <Ionicons name={showChart ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
              {showChart && (
                <PriceChart
                  history={priceHistory}
                  accent={colors.accent}
                  textColor={colors.textPrimary}
                  mutedColor={colors.textMuted}
                  token0={reserves.token0}
                  token1={reserves.token1}
                />
              )}
            </ThemedCard>
          )}

          {/* Pool stats */}
          {reserves && (
            <ThemedCard style={s.statsCard}>
              <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Pool Reserves</Text>
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={[s.statValue, { color: colors.textPrimary }]}>
                    {fmt(reserves.reserve0 / 1e8, 2)}
                  </Text>
                  <Text style={[s.statLabel, { color: colors.textMuted }]}>{reserves.token0}</Text>
                </View>
                <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
                <View style={s.statItem}>
                  <Text style={[s.statValue, { color: colors.textPrimary }]}>
                    {fmt(reserves.reserve1 / 1e8, 2)}
                  </Text>
                  <Text style={[s.statLabel, { color: colors.textMuted }]}>{reserves.token1}</Text>
                </View>
                <View style={[s.statItem, s.statItemRight]}>
                  <Text style={[s.statValue, { color: colors.textPrimary }]}>
                    {fmt(lpBalance, 4)}
                  </Text>
                  <Text style={[s.statLabel, { color: colors.textMuted }]}>Your LP</Text>
                </View>
              </View>
            </ThemedCard>
          )}

          {/* Swap card */}
          <ThemedCard style={s.swapCard}>
            {/* From */}
            <View style={[s.tokenBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Text style={[s.tokenLabel, { color: colors.textSecondary }]}>From</Text>
              <View style={s.tokenRow}>
                <View style={[s.tokenPill, { backgroundColor: colors.card2 }]}>
                  <Text style={[s.tokenName, { color: colors.textPrimary }]}>{tokenIn}</Text>
                </View>
                <TextInput
                  style={[s.amountInput, { color: colors.textPrimary }]}
                  value={amountIn}
                  onChangeText={setAmountIn}
                  placeholder="0.0000"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Flip button */}
            <View style={s.flipRow}>
              <View style={[s.divider, { backgroundColor: colors.cardBorder }]} />
              <Animated.View style={{ transform: [{ rotateY }] }}>
                <TouchableOpacity
                  style={[s.flipBtn, { backgroundColor: colors.accent }]}
                  onPress={flipDirection}
                >
                  <Ionicons name="swap-vertical" size={18} color="#fff" />
                </TouchableOpacity>
              </Animated.View>
              <View style={[s.divider, { backgroundColor: colors.cardBorder }]} />
            </View>

            {/* To */}
            <View style={[s.tokenBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Text style={[s.tokenLabel, { color: colors.textSecondary }]}>To (estimated)</Text>
              <View style={s.tokenRow}>
                <View style={[s.tokenPill, { backgroundColor: colors.card2 }]}>
                  <Text style={[s.tokenName, { color: colors.textPrimary }]}>{tokenOut}</Text>
                </View>
                <View style={s.amountOutBox}>
                  {isQuoting
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text style={[s.amountOut, { color: quote ? colors.textPrimary : colors.textMuted }]}>
                        {quote ? fmt(quote.amountOut) : '—'}
                      </Text>
                  }
                </View>
              </View>
            </View>

            {/* Quote details */}
            {quote && (
              <View style={[s.quoteBox, { borderColor: colors.cardBorder }]}>
                <View style={s.quoteRow}>
                  <Text style={[s.quoteKey, { color: colors.textMuted }]}>Fee (0.3%)</Text>
                  <Text style={[s.quoteVal, { color: colors.textSecondary }]}>{fmt(quote.fee)} {tokenIn}</Text>
                </View>
                <View style={s.quoteRow}>
                  <Text style={[s.quoteKey, { color: colors.textMuted }]}>Price Impact</Text>
                  <Text style={[s.quoteVal, { color: quote.priceImpactPct > 5 ? colors.danger : colors.textSecondary }]}>
                    {quote.priceImpactPct.toFixed(2)}%
                  </Text>
                </View>
                <View style={s.quoteRow}>
                  <Text style={[s.quoteKey, { color: colors.textMuted }]}>Min. received ({slippage}% slippage)</Text>
                  <Text style={[s.quoteVal, { color: colors.textSecondary }]}>
                    {fmt(quote.amountOut * (1 - slippage / 100))} {tokenOut}
                  </Text>
                </View>
              </View>
            )}

            {/* Slippage selector */}
            <View style={s.slippageRow}>
              <Text style={[s.quoteKey, { color: colors.textMuted }]}>Slippage tolerance</Text>
              <View style={s.slippagePills}>
                {[0.1, 0.5, 1.0].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[
                      s.slippagePill,
                      { borderColor: colors.cardBorder },
                      slippage === v && { backgroundColor: colors.accent, borderColor: colors.accent },
                    ]}
                    onPress={() => setSlippage(v)}
                  >
                    <Text style={[
                      s.slippagePillText,
                      { color: slippage === v ? '#fff' : colors.textSecondary },
                    ]}>
                      {v}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Swap button */}
            <TouchableOpacity
              style={[
                s.swapBtn,
                { opacity: quote && !isSwapping ? 1 : 0.45 },
              ]}
              disabled={!quote || isSwapping}
              onPress={handleSwap}
            >
              <LinearGradient colors={['#3498db', '#2271b1']} style={s.swapBtnGrad}>
                {isSwapping
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.swapBtnText}>
                      {amountIn ? `Swap ${tokenIn} → ${tokenOut}` : 'Enter amount'}
                    </Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            {pendingTx && (
              <View style={[s.pendingBanner, { backgroundColor: colors.card2 }]}>
                <Ionicons name="time-outline" size={16} color={colors.accent} />
                <Text style={[s.pendingText, { color: colors.textSecondary }]}>
                  TX {pendingTx.slice(0, 12)}… settling…
                </Text>
              </View>
            )}
          </ThemedCard>

          {/* High price impact warning */}
          {quote && quote.priceImpactPct > 5 && (
            <View style={[s.warnBox, { backgroundColor: 'rgba(231,76,60,0.12)', borderColor: colors.danger }]}>
              <Ionicons name="warning" size={16} color={colors.danger} />
              <Text style={[s.warnText, { color: colors.danger }]}>
                High price impact ({quote.priceImpactPct.toFixed(1)}%). Consider a smaller amount.
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = (colors: any, isDark: boolean) => StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.bg },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  backBtn:     { padding: 6, marginRight: 8 },
  refreshBtn:  { padding: 6 },
  scroll:      { flex: 1 },
  scrollContent:{ paddingHorizontal: 16, paddingTop: 16 },

  // Stats
  statsCard:   { marginBottom: 12 },
  sectionLabel:{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  statsRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statItem:    { alignItems: 'center', flex: 1 },
  statItemRight:{ alignItems: 'flex-end' },
  statValue:   { fontSize: 16, fontWeight: '700' },
  statLabel:   { fontSize: 11, marginTop: 2 },

  // Swap card
  swapCard:    { marginBottom: 12 },
  tokenBox:    { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 4 },
  tokenLabel:  { fontSize: 11, fontWeight: '600', marginBottom: 8 },
  tokenRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tokenPill:   { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  tokenName:   { fontWeight: '700', fontSize: 15 },
  amountInput: { flex: 1, textAlign: 'right', fontSize: 22, fontWeight: '700', paddingRight: 2 },
  amountOutBox:{ flex: 1, alignItems: 'flex-end', justifyContent: 'center', minHeight: 34 },
  amountOut:   { fontSize: 22, fontWeight: '700' },

  flipRow:     { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  divider:     { flex: 1, height: 1 },
  flipBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginHorizontal: 12 },

  quoteBox:    { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  quoteRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  quoteKey:    { fontSize: 12 },
  quoteVal:    { fontSize: 12, fontWeight: '600' },

  slippageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  slippagePills:{ flexDirection: 'row', gap: 6 },
  slippagePill: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  slippagePillText: { fontSize: 12, fontWeight: '600' },

  swapBtn:     { marginTop: 16, borderRadius: 14, overflow: 'hidden' },
  swapBtnGrad: { paddingVertical: 14, alignItems: 'center' },
  swapBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  pendingBanner:{ flexDirection: 'row', alignItems: 'center', marginTop: 10, borderRadius: 8, padding: 10, gap: 8 },
  pendingText:  { fontSize: 12, flex: 1 },

  warnBox:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  warnText:    { flex: 1, fontSize: 13, fontWeight: '500' },

  emptyState:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle:  { fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 10, textAlign: 'center' },
  emptyBody:   { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});

export default SwapScreen;
