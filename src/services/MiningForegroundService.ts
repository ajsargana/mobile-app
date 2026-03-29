/**
 * MiningForegroundService
 *
 * Wraps react-native-background-actions to create a real Android Foreground
 * Service for background mining. On Android 8+ this is the only reliable way
 * to keep the JS thread alive when the app is backgrounded.
 *
 * iOS: falls back to BackgroundTask API (limited but best available).
 */
import { Platform } from 'react-native';

let BackgroundService: any = null;
try {
  BackgroundService = require('react-native-background-actions').default;
} catch (e) {
  console.warn('[FGService] react-native-background-actions not available');
}

// ── Task function — runs inside the foreground service ────────────────────────
// Must be defined outside the class (react-native-background-actions requirement)
const miningServiceTask = async (taskDataArguments: any) => {
  // This function keeps running as long as the foreground service is alive.
  // The actual hash computation is done by MiningService — we just need to
  // keep the JS thread awake and periodically check if mining should continue.
  const { MiningService } = require('./MiningService');
  const svc = MiningService.getInstance();

  // Ensure mining is running when the service starts (may need a restart
  // if the foreground service was invoked after a quick background kill)
  if (!svc.isMiningActive()) {
    console.log('[FGService] Mining not active at service start — attempting start');
    await svc.startMining();
  }

  // Keep the service alive with a heartbeat loop.
  // react-native-background-actions will reject the promise when stop() is called.
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (!svc.isMiningActive()) {
        // Mining ended (block settled / stopped by user) — clean up
        clearInterval(interval);
        resolve();
      }
    }, 5_000); // check every 5 s

    // Allow the service to be cancelled from outside
    taskDataArguments?.onStop?.(() => {
      clearInterval(interval);
      resolve();
    });
  });
};

// ── Notification options for the foreground service ───────────────────────────
const SERVICE_OPTIONS = {
  taskName: 'AURA50 Mining',
  taskTitle: 'AURA50 Mining Active',
  taskDesc: 'Mining A50 in the background — tap to open',
  taskIcon: {
    name: 'notification_icon',
    type: 'drawable',
  },
  color: '#E8A020',
  linkingURI: 'aura50://mining',
  parameters: {},
};

// ── Public API ────────────────────────────────────────────────────────────────

let _onStopCallback: (() => void) | null = null;
let _isRunning = false;

/**
 * Start the Android Foreground Service (no-op on iOS — BackgroundTask handles it).
 * Safe to call even if already running.
 */
export async function startForegroundMiningService(): Promise<void> {
  if (!BackgroundService) {
    console.warn('[FGService] BackgroundService not available');
    return;
  }
  if (Platform.OS !== 'android') return; // iOS handled separately

  try {
    if (await BackgroundService.isRunning()) {
      console.log('[FGService] Already running');
      _isRunning = true;
      return;
    }

    // Inject an onStop callback into the task so we can resolve the promise
    const options = {
      ...SERVICE_OPTIONS,
      parameters: {
        onStop: (cb: () => void) => { _onStopCallback = cb; },
      },
    };

    await BackgroundService.start(miningServiceTask, options);
    _isRunning = true;
    console.log('[FGService] Foreground service started');
  } catch (err) {
    console.error('[FGService] Failed to start:', err);
  }
}

/**
 * Stop the Android Foreground Service.
 * Calling this will also resolve the inner heartbeat promise, letting the task end cleanly.
 */
export async function stopForegroundMiningService(): Promise<void> {
  if (!BackgroundService || Platform.OS !== 'android') return;

  try {
    _onStopCallback?.();
    _onStopCallback = null;

    if (await BackgroundService.isRunning()) {
      await BackgroundService.stop();
      console.log('[FGService] Foreground service stopped');
    }
    _isRunning = false;
  } catch (err) {
    console.error('[FGService] Failed to stop:', err);
  }
}

/** True if the foreground service is currently active. */
export function isForegroundServiceRunning(): boolean {
  return _isRunning;
}

/**
 * Update the foreground service notification text (e.g. show current hash rate).
 * No-op if service is not running or not Android.
 */
export async function updateForegroundNotification(title: string, desc: string): Promise<void> {
  if (!BackgroundService || Platform.OS !== 'android' || !_isRunning) return;
  try {
    await BackgroundService.updateNotification({ taskTitle: title, taskDesc: desc });
  } catch (_) {}
}
