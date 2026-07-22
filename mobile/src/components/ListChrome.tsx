import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { BottomSheet } from './BottomSheet';
import { palette, radii, spacing, textStart, type } from './theme';

/**
 * Shared chrome for admin "list" screens (buildings, users, units, …). Gives
 * every list the same architecture: a compact toolbar (count + icon actions),
 * an optional search field, a multi-criteria filter bottom sheet, and a
 * consistent action-sheet menu item. Keeping these here means one place to
 * evolve the look and every screen stays in lock-step.
 */

// ---------------------------------------------------------------------------
// Toolbar — count label on the start side, icon buttons on the end side.
// ---------------------------------------------------------------------------
export function ListToolbar({
  countLabel,
  onFilter,
  filterActive,
  onAdd,
  addA11yLabel,
  onSearch,
  searchActive,
}: {
  countLabel: string;
  onFilter?: () => void;
  filterActive?: boolean;
  onAdd?: () => void;
  addA11yLabel?: string;
  onSearch?: () => void;
  searchActive?: boolean;
}) {
  return (
    <View style={styles.toolbar}>
      <Text style={styles.toolbarCount} numberOfLines={1}>
        {countLabel}
      </Text>
      <View style={styles.toolbarActions}>
        {onSearch && (
          <TouchableOpacity
            onPress={onSearch}
            hitSlop={8}
            style={[styles.iconBtn, searchActive && styles.iconBtnActive]}
            accessibilityRole="button"
          >
            <Icon name="search" size={20} color={searchActive ? palette.accent : palette.text} />
          </TouchableOpacity>
        )}
        {onFilter && (
          <TouchableOpacity
            onPress={onFilter}
            hitSlop={8}
            style={[styles.iconBtn, filterActive && styles.iconBtnActive]}
            accessibilityRole="button"
          >
            <Icon name="filter" size={20} color={filterActive ? palette.accent : palette.text} />
            {filterActive && <View style={styles.dot} />}
          </TouchableOpacity>
        )}
        {onAdd && (
          <TouchableOpacity
            onPress={onAdd}
            hitSlop={8}
            style={styles.iconBtnPrimary}
            accessibilityRole="button"
            accessibilityLabel={addA11yLabel}
          >
            <Icon name="add" size={20} color={palette.accentText} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Search field.
// ---------------------------------------------------------------------------
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.searchWrap}>
      <Icon name="search" size={16} color={palette.textSubtle} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textSubtle}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Filter sheet — N single-select criteria groups. Selection is a plain
// { groupId: optionValue } map; a group with no entry defaults to its first
// option (conventionally an "all" option). Extend a screen's filters by
// handing this component another group — no layout work per screen.
// ---------------------------------------------------------------------------
export type FilterOption = { value: string; label: string; count?: number };
export type FilterGroup = { id: string; title: string; options: FilterOption[] };
export type FilterValue = Record<string, string>;

/** True when any group is set to something other than its first option. */
export function isFilterActive(groups: FilterGroup[], value: FilterValue): boolean {
  return groups.some((g) => {
    const selected = value[g.id] ?? g.options[0]?.value;
    return selected !== g.options[0]?.value;
  });
}

export function FilterSheet({
  open,
  onClose,
  title,
  groups,
  value,
  onChange,
  onClear,
  clearLabel,
  doneLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  groups: FilterGroup[];
  value: FilterValue;
  onChange: (groupId: string, optionValue: string) => void;
  onClear: () => void;
  clearLabel: string;
  doneLabel: string;
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.sheetTitle}>{title}</Text>
      {groups.map((g) => (
        <View key={g.id} style={styles.group}>
          <Text style={styles.groupTitle}>{g.title}</Text>
          <View style={styles.chipRow}>
            {g.options.map((o) => {
              const active = (value[g.id] ?? g.options[0]?.value) === o.value;
              return (
                <TouchableOpacity
                  key={o.value}
                  onPress={() => onChange(g.id, o.value)}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {o.label}
                    {o.count != null ? ` · ${o.count}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.sheetActions}>
        <TouchableOpacity style={styles.clearBtn} onPress={onClear} activeOpacity={0.7}>
          <Text style={styles.clearText}>{clearLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.doneText}>{doneLabel}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Action-sheet menu item — icon + label, left-aligned, tone-colored.
// ---------------------------------------------------------------------------
export function SheetMenuItem({
  icon,
  label,
  onPress,
  tone = 'neutral',
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'warning' | 'danger' | 'muted';
}) {
  const color =
    tone === 'danger'
      ? palette.danger
      : tone === 'warning'
        ? palette.warning
        : tone === 'muted'
          ? palette.textMuted
          : palette.text;
  return (
    <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={onPress}>
      {icon ? <Icon name={icon} size={20} color={color} /> : null}
      <Text style={[styles.menuLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Title + subtitle header commonly shown at the top of an action sheet. */
export function SheetHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sheetHeader}>
      <Text style={type.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={type.small} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  toolbarCount: { ...type.small, color: palette.textMuted, fontWeight: '700', flex: 1 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  iconBtnActive: { backgroundColor: palette.accentSoft },
  iconBtnPrimary: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
  },
  dot: {
    position: 'absolute',
    top: 6,
    end: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accent,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.md,
  },
  search: { flex: 1, paddingVertical: 10, color: palette.text, fontSize: 15, ...textStart },

  sheetTitle: { ...type.title, textAlign: 'center', marginBottom: spacing.md },
  group: { marginBottom: spacing.md },
  groupTitle: {
    ...type.caption,
    color: palette.textSubtle,
    marginBottom: spacing.sm,
    ...textStart,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 13, color: palette.textMuted, fontWeight: '500' },
  chipTextActive: { color: palette.accentText, fontWeight: '600' },

  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  clearBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: radii.md },
  clearText: { ...type.body, color: palette.textMuted, fontWeight: '600' },
  doneBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: palette.accent,
  },
  doneText: { ...type.body, color: palette.accentText, fontWeight: '700' },

  sheetHeader: { marginBottom: spacing.sm, gap: 2 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.divider,
  },
  menuLabel: { ...type.body, fontWeight: '600' },
});
