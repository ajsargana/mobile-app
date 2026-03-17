/**
 * TransactionSuccessScreen
 *
 * Premium animated receipt shown after a successful transaction.
 * The shareable receipt card contains full proof-grade detail:
 * tx ID, type, fee, from, to, block height, status, date, network.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Platform, StatusBar, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';

const { width } = Dimensions.get('window');
const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

// ── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  '#5DADE2', '#F4D03F', '#2ECC71', '#E74C3C',
  '#9B59B6', '#F39C12', '#1ABC9C', '#FF6B6B', '#FFFFFF',
];
const PARTICLE_COUNT = 32;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = (360 / PARTICLE_COUNT) * i + (Math.random() - 0.5) * 24;
  const rad   = (angle * Math.PI) / 180;
  const dist  = 90 + Math.random() * 130;
  return {
    id: i,
    color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    tx:       Math.cos(rad) * dist,
    ty:       Math.sin(rad) * dist,
    size:     4 + Math.random() * 7,
    isSquare: i % 3 === 0,
    delay:    Math.random() * 120,
    spin:     180 + Math.random() * 360,
  };
});

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const CIRCLE_R = 46;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R;

// ── Component ────────────────────────────────────────────────────────────────
export function TransactionSuccessScreen({ route, navigation }: any) {
  const {
    txId         = '',
    amount       = '0',
    fee          = '0',
    fromAddress  = '',
    toAddress    = '',
    toName,
    timestamp,
    type         = 'Sent',       // 'Sent' | 'Received'
    blockHeight,
    status       = 'pending',
    confirmations = 0,
  } = route.params ?? {};

  // ── Animations ──────────────────────────────────────────────────────────────
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const circleDash    = useRef(new Animated.Value(CIRCLE_CIRCUMFERENCE)).current;
  const circleOpacity = useRef(new Animated.Value(0)).current;
  const checkScale    = useRef(new Animated.Value(0)).current;
  const checkOpacity  = useRef(new Animated.Value(0)).current;
  const titleOpacity  = useRef(new Animated.Value(0)).current;
  const titleY        = useRef(new Animated.Value(14)).current;
  const amountScale   = useRef(new Animated.Value(0.6)).current;
  const amountOpacity = useRef(new Animated.Value(0)).current;
  const cardY         = useRef(new Animated.Value(60)).current;
  const cardOpacity   = useRef(new Animated.Value(0)).current;
  const glowOpacity   = useRef(new Animated.Value(0)).current;

  const particleAnims = useRef(
    PARTICLES.map(() => ({
      pos:     new Animated.ValueXY({ x: 0, y: 0 }),
      opacity: new Animated.Value(0),
      rotate:  new Animated.Value(0),
    }))
  ).current;

  const receiptRef = useRef<View>(null);

  useEffect(() => {
    Animated.timing(screenOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 120);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 500);

    Animated.parallel([
      Animated.timing(circleDash,    { toValue: 0, duration: 550, delay: 200, useNativeDriver: false }),
      Animated.timing(circleOpacity, { toValue: 1, duration: 200, delay: 200, useNativeDriver: false }),
    ]).start();

    Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 0.35, duration: 300, delay: 600, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0.15, duration: 600, useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.spring(checkScale,   { toValue: 1, delay: 680, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 180, delay: 680, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel(PARTICLES.map((p, i) =>
        Animated.parallel([
          Animated.timing(particleAnims[i].pos, {
            toValue: { x: p.tx, y: p.ty }, duration: 700 + p.delay, useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(particleAnims[i].opacity, { toValue: 1, duration: 80,  useNativeDriver: true }),
            Animated.timing(particleAnims[i].opacity, { toValue: 0, duration: 500, delay: 180 + p.delay, useNativeDriver: true }),
          ]),
          Animated.timing(particleAnims[i].rotate, {
            toValue: 1, duration: 700 + p.delay, useNativeDriver: true,
          }),
        ])
      )).start();
    }, 380);

    Animated.parallel([
      Animated.timing(titleOpacity,  { toValue: 1, duration: 380, delay: 560, useNativeDriver: true }),
      Animated.timing(titleY,        { toValue: 0, duration: 380, delay: 560, useNativeDriver: true }),
    ]).start();
    Animated.parallel([
      Animated.spring(amountScale,   { toValue: 1, delay: 700, friction: 6, tension: 90, useNativeDriver: true }),
      Animated.timing(amountOpacity, { toValue: 1, duration: 300, delay: 700, useNativeDriver: true }),
    ]).start();
    Animated.parallel([
      Animated.spring(cardY,    { toValue: 0, delay: 820, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, delay: 820, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Save / Share ─────────────────────────────────────────────────────────────
  const captureReceipt = async (): Promise<string | null> => {
    try {
      const { captureRef } = require('react-native-view-shot');
      return await captureRef(receiptRef, { format: 'png', quality: 1 });
    } catch { return null; }
  };

  const saveToPhotos = async () => {
    const uri = await captureReceipt();
    if (!uri) { Alert.alert('Unavailable', 'Run: npx expo install react-native-view-shot expo-media-library'); return; }
    try {
      const ML = require('expo-media-library');
      const { status } = await ML.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
      await ML.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved!', 'Transaction proof saved to your photos.');
    } catch { Alert.alert('Error', 'Could not save. Please try again.'); }
  };

  const shareReceipt = async () => {
    const uri = await captureReceipt();
    if (!uri) { Alert.alert('Unavailable', 'Run: npx expo install expo-sharing'); return; }
    try {
      const Sharing = require('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Transaction Proof' });
      }
    } catch { Alert.alert('Error', 'Could not share.'); }
  };

  // ── Formatting helpers ───────────────────────────────────────────────────────
  const isSent = type === 'Sent';

  const fmtAmount = (v: string) =>
    parseFloat(v || '0').toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 });

  const fmtAmountDisplay = (v: string) =>
    parseFloat(v || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

  const fmtFee = (v: string) => {
    const n = parseFloat(v || '0');
    return n === 0 ? '0.00000000' : n.toFixed(8);
  };

  const fmtTime = (ts: any) => {
    const d = ts ? new Date(ts) : new Date();
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const shortAddr = (addr: string) => {
    if (!addr || addr.length <= 20) return addr || '—';
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  };

  const statusLabel = (() => {
    if (status === 'final' || status === 'completed') return 'Final';
    if (status === 'confirmed') return 'Confirmed';
    if (status === 'included') return 'Included';
    if (confirmations > 0) return `${confirmations} Confirmation${confirmations > 1 ? 's' : ''}`;
    return 'Pending';
  })();

  const statusColor = (() => {
    if (status === 'final' || status === 'completed') return '#059669';
    if (status === 'confirmed') return '#10b981';
    if (status === 'included') return '#3b82f6';
    if (confirmations > 0) return '#3b82f6';
    return '#f59e0b';
  })();

  // Confirmation bar: 6 segments
  const TOTAL_CONFS = 6;
  const filledConfs = Math.min(status === 'final' || status === 'completed' ? TOTAL_CONFS : (confirmations || 0), TOTAL_CONFS);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={['#07071A', '#110829', '#071829']}
        start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Close */}
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()} activeOpacity={0.75}>
        <Ionicons name="close" size={20} color="rgba(255,255,255,0.55)" />
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* ── Hero ── */}
        <View style={styles.heroZone}>
          {PARTICLES.map((p, i) => (
            <Animated.View
              key={p.id}
              style={[styles.particle, {
                width: p.size, height: p.isSquare ? p.size : p.size * 0.6,
                borderRadius: p.isSquare ? 2 : p.size,
                backgroundColor: p.color,
                opacity: particleAnims[i].opacity,
                transform: [
                  { translateX: particleAnims[i].pos.x },
                  { translateY: particleAnims[i].pos.y },
                  { rotate: particleAnims[i].rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
                ],
              }]}
            />
          ))}

          <Animated.View style={[styles.glowHalo, { opacity: glowOpacity }]} />

          <Svg width={112} height={112} style={styles.svgCircle}>
            <Circle cx={56} cy={56} r={CIRCLE_R} stroke="rgba(46,204,113,0.15)" strokeWidth={5} fill="transparent" />
            <AnimatedCircle
              cx={56} cy={56} r={CIRCLE_R}
              stroke="#2ECC71" strokeWidth={5} fill="transparent"
              strokeDasharray={`${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`}
              strokeDashoffset={circleDash}
              strokeLinecap="round"
              rotation="-90" origin="56, 56"
              opacity={circleOpacity}
            />
          </Svg>

          <Animated.View style={[styles.checkmark, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
            <Ionicons name="checkmark" size={50} color="#2ECC71" />
          </Animated.View>
        </View>

        {/* Title */}
        <Animated.Text style={[styles.title, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          {isSent ? 'Transaction Sent!' : 'Transaction Received!'}
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, { opacity: titleOpacity }]}>
          {isSent ? 'Your A50 is on its way' : 'A50 arrived in your wallet'}
        </Animated.Text>

        {/* Amount */}
        <Animated.View style={[styles.amountRow, { transform: [{ scale: amountScale }], opacity: amountOpacity }]}>
          <Text style={[styles.amountSign, { color: isSent ? '#EF4444' : '#2ECC71' }]}>
            {isSent ? '−' : '+'}
          </Text>
          <Text style={styles.amount}>{fmtAmountDisplay(amount)}</Text>
          <Text style={styles.amountUnit}> A50</Text>
        </Animated.View>

        {/* ── Receipt Card ── */}
        <Animated.View style={[styles.receiptOuter, { transform: [{ translateY: cardY }], opacity: cardOpacity }]}>

          {/* Capture target */}
          <View ref={receiptRef} collapsable={false} style={styles.receiptCapture}>
            <LinearGradient colors={['#0D1B2A', '#0A1520']} style={styles.receiptCard}>

              {/* Brand header */}
              <View style={styles.rcHeader}>
                <View style={styles.rcBrand}>
                  <Ionicons name="flash" size={13} color="#5DADE2" />
                  <Text style={styles.rcBrandText}>AURA50</Text>
                  <View style={styles.networkBadge}>
                    <Text style={styles.networkBadgeText}>Mainnet</Text>
                  </View>
                </View>
                <View style={[styles.statusPill, { borderColor: statusColor + '50', backgroundColor: statusColor + '18' }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>

              {/* Confirmation bar */}
              <View style={styles.confBar}>
                {Array.from({ length: TOTAL_CONFS }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.confSegment,
                      { backgroundColor: i < filledConfs ? statusColor : 'rgba(255,255,255,0.1)' },
                      i === 0 && styles.confSegFirst,
                      i === TOTAL_CONFS - 1 && styles.confSegLast,
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.confLabel}>{filledConfs}/{TOTAL_CONFS} Confirmations</Text>

              <View style={styles.rcDivider} />

              {/* Amount block */}
              <View style={styles.amountBlock}>
                <Text style={[styles.rcAmountBig, { color: isSent ? '#EF4444' : '#2ECC71' }]}>
                  {isSent ? '−' : '+'}{fmtAmount(amount)} A50
                </Text>
                <View style={[styles.typeBadge, { backgroundColor: isSent ? 'rgba(239,68,68,0.12)' : 'rgba(46,204,113,0.12)' }]}>
                  <Ionicons name={isSent ? 'arrow-up-circle' : 'arrow-down-circle'} size={13} color={isSent ? '#EF4444' : '#2ECC71'} />
                  <Text style={[styles.typeBadgeText, { color: isSent ? '#EF4444' : '#2ECC71' }]}>{type}</Text>
                </View>
              </View>

              <View style={styles.rcDivider} />

              {/* Detail rows */}
              {[
                { label: 'TRANSACTION ID', value: txId || '—', mono: true, fullWidth: true },
                { label: 'FEE',            value: `${fmtFee(fee)} A50` },
                { label: 'FROM',           value: shortAddr(fromAddress), mono: true },
                { label: 'TO',             value: toName ? `${toName}\n${shortAddr(toAddress)}` : shortAddr(toAddress), mono: !toName },
                { label: 'DATE & TIME',    value: fmtTime(timestamp) },
                { label: 'BLOCK HEIGHT',   value: blockHeight ? `#${Number(blockHeight).toLocaleString()}` : 'Pending' },
              ].map(row => (
                <View key={row.label} style={[styles.rcRow, row.fullWidth && styles.rcRowFull]}>
                  <Text style={styles.rcLabel}>{row.label}</Text>
                  <Text style={[styles.rcValue, row.mono && styles.rcMono, row.fullWidth && styles.rcValueFull]}>
                    {row.value}
                  </Text>
                </View>
              ))}

              {/* Dotted cut line */}
              <View style={styles.dottedSeparator}>
                <View style={styles.dottedLine} />
                <Ionicons name="cut-outline" size={12} color="rgba(255,255,255,0.18)" style={{ marginHorizontal: 6 }} />
                <View style={styles.dottedLine} />
              </View>

              <Text style={styles.rcFooter}>
                AURA50 Blockchain  ·  Immutable Proof  ·  Verified ✓
              </Text>
            </LinearGradient>
          </View>

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={saveToPhotos} activeOpacity={0.8}>
              <Ionicons name="download-outline" size={17} color="#5DADE2" />
              <Text style={styles.actionBtnText}>Save as Proof</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.actionBtn} onPress={shareReceipt} activeOpacity={0.8}>
              <Ionicons name="share-social-outline" size={17} color="#5DADE2" />
              <Text style={styles.actionBtnText}>Share</Text>
            </TouchableOpacity>
          </View>

          {/* Done */}
          <TouchableOpacity onPress={() => navigation.navigate('MainTabs')} activeOpacity={0.85} style={styles.doneBtn}>
            <LinearGradient colors={['#1A6FA0', '#5DADE2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.doneBtnInner}>
              <Text style={styles.doneBtnText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1 },
  scroll:     { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 64 : 44,
    paddingHorizontal: 18,
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 38,
    right: 20,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 20,
  },

  // Hero
  heroZone:  { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  particle:  { position: 'absolute' },
  glowHalo:  { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: '#2ECC71' },
  svgCircle: { position: 'absolute' },
  checkmark: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },

  // Title / amount
  title:      { fontSize: 26, fontWeight: '700', color: '#FFFFFF', marginTop: 10, letterSpacing: 0.2 },
  subtitle:   { fontSize: 14, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  amountRow:  { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 },
  amountSign: { fontSize: 36, fontWeight: '800', marginBottom: 3 },
  amount:     { fontSize: 40, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 },
  amountUnit: { fontSize: 20, fontWeight: '600', color: '#5DADE2', marginBottom: 4 },

  // Receipt outer
  receiptOuter:  { width: '100%', marginTop: 20 },
  receiptCapture: {
    borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  receiptCard:   { padding: 18 },

  // Receipt header
  rcHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  rcBrand:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rcBrandText: { color: '#5DADE2', fontWeight: '700', fontSize: 13, letterSpacing: 1.2 },
  networkBadge: {
    backgroundColor: 'rgba(93,173,226,0.15)',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(93,173,226,0.25)',
    marginLeft: 4,
  },
  networkBadgeText: { color: '#5DADE2', fontSize: 10, fontWeight: '600' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 5,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 12, fontWeight: '600' },

  // Confirmation bar
  confBar: { flexDirection: 'row', gap: 3, marginBottom: 5 },
  confSegment: { flex: 1, height: 5, borderRadius: 2 },
  confSegFirst: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  confSegLast:  { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  confLabel: { fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginBottom: 14 },

  rcDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 14 },

  // Amount block
  amountBlock: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  rcAmountBig: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },

  // Detail rows
  rcRow:      { marginBottom: 12 },
  rcRowFull:  { marginBottom: 14 },
  rcLabel:    { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '700', letterSpacing: 0.8, marginBottom: 3 },
  rcValue:    { fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: '500' },
  rcValueFull:{ fontSize: 12 },
  rcMono:     { fontFamily: MONO, fontSize: 12, color: '#A8D8F0', letterSpacing: 0.3 },

  // Dotted separator
  dottedSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  dottedLine: {
    flex: 1, height: 1,
    borderStyle: 'dashed', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rcFooter: {
    textAlign: 'center', fontSize: 10,
    color: 'rgba(255,255,255,0.22)', letterSpacing: 0.5,
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    borderWidth: 1, borderColor: 'rgba(93,173,226,0.22)',
    borderRadius: 14, marginTop: 12,
    backgroundColor: 'rgba(93,173,226,0.05)',
    overflow: 'hidden',
  },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14 },
  actionBtnText: { color: '#5DADE2', fontSize: 14, fontWeight: '600' },
  actionDivider: { width: 1, backgroundColor: 'rgba(93,173,226,0.22)', marginVertical: 10 },

  // Done
  doneBtn:      { marginTop: 12 },
  doneBtnInner: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  doneBtnText:  { color: '#FFFFFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.4 },
});
