import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth, useCurrency } from '../auth/AuthContext';
import { ACTIONS, hasAction } from '../auth/capabilities';
import { palette, radii, shadow, spacing, type, textStart } from '../components/theme';
import { Button, Card, EmptyState, Pill, SectionHeader, Legend } from '../components/ui';
import { BottomSheet } from '../components/BottomSheet';
import { fmtMoney } from '../utils/format';
import { createUnit, listUnits, type Unit } from '../api/units';
import { apiErrorMessage, useApiResource } from '../api/useApiResource';
import type { AppStackParamList } from '../navigation/types';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

type Filter = 'all' | 'occupied' | 'vacant';

const FILTER_KEY: Record<Filter, StringKey> = {
  all: 'units_filter_all',
  occupied: 'units_filter_occupied',
  vacant: 'units_filter_vacant',
};

function isOccupied(u: Unit): boolean {
  return u.occupants.length > 0;
}

function effectiveDue(u: Unit, buildingDefault: number): number {
  return u.monthlyDuesAmount ?? buildingDefault;
}

export function UnitsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const currency = useCurrency();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { building, capabilities: caps } = useAuth();
  const canCreate = hasAction(caps, ACTIONS.UNIT_CREATE);
  const buildingDefault = building?.settings?.defaultMonthlyDues ?? 0;
  const { t, tf } = useI18n();

  const fetcher = useCallback(() => listUnits(), []);
  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    fetcher,
    t('units_err_load')
  );
  const units = useMemo(() => data ?? [], [data]);

  const counts = useMemo(
    () => ({
      occupied: units.filter(isOccupied).length,
      vacant: units.filter((u) => !isOccupied(u)).length,
    }),
    [units]
  );

  const filtered =
    filter === 'all'
      ? units
      : filter === 'occupied'
        ? units.filter(isOccupied)
        : units.filter((u) => !isOccupied(u));
  const totalDue = units.reduce((s, u) => s + effectiveDue(u, buildingDefault), 0);
  const occupancyRate = units.length > 0 ? Math.round((counts.occupied / units.length) * 100) : 0;

  const pie = [
    { value: counts.occupied, color: palette.success, text: t('units_status_occupied') },
    { value: counts.vacant, color: palette.warning, text: t('units_status_vacant') },
  ].filter((d) => d.value > 0);

  async function addUnit(input: {
    number: string;
    floor?: number;
    bedrooms?: number;
    monthlyDuesAmount?: number;
  }) {
    setBusy(true);
    try {
      await createUnit(input);
      setModalOpen(false);
      await reload();
    } catch (e) {
      Alert.alert(apiErrorMessage(e, t('err_generic')));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.center}>
        <EmptyState
          iconName="units"
          title={t('units_err_load')}
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
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('units_occupancy_caps')}</Text>
          <Text style={type.display}>{occupancyRate}%</Text>
          <Text style={type.small}>
            {tf('units_occupancy_summary', {
              occupied: counts.occupied,
              habitable: units.length,
            })}
          </Text>
        </View>
        {canCreate && (
          <Button label={t('new_unit')} variant="primary" onPress={() => setModalOpen(true)} style={{ paddingHorizontal: 14 }} />
        )}
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.statsCardRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.caption}>{t('units_potential_mrr')}</Text>
            <Text style={type.title}>{fmtMoney(totalDue, currency)}</Text>
            <Legend items={pie.map((d) => ({ color: d.color, label: `${d.text} (${d.value})` }))} />
          </View>
          {pie.length > 0 && (
            <PieChart
              donut
              data={pie}
              radius={48}
              innerRadius={28}
              innerCircleColor={palette.surface}
            />
          )}
        </View>
      </Card>

      <SectionHeader title={t('units_section_all')} />
      <View style={styles.filterRow}>
        {(['all', 'occupied', 'vacant'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {t(FILTER_KEY[f])}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <EmptyState iconName="units" title={t('units_empty')} body={t('payments_empty_default_body')} />
      ) : (
        <View style={styles.grid}>
          {filtered.map((u) => (
            <TouchableOpacity
              key={u._id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('UnitDetail', { unitNumber: u.number })}
            >
              <View style={styles.cardHead}>
                <Text style={styles.unitNumber}>{u.number}</Text>
                <Pill
                  label={t(isOccupied(u) ? 'units_status_occupied' : 'units_status_vacant')}
                  tone={isOccupied(u) ? 'positive' : 'warning'}
                />
              </View>
              <Text style={[type.small, { marginTop: 4 }]}>
                {tf('units_meta_floor', { floor: u.floor ?? '—', bedrooms: u.bedrooms ?? 0 })}
              </Text>
              <Text style={type.small}>
                {u.ownerId ? t('role_owner') : t('units_unassigned')}
              </Text>
              <View style={styles.dueRow}>
                <Text style={type.caption}>{t('units_monthly_caps')}</Text>
                <Text style={[type.body, { fontWeight: '700' }]}>
                  {fmtMoney(effectiveDue(u, buildingDefault), currency)}
                  {u.monthlyDuesAmount == null ? <Text style={styles.defaultBadge}>{t('units_default_badge')}</Text> : null}
                </Text>
              </View>
              <Text style={styles.chev}>{t('units_card_view')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ height: spacing.xl }} />

      <NewUnitModal open={modalOpen} busy={busy} onClose={() => setModalOpen(false)} onSubmit={(input) => void addUnit(input)} />
    </ScrollView>
  );
}

function NewUnitModal({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: { number: string; floor?: number; bedrooms?: number; monthlyDuesAmount?: number }) => void;
}) {
  const { t } = useI18n();
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [monthlyDue, setMonthlyDue] = useState('');

  const floorN = parseInt(floor || '0', 10);
  const bedroomsN = parseInt(bedrooms || '0', 10);
  const dueTrimmed = monthlyDue.trim();
  const dueN = dueTrimmed ? parseFloat(dueTrimmed.replace(/,/g, '')) : null;
  const dueValid = dueN === null || (Number.isFinite(dueN) && dueN >= 0);
  const valid = number.trim().length > 0 && floorN > 0 && bedroomsN >= 0 && dueValid;

  function reset() {
    setNumber('');
    setFloor('');
    setBedrooms('');
    setMonthlyDue('');
  }

  function submit() {
    if (!valid) return;
    onSubmit({
      number: number.trim(),
      floor: floorN,
      bedrooms: bedroomsN,
      // empty input ⇒ inherit building default
      ...(dueN != null ? { monthlyDuesAmount: dueN } : {}),
    });
    reset();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View>
        <Text style={[type.title, { marginBottom: spacing.sm }]}>{t('new_unit_title')}</Text>
        <Text style={[type.small, { marginBottom: spacing.md }]}>{t('new_unit_body')}</Text>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={modalStyles.label}>{t('new_unit_number')}</Text>
            <TextInput value={number} onChangeText={setNumber} placeholder={t('new_unit_number_ph')} placeholderTextColor={palette.textSubtle} style={modalStyles.input} autoCapitalize="characters" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={modalStyles.label}>{t('new_unit_floor')}</Text>
            <TextInput value={floor} onChangeText={setFloor} keyboardType="number-pad" placeholder="9" placeholderTextColor={palette.textSubtle} style={modalStyles.input} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={modalStyles.label}>{t('new_unit_bedrooms')}</Text>
            <TextInput value={bedrooms} onChangeText={setBedrooms} keyboardType="number-pad" placeholder="2" placeholderTextColor={palette.textSubtle} style={modalStyles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={modalStyles.label}>{t('new_unit_dues')}</Text>
            <TextInput value={monthlyDue} onChangeText={setMonthlyDue} keyboardType="decimal-pad" placeholder={t('new_unit_dues_ph')} placeholderTextColor={palette.textSubtle} style={modalStyles.input} />
          </View>
        </View>

        <View style={modalStyles.actions}>
          <Button label={t('cancel')} variant="secondary" onPress={() => { reset(); onClose(); }} style={{ flex: 1 }} />
          <Button label={t('new_unit_add')} onPress={submit} disabled={!valid} loading={busy} style={{ flex: 1 }} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  statsCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border },
  filterBtnActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  filterText: { fontSize: 12, color: palette.textMuted, fontWeight: '500' },
  filterTextActive: { color: '#fff', fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: '48%',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    ...shadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitNumber: { fontSize: 20, fontWeight: '700', color: palette.text },
  dueRow: { marginTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider, paddingTop: spacing.sm },
  chev: { marginTop: spacing.xs, color: palette.accent, fontSize: 12, fontWeight: '600', alignSelf: 'flex-end' },
  defaultBadge: { color: palette.textSubtle, fontSize: 11, fontWeight: '500' },
});

const modalStyles = StyleSheet.create({
  label: { ...type.small, color: palette.textMuted, marginTop: spacing.md, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,    ...textStart,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
