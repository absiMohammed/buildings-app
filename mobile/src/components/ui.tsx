import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { palette, radii, shadow, spacing, type } from './theme';

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[cardStyles.card, padded && cardStyles.padded, style]}>{children}</View>;
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow,
  },
  padded: { padding: spacing.lg },
});

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  style,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'accent';
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyle = statToneStyles[tone];
  return (
    <View style={[statStyles.card, style]}>
      <LinearGradient
        colors={[toneStyle.gradStart, toneStyle.gradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[statStyles.toneStripe, { backgroundColor: toneStyle.stripe }]} />
      <View style={[statStyles.iconBubble, { backgroundColor: toneStyle.bubble }]}>
        <Text style={[statStyles.iconText, { color: toneStyle.stripe }]}>{toneStyle.glyph}</Text>
      </View>
      <Text style={[type.caption, { color: toneStyle.label }]}>{label}</Text>
      <Text style={[type.title, statStyles.value]}>{value}</Text>
      {hint ? <Text style={[type.small, { color: toneStyle.hint, fontWeight: '600' }]}>{hint}</Text> : null}
    </View>
  );
}

const statToneStyles: Record<string, { stripe: string; hint: string; gradStart: string; gradEnd: string; bubble: string; glyph: string; label: string }> = {
  neutral: { stripe: palette.textSubtle, hint: palette.textSubtle, gradStart: '#ffffff', gradEnd: '#f6f8fb', bubble: '#eef2f6', glyph: '●', label: palette.textSubtle },
  positive: { stripe: palette.success, hint: palette.success, gradStart: '#ffffff', gradEnd: '#ecfdf5', bubble: '#d1fae5', glyph: I18nManager.isRTL ? '↖' : '↗', label: palette.textSubtle },
  warning: { stripe: palette.warning, hint: palette.warning, gradStart: '#ffffff', gradEnd: '#fffbeb', bubble: '#fde68a', glyph: '!', label: palette.textSubtle },
  danger: { stripe: palette.danger, hint: palette.danger, gradStart: '#ffffff', gradEnd: '#fef2f2', bubble: '#fecaca', glyph: '!', label: palette.textSubtle },
  accent: { stripe: palette.accent, hint: palette.accent, gradStart: '#ffffff', gradEnd: '#eef2ff', bubble: '#e0e7ff', glyph: '★', label: palette.textSubtle },
};

const statStyles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadow,
  },
  toneStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  iconBubble: {
    position: 'absolute',
    top: 14,
    end: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 14, fontWeight: '800' },
  value: { marginTop: spacing.xs, fontSize: 24, fontWeight: '700' },
});

export function Pill({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'accent' | 'info';
  style?: StyleProp<ViewStyle>;
}) {
  const t = pillTones[tone];
  return (
    <View style={[pillStyles.pill, { backgroundColor: t.bg }, style]}>
      <Text style={[pillStyles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const pillTones: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: palette.surfaceMuted, fg: palette.textMuted },
  positive: { bg: palette.successSoft, fg: palette.success },
  warning: { bg: palette.warningSoft, fg: palette.warning },
  danger: { bg: palette.dangerSoft, fg: palette.danger },
  accent: { bg: palette.accentSoft, fg: palette.accent },
  info: { bg: palette.infoSoft, fg: palette.info },
};

const pillStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
});

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[buttonStyles.base, { backgroundColor: v.bg, borderColor: v.border }, (disabled || loading) && buttonStyles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[buttonStyles.label, { color: v.fg }, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const buttonVariants: Record<string, { bg: string; fg: string; border: string }> = {
  primary: { bg: palette.accent, fg: palette.accentText, border: palette.accent },
  secondary: { bg: palette.surface, fg: palette.text, border: palette.border },
  ghost: { bg: 'transparent', fg: palette.accent, border: 'transparent' },
  danger: { bg: palette.danger, fg: palette.textInverse, border: palette.danger },
};

const buttonStyles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  disabled: { opacity: 0.55 },
  label: { fontSize: 15, fontWeight: '600' },
});

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={segmentedStyles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.85}
            style={[segmentedStyles.btn, active && segmentedStyles.btnActive]}
          >
            <Text style={[segmentedStyles.label, active && segmentedStyles.labelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const segmentedStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md,
    padding: 3,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radii.sm,
  },
  btnActive: {
    backgroundColor: palette.surface,
    ...shadow,
  },
  label: { color: palette.textMuted, fontSize: 13, fontWeight: '500' },
  labelActive: { color: palette.text, fontWeight: '600' },
});

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: palette.accent, fontWeight: '700', fontSize: size * 0.4 }}>{initials}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body?: string;
  icon?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={emptyStyles.container}>
      {icon ? <Text style={emptyStyles.icon}>{icon}</Text> : null}
      <Text style={emptyStyles.title}>{title}</Text>
      {body ? <Text style={emptyStyles.body}>{body}</Text> : null}
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant="secondary" style={emptyStyles.btn} />
      ) : null}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  icon: { fontSize: 32, marginBottom: spacing.sm },
  title: { ...type.heading, marginBottom: spacing.xs },
  body: { ...type.small, textAlign: 'center', maxWidth: 260 },
  btn: { marginTop: spacing.lg, minWidth: 160 },
});

export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={sectionStyles.row}>
      <Text style={type.heading}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress}>
          <Text style={sectionStyles.link}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  link: { color: palette.accent, fontSize: 13, fontWeight: '600' },
});

export function ProgressBar({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'positive' | 'warning' | 'danger' }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const fill = tone === 'positive' ? palette.success : tone === 'warning' ? palette.warning : tone === 'danger' ? palette.danger : palette.accent;
  return (
    <View style={progressStyles.track}>
      <View style={[progressStyles.fill, { width: `${pct * 100}%`, backgroundColor: fill }]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radii.pill },
});

export function IconCircle({ glyph, tone = 'accent', size = 40 }: { glyph: string; tone?: 'accent' | 'positive' | 'warning' | 'danger' | 'neutral'; size?: number }) {
  const map: Record<string, { bg: string; fg: string }> = {
    accent: { bg: palette.accentSoft, fg: palette.accent },
    positive: { bg: palette.successSoft, fg: palette.success },
    warning: { bg: palette.warningSoft, fg: palette.warning },
    danger: { bg: palette.dangerSoft, fg: palette.danger },
    neutral: { bg: palette.surfaceMuted, fg: palette.textMuted },
  };
  const t = map[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.5, color: t.fg }}>{glyph}</Text>
    </View>
  );
}
