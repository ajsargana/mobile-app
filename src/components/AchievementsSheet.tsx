import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import AchievementService, { Achievement } from '../services/AchievementService';

interface Props {
  visible: boolean;
  onClose: () => void;
  refreshKey?: number;
}

const AchievementsSheet: React.FC<Props> = ({ visible, onClose, refreshKey = 0 }) => {
  const { colors, isDark } = useTheme();
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    if (visible) {
      AchievementService.getInstance().getAllWithStatus().then(setAchievements);
    }
  }, [visible, refreshKey]);

  const sheetBg = isDark ? '#1C2833' : '#FFFFFF';

  const unlocked = achievements.filter(a => a.unlocked).length;

  const handleTap = (item: Achievement) => {
    if (item.unlocked) {
      Alert.alert(
        `${item.icon} ${item.label}`,
        `${item.description}\n\n💡 ${item.benefit}\n\nUnlocked ${new Date(item.unlockedAt!).toLocaleDateString()}`,
        [{ text: 'Nice!' }]
      );
    } else {
      Alert.alert(
        `🔒 ${item.label}`,
        `${item.description}\n\n💡 Why unlock this?\n${item.benefit}`,
        [{ text: 'Got it' }]
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismissArea} onPress={onClose} activeOpacity={1} />

        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#DDD' }]} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.settingTitle }]}>Achievements</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted ?? '#566573' }]}>
                Tap any badge to see how it helps you
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={[styles.count, { color: colors.textMuted ?? '#566573' }]}>
                {unlocked}/{achievements.length}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textMuted ?? '#566573'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0', marginHorizontal: 20, marginBottom: 12 }]}>
            <View style={[styles.progressFill, {
              width: achievements.length ? `${(unlocked / achievements.length) * 100}%` as any : '0%',
            }]} />
          </View>

          {/* Grid */}
          <FlatList
            data={achievements}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleTap(item)}
                activeOpacity={0.75}
                style={[
                  styles.badge,
                  {
                    backgroundColor: item.unlocked
                      ? (isDark ? 'rgba(93,173,226,0.10)' : '#EEF6FF')
                      : (isDark ? 'rgba(255,255,255,0.03)' : '#F5F5F5'),
                    borderColor: item.unlocked
                      ? (isDark ? 'rgba(93,173,226,0.40)' : 'rgba(37,99,235,0.25)')
                      : (isDark ? 'rgba(255,255,255,0.07)' : '#E5E5E5'),
                    opacity: item.unlocked ? 1 : 0.55,
                  },
                ]}
              >
                <Text style={styles.icon}>{item.icon}</Text>

                {!item.unlocked && (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed" size={12} color={isDark ? '#566573' : '#AAA'} />
                  </View>
                )}

                <Text style={[styles.badgeLabel, { color: colors.settingTitle }]}>{item.label}</Text>
                <Text style={[styles.badgeDesc, { color: colors.textMuted ?? '#566573' }]}>
                  {item.description}
                </Text>

                {item.unlocked ? (
                  <View style={styles.unlockedPill}>
                    <Text style={styles.unlockedPillText}>✓ Earned</Text>
                  </View>
                ) : (
                  <View style={styles.lockedHint}>
                    <Text style={[styles.lockedHintText, { color: colors.textMuted ?? '#566573' }]}>
                      Tap to see benefit
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 40,
    maxHeight: '82%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  count: {
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#5DADE2',
  },
  grid: {
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  badge: {
    flex: 1,
    margin: 6,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    gap: 5,
    position: 'relative',
    minHeight: 130,
  },
  icon: {
    fontSize: 30,
    marginBottom: 2,
  },
  lockOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  badgeDesc: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  unlockedPill: {
    marginTop: 4,
    backgroundColor: 'rgba(46,204,113,0.18)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unlockedPillText: {
    color: '#2ECC71',
    fontSize: 10,
    fontWeight: '700',
  },
  lockedHint: {
    marginTop: 4,
  },
  lockedHintText: {
    fontSize: 10,
    fontStyle: 'italic',
  },
});

export default AchievementsSheet;
