import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { api } from '../api/client';
import { Card, EmptyState, Pill } from '../components/ui';
import { ListToolbar } from '../components/ListChrome';
import { ActionFormModal, type BuildingAction } from '../components/ActionFormModal';
import { palette, spacing, type } from '../components/theme';
import { useI18n } from '../i18n';
import type { AppStackParamList } from '../navigation/types';

/**
 * System-admin's per-building "actions" surface (gates, doors, elevators, …).
 * Split out of BuildingDetail into its own screen so the detail page stays
 * focused. Each action carries its own annual price that folds into the
 * building's subscription total.
 */
export function BuildingActionsPage() {
  const route = useRoute<RouteProp<AppStackParamList, 'BuildingActions'>>();
  const { t } = useI18n();
  const buildingId = route.params?.buildingId;
  const currency = route.params?.currency ?? '';

  const [actions, setActions] = useState<BuildingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BuildingAction | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get(`/buildings/${buildingId}/actions`);
      setActions((r.data?.actions ?? []) as BuildingAction[]);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('buildings_err_load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildingId, t]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void fetch();
          }}
        />
      }
    >
      <ListToolbar
        countLabel={`${t('actions_section_title')} · ${actions.length}`}
        onAdd={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        addA11yLabel={t('actions_new')}
      />

      <Text style={[type.small, { marginBottom: spacing.md }]}>{t('actions_section_hint')}</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {actions.length === 0 ? (
        <EmptyState iconName="gate" title={t('actions_empty')} body="" />
      ) : (
        <Card padded={false}>
          {actions.map((a, i) => (
            <TouchableOpacity
              key={a._id}
              activeOpacity={0.85}
              onPress={() => {
                setEditing(a);
                setModalOpen(true);
              }}
              style={[styles.row, i < actions.length - 1 && styles.divider]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={type.small} numberOfLines={1}>
                  {t(`action_type_${a.type}` as const)}
                  {a.annualPrice > 0 ? ` · ${currency} ${a.annualPrice}` : ''}
                </Text>
              </View>
              <Pill
                label={t(a.status === 'active' ? 'action_status_active' : 'action_status_inactive')}
                tone={a.status === 'active' ? 'positive' : 'warning'}
              />
            </TouchableOpacity>
          ))}
        </Card>
      )}

      <ActionFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        buildingId={buildingId ?? ''}
        initial={editing}
        onSaved={(saved) =>
          setActions((prev) => {
            const idx = prev.findIndex((x) => x._id === saved._id);
            if (idx === -1) return [saved, ...prev];
            const next = prev.slice();
            next[idx] = saved;
            return next;
          })
        }
        onDeleted={(id) => setActions((prev) => prev.filter((x) => x._id !== id))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.divider },
  errorBox: {
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
});
