import { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { palette, radii, shadow, spacing, textStart, type } from './theme';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';

export interface UnitFilterPickerProps {
  units: string[];
  value: string; // 'all' or unit number
  onChange: (value: string) => void;
  // Optional counts displayed next to each unit (e.g. # of open payments per unit).
  counts?: Record<string, number>;
}

export function UnitFilterPicker({ units, value, onChange, counts }: UnitFilterPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { t, tf } = useI18n();

  const sorted = useMemo(() => [...units].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [units]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((u) => u.toLowerCase().includes(q));
  }, [sorted, query]);

  const label = value === 'all' ? t('unit_filter_all') : tf('unit_filter_unit_prefix', { n: value });

  return (
    <>
      <View style={styles.row}>
        <Text style={styles.fieldLabel}>{t('unit_filter_label')}</Text>
        <TouchableOpacity
          onPress={() => {
            setQuery('');
            setOpen(true);
          }}
          activeOpacity={0.85}
          style={styles.pill}
        >
          <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
          <Text style={styles.pillChev}>▾</Text>
        </TouchableOpacity>
        {value !== 'all' && (
          <TouchableOpacity onPress={() => onChange('all')} hitSlop={8} style={styles.clearBtn}>
            <Text style={styles.clearText}>{t('clear')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <View>
            <Text style={[type.title, { marginBottom: spacing.xs }]}>{t('unit_filter_title')}</Text>
            <Text style={[type.small, { marginBottom: spacing.md }]}>
              {sorted.length === 1
                ? t('unit_filter_subtitle_one')
                : tf('unit_filter_subtitle_many', { count: sorted.length })}
            </Text>

            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('unit_filter_search')}
                placeholderTextColor={palette.textSubtle}
                style={styles.search}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={6}>
                  <Text style={styles.clearInner}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={() => {
                onChange('all');
                setOpen(false);
              }}
              style={[styles.allRow, value === 'all' && styles.activeRow]}
              activeOpacity={0.85}
            >
              <Text style={styles.allLabel}>{t('unit_filter_all')}</Text>
              {value === 'all' && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            <FlatList
              data={filtered}
              keyExtractor={(u) => u}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={{ paddingBottom: spacing.md }}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
              ListEmptyComponent={
                <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                  <Text style={type.small}>{t('unit_filter_no_match')}</Text>
                </View>
              }
              renderItem={({ item }) => {
                const active = item === value;
                const count = counts?.[item];
                return (
                  <TouchableOpacity
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    style={[styles.itemRow, active && styles.activeRow]}
                    activeOpacity={0.85}
                  >
                    <View style={styles.itemAvatar}>
                      <Text style={styles.itemAvatarText}>{item}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemLabel}>{tf('unit_filter_unit_prefix', { n: item })}</Text>
                      {count !== undefined && (
                        <Text style={type.small}>
                          {count === 1 ? t('unit_filter_count_one') : tf('unit_filter_count_many', { count })}
                        </Text>
                      )}
                    </View>
                    {active && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  fieldLabel: { fontSize: 11, color: palette.textSubtle, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexShrink: 1,
    ...shadow,
  },
  pillText: { fontSize: 14, color: palette.text, fontWeight: '600' },
  pillChev: { color: palette.textSubtle, fontSize: 14 },
  clearBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  clearText: { color: palette.accent, fontSize: 13, fontWeight: '600' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchIcon: { fontSize: 14 },
  search: { flex: 1, paddingVertical: 10, color: palette.text, fontSize: 15, ...textStart },
  clearInner: { color: palette.textSubtle, fontSize: 16, paddingHorizontal: 4 },

  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: palette.surfaceMuted,
  },
  allLabel: { fontSize: 15, color: palette.text, fontWeight: '700' },

  list: { maxHeight: 360, marginTop: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  activeRow: { backgroundColor: palette.accentSoft },
  itemAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemAvatarText: { color: palette.text, fontSize: 12, fontWeight: '700' },
  itemLabel: { fontSize: 14, color: palette.text, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.md },
  checkmark: { color: palette.accent, fontSize: 18, fontWeight: '900' },
});
