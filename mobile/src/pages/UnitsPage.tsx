import { useMemo, useState } from 'react';
import {
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
import { ACTIONS, EMPTY_CAPABILITIES, hasAction } from '../auth/capabilities';
import { palette, radii, shadow, spacing, type, textStart } from '../components/theme';
import { Button, Card, Pill, SectionHeader } from '../components/ui';
import { BottomSheet } from '../components/BottomSheet';
import { effectiveMonthlyDue, fmtMoney, type MockUnit } from '../mocks/fixtures';
import { useMockStore } from '../mocks/store';
import type { AppStackParamList } from '../navigation/types';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

type Filter = 'all' | 'occupied' | 'vacant' | 'under_construction';

const statusTone: Record<MockUnit['occupancyStatus'], 'positive' | 'warning' | 'danger'> = {
  occupied: 'positive',
  vacant: 'warning',
  under_construction: 'danger',
};

const STATUS_KEY: Record<MockUnit['occupancyStatus'], StringKey> = {
  occupied: 'units_status_occupied',
  vacant: 'units_status_vacant',
  under_construction: 'units_status_construction',
};

const FILTER_KEY: Record<Filter, StringKey> = {
  all: 'units_filter_all',
  occupied: 'units_filter_occupied',
  vacant: 'units_filter_vacant',
  under_construction: 'units_filter_construction',
};

export function UnitsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const currency = useCurrency();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { user, building, capabilities: caps } = useAuth();
  const canCreate = hasAction(caps, ACTIONS.UNIT_CREATE);
  const { units, addUnit } = useMockStore();
  const buildingDefault = building?.settings?.defaultMonthlyDues ?? 0;
  const { t, tf } = useI18n();

  const counts = useMemo(
    () => ({
      occupied: units.filter((u) => u.occupancyStatus === 'occupied').length,
      vacant: units.filter((u) => u.occupancyStatus === 'vacant').length,
      under_construction: units.filter((u) => u.occupancyStatus === 'under_construction').length,
    }),
    [units]
  );

  const filtered = filter === 'all' ? units : units.filter((u) => u.occupancyStatus === filter);
  const totalDue = units
    .filter((u) => u.occupancyStatus !== 'under_construction')
    .reduce((s, u) => s + effectiveMonthlyDue(u, buildingDefault), 0);
  const livableUnits = units.length - counts.under_construction;
  const occupancyRate = livableUnits > 0 ? Math.round((counts.occupied / livableUnits) * 100) : 0;

  const pie = [
    { value: counts.occupied, color: palette.success, text: t('units_status_occupied') },
    { value: counts.vacant, color: palette.warning, text: t('units_status_vacant') },
    { value: counts.under_construction, color: palette.danger, text: t('units_status_construction') },
  ].filter((d) => d.value > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('units_occupancy_caps')}</Text>
          <Text style={type.display}>{occupancyRate}%</Text>
          <Text style={type.small}>
            {tf('units_occupancy_summary', {
              occupied: counts.occupied,
              habitable: livableUnits,
              construction: counts.under_construction,
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
            <View style={styles.legend}>
              {pie.map((d) => (
                <View key={d.text} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                  <Text style={type.small}>{d.text} ({d.value})</Text>
                </View>
              ))}
            </View>
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
        {(['all', 'occupied', 'vacant', 'under_construction'] as Filter[]).map((f) => (
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
              <Pill label={t(STATUS_KEY[u.occupancyStatus])} tone={statusTone[u.occupancyStatus]} />
            </View>
            <Text style={[type.small, { marginTop: 4 }]}>
              {tf('units_meta_floor', { floor: u.floor, bedrooms: u.bedrooms })}
            </Text>
            <Text style={type.small}>{u.ownerName ?? t('units_unassigned')}</Text>
            <View style={styles.dueRow}>
              <Text style={type.caption}>{t('units_monthly_caps')}</Text>
              <Text style={[type.body, { fontWeight: '700' }]}>
                {fmtMoney(effectiveMonthlyDue(u, buildingDefault), currency)}
                {u.monthlyDue == null ? <Text style={styles.defaultBadge}>{t('units_default_badge')}</Text> : null}
              </Text>
            </View>
            <Text style={styles.chev}>{t('units_card_view')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: spacing.xl }} />

      <NewUnitModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(input) => {
          addUnit(input);
          setModalOpen(false);
        }}
      />
    </ScrollView>
  );
}

function NewUnitModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: Omit<MockUnit, '_id'>) => void;
}) {
  const { t } = useI18n();
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [monthlyDue, setMonthlyDue] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [status, setStatus] = useState<MockUnit['occupancyStatus']>('vacant');

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
    setOwnerName('');
    setStatus('vacant');
  }

  function submit() {
    if (!valid) return;
    onSubmit({
      number: number.trim(),
      floor: floorN,
      bedrooms: bedroomsN,
      occupancyStatus: status,
      monthlyDue: dueN,
      // empty input ⇒ inherit building default
      ownerName: ownerName.trim() || undefined,
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

          <Text style={modalStyles.label}>{t('new_unit_owner')}</Text>
          <TextInput value={ownerName} onChangeText={setOwnerName} placeholder={t('new_unit_owner_ph')} placeholderTextColor={palette.textSubtle} style={modalStyles.input} autoCapitalize="words" />

          <Text style={modalStyles.label}>{t('new_unit_initial_status')}</Text>
          <View style={modalStyles.chipRow}>
            {(['occupied', 'vacant', 'under_construction'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={[modalStyles.chip, status === s && modalStyles.chipActive]}
                activeOpacity={0.85}
              >
                <Text style={[modalStyles.chipText, status === s && modalStyles.chipTextActive]}>
                  {t(STATUS_KEY[s])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={modalStyles.actions}>
            <Button label={t('cancel')} variant="secondary" onPress={() => { reset(); onClose(); }} style={{ flex: 1 }} />
            <Button label={t('new_unit_add')} onPress={submit} disabled={!valid} style={{ flex: 1 }} />
          </View>
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  statsCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border },
  filterBtnActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  filterText: { fontSize: 12, color: palette.textMuted, textTransform: 'capitalize', fontWeight: '500' },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 12, color: palette.textMuted, textTransform: 'capitalize', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
