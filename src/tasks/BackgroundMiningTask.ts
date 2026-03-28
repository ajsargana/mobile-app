/**
 * BackgroundMiningTask
 *
 * Registers an expo-background-fetch task so the OS periodically wakes the
 * app to resume mining if it was running when the user backgrounded.
 *
 * Android: fires every ~1 min (OS may batch to ~5 min in Doze mode)
 * iOS:     fires every ~15 min (system-controlled minimum)
 *
 * Must be imported once at the module level — before any component mounts.
 * App.tsx imports this file to ensure the task is defined before registration.
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export const BACKGROUND_MINING_TASK = 'aura50-background-mining';

// ── Persistent flag keys ──────────────────────────────────────────────────────
const MINING_SHOULD_RUN_KEY = '@aura50_bg_mining_active';

// ── Define the task (must be at module level, not inside a component) ─────────
TaskManager.defineTask(BACKGROUND_MINING_TASK, async () => {
  try {
    const flag = await AsyncStorage.getItem(MINING_SHOULD_RUN_KEY);
    if (flag !== 'true') {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Lazy import to avoid circular dependency
    const { MiningService } = require('../services/MiningService');
    const svc = MiningService.getInstance();

    if (svc.isMiningActive()) {
      // Already running — nothing to do
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Mining was active before but stopped — restart it
    console.log('[BGMining] Restarting mining from background task');
    const started = await svc.startMining();

    if (started) {
      // Refresh the persistent notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AURA50 Mining Active',
          body: 'Background mining resumed — tap to open',
          sticky: true,
          autoDismiss: false,
          data: { source: 'background-task' },
        },
        trigger: null,
      });
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (err) {
    console.error('[BGMining] Task error:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call when mining starts. Persists the "should mine" flag and registers the
 * background fetch task so the OS will wake us to resume if we're killed.
 */
export async function enableBackgroundMining(): Promise<void> {
  await AsyncStorage.setItem(MINING_SHOULD_RUN_KEY, 'true');
  try {
    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_MINING_TASK);
    if (!already) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_MINING_TASK, {
        minimumInterval: 60,    // seconds — iOS honours ~900s minimum; Android may be faster
        stopOnTerminate: false, // survive app kill on Android
        startOnBoot: true,      // restart after device reboot
      });
      console.log('[BGMining] Background task registered');
    }
  } catch (err) {
    // Non-fatal: background fetch may be unavailable (simulator, low-power mode, etc.)
    console.warn('[BGMining] Could not register background task:', err);
  }
}

/**
 * Call when the user explicitly stops mining. Clears the flag so the
 * background task won't restart it.
 */
export async function disableBackgroundMining(): Promise<void> {
  await AsyncStorage.removeItem(MINING_SHOULD_RUN_KEY);
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_MINING_TASK);
    if (registered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_MINING_TASK);
      console.log('[BGMining] Background task unregistered');
    }
  } catch (err) {
    console.warn('[BGMining] Could not unregister background task:', err);
  }
}

/** Returns true if the app was mining before it was last killed/backgrounded. */
export async function wasMiningBeforeBackground(): Promise<boolean> {
  return (await AsyncStorage.getItem(MINING_SHOULD_RUN_KEY)) === 'true';
}
