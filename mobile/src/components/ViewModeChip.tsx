import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth, type ViewMode } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { palette, radii, shadow } from './theme';
import { Icon, type IconName } from './Icon';

/**
 * Segmented owner/admin view switcher rendered for building-admin owners.
 * Both modes are always visible (icon + label) with an animated thumb that
 * springs to the active side — so it reads as a switch, not a status badge.
 *
 * `variant="onDark"` renders a glassy style for gradient/hero surfaces;
 * the default suits plain (light) navigation headers.
 *
 * For navigation headers, prefer `useHeaderViewModeChip()` over passing
 * `<ViewModeChip />` to `headerRight` directly — iOS native-stack reserves
 * a slot for any element returned by `headerRight`, so a component that
 * renders `null` still produces a hollow button frame.
 */

const SEGMENTS: { mode: ViewMode; icon: IconName }[] = [
  { mode: 'owner', icon: 'home' },
  { mode: 'admin', icon: 'shieldCheck' },
];

const PAD = 3; // inner padding around the thumb

export function ViewModeChip({ variant = 'onLight' }: { variant?: 'onLight' | 'onDark' }) {
  const { canToggleAdminView, viewMode, setViewMode } = useAuth();
  const { t } = useI18n();
  const [segWidth, setSegWidth] = useState(0);
  const activeIndex = SEGMENTS.findIndex((s) => s.mode === viewMode);
  const anim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: activeIndex,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  }, [activeIndex, anim]);

  if (!canToggleAdminView) return null;

  const dark = variant === 'onDark';
  const inAdmin = viewMode === 'admin';
  // The thumb is absolutely positioned at the logical start; translateX is a
  // physical offset, so flip its direction under RTL.
  const dir = I18nManager.isRTL ? -1 : 1;
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segWidth * dir],
  });

  return (
    <View style={[styles.track, dark ? styles.trackDark : styles.trackLight]}>
      {segWidth > 0 && (
        <Animated.View
          style={[
            styles.thumb,
            { width: segWidth, transform: [{ translateX }] },
            inAdmin ? styles.thumbAdmin : styles.thumbOwner,
          ]}
        />
      )}
      {SEGMENTS.map((seg) => {
        const active = seg.mode === viewMode;
        const color = active
          ? seg.mode === 'admin' ? '#fff' : palette.accent
          : dark ? 'rgba(255,255,255,0.85)' : palette.textSubtle;
        return (
          <Pressable
            key={seg.mode}
            onPress={() => setViewMode(seg.mode)}
            hitSlop={6}
            style={styles.segment}
            onLayout={(e) => setSegWidth(e.nativeEvent.layout.width)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Icon name={seg.icon} size={13} color={color} strokeWidth={2.6} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {seg.mode === 'admin' ? t('view_mode_admin_short') : t('view_mode_owner_short')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Hook variant: call this once at the top of any screen that wants the
 * view-mode chip on its navigation header. It uses `setOptions` so the
 * `headerRight` slot is only created for users who can actually toggle —
 * other roles get no slot (no empty native button frame).
 */
export function useHeaderViewModeChip(): void {
  const navigation = useNavigation();
  const { canToggleAdminView } = useAuth();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canToggleAdminView ? () => <ViewModeChip /> : undefined,
    });
  }, [navigation, canToggleAdminView]);
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    padding: PAD,
    borderWidth: 1,
  },
  trackLight: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
  },
  trackDark: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.30)',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    zIndex: 1,
  },
  thumb: {
    position: 'absolute',
    start: PAD,
    top: PAD,
    bottom: PAD,
    borderRadius: radii.pill,
    ...shadow,
  },
  thumbOwner: { backgroundColor: '#ffffff' },
  thumbAdmin: { backgroundColor: palette.accent },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
});
