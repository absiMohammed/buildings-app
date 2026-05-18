import { I18nManager, Platform, type TextStyle } from 'react-native';

// Writing-direction is read once at theme module-load from the native
// I18nManager flag. RN's persistent forceRTL setting drives this; switching
// languages requires a native process restart (the i18n provider prompts
// for it). Keeping it as plain values means StyleSheet.create can freeze
// styles without confusing RN's style processor.
const _isRTL = I18nManager.isRTL;

// Kept for callers; updates require a process restart to take visual effect.
export function setLocaleDirection(_rtl: boolean): void {
  // no-op at runtime — see comment above. The i18n provider still calls
  // this for forward compatibility if we later swap to a dynamic strategy.
}

// Project convention: text is always left-aligned, even in Arabic (RTL) mode.
// Arabic glyphs still read right-to-left within each line — only the block
// alignment is anchored to the visual left edge.
export const textStart: TextStyle = {
  textAlign: 'left',
  writingDirection: _isRTL ? 'rtl' : 'ltr',
};

export const palette = {
  bg: '#f7f8fa',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  border: '#e2e8f0',
  divider: '#eef2f6',

  text: '#0f172a',
  textMuted: '#475569',
  textSubtle: '#64748b',
  textInverse: '#ffffff',

  accent: '#4f46e5', // indigo-600
  accentSoft: '#eef2ff',
  accentText: '#ffffff',

  primary: '#0f172a',
  primaryText: '#ffffff',

  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  warning: '#d97706',
  warningSoft: '#fffbeb',
  success: '#059669',
  successSoft: '#ecfdf5',
  info: '#0284c7',
  infoSoft: '#f0f9ff',

  link: '#1d4ed8',
  inputBorder: '#cbd5e1',
  inputBg: '#ffffff',
};

// Backward-compat alias used by older code.
export const colors = {
  ...palette,
  navActiveBg: palette.primary,
  navActiveText: palette.primaryText,
  navHoverBg: palette.surfaceMuted,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

export const type: Record<string, TextStyle> = {
  display: { fontSize: 28, fontWeight: '700', color: palette.text, letterSpacing: -0.4, ...textStart },
  title: { fontSize: 22, fontWeight: '600', color: palette.text, letterSpacing: -0.2, ...textStart },
  heading: { fontSize: 17, fontWeight: '600', color: palette.text, ...textStart },
  body: { fontSize: 15, color: palette.text, ...textStart },
  bodyMuted: { fontSize: 15, color: palette.textMuted, ...textStart },
  small: { fontSize: 13, color: palette.textSubtle, ...textStart },
  caption: { fontSize: 11, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6, ...textStart },
};

export const shadow = Platform.select({
  ios: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 2 },
  default: {},
}) as object;
