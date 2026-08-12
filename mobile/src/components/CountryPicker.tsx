import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COUNTRIES, countryName, type Country } from '../data/countries';
import { palette, radii, spacing, type } from './theme';
import { useI18n } from '../i18n';

export function CountryPicker({
  visible,
  selectedIso,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedIso: string;
  onSelect: (c: Country) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        countryName(c, locale).includes(query.trim()) ||
        c.dial.includes(q) ||
        c.iso.toLowerCase().includes(q),
    );
  }, [query, locale]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false} statusBarTranslucent>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={type.title}>{t('country_select_title')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('country_search_placeholder')}
          placeholderTextColor={palette.textSubtle}
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.search}
        />
        <FlatList
          data={data}
          keyExtractor={(c) => c.iso}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, item.iso === selectedIso && styles.rowActive]}
              onPress={() => {
                onSelect(item);
                setQuery('');
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.flag}>{item.flag}</Text>
              <Text style={styles.name}>{countryName(item, locale)}</Text>
              <Text style={styles.dial}>{item.dial}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  close: { fontSize: 20, color: palette.textMuted, paddingHorizontal: 8 },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
    // The country list is a global reference — keep it LTR in any app language.
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    // Force a consistent flag · name · dial order regardless of app direction.
    direction: 'ltr',
  },
  rowActive: { backgroundColor: palette.accentSoft },
  flag: { fontSize: 26 },
  name: { flex: 1, ...type.body, color: palette.text },
  dial: { ...type.body, color: palette.textMuted, fontVariant: ['tabular-nums'] },
});
