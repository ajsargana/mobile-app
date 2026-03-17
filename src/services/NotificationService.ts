/**
 * NotificationService — expo-notifications implementation
 *
 * Handles:
 *   1. Permission requests
 *   2. Android notification channel setup
 *   3. Local notifications for received coins / mining rewards
 *   4. Persisting notification events to AsyncStorage (badge + history)
 *   5. Graceful fallback in Expo Go (no native build)
 *
 * Install required packages:
 *   npx expo install expo-notifications expo-media-library expo-sharing react-native-view-shot
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface StoredNotification {
  id: string;
  type: 'received' | 'sent' | 'mining_reward' | 'referral_bonus' | 'security' | 'limit_reset' | 'default';
  title: string;
  body: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: string; // ISO string
}

const NOTIFS_KEY               = '@aura50_notifs_enabled';
const NOTIF_EVENTS_KEY         = '@aura50_notification_events';
const MAX_STORED               = 60; // keep last 60 notifications
const LIMIT_RESET_NOTIF_ID     = 'daily-limit-reset';

// Safe expo-notifications import — gracefully degrades in Expo Go
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  // Must call setNotificationHandler so banners/sounds show while app is in foreground.
  // Without this, all foreground notifications are silently dropped by the OS.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  // expo-notifications not installed — run: npx expo install expo-notifications
}

class NotificationService {
  private static _instance: NotificationService;
  private channelCreated = false;

  static getInstance(): NotificationService {
    if (!NotificationService._instance) {
      NotificationService._instance = new NotificationService();
    }
    return NotificationService._instance;
  }

  // ── Permissions & Setup ─────────────────────────────────────────────────────

  async isEnabled(): Promise<boolean> {
    const v = await AsyncStorage.getItem(NOTIFS_KEY);
    return v !== 'false'; // default: enabled
  }

  async requestPermission(): Promise<boolean> {
    if (!Notifications) return false;
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      const granted = status === 'granted';
      await AsyncStorage.setItem(NOTIFS_KEY, granted ? 'true' : 'false');
      if (granted) await this.setupAndroidChannel();
      return granted;
    } catch {
      return false;
    }
  }

  async setupAndroidChannel(): Promise<void> {
    if (!Notifications || Platform.OS !== 'android' || this.channelCreated) return;
    try {
      await Notifications.setNotificationChannelAsync('aura50-coins', {
        name: 'AURA50 Coins',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 150, 80, 150],
        lightColor: '#5DADE2',
        sound: 'coin_received.wav', // place in assets/sounds/coin_received.wav
        enableVibrate: true,
        showBadge: true,
      });
      await Notifications.setNotificationChannelAsync('aura50-mining', {
        name: 'AURA50 Mining',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'coin_received.wav',
        showBadge: true,
      });
      this.channelCreated = true;
    } catch { /* ignore */ }
  }

  async enable(): Promise<boolean> {
    return this.requestPermission();
  }

  async disable(): Promise<void> {
    await AsyncStorage.setItem(NOTIFS_KEY, 'false');
    if (Notifications) {
      try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch { /* ignore */ }
    }
  }

  // ── Trigger Notifications ───────────────────────────────────────────────────

  /**
   * Called whenever the app detects a new incoming transaction.
   * Works when app is in foreground AND schedules a local notification
   * for background/killed state via expo-notifications.
   */
  async triggerCoinReceivedNotification(amount: string, fromAddress: string, txId?: string): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) return;

    const shortFrom = fromAddress.length > 14
      ? `${fromAddress.slice(0, 6)}...${fromAddress.slice(-4)}`
      : fromAddress;

    const title = `You received ${parseFloat(amount).toLocaleString('en-US', { maximumFractionDigits: 4 })} A50`;
    const body  = `From ${shortFrom}`;

    // Store for notification history screen — include txId so tapping opens the detail
    await this.storeNotification({
      type: 'received',
      title,
      body,
      data: { amount, fromAddress, ...(txId ? { txId } : {}) },
    });

    // Fire local notification (works when app is backgrounded)
    if (!Notifications) return;
    try {
      await this.setupAndroidChannel();
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'coin_received.wav',
          data: { type: 'received', amount, fromAddress },
          ...(Platform.OS === 'android' ? { channelId: 'aura50-coins' } : {}),
        },
        trigger: null, // fire immediately
      });
    } catch { /* ignore — may not have permission */ }
  }

  async triggerCoinSentNotification(amount: string, toAddress: string, txId?: string): Promise<void> {
    const shortTo = toAddress.length > 14
      ? `${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`
      : toAddress;
    const title = `Sent ${parseFloat(amount).toLocaleString('en-US', { maximumFractionDigits: 4 })} A50`;
    const body  = `To ${shortTo}`;
    await this.storeNotification({
      type: 'sent', title, body,
      data: { amount, toAddress, ...(txId ? { txId } : {}) },
    });
    // No OS push for sent — it's self-initiated, in-app history is enough
  }

  async triggerMiningRewardNotification(amount: string, blockHeight: number): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) return;

    const title = `Mining reward: ${parseFloat(amount).toLocaleString('en-US', { maximumFractionDigits: 4 })} A50`;
    const body  = `Block #${blockHeight} confirmed`;

    await this.storeNotification({
      type: 'mining_reward',
      title,
      body,
      data: { amount, blockHeight },
    });

    if (!Notifications) return;
    try {
      await this.setupAndroidChannel();
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'coin_received.wav',
          data: { type: 'mining_reward', amount, blockHeight },
          ...(Platform.OS === 'android' ? { channelId: 'aura50-mining' } : {}),
        },
        trigger: null,
      });
    } catch { /* ignore */ }
  }

  // ── Notification History (AsyncStorage) ─────────────────────────────────────

  async storeNotification(event: Omit<StoredNotification, 'id' | 'read' | 'createdAt'>): Promise<void> {
    const notification: StoredNotification = {
      ...event,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
    try {
      const raw = await AsyncStorage.getItem(NOTIF_EVENTS_KEY);
      const existing: StoredNotification[] = raw ? JSON.parse(raw) : [];
      // Prepend + cap at MAX_STORED
      const updated = [notification, ...existing].slice(0, MAX_STORED);
      await AsyncStorage.setItem(NOTIF_EVENTS_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
  }

  async getNotifications(): Promise<StoredNotification[]> {
    try {
      const raw = await AsyncStorage.getItem(NOTIF_EVENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async getUnreadCount(): Promise<number> {
    const notifications = await this.getNotifications();
    return notifications.filter(n => !n.read).length;
  }

  async markAllRead(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(NOTIF_EVENTS_KEY);
      if (!raw) return;
      const notifications: StoredNotification[] = JSON.parse(raw);
      const updated = notifications.map(n => ({ ...n, read: true }));
      await AsyncStorage.setItem(NOTIF_EVENTS_KEY, JSON.stringify(updated));
      // Clear app badge
      if (Notifications) {
        try { await Notifications.setBadgeCountAsync(0); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  async clearNotifications(): Promise<void> {
    await AsyncStorage.removeItem(NOTIF_EVENTS_KEY);
    if (Notifications) {
      try {
        await Notifications.setBadgeCountAsync(0);
        await Notifications.cancelAllScheduledNotificationsAsync();
      } catch { /* ignore */ }
    }
  }

  // ── Limit Reset Notification ─────────────────────────────────────────────────

  /**
   * Schedule a local notification at `resetTimestamp` (Unix ms) to inform the
   * user that their forging limit has reset.  Any previously scheduled
   * limit-reset notification is cancelled first so there is never more than one
   * outstanding at a time.
   *
   * @param resetTimestamp - The Unix epoch milliseconds at which the limit resets.
   */
  async scheduleLimitResetNotification(resetTimestamp: number): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled || !Notifications) return;

    try {
      await this.setupAndroidChannel();

      // Cancel any outstanding limit-reset notification before scheduling a new one
      try {
        await Notifications.cancelScheduledNotificationAsync(LIMIT_RESET_NOTIF_ID);
      } catch {
        // Notification may not exist yet — ignore
      }

      const resetDate = new Date(resetTimestamp);

      // Guard: don't schedule a notification in the past
      if (resetDate.getTime() <= Date.now()) return;

      await Notifications.scheduleNotificationAsync({
        identifier: LIMIT_RESET_NOTIF_ID,
        content: {
          title: 'Daily Forge Limit Reset! ⚒️',
          body: 'Your forging limit has been reset — come back and forge new A50 coins!',
          sound: 'coin_received.wav',
          data: { type: 'limit_reset' },
          ...(Platform.OS === 'android' ? { channelId: 'aura50-mining' } : {}),
        },
        trigger: {
          type: 'date' as any,
          date: resetDate,
        },
      });
    } catch { /* ignore — may not have permission or module unavailable */ }
  }

  // ── Legacy stubs (kept for SettingsScreen compatibility) ────────────────────

  async scheduleDailyReminder(_hour: number = 9): Promise<void> {
    if (!Notifications) return;
    try {
      await this.setupAndroidChannel();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Keep mining AURA50! ⛏️',
          body: 'Your node is waiting. Tap to start mining.',
          sound: 'coin_received.wav',
          ...(Platform.OS === 'android' ? { channelId: 'aura50-mining' } : {}),
        },
        trigger: {
          type: 'daily' as any,
          hour: _hour,
          minute: 0,
        },
      });
    } catch { /* ignore */ }
  }

  async scheduleStreakWarning(_lastMineTime: Date): Promise<void> { /* future */ }

  async cancelAll(): Promise<void> {
    if (Notifications) {
      try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch { /* ignore */ }
    }
  }
}

export default NotificationService;
