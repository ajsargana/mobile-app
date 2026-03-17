import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@aura50_theme_id';

export type ThemeId = 'dark' | 'light';

export const DARK_COLORS = {
  // Backgrounds
  bg:           '#141E28',
  card:         '#1C2833',
  card2:        '#212F3C',
  cardBorder:   'rgba(52,152,219,0.18)',
  inputBg:      'rgba(255,255,255,0.06)',
  inputBorder:  'rgba(52,152,219,0.22)',
  overlay:      'rgba(0,0,0,0.7)',
  pillBg:       'rgba(255,255,255,0.08)',
  progressTrack:'rgba(255,255,255,0.07)',
  emptyIcon:    '#4A6274',

  // Text
  textPrimary:  '#FFFFFF',
  textSecondary:'#85B8D5',
  textMuted:    '#566573',
  textLabel:    '#4A6274',
  placeholder:  '#4A6274',

  // Accents
  accent:       '#5DADE2',
  accentAlt:    '#3498DB',
  success:      '#27AE60',
  danger:       '#E74C3C',

  // Capsule button tints (dark-mode variants)
  sendBg:       'rgba(220,38,38,0.18)',
  receiveBg:    'rgba(5,150,105,0.18)',
  seedBg:       'rgba(124,58,237,0.18)',
  sendColor:    '#F87171',
  receiveColor: '#34D399',
  seedColor:    '#A78BFA',

  // Section card shadow
  cardShadow:   '#000',

  // Tab bar
  tabBg:        '#141E28',
  tabActive:    '#5DADE2',
  tabInactive:  '#4A6274',

  // Mining gradients
  miningIdle:   ['#1C2833', '#212F3C', '#17202A'] as [string, string, string],
  miningActive: ['#0D2137', '#0A3D62', '#1A5276'] as [string, string, string],
  miningBtn:    '#2C3E50',
  miningBtnActive: '#2E86C1',
  labelTop:     '#566573',
  labelTopActive:'#5DADE2',
  labelBottom:  '#4A6274',
  historyBtn:   '#5DADE2',
  historyBtnText:'#85B8D5',
  participationLabel:'#566573',
  participationValue:'#FFFFFF',
  divider:      'rgba(52,152,219,0.12)',

  // Settings
  settingsBg:   '#141E28',
  settingCard:  '#1C2833',
  settingIcon:  '#3498DB',
  settingTitle: '#FFFFFF',
  settingSubtitle:'#566573',
  settingArrow: '#4A6274',
  sectionTitle: '#85B8D5',
  switchTrackFalse:'#2C3E50',
  switchTrackTrue: '#3498DB',
  logoutBg:     'rgba(255,255,255,0.06)',
  logoutIcon:   '#5DADE2',
  logoutText:   '#5DADE2',
  dangerBg:     'rgba(231,76,60,0.12)',
  footerText:   '#4A6274',

  // Contact avatar
  contactAvatarBg: 'rgba(52,152,219,0.15)',
  contactInitial: '#5DADE2',
  addContactCardBg: 'rgba(52,152,219,0.1)',
  addContactBorder: 'rgba(52,152,219,0.35)',

  // Tx
  txPosBg: 'rgba(39,174,96,0.15)',
  txNegBg: 'rgba(231,76,60,0.15)',

  // Market
  marketRowBorder: 'rgba(255,255,255,0.06)',
  editBtnBg: 'rgba(255,255,255,0.08)',
  editDelBg: 'rgba(231,76,60,0.18)',
  coinIconFallbackBg: '#2C3E50',
  coinIconLetter: '#85B8D5',
  coinName: '#FFFFFF',
  coinSymbol: '#566573',
  coinPrice: '#FFFFFF',
  marketActionBtnBg: 'rgba(255,255,255,0.08)',

  // Chart popup
  chartBg: '#1C2833',
  chartAreaBg: '#212F3C',
  chartGridLine: 'rgba(255,255,255,0.08)',
  chartCoinName: '#FFFFFF',
  chartCoinSymbol: '#566573',
  chartCloseBtn: 'rgba(255,255,255,0.08)',
  chartPrice: '#FFFFFF',
  chartFootnote: '#566573',

  // Profile
  profileBg: '#141E28',
  profileCard: '#1C2833',
};

