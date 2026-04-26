import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import StakingService, {
  StakeRecord,
  LockDays,
  computeStakingBoost,
} from '../services/StakingService';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { applyFontScaling } from '../utils/fontScaling';

interface Props {
  navigation: any;
}

// Max duration: 3 years = 1095 days
const MAX_LOCK_DAYS = 1095;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dp = 4): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDuration(days: number): string {
  if (days === 0) return '0 days';

  const years = Math.floor(days / 365);
  let remaining = days % 365;

  const months = Math.floor(remaining / 30);
  remaining = remaining % 30;

  const weeks = Math.floor(remaining / 7);
  remaining = remaining % 7;

  const daysPart = remaining;

  let parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  if (weeks > 0) parts.push(`${weeks}w`);
  if (daysPart > 0) parts.push(`${daysPart}d`);

  return parts.length > 0 ? parts.join(' ') : '0 days';
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export const StakingScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const svc = StakingService.getInstance();

  const [activeStake, setActiveStake]       = useState<StakeRecord | null>(null);
  const [walletBalance, setWalletBalance]   = useState(0);
  const [amountText, setAmountText]         = useState('');
  const [lockDays, setLockDays]             = useState<LockDays>(30);
  const [loading, setLoading]               = useState(false);
  const [remainingLabel, setRemainingLabel] = useState('');
  const [infoVisible, setInfoVisible]       = useState(false);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const amount    = parseFloat(amountText) || 0;
  const available = svc.getAvailableBalanceSync();
  const preview   = computeStakingBoost(amount, lockDays);

  // ── Input validation ──────────────────────────────────────────────────────
  const amountError: string | null = (() => {
    if (amountText === '' || amountText === '0') return null; // no error while empty
    if (isNaN(amount) || amount <= 0) return 'Enter a valid positive amount.';
    if (amount > walletBalance)
      return `You only have ${fmt(walletBalance)} A50 in your wallet.`;
    if (amount > available)
      return `${fmt(walletBalance - available, 4)} A50 is already locked in an active stake.`;
    return null;
  })();

  const canStake = amount > 0 && amountError === null && !loading;

  // ── Data refresh ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const stake = await svc.getActiveStake();
    setActiveStake(stake);
    const account = EnhancedWalletService.getInstance().getCurrentAccount();
    setWalletBalance(account ? parseFloat(account.balance) : 0);
    setRemainingLabel(svc.getRemainingLabel());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      tickRef.current = setInterval(() => {
        setRemainingLabel(svc.getRemainingLabel());
      }, 30_000);
      return () => { if (tickRef.current) clearInterval(tickRef.current); };
    }, [refresh])
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleStake = () => {
    if (!canStake) return;

    const unlockDate = formatDate(Date.now() + lockDays * 86_400_000);
    const durationLabel = formatDuration(lockDays);

    Alert.alert(
      'Think Before You Stake',
      [
        `You are about to lock ${fmt(amount)} A50 for ${durationLabel} (${lockDays} days).`,
        '',
        `• Unlock date: ${unlockDate}`,
        `• Mining boost: +${preview.boostPct.toFixed(1)}% (×${preview.multiplier.toFixed(4)})`,
        '',
        '⚠️  IMPORTANT:',
        'You can only stake once until the end of your lock period.',
        'If you want a higher boost, decide now — as coin is locked, so is the time.',
        'Once locked, this opportunity is gone.',
        '',
        'These coins will be completely non-moveable until the lock expires.',
        'No early withdrawal. No exceptions.',
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Lock',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await svc.stake(amount, lockDays);
              console.log(`[Staking] Staked ${amount} A50 for ${lockDays} days. Boost: ×${preview.multiplier}`);
              setAmountText('');
              await refresh();
            } catch (e: any) {
              console.error('[Staking] stake() failed:', e.message);
              Alert.alert('Stake Failed', e.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleUnstake = async () => {
    if (!svc.canUnstake()) {
      // Should never reach here (button is disabled) but log it clearly
      const reason = `Unlock denied: ${svc.getRemainingLabel()}. Lock expires on ${activeStake ? formatDate(activeStake.endTime) : 'unknown date'}.`;
      console.warn('[Staking] Unstake attempted before lock expiry.', reason);
      Alert.alert(
        'Still Locked',
        `Your coins are locked until ${activeStake ? formatDate(activeStake.endTime) : 'the lock period ends'}.\n\n${svc.getRemainingLabel()}\n\nNo early withdrawal is possible.`,
      );
      return;
    }

    Alert.alert(
      'Claim Back Coins',
      `Your lock period has ended. Return ${activeStake?.lockedAmount ?? 0} A50 to your spendable balance?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Claim',
          onPress: async () => {
            setLoading(true);
            try {
              await svc.unstake();
              console.log(`[Staking] Unstaked successfully. Coins returned to balance.`);
              await refresh();
              Alert.alert('Unlocked', `${activeStake?.lockedAmount ?? 0} A50 has been returned to your spendable balance.`);
            } catch (e: any) {
              console.error('[Staking] unstake() failed:', e.message);
              Alert.alert('Unlock Failed', e.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const bg = isDark ? colors.bg : '#F4F6F8';

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Staking</Text>
        <TouchableOpacity onPress={() => setInfoVisible(true)} style={styles.iconBtn}>
          <Ionicons name="information-circle-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {activeStake
          ? <ActiveStakeView
              stake={activeStake}
              remainingLabel={remainingLabel}
              canUnstake={svc.canUnstake()}
              onUnstake={handleUnstake}
              loading={loading}
              colors={colors}
              isDark={isDark}
            />
          : <StakeForm
              available={available}
              walletBalance={walletBalance}
              amountText={amountText}
              setAmountText={setAmountText}
              lockDays={lockDays}
              setLockDays={setLockDays}
              preview={preview}
              amount={amount}
              amountError={amountError}
              canStake={canStake}
              loading={loading}
              onStake={handleStake}
              colors={colors}
              isDark={isDark}
            />
        }
      </ScrollView>

      {/* ── Info modal ── */}
      <InfoModal visible={infoVisible} onClose={() => setInfoVisible(false)} colors={colors} isDark={isDark} />
    </View>
  );
};

// ── StakeForm ─────────────────────────────────────────────────────────────────

const StakeForm = ({
  available, walletBalance, amountText, setAmountText,
  lockDays, setLockDays, preview, amount, amountError,
  canStake, loading, onStake, colors, isDark,
}: any) => {

  const unlockDate = formatDateShort(Date.now() + lockDays * 86_400_000);
  const cardBg = isDark ? colors.card : '#FFFFFF';

  // Handle amount slider changes
  const handleAmountSliderChange = (val: number) => {
    setAmountText(val.toFixed(2));
  };

  // Handle amount text input changes
  const handleAmountTextChange = (text: string) => {
    setAmountText(text);
  };

  // Handle duration slider changes
  const handleDurationSliderChange = (val: number) => {
    setLockDays(Math.round(val));
  };

  return (
    <>
      {/* Welcome announcement */}
      <View style={[styles.welcomeBanner, { backgroundColor: 'rgba(39,174,96,0.12)', borderColor: 'rgba(39,174,96,0.35)' }]}>
        <Ionicons name="flash" size={18} color={colors.success} style={{ marginRight: 10, marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.welcomeBannerTitle, { color: colors.success }]}>
            Boost Your Mining Rewards
          </Text>
          <Text style={[styles.welcomeBannerText, { color: colors.textSecondary }]}>
            Lock your coins to multiply your mining share. The longer and more you stake, the higher your boost. Every share you submit is worth more.
          </Text>
        </View>
      </View>

      {/* Balance row */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.cardBorder }]}>
        <View style={styles.balRow}>
          <View>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Available to Stake</Text>
            <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{fmt(available)} A50</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Wallet Total</Text>
            <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{fmt(walletBalance)} A50</Text>
          </View>
        </View>
        {walletBalance > available && (
          <View style={[styles.inlineNote, { backgroundColor: 'rgba(93,173,226,0.08)' }]}>
            <Ionicons name="lock-closed" size={13} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={[styles.inlineNoteText, { color: colors.accent }]}>
              {fmt(walletBalance - available, 4)} A50 already locked in an active stake
            </Text>
          </View>
        )}
      </View>

      {/* Amount Slider */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Amount to Stake</Text>

        <View style={styles.sliderContainer}>
          <View style={{ flex: 1 }}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={available}
              step={0.01}
              value={amount}
              onValueChange={handleAmountSliderChange}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.pillBg}
              thumbTintColor={colors.accent}
            />
          </View>

          <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <TextInput
              style={[styles.inputBoxText, { color: colors.textPrimary }]}
              placeholder="0.00"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={amountText}
              onChangeText={handleAmountTextChange}
            />
            <Text style={[styles.inputBoxUnit, { color: colors.textSecondary }]}>A50</Text>
          </View>
        </View>

        {amountError && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.danger} style={{ marginRight: 5 }} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{amountError}</Text>
          </View>
        )}

        {/* Duration Slider */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 24 }]}>Lock Duration</Text>

        <View style={styles.sliderContainer}>
          <View style={{ flex: 1 }}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={MAX_LOCK_DAYS}
              step={1}
              value={lockDays}
              onValueChange={handleDurationSliderChange}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.pillBg}
              thumbTintColor={colors.accent}
            />
          </View>

          <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <TextInput
              style={[styles.inputBoxText, { color: colors.textPrimary }]}
              placeholder="0"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={String(lockDays)}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                const clamped = Math.max(0, Math.min(MAX_LOCK_DAYS, val));
                setLockDays(clamped);
              }}
            />
            <Text style={[styles.inputBoxUnit, { color: colors.textSecondary }]}>days</Text>
          </View>
        </View>

        {/* Duration label */}
        <Text style={[styles.durationLabel, { color: colors.textMuted }]} >
          {formatDuration(lockDays)}
        </Text>

        {/* Live preview */}
        {amount > 0 && !amountError && (
          <View style={[styles.previewBox, { backgroundColor: 'rgba(93,173,226,0.07)', borderColor: 'rgba(93,173,226,0.22)' }]}>
            <PreviewRow label="Commitment Score"  value={preview.score.toFixed(3)}               colors={colors} />
            <PreviewRow label="Mining Boost"       value={`+${preview.boostPct.toFixed(2)}%`}    colors={colors} accent />
            <PreviewRow label="Share Multiplier"   value={`×${preview.multiplier.toFixed(4)}`}   colors={colors} accent />
            <PreviewRow label="Coins Locked"       value={`${fmt(amount)} A50`}                  colors={colors} />
            <PreviewRow label="Unlocks On"         value={unlockDate}                             colors={colors} />
          </View>
        )}
      </View>

      {/* Hard-lock warning */}
      <View style={[styles.warnCard, { backgroundColor: 'rgba(231,76,60,0.09)', borderColor: 'rgba(231,76,60,0.28)' }]}>
        <Ionicons name="lock-closed" size={16} color={colors.danger} style={{ marginRight: 8, marginTop: 1 }} />
        <Text style={[styles.warnText, { color: colors.danger }]}>
          Staked coins are completely non-moveable until the lock expires.{'\n'}
          No early withdrawal. No exceptions.
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          { backgroundColor: canStake ? colors.accent : colors.pillBg, opacity: loading ? 0.6 : 1 },
        ]}
        onPress={onStake}
        disabled={!canStake}
      >
        <Ionicons name="lock-closed-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.primaryBtnText}>{loading ? 'Staking…' : 'Lock & Stake'}</Text>
      </TouchableOpacity>
    </>
  );
};

// ── ActiveStakeView ───────────────────────────────────────────────────────────

const ActiveStakeView = ({
  stake, remainingLabel, canUnstake, onUnstake, loading, colors, isDark,
}: any) => {

  const elapsed    = Date.now() - stake.startTime;
  const total      = stake.endTime - stake.startTime;
  const pct        = Math.max(0, Math.min(100, (elapsed / total) * 100));
  const cardBg     = isDark ? colors.card : '#FFFFFF';
  const daysLeft   = Math.ceil(Math.max(0, stake.endTime - Date.now()) / 86_400_000);
  const startDate  = formatDate(stake.startTime);
  const endDate    = formatDate(stake.endTime);

  return (
    <>
      {/* Boost hero badge */}
      <View style={[styles.boostHero, { backgroundColor: 'rgba(93,173,226,0.12)', borderColor: 'rgba(93,173,226,0.30)' }]}>
        <Ionicons name="flash" size={28} color={colors.accent} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.boostHeroTitle, { color: colors.accent }]}>
            +{stake.boostPct.toFixed(1)}% Mining Boost Active
          </Text>
          <Text style={[styles.boostHeroSub, { color: colors.textSecondary }]}>
            Every share you submit is worth ×{stake.multiplier.toFixed(4)} shares in block reward distribution
          </Text>
        </View>
      </View>

      {/* Stake details */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Stake Details</Text>
        <DetailRow label="Locked Amount"    value={`${fmt(stake.lockedAmount)} A50`}         colors={colors} />
        <DetailRow label="Lock Duration"    value={`${stake.lockDays} days`}                 colors={colors} />
        <DetailRow label="Staked On"        value={startDate}                                colors={colors} />
        <DetailRow label="Unlocks On"       value={endDate}                                  colors={colors} />
        <DetailRow label="Commitment Score" value={stake.score.toFixed(3)}                   colors={colors} />
        <DetailRow label="Share Multiplier" value={`×${stake.multiplier.toFixed(4)}`}        colors={colors} accent />
        <DetailRow label="Mining Boost"     value={`+${stake.boostPct.toFixed(1)}%`}         colors={colors} accent />

        {/* Progress bar */}
        <View style={{ marginTop: 16 }}>
          <View style={[styles.progressTrack, { backgroundColor: colors.progressTrack }]}>
            <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: colors.accent }]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={[styles.progressDate, { color: colors.textMuted }]}>{formatDateShort(stake.startTime)}</Text>
            <Text style={[styles.progressDate, { color: colors.textMuted }]}>{formatDateShort(stake.endTime)}</Text>
          </View>
        </View>
      </View>

      {/* Status / countdown */}
      {canUnstake ? (
        <View style={[styles.warnCard, { backgroundColor: 'rgba(39,174,96,0.09)', borderColor: 'rgba(39,174,96,0.28)' }]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} style={{ marginRight: 8, marginTop: 1 }} />
          <Text style={[styles.warnText, { color: colors.success }]}>
            Lock period complete. Your {fmt(stake.lockedAmount)} A50 is ready to be claimed back.
          </Text>
        </View>
      ) : (
        <View style={[styles.warnCard, { backgroundColor: 'rgba(231,76,60,0.07)', borderColor: 'rgba(231,76,60,0.22)' }]}>
          <Ionicons name="lock-closed" size={16} color={colors.danger} style={{ marginRight: 8, marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.warnText, { color: colors.danger }]}>
              Coins are hard-locked. No early withdrawal.
            </Text>
            <Text style={[styles.warnSub, { color: colors.textMuted, marginTop: 4 }]}>
              {remainingLabel} — unlocks {endDate}
            </Text>
            <Text style={[styles.warnSub, { color: colors.textMuted }]}>
              {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining out of {stake.lockDays}
            </Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          {
            backgroundColor: canUnstake ? colors.success : colors.pillBg,
            opacity: loading ? 0.6 : canUnstake ? 1 : 0.35,
          },
        ]}
        onPress={onUnstake}
        disabled={loading}
      >
        <Ionicons
          name={canUnstake ? 'lock-open-outline' : 'lock-closed-outline'}
          size={18}
          color="#fff"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.primaryBtnText}>
          {loading
            ? 'Processing…'
            : canUnstake
            ? 'Claim Back Coins'
            : `Locked — ${daysLeft}d remaining`}
        </Text>
      </TouchableOpacity>

      {/* Why boost works */}
      <BoostExplanation stake={stake} colors={colors} isDark={isDark} />
    </>
  );
};

// ── Info modal ────────────────────────────────────────────────────────────────

const InfoModal = ({ visible, onClose, colors, isDark }: any) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalSheet, { backgroundColor: isDark ? colors.card : '#FFFFFF' }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>How Staking Works</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {[
            {
              icon: 'calculator-outline',
              title: 'Commitment Score',
              body: 'score = (amount ÷ 100) × (days ÷ 30)\n\nExamples:\n• 10 A50 / 30d → score 0.10\n• 100 A50 / 30d → score 1.0\n• 300 A50 / 90d → score 9.0',
            },
            {
              icon: 'flash-outline',
              title: 'Mining Boost Formula',
              body: 'boost% = 10 × √score\nmultiplier = 1 + boost% ÷ 100\n\nYour mining share weight increases with your commitment score. The higher your score, the greater your boost.',
            },
            {
              icon: 'share-social-outline',
              title: 'Shares, Not Inflation',
              body: 'The block reward is fixed. Staking does NOT create new coins.\n\nWhen you submit a share, it is weighted by your multiplier. Your slice of the block reward grows — the total pie stays the same.',
            },
            {
              icon: 'lock-closed-outline',
              title: 'Hard Lock — No Exceptions',
              body: 'Once staked, coins are removed from your spendable balance and completely non-moveable.\n\nThe unlock button only activates after the full lock period. There is no early withdrawal, no force-unlock, and no penalty path.',
            },
            {
              icon: 'wallet-outline',
              title: 'Available Balance',
              body: 'Your spendable balance is always your unlocked coins. Locked coins are held separately and protected.',
            },
          ].map(item => (
            <View key={item.title} style={[styles.infoItem, { borderBottomColor: colors.divider }]}>
              <View style={styles.infoIconWrap}>
                <Ionicons name={item.icon as any} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoItemTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                <Text style={[styles.infoItemBody, { color: colors.textSecondary }]}>{item.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.accent, marginTop: 12 }]}
          onPress={onClose}
        >
          <Text style={styles.primaryBtnText}>Got It</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

// ── BoostExplanation (shown on active stake) ──────────────────────────────────

const BoostExplanation = ({ stake, colors, isDark }: any) => (
  <View style={[styles.card, { backgroundColor: isDark ? colors.card2 : '#F0F4F8', borderColor: colors.cardBorder, marginTop: 4 }]}>
    <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 10 }]}>Your Boost Calculation</Text>
    <PreviewRow label={`${fmt(stake.lockedAmount)} ÷ 100`}  value={`= ${(stake.lockedAmount / 100).toFixed(3)}`}   colors={colors} />
    <PreviewRow label={`${stake.lockDays} ÷ 30`}           value={`= ${(stake.lockDays / 30).toFixed(3)}`}         colors={colors} />
    <PreviewRow label="Commitment Score"                    value={stake.score.toFixed(3)}                          colors={colors} />
    <PreviewRow label={`10 × √${stake.score.toFixed(3)}`}  value={`= ${(10 * Math.sqrt(stake.score)).toFixed(3)}%`} colors={colors} />
    <PreviewRow label="Current Boost"                      value={`${stake.boostPct.toFixed(2)}%`}                  colors={colors} accent />
    <PreviewRow label="Share Multiplier"                    value={`×${stake.multiplier.toFixed(4)}`}               colors={colors} accent />
  </View>
);

// ── Shared small components ───────────────────────────────────────────────────

const PreviewRow = ({ label, value, colors, accent }: any) => (
  <View style={styles.previewRow}>
    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[styles.previewValue, { color: accent ? colors.accent : colors.textPrimary }]}>{value}</Text>
  </View>
);

const DetailRow = ({ label, value, colors, accent }: any) => (
  <View style={[styles.detailRow]}>
    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[styles.detailValue, { color: accent ? colors.accent : colors.textPrimary }]}>{value}</Text>
  </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = applyFontScaling(StyleSheet.create({
  root:            { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn:         { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle:     { fontSize: 18, fontWeight: '700' },
  scroll:          { paddingHorizontal: 16, paddingBottom: 48, paddingTop: 4 },

  card:            { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  sectionLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },

  balRow:          { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel:       { fontSize: 12, marginBottom: 4 },
  metaValue:       { fontSize: 17, fontWeight: '700' },

  inlineNote:      { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 12 },
  inlineNoteText:  { fontSize: 12, fontWeight: '500' },

  sliderContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  slider:          { flex: 1, height: 40 },
  inputBox:        { width: 90, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 44 },
  inputBoxText:    { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  inputBoxUnit:    { fontSize: 11, fontWeight: '500', marginLeft: 4 },

  durationLabel:   { fontSize: 12, marginTop: 8, textAlign: 'center' },

  welcomeBanner:   { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  welcomeBannerTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  welcomeBannerText:  { fontSize: 12, lineHeight: 17 },

  errorRow:        { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  errorText:       { fontSize: 12 },

  previewBox:      { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 14 },
  previewRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  previewLabel:    { fontSize: 13 },
  previewValue:    { fontSize: 13, fontWeight: '700' },

  warnCard:        { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 14 },
  warnText:        { fontSize: 13, lineHeight: 19, fontWeight: '600', flex: 1 },
  warnSub:         { fontSize: 12, lineHeight: 17 },

  primaryBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, height: 52, marginBottom: 14 },
  primaryBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },

  boostHero:       { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  boostHeroTitle:  { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  boostHeroSub:    { fontSize: 13, lineHeight: 18 },

  progressTrack:   { height: 7, borderRadius: 4, overflow: 'hidden' },
  progressFill:    { height: '100%', borderRadius: 4 },
  progressLabels:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  progressDate:    { fontSize: 11 },

  detailRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.05)' },
  detailLabel:     { fontSize: 13 },
  detailValue:     { fontSize: 13, fontWeight: '600' },

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '88%' },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:      { fontSize: 17, fontWeight: '700' },
  infoItem:        { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  infoIconWrap:    { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(93,173,226,0.12)', justifyContent: 'center', alignItems: 'center', marginRight: 14, marginTop: 2 },
  infoItemTitle:   { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  infoItemBody:    { fontSize: 13, lineHeight: 19 },
}));

export default StakingScreen;
