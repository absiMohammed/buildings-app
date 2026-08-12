import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { palette, radii, shadow, spacing, textStart, type } from '../components/theme';
import { Card, EmptyState, IconCircle, Pill } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import {
  deleteDocument,
  documentDownloadUrl,
  listDocuments,
  type BuildingDocument,
  type DocumentCategory,
} from '../api/documents';
import { apiErrorMessage, useApiResource } from '../api/useApiResource';
import { useConfirm } from '../components/ConfirmProvider';
import { relativeDay } from '../utils/format';
import { ActionSheet } from '../components/ActionSheet';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

// Server category set → existing i18n keys (no new keys added). `contract`
// maps onto the lease label and `other` onto the generic "Other" string.
const CATEGORY_KEY: Record<DocumentCategory, StringKey> = {
  bylaws: 'dcat_bylaws',
  meeting_minutes: 'dcat_minutes',
  notice: 'dcat_notice',
  contract: 'dcat_lease',
  other: 'sub_method_other',
};

// Pick an icon/tone from the MIME type (the tone still varies per file family,
// derived from real `mimeType` now that there is no discrete `type` field).
function glyphFor(mime: string): { iconName: IconName; tone: 'danger' | 'positive' | 'warning' | 'accent' } {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return { iconName: 'documents', tone: 'danger' };
  if (m.startsWith('image/')) return { iconName: 'documents', tone: 'accent' };
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) {
    return { iconName: 'documents', tone: 'positive' };
  }
  return { iconName: 'documents', tone: 'warning' };
}

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const { user } = useAuth();
  const { t, tf } = useI18n();
  const { confirm } = useConfirm();
  const [query, setQuery] = useState('');
  const [actionTarget, setActionTarget] = useState<BuildingDocument | null>(null);

  // Delete is admin-only server-side; only surface it to the building/system
  // admin. There is no discrete document-delete capability action.
  const canDelete = user?.role === 'admin' || !!user?.isBuildingAdmin;

  const fetcher = useCallback(() => listDocuments(), []);
  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    fetcher,
    t('docs_err_load'),
  );
  const all = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [all, query]);

  const grouped = useMemo(() => {
    const map: Record<string, BuildingDocument[]> = {};
    filtered.forEach((d) => {
      map[d.category] = map[d.category] ?? [];
      map[d.category].push(d);
    });
    return Object.entries(map) as [DocumentCategory, BuildingDocument[]][];
  }, [filtered]);

  async function removeDocument(d: BuildingDocument) {
    if (!(await confirm({ title: d.title, confirmLabel: t('remove'), destructive: true }))) return;
    try {
      await deleteDocument(d._id);
      await reload();
    } catch (e) {
      await confirm({ title: t('remove'), message: apiErrorMessage(e, t('err_generic')) });
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (error && all.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          iconName="documents"
          title={t('docs_err_load')}
          body={error}
          action={{ label: t('retry'), onPress: () => void refresh() }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <Text style={type.caption}>{t('docs_library_caps')}</Text>
      <Text style={type.display}>{tf('docs_files_count', { count: all.length })}</Text>

      <View style={styles.searchWrap}>
        <Icon name="search" size={16} color={palette.textSubtle} />
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
            <Text style={type.heading}>{t(CATEGORY_KEY[cat])}</Text>
            <Pill label={`${items.length}`} tone="neutral" />
          </View>
          <Card padded={false}>
            {items.map((d, i) => {
              const meta = glyphFor(d.mimeType);
              return (
                <View key={d._id}>
                  <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={() => setActionTarget(d)}>
                    <IconCircle iconName={meta.iconName} tone={meta.tone} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{d.title}</Text>
                      <Text style={type.small}>
                        {tf('docs_meta', {
                          size: formatBytes(d.sizeBytes),
                          by: d.uploadedBy,
                          relative: relativeDay(d.createdAt),
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
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

      <ActionSheet
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.title ?? ''}
        subtitle={actionTarget?.description || undefined}
        items={[
          {
            icon: 'documents' as const,
            label: t('buildings_action_open'),
            onPress: () => {
              if (actionTarget) void Linking.openURL(documentDownloadUrl(actionTarget._id));
            },
          },
          ...(canDelete
            ? [{
                icon: 'trash' as const,
                label: t('remove'),
                tone: 'danger' as const,
                onPress: () => {
                  if (actionTarget) void removeDocument(actionTarget);
                },
              }]
            : []),
        ]}
      />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
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
  search: { flex: 1, paddingVertical: 10, color: palette.text, fontSize: 15, ...textStart },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg },
});
