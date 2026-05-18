import { useLayoutEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { palette, radii, spacing } from './theme';

/**
 * Header-right chip rendered on every screen for building-admin owners.
 * Taps flip between owner view (resident capabilities) and admin view
 * (building-management capabilities). Returns null for users without an
 * admin overlay so it costs nothing for other roles.
 *
 * For navigation headers, prefer `useHeaderViewModeChip()` over passing
 * `<ViewModeChip />` to `headerRight` directly — iOS native-stack
 * reserves a slot for any element returned by `headerRight`, so a
 * component that renders `null` still produces a hollow button frame.
 * The hook calls `navigation.setOptions` so the slot is only created
 * when the chip should actually appear.
 */
export function ViewModeChip() {
  const { canToggleAdminView, viewMode, setViewMode } = useAuth();
  const { t } = useI18n();
  if (!canToggleAdminView) return null;
  const inAdmin = viewMode === 'admin';
  return (
    <Pressable
      onPress={() => setViewMode(inAdmin ? 'owner' : 'admin')}
      hitSlop={8}
      style={[styles.chip, inAdmin ? styles.chipAdmin : styles.chipOwner]}
    >
      <Text style={[styles.text, inAdmin ? styles.textAdmin : styles.textOwner]}>
        {inAdmin ? t('view_mode_admin') : t('view_mode_owner')}
      </Text>
    </Pressable>
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
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginEnd: spacing.sm,
  },
  chipOwner: { backgroundColor: palette.surfaceMuted, borderColor: palette.border },
  chipAdmin: { backgroundColor: palette.accent, borderColor: palette.accent },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  textOwner: { color: palette.textMuted },
  textAdmin: { color: '#fff' },
});