export const LIGHT_COLORS = {
  // Backgrounds
  bg:           '#F9FAFB',
  card:         '#FFFFFF',
  card2:        '#F3F4F6',
  cardBorder:   '#E5E7EB',
  inputBg:      '#F9FAFB',
  inputBorder:  '#D1D5DB',
  overlay:      'rgba(0,0,0,0.55)',
  pillBg:       '#F3F4F6',
  progressTrack:'rgba(0,0,0,0.07)',
  emptyIcon:    '#D1D5DB',

  // Text
  textPrimary:  '#111827',
  textSecondary:'#374151',
  textMuted:    '#6B7280',
  textLabel:    '#374151',
  placeholder:  '#9CA3AF',

  // Accents
  accent:       '#2563EB',
  accentAlt:    '#1D4ED8',
  success:      '#059669',
  danger:       '#DC2626',

  // Capsule button tints
  sendBg:       '#FEF2F2',
  receiveBg:    '#F0FDF4',
  seedBg:       '#F5F3FF',
  sendColor:    '#DC2626',
  receiveColor: '#059669',
  seedColor:    '#7C3AED',

  // Section card shadow
  cardShadow:   '#000',

  // Tab bar
  tabBg:        '#FFFFFF',
  tabActive:    '#2563EB',
  tabInactive:  '#9CA3AF',

  // Mining gradients
  miningIdle:   ['#EBF5FB', '#D6EAF8', '#EBF5FB'] as [string, string, string],
  miningActive: ['#DBEAFE', '#BFDBFE', '#EFF6FF'] as [string, string, string],
  miningBtn:    '#D1D5DB',
  miningBtnActive: '#2563EB',
  labelTop:     '#6B7280',
  labelTopActive:'#2563EB',
  labelBottom:  '#9CA3AF',
  historyBtn:   '#2563EB',
  historyBtnText:'#374151',
  participationLabel:'#6B7280',
  participationValue:'#111827',
  divider:      'rgba(37,99,235,0.12)',

  // Settings
  settingsBg:   '#F8F9FA',
  settingCard:  '#FFFFFF',
  settingIcon:  '#667eea',
  settingTitle: '#2C3E50',
  settingSubtitle:'#6B7280',
  settingArrow: '#BDC3C7',
  sectionTitle: '#2C3E50',
  switchTrackFalse:'#BDC3C7',
  switchTrackTrue: '#667eea',
  logoutBg:     '#F8F9FA',
  logoutIcon:   '#667eea',
  logoutText:   '#667eea',
  dangerBg:     '#FFF5F5',
  footerText:   '#9CA3AF',

  // Contact avatar
  contactAvatarBg: '#EFF6FF',
  contactInitial: '#2563EB',
  addContactCardBg: '#EFF6FF',
  addContactBorder: '#BFDBFE',

  // Tx
  txPosBg: '#D1FAE5',
  txNegBg: '#FEE2E2',

  // Market
  marketRowBorder: '#F3F4F6',
  editBtnBg: '#F3F4F6',
  editDelBg: '#FEE2E2',
  coinIconFallbackBg: '#E5E7EB',
  coinIconLetter: '#374151',
  coinName: '#1F2937',
  coinSymbol: '#6B7280',
  coinPrice: '#1F2937',
  marketActionBtnBg: '#F3F4F6',

  // Chart popup
  chartBg: '#FFFFFF',
  chartAreaBg: '#F9FAFB',
  chartGridLine: '#E5E7EB',
  chartCoinName: '#111827',
  chartCoinSymbol: '#6B7280',
  chartCloseBtn: '#F3F4F6',
  chartPrice: '#111827',
  chartFootnote: '#9CA3AF',

  // Profile
  profileBg: '#F9FAFB',
  profileCard: '#FFFFFF',
};

export type ThemeColors = typeof DARK_COLORS;

export const PALETTE_MAP: Record<ThemeId, ThemeColors> = {
  dark: DARK_COLORS,
  light: LIGHT_COLORS,
};

// ── Context ────────────────────────────────────────────────────────────────────
interface ThemeContextValue {
  isDark: boolean;
  themeId: ThemeId;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  themeId: 'dark',
  colors: DARK_COLORS,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeId, setThemeIdState] = useState<ThemeId>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (val === null) return;
      // Backward compat: old storage was a boolean string
      if (val === 'true' || val === 'dark' || val === 'glass' || val === 'futuristic' || val === 'techgame') {
        setThemeIdState('dark');
      } else if (val === 'false' || val === 'light') {
        setThemeIdState('light');
      }
    });
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    AsyncStorage.setItem(THEME_KEY, id);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeIdState(prev => {
      const next: ThemeId = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const isDark = themeId !== 'light';
  const colors = PALETTE_MAP[themeId];

  return (
    <ThemeContext.Provider value={{ isDark, themeId, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
