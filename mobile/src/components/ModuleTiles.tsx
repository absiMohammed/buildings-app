import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from './Icon';
import { palette, shadow, spacing } from './theme';
import { TONE_GRADIENTS, type ModuleEntry } from '../navigation/moduleRegistry';
import { useI18n } from '../i18n';

const GRID_COLS = 3;
const GRID_GAP = 10;

/**
 * Fixed 3-column grid of module tiles (gradient icon chip, label, colored
 * stripe) — the app's section launcher, rendered inside the "More" sheet.
 * Pixel-exact tile widths: percentage widths plus `gap` overflow the row by
 * a fraction of a point and wrap to 2 ragged columns.
 *
 * `containerPadding` = the horizontal padding of whatever wraps the grid
 * (screen or sheet), so the math stays exact in both.
 */
export function ModulesGrid({
  modules,
  onPress,
  activeRoute,
  containerPadding = spacing.lg * 2,
}: {
  modules: ModuleEntry[];
  onPress: (m: ModuleEntry) => void;
  activeRoute?: string;
  containerPadding?: number;
}) {
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - containerPadding - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
  return (
    <View style={styles.grid}>
      {modules.map((m) => (
        <ModuleTile
          key={m.capability}
          module={m}
          width={tileWidth}
          active={activeRoute === m.route}
          onPress={() => onPress(m)}
        />
      ))}
    </View>
  );
}

function ModuleTile({
  module,
  width,
  active,
  onPress,
}: {
  module: ModuleEntry;
  width: number;
  active?: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const gradient = TONE_GRADIENTS[module.tone];
  return (
    <TouchableOpacity
      style={[styles.tile, { width }, active && styles.tileActive]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.icon}
      >
        <Icon name={module.icon} size={24} color="#fff" strokeWidth={2.2} />
      </LinearGradient>
      <Text style={styles.label} numberOfLines={1}>{t(module.labelKey)}</Text>
      <View style={[styles.stripe, { backgroundColor: gradient[1] }]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  tile: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: 6,
    alignItems: 'center',
    overflow: 'hidden',
    ...shadow,
  },
  tileActive: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12.5, color: palette.text, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  stripe: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 14,
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    opacity: 0.8,
  },
});
