import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PerfTier = 'lite' | 'full';
export type OverrideSetting = 'auto' | 'lite' | 'full';

const TIER_CACHE_KEY = '@aura50_perf_tier';
const OVERRIDE_KEY   = '@aura50_perf_tier_override';

// Single hardware metric: total RAM reported by the OS.
// >= 4 GB → full experience  /  < 4 GB → lite mode
// 2 GB phones land squarely in lite; 4 GB+ flagships get the full glass UI.
const RAM_THRESHOLD_BYTES = 4 * 1024 * 1024 * 1024;

let DeviceInfo: { getTotalMemory: () => Promise<number> } | null = null;
try {
  const mod = require('react-native-device-info');
  if (typeof mod.getTotalMemory === 'function') DeviceInfo = mod;
} catch {}

/** Run the actual RAM check and persist the result. */
async function measureTier(): Promise<PerfTier> {
  if (!DeviceInfo) return 'lite'; // module unavailable → safe default
  try {
    const bytes = await DeviceInfo.getTotalMemory();
    return bytes >= RAM_THRESHOLD_BYTES ? 'full' : 'lite';
  } catch {
    return 'lite';
  }
}

/** Return cached tier if available, otherwise measure and cache. */
async function resolveTier(): Promise<PerfTier> {
  const cached = await AsyncStorage.getItem(TIER_CACHE_KEY);
  if (cached === 'lite' || cached === 'full') return cached;
  const tier = await measureTier();
  await AsyncStorage.setItem(TIER_CACHE_KEY, tier);
  return tier;
}

// ─────────────────────────────────────────────────────────────────────────────

interface DeviceCapabilityContextValue {
  perfTier: PerfTier;
  /** true when perfTier === 'lite' — convenience alias used across components */
  isLowEnd: boolean;
  /** true only during the first async detection; resolves in < 100 ms */
  isDetecting: boolean;
  overrideSetting: OverrideSetting;
  overrideTier: (setting: OverrideSetting) => Promise<void>;
}

const DeviceCapabilityContext = createContext<DeviceCapabilityContextValue | undefined>(undefined);

export const DeviceCapabilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [perfTier, setPerfTier]           = useState<PerfTier>('lite');
  const [isDetecting, setIsDetecting]     = useState(true);
  const [overrideSetting, setOverride]    = useState<OverrideSetting>('auto');

  useEffect(() => {
    (async () => {
      // Manual override always wins — no need to touch hardware.
      const savedOverride = await AsyncStorage.getItem(OVERRIDE_KEY);
      if (savedOverride === 'lite' || savedOverride === 'full') {
        setOverride(savedOverride);
        setPerfTier(savedOverride);
        setIsDetecting(false);
        return;
      }

      const tier = await resolveTier();
      setPerfTier(tier);
      setIsDetecting(false);
    })();
  }, []);

  const overrideTier = async (setting: OverrideSetting) => {
    await AsyncStorage.setItem(OVERRIDE_KEY, setting);
    setOverride(setting);

    if (setting === 'auto') {
      // Re-detect from scratch (clear stale cache so measureTier runs fresh).
      await AsyncStorage.removeItem(TIER_CACHE_KEY);
      setIsDetecting(true);
      const tier = await measureTier();
      await AsyncStorage.setItem(TIER_CACHE_KEY, tier);
      setPerfTier(tier);
      setIsDetecting(false);
    } else {
      setPerfTier(setting);
    }
  };

  return (
    <DeviceCapabilityContext.Provider value={{
      perfTier,
      isLowEnd: perfTier === 'lite',
      isDetecting,
      overrideSetting,
      overrideTier,
    }}>
      {children}
    </DeviceCapabilityContext.Provider>
  );
};

export const useDeviceCapability = (): DeviceCapabilityContextValue => {
  const ctx = useContext(DeviceCapabilityContext);
  if (!ctx) throw new Error('useDeviceCapability must be used within DeviceCapabilityProvider');
  return ctx;
};
