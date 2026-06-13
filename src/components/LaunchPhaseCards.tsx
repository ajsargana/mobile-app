/**
 * Launch-phase UI for the main wallet screen.
 *
 * <LockStatusCard>  — phase-2 card: transfers unlock on <date> + countdown.
 *                     Renders nothing outside phase 2 (auto-hides at unlock).
 * <CurrentTaskCard> — phase-1 card: unlock invites / invite-3 progress.
 * <LaunchLockModal> — shared explainer opened by the hero lock icon AND the
 *                     Send button while transfers are locked. Phase-aware copy.
 *
 * All three are driven by the server's send-lock status, so they appear and
 * disappear together as the user moves Phase 1 → Phase 2 → unlocked.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import { applyFontScaling } from '../utils/fontScaling';
import type { CurrentTask, LockStatus } from '../services/PhaseTaskService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function remainingLabel(ms: number): string {
  if (ms <= 0) return 'Unlocking…';
  const totalMins = Math.floor(ms / 60_000);
  const days  = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const mins = totalMins % 60;
  if (hours >= 1) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

function unlockDateLabel(unlockAt: string | null): string {
  if (!unlockAt) return '';
  return new Date(unlockAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── LockStatusCard (phase 2) ──────────────────────────────────────────────────

export const LockStatusCard: React.FC<{ lock: LockStatus | null; onPress?: () => void }> = ({ lock, onPress }) => {
  const { colors } = useTheme();
  if (!lock || !lock.locked || lock.phase !== 2) return null;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <ThemedCard style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <Ionicons name="shield-checkmark" size={20} color="#10B981" />
          </View>
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>You're verified ✓</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Receive anytime · transfers unlock {unlockDateLabel(lock.unlockAt)} · {remainingLabel(lock.remainingMs)}
            </Text>
          </View>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
        </View>
      </ThemedCard>
    </TouchableOpacity>
  );
};

// ── CurrentTaskCard (phase 1) ─────────────────────────────────────────────────

export const CurrentTaskCard: React.FC<{ task: CurrentTask | null; onPress?: () => void }> = ({ task, onPress }) => {
  const { colors } = useTheme();
  if (!task || task.phase !== 1) return null;

  const { current, target } = task.progress;
  const pct = Math.min(100, Math.round((current / Math.max(1, target)) * 100));

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <ThemedCard style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(99,102,241,0.15)' }]}>
            <Ionicons name="people" size={20} color="#6366F1" />
          </View>
          <View style={styles.textBlock}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{task.title}</Text>
              <Text style={[styles.progressLabel, { color: colors.accent }]}>{current}/{target}</Text>
            </View>
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={3}>
              {task.description}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.pillBg ?? 'rgba(127,127,127,0.15)' }]}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </ThemedCard>
    </TouchableOpacity>
  );
};

// ── LaunchLockModal (shared explainer) ────────────────────────────────────────

export const LaunchLockModal: React.FC<{
  visible: boolean;
  lock: LockStatus | null;
  onClose: () => void;
  onInvite: () => void;
}> = ({ visible, lock, onClose, onInvite }) => {
  const { colors } = useTheme();
  if (!lock) return null;

  const isPhase1 = lock.phase === 1;
  const { current, target } = lock.progress;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.modalIcon, { backgroundColor: isPhase1 ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)' }]}>
            <Ionicons
              name={isPhase1 ? 'lock-closed' : 'shield-checkmark'}
              size={26}
              color={isPhase1 ? '#6366F1' : '#10B981'}
            />
          </View>

          {isPhase1 ? (
            <>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Transfers are locked</Text>
              <Text style={[styles.modalBody, { color: colors.textMuted }]}>
                For your security, invite 3 real people who vouch for you. Always invite users you
                actually know — fake or inactive invites can cost you your 10 A50 bond and put your
                account at risk.
              </Text>
              <View style={[styles.progressPill, { backgroundColor: colors.pillBg ?? 'rgba(99,102,241,0.12)' }]}>
                <Ionicons name="people-outline" size={15} color="#6366F1" />
                <Text style={[styles.progressPillText, { color: colors.textPrimary }]}>
                  {current}/{target} verified members
                </Text>
              </View>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#6366F1' }]} onPress={() => { onClose(); onInvite(); }}>
                <Ionicons name="person-add-outline" size={18} color="#FFF" />
                <Text style={styles.primaryBtnText}>Invite friends</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Thanks for verifying ✓</Text>
              <Text style={[styles.modalBody, { color: colors.textMuted }]}>
                Your security circle is complete. Your wallet can receive and mine anytime —
                you'll be able to transfer your balance on {unlockDateLabel(lock.unlockAt)}
                {lock.remainingMs > 0 ? ` (${remainingLabel(lock.remainingMs)})` : ''}.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#10B981' }]} onPress={onClose}>
                <Text style={styles.primaryBtnText}>Got it</Text>
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = applyFontScaling(StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  textBlock: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  progressLabel: { fontSize: 14, fontWeight: '700', marginLeft: 8 },
  subtitle: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#6366F1' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  sheet: { width: '100%', borderRadius: 22, padding: 24, alignItems: 'center' },
  modalIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 19, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  modalBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 16 },
  progressPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginBottom: 18 },
  progressPillText: { fontSize: 13, fontWeight: '700' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', paddingVertical: 14, borderRadius: 14 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
}));
