/**
 * NotificationsScreen
 *
 * Shows all stored notification events (received coins, mining rewards, etc.)
 * Wired to the bell icon on the home screen.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import NotificationService, { StoredNotification } from '../services/NotificationService';

const ICON_MAP: Record<string, { name: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }> = {
  received:       { name: 'arrow-down-circle',  color: '#2ECC71' },
  sent:           { name: 'arrow-up-circle',    color: '#5DADE2' },
  mining_reward:  { name: 'flash',               color: '#F4D03F' },
  referral_bonus: { name: 'people',              color: '#9B59B6' },
  security:       { name: 'shield-checkmark',    color: '#E74C3C' },
  default:        { name: 'notifications',        color: '#5DADE2' },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationsScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const ns = NotificationService.getInstance();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const data = await ns.getNotifications();
        if (active) {
          setNotifications(data);
          setLoading(false);
          // Mark all as read when screen opens
          await ns.markAllRead();
        }
      })();
      return () => { active = false; };
    }, [])
  );

  const clearAll = async () => {
    await ns.clearNotifications();
    setNotifications([]);
  };

  const handleItemPress = (item: StoredNotification) => {
    // Navigate to TransactionHistory; if we have a txId, auto-open its detail modal
    navigation.navigate('TransactionHistory', item.data?.txId ? { txId: item.data.txId } : {});
  };

  const renderItem = ({ item, index }: { item: StoredNotification; index: number }) => {
    const iconCfg = ICON_MAP[item.type] ?? ICON_MAP.default;

    return (
      <TouchableOpacity
        style={[
          styles.item,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' },
          !item.read && styles.itemUnread,
          index === 0 && styles.itemFirst,
        ]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.75}
      >
        {/* Unread dot */}
        {!item.read && <View style={styles.unreadDot} />}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: `${iconCfg.color}18` }]}>
          <Ionicons name={iconCfg.name} size={22} color={iconCfg.color} />
        </View>

        {/* Content */}
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>
            {item.title}
          </Text>
          <Text style={[styles.itemBody, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
        </View>

        {/* Time */}
        <Text style={[styles.itemTime, { color: colors.textSecondary }]}>
          {timeAgo(item.createdAt)}
        </Text>
      </TouchableOpacity>
    );
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={isDark ? ['#0A3D62', '#0A2744'] : ['#1D4ED8', '#2563EB']}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* List or empty state */}
      {loading ? null : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? 'rgba(93,173,226,0.1)' : '#DBEAFE' }]}>
            <Ionicons name="notifications-off-outline" size={42} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All caught up</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            You'll be notified when you receive A50 or earn mining rewards.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB' }]} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 14, paddingHorizontal: 16,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  headerBadge: {
    backgroundColor: '#EF4444', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  headerBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  clearBtn: { padding: 6 },
  clearBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },

  // List
  listContent: { paddingTop: 8 },
  separator: { height: 1, marginLeft: 68 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    position: 'relative',
  },
  itemFirst: {},
  itemUnread: { borderLeftWidth: 3, borderLeftColor: '#5DADE2' },
  unreadDot: {
    position: 'absolute', top: 14, right: 16,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#5DADE2',
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  itemContent: { flex: 1, marginRight: 32 },
  itemTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  itemBody: { fontSize: 13, lineHeight: 18 },
  itemTime: { fontSize: 11, position: 'absolute', top: 14, right: 16 },

  // Empty state
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
