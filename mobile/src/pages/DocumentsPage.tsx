import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth, type Role } from '../auth/AuthContext';
import { palette, radii, shadow, spacing, textStart, type } from '../components/theme';
import { Card, IconCircle, Pill } from '../components/ui';
import { documentsFor, relativeDay, type MockDocument } from '../mocks/fixtures';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const CATEGORY_KEY: Record<MockDocument['category'], StringKey> = {
  lease: 'dcat_lease',
  minutes: 'dcat_minutes',
  bylaws: 'dcat_bylaws',
  invoice: 'dcat_invoice',
  notice: 'dcat_notice',
};

const typeGlyph: Record<MockDocument['type'], { glyph: string; tone: 'danger' | 'positive' | 'warning' | 'accent' }> = {
  pdf: { glyph: '📕', tone: 'danger' },
  image: { glyph: '🖼️', tone: 'accent' },
  spreadsheet: { glyph: '📊', tone: 'positive' },
  doc: { glyph: '📄', tone: 'warning' },
};

export function DocumentsPage() {
  const { user } = useAuth();
  const role = (user?.role ?? 'renter') as Role;
  const [query, setQuery] = useState('');
  const all = useMemo(() => documentsFor(role), [role]);
  const { t, tf } = useI18n();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d) => d.name.toLowerCase().includes(q) || d.category.includes(q));
  }, [all, query]);

  const grouped = useMemo(() => {
    const map: Record<string, MockDocument[]> = {};
    filtered.forEach((d) => {
      map[d.category] = map[d.category] ?? [];
      map[d.category].push(d);
    });
    return Object.entries(map);
  }, [filtered]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={type.caption}>{t('docs_library_caps')}</Text>
      <Text style={type.display}>{tf('docs_files_count', { count: all.length })}</Text>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('docs_search_ph')}
          placeholderTextColor={palette.textSubtle}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {grouped.map(([cat, items]) => (
        <View key={cat} style={{ marginTop: spacing.lg }}>
          <View style={styles.groupHeader}>
            <Text style={type.heading}>{t(CATEGORY_KEY[cat as MockDocument['category']])}</Text>
            <Pill label={`${items.length}`} tone="neutral" />
          </View>
          <Card padded={false}>
            {items.map((d, i) => {
              const meta = typeGlyph[d.type];
              return (
                <View key={d._id}>
                  <View style={styles.row}>
                    <IconCircle glyph={meta.glyph} tone={meta.tone} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{d.name}</Text>
                      <Text style={type.small}>
                        {tf('docs_meta', { size: d.size, by: d.uploadedBy, relative: relativeDay(d.uploadedAt) })}
                      </Text>
                    </View>
                  </View>
                  {i < items.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </Card>
        </View>
      ))}

      {grouped.length === 0 && (
        <Card><Text style={type.small}>{t('docs_none_match')}</Text></Card>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: spacing.md,
    ...shadow,
  },
  searchIcon: { fontSize: 14 },
  search: { flex: 1, paddingVertical: 10, color: palette.text, fontSize: 15, ...textStart },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg },
});
