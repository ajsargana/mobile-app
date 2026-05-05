import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import AMMService, { type PoolReserves, type SwapQuote } from '../services/AMMService';
import { EnhancedWalletService } from '../services/EnhancedWalletService';

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

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipAnim   = useRef(new Animated.Value(0)).current;

  const walletAddress = EnhancedWalletService.getInstance().getCurrentAccount()?.address ?? '';

  // ── Load pool data ──────────────────────────────────────────────────────────

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
    } catch {
      // Pool unreachable — show last cached state
    }
  }, [walletAddress]);

  useFocusEffect(useCallback(() => { loadPool(); }, [loadPool]));

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
