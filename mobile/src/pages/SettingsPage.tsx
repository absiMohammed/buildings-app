import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth, useCurrency, type BuildingSummary, type Role } from '../auth/AuthContext';
import { api } from '../api/client';
import { apiErrorMessage } from '../api/useApiResource';
import { runMonthlyDues } from '../api/payments';
import { listUnits, type Unit } from '../api/units';
import { getRefreshToken } from '../api/client';
import { setPinForAccount, hasPinForAccount, disablePinForAccount } from '../auth/pin';
import { fmtMoney } from '../utils/format';
import { Avatar, Button, Card, Pill, SectionHeader } from '../components/ui';
import { Icon } from '../components/Icon';
import { PinModal } from '../components/PinModal';
import { useConfirm } from '../components/ConfirmProvider';
import { palette, radii, spacing, type, textStart } from '../components/theme';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const CURRENCY_OPTIONS = [
  { code: 'ILS', labelKey: 'currency_ils' },
  { code: 'USD', labelKey: 'currency_usd' },
  { code: 'EUR', labelKey: 'currency_eur' },
  { code: 'GBP', labelKey: 'currency_gbp' },
  { code: 'JOD', labelKey: 'currency_jod' },
] as const;

const ROLE_KEY: Record<Role, StringKey> = {
  admin: 'role_admin',
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
  independent: 'role_independent',
};

const ROLE_TONE: Record<Role, 'accent' | 'positive' | 'warning' | 'neutral'> = {
  admin: 'accent',
  owner: 'positive',
  renter: 'warning',
  dependent: 'neutral',
  independent: 'neutral',
};

// Notification toggles, scoped per role. Keys match StringKey entries in strings.ts.
const NOTIF_KEYS_BY_ROLE: Record<Role, StringKey[]> = {
  admin: ['settings_notif_overdue', 'settings_notif_tickets', 'settings_notif_polls', 'settings_notif_residents'],
  owner: ['settings_notif_rent', 'settings_notif_overdue', 'settings_notif_maintenance', 'settings_notif_polls'],
  renter: ['settings_notif_payments', 'settings_notif_maintenance', 'settings_notif_polls'],
  dependent: ['settings_notif_polls', 'settings_notif_household'],
  independent: ['settings_notif_maintenance'],
};

export function SettingsPage() {
  const { user, building, updateBuilding, switchBuilding, logout } = useAuth();

  async function doSwitchBuilding(buildingId: string) {
    try {
      await switchBuilding(buildingId);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('buildings_err_load'), message: msg ?? '', confirmLabel: t('done') });
    }
  }
  const currentCurrency = useCurrency();
  const { t, tf, locale, setLocale } = useI18n();
  const { confirm } = useConfirm();
  const role = user?.role ?? 'renter';
  const isAdmin = role === 'admin';

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState(building?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [dayDraft, setDayDraft] = useState(String(building?.settings?.monthlyDuesDay ?? 1));
  const [savingDay, setSavingDay] = useState(false);
  const [amountDraft, setAmountDraft] = useState(String(building?.settings?.defaultMonthlyDues ?? 0));
  const [savingAmount, setSavingAmount] = useState(false);
  const [graceDraft, setGraceDraft] = useState(String(building?.settings?.lateFee?.gracePeriodDays ?? 5));
  const [feeFlatDraft, setFeeFlatDraft] = useState(String(building?.settings?.lateFee?.flatAmount ?? 0));
  const [feePctDraft, setFeePctDraft] = useState(String(building?.settings?.lateFee?.percent ?? 0));
  const [remindDraft, setRemindDraft] = useState(String(building?.settings?.lateFee?.reminderEveryDays ?? 7));
  const [savingLateFee, setSavingLateFee] = useState(false);
  const [generatingDues, setGeneratingDues] = useState(false);
  const [projUnits, setProjUnits] = useState<Unit[]>([]);
  const accessInit = building?.settings?.access;
  const [access, setAccess] = useState({
    gate: { enabled: accessInit?.gate?.enabled ?? true, label: accessInit?.gate?.label ?? '' },
    door: { enabled: accessInit?.door?.enabled ?? true, label: accessInit?.door?.label ?? '' },
    elevator: { enabled: accessInit?.elevator?.enabled ?? false, label: accessInit?.elevator?.label ?? '' },
  });
  const [savingAccess, setSavingAccess] = useState(false);
  const userPhone = user?.phone ?? '';
  const [hasPin, setHasPin] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  useEffect(() => {
    if (!userPhone) return;
    let cancelled = false;
    hasPinForAccount(userPhone).then((v) => !cancelled && setHasPin(v));
    return () => {
      cancelled = true;
    };
  }, [userPhone]);

  async function onSetPin(pin: string) {
    const rt = getRefreshToken();
    if (!userPhone || !rt) {
      setPinModalOpen(false);
      return;
    }
    await setPinForAccount(userPhone, pin, rt);
    setHasPin(true);
    setPinModalOpen(false);
    setSavedAt(Date.now());
  }

  async function removePin() {
    if (!userPhone) return;
    await disablePinForAccount(userPhone);
    setHasPin(false);
  }
  const [latDraft, setLatDraft] = useState(
    building?.settings?.geoCenter?.lat == null ? '' : String(building.settings.geoCenter.lat)
  );
  const [lngDraft, setLngDraft] = useState(
    building?.settings?.geoCenter?.lng == null ? '' : String(building.settings.geoCenter.lng)
  );
  const [savingGeo, setSavingGeo] = useState(false);

  // Local-only notification toggles (demo). Keyed by translation string key.
  const notifKeys = NOTIF_KEYS_BY_ROLE[role];
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(notifKeys.map((k) => [k, true]))
  );

  useEffect(() => {
    setNameDraft(building?.name ?? '');
  }, [building?.name]);

  useEffect(() => {
    setDayDraft(String(building?.settings?.monthlyDuesDay ?? 1));
  }, [building?.settings?.monthlyDuesDay]);

  useEffect(() => {
    setAmountDraft(String(building?.settings?.defaultMonthlyDues ?? 0));
  }, [building?.settings?.defaultMonthlyDues]);

  useEffect(() => {
    setGraceDraft(String(building?.settings?.lateFee?.gracePeriodDays ?? 5));
    setFeeFlatDraft(String(building?.settings?.lateFee?.flatAmount ?? 0));
    setFeePctDraft(String(building?.settings?.lateFee?.percent ?? 0));
    setRemindDraft(String(building?.settings?.lateFee?.reminderEveryDays ?? 7));
  }, [building?.settings?.lateFee]);

  useEffect(() => {
    setLatDraft(
      building?.settings?.geoCenter?.lat == null ? '' : String(building.settings.geoCenter.lat)
    );
    setLngDraft(
      building?.settings?.geoCenter?.lng == null ? '' : String(building.settings.geoCenter.lng)
    );
  }, [building?.settings?.geoCenter?.lat, building?.settings?.geoCenter?.lng]);

  const myUnit = user?.unit ?? null;

  async function saveDefaultAmount() {
    const n = parseFloat(amountDraft.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      setError(t('settings_error_amount_invalid'));
      return;
    }
    if (n === (building?.settings?.defaultMonthlyDues ?? 0)) return;
    setSavingAmount(true);
    setError(null);
    try {
      const r = await api.patch('/buildings/me', { settings: { defaultMonthlyDues: n } });
      updateBuilding(r.data.building as BuildingSummary);
      setSavedAt(Date.now());
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('settings_error_amount_save_failed'));
    } finally {
      setSavingAmount(false);
    }
  }

  async function saveDuesDay() {
    const n = parseInt(dayDraft, 10);
    if (!Number.isFinite(n) || n < 1 || n > 28) {
      setError(t('settings_error_day_invalid'));
      return;
    }
    if (n === building?.settings?.monthlyDuesDay) return;
    setSavingDay(true);
    setError(null);
    try {
      const r = await api.patch('/buildings/me', { settings: { monthlyDuesDay: n } });
      updateBuilding(r.data.building as BuildingSummary);
      setSavedAt(Date.now());
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('settings_error_day_save_failed'));
    } finally {
      setSavingDay(false);
    }
  }

  async function saveLateFee() {
    const grace = parseInt(graceDraft, 10);
    const flat = parseFloat(feeFlatDraft.replace(/,/g, ''));
    const pct = parseFloat(feePctDraft.replace(/,/g, ''));
    const remind = parseInt(remindDraft, 10);
    if (
      !Number.isFinite(grace) || grace < 0 || grace > 60 ||
      !Number.isFinite(flat) || flat < 0 ||
      !Number.isFinite(pct) || pct < 0 || pct > 100 ||
      !Number.isFinite(remind) || remind < 1 || remind > 90
    ) {
      setError(t('settings_late_fee_invalid'));
      return;
    }
    setSavingLateFee(true);
    setError(null);
    try {
      const r = await api.patch('/buildings/me', {
        settings: { lateFee: { gracePeriodDays: grace, flatAmount: flat, percent: pct, reminderEveryDays: remind } },
      });
      updateBuilding(r.data.building as BuildingSummary);
      setSavedAt(Date.now());
    } catch (e) {
      setError(apiErrorMessage(e, t('err_generic')));
    } finally {
      setSavingLateFee(false);
    }
  }

  // Load units (admin only) to project the monthly collection total.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    listUnits()
      .then((u) => !cancelled && setProjUnits(u))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const defaultDue = building?.settings?.defaultMonthlyDues ?? 0;
  const projectedMonthly = projUnits.reduce(
    (sum, u) => sum + (u.monthlyDuesAmount ?? defaultDue),
    0,
  );

  async function saveAccess() {
    setSavingAccess(true);
    setError(null);
    try {
      const r = await api.patch('/buildings/me', { settings: { access } });
      updateBuilding(r.data.building as BuildingSummary);
      setSavedAt(Date.now());
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('settings_access_save_failed'));
    } finally {
      setSavingAccess(false);
    }
  }

  async function generateDuesNow() {
    setGeneratingDues(true);
    setError(null);
    try {
      const count = await runMonthlyDues();
      await confirm({
        title: t('settings_dues_generate_title'),
        message: count > 0 ? tf('settings_dues_generated', { count }) : t('settings_dues_generate_none'),
      });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('settings_dues_generate_failed'));
    } finally {
      setGeneratingDues(false);
    }
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === building?.name) return;
    setSavingName(true);
    setError(null);
    try {
      const r = await api.patch('/buildings/me', { name: trimmed });
      updateBuilding(r.data.building as BuildingSummary);
      setSavedAt(Date.now());
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('settings_error_name_save_failed'));
    } finally {
      setSavingName(false);
    }
  }

  async function saveGeoCenter() {
    const latTrim = latDraft.trim();
    const lngTrim = lngDraft.trim();
    const lat = latTrim === '' ? null : parseFloat(latTrim);
    const lng = lngTrim === '' ? null : parseFloat(lngTrim);
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      setError(t('settings_error_geo_lat_invalid'));
      return;
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      setError(t('settings_error_geo_lng_invalid'));
      return;
    }
    if (
      lat === (building?.settings?.geoCenter?.lat ?? null) &&
      lng === (building?.settings?.geoCenter?.lng ?? null)
    ) {
      return;
    }
    setSavingGeo(true);
    setError(null);
    try {
      const r = await api.patch('/buildings/me', {
        settings: { geoCenter: { lat, lng } },
      });
      updateBuilding(r.data.building as BuildingSummary);
      setSavedAt(Date.now());
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('settings_error_geo_save_failed'));
    } finally {
      setSavingGeo(false);
    }
  }

  async function changeCurrency(code: string) {
    if (code === currentCurrency) return;
    setPending(code);
    setError(null);
    try {
      const r = await api.patch('/buildings/me', { currency: code });
      updateBuilding(r.data.building as BuildingSummary);
      setSavedAt(Date.now());
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('settings_error_currency_save_failed'));
    } finally {
      setPending(null);
    }
  }

  async function confirmSignOut() {
    if (
      await confirm({
        title: t('settings_account_signout'),
        message: t('settings_account_signout_confirm'),
        confirmLabel: t('settings_account_signout'),
        destructive: true,
      })
    ) {
      logout();
    }
  }

  const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.phone || '—';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={type.caption}>{t('settings_title')}</Text>
      <Text style={type.display}>{building?.name ?? '—'}</Text>
      <Text style={type.small}>{t('settings_subtitle')}</Text>

      {/* ── Profile (all roles) ── */}
      <SectionHeader title={t('settings_section_profile')} />
      <Card>
        <View style={styles.profileRow}>
          <Avatar name={fullName} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.body, { fontWeight: '700' }]} numberOfLines={1}>{fullName}</Text>
            <Text style={type.small} numberOfLines={1}>{user?.phone ?? '—'}</Text>
          </View>
          <Pill label={t(ROLE_KEY[role])} tone={ROLE_TONE[role]} />
        </View>
        <View style={styles.divider} />
        <DetailRow label={t('settings_profile_unit')} value={myUnit ? `${myUnit.number}` : t('settings_profile_no_unit')} />
      </Card>

      {/* ── Building switcher (members of more than one building) ── */}
      {(user?.memberships?.length ?? 0) > 1 && (
        <>
          <SectionHeader title={t('settings_section_buildings')} />
          <Card padded={false}>
            {user!.memberships!.map((m, i) => {
              const isActive = m.buildingId === user!.activeBuildingId;
              return (
                <TouchableOpacity
                  key={m.buildingId}
                  disabled={isActive}
                  activeOpacity={0.85}
                  onPress={() => void doSwitchBuilding(m.buildingId)}
                  style={[styles.switchRow, i < user!.memberships!.length - 1 && styles.divider]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{m.buildingName}</Text>
                    <Text style={type.small} numberOfLines={1}>
                      {t(ROLE_KEY[m.role])}
                      {m.isBuildingAdmin ? ` · ${t('users_pill_building_admin')}` : ''}
                    </Text>
                  </View>
                  {isActive ? (
                    <Icon name="check" size={20} color={palette.accent} />
                  ) : (
                    <Icon name="chevronLeft" size={18} color={palette.textSubtle} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Card>
        </>
      )}

      {/* ── Language (all roles) ── */}
      <SectionHeader title={t('settings_section_language')} />
      <Card padded={false}>
        {(['ar', 'en'] as const).map((code, i) => {
          const active = locale === code;
          return (
            <TouchableOpacity
              key={code}
              onPress={() => setLocale(code)}
              activeOpacity={0.85}
              style={[styles.langRow, i === 0 && styles.rowDivider]}
            >
              <Text style={[type.body, { flex: 1 }]}>
                {code === 'ar' ? t('language_arabic') : t('language_english')}
              </Text>
              {active ? <Pill label={t('settings_current')} tone="positive" /> : <Text style={type.small}>{t('settings_set')}</Text>}
            </TouchableOpacity>
          );
        })}
      </Card>

      {/* ── Notifications (per-role) ── */}
      <SectionHeader title={t('settings_section_notifications')} />
      <Card padded={false}>
        {notifKeys.map((k, i) => (
          <View key={k} style={[styles.toggleRow, i < notifKeys.length - 1 && styles.rowDivider]}>
            <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>{t(k)}</Text>
            <Switch
              value={!!notifPrefs[k]}
              onValueChange={(v) => setNotifPrefs((p) => ({ ...p, [k]: v }))}
              trackColor={{ false: palette.surfaceMuted, true: palette.accentSoft }}
              thumbColor={notifPrefs[k] ? palette.accent : palette.textSubtle}
              ios_backgroundColor={palette.surfaceMuted}
            />
          </View>
        ))}
      </Card>

      {/* ── Building admin (admin-only) ── */}
      {isAdmin && (
        <>
          <SectionHeader title={t('settings_admin_section_label')} />

          <Card>
            <Text style={styles.fieldLabel}>{t('settings_display_name')}</Text>
            <View style={styles.nameRow}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder={t('settings_building_name_placeholder')}
                placeholderTextColor={palette.textSubtle}
                style={styles.nameInput}
                maxLength={120}
              />
              <Button
                label={savingName ? t('saving') : t('save')}
                onPress={saveName}
                disabled={savingName || !nameDraft.trim() || nameDraft.trim() === building?.name}
                loading={savingName}
                style={{ paddingHorizontal: 16 }}
              />
            </View>
          </Card>

          <Card>
            <Text style={styles.fieldLabel}>
              {t('settings_default_amount_hint')} ({currentCurrency}).
            </Text>
            <View style={styles.nameRow}>
              <TextInput
                value={amountDraft}
                onChangeText={setAmountDraft}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={palette.textSubtle}
                style={[styles.nameInput, { maxWidth: 140 }]}
              />
              <Button
                label={savingAmount ? t('saving') : t('save')}
                onPress={saveDefaultAmount}
                disabled={savingAmount || amountDraft === String(building?.settings?.defaultMonthlyDues ?? 0)}
                loading={savingAmount}
                style={{ paddingHorizontal: 16 }}
              />
            </View>
            <Text style={[type.small, { marginTop: spacing.sm }]}>
              {t('settings_units_can_override')}
            </Text>
          </Card>

          <Card>
            <Text style={styles.fieldLabel}>{t('settings_dues_day_hint')}</Text>
            <View style={styles.nameRow}>
              <TextInput
                value={dayDraft}
                onChangeText={setDayDraft}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1"
                placeholderTextColor={palette.textSubtle}
                style={[styles.nameInput, { maxWidth: 80 }]}
              />
              <Button
                label={savingDay ? t('saving') : t('save')}
                onPress={saveDuesDay}
                disabled={savingDay || dayDraft === String(building?.settings?.monthlyDuesDay ?? 1)}
                loading={savingDay}
                style={{ paddingHorizontal: 16 }}
              />
            </View>
          </Card>

          <Card>
            <Text style={[type.body, { fontWeight: '700', marginBottom: 4 }]}>
              {t('settings_late_fee_title')}
            </Text>
            <Text style={styles.fieldLabel}>{t('settings_late_fee_hint')}</Text>
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <Text style={type.small}>{t('settings_late_fee_grace')}</Text>
                <TextInput
                  value={graceDraft}
                  onChangeText={setGraceDraft}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.nameInput}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.small}>{t('settings_late_fee_reminder')}</Text>
                <TextInput
                  value={remindDraft}
                  onChangeText={setRemindDraft}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.nameInput}
                />
              </View>
            </View>
            <View style={[styles.nameRow, { marginTop: spacing.sm }]}>
              <View style={{ flex: 1 }}>
                <Text style={type.small}>{t('settings_late_fee_flat')} ({currentCurrency})</Text>
                <TextInput
                  value={feeFlatDraft}
                  onChangeText={setFeeFlatDraft}
                  keyboardType="decimal-pad"
                  style={styles.nameInput}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.small}>{t('settings_late_fee_percent')}</Text>
                <TextInput
                  value={feePctDraft}
                  onChangeText={setFeePctDraft}
                  keyboardType="decimal-pad"
                  style={styles.nameInput}
                />
              </View>
            </View>
            <Button
              label={savingLateFee ? t('saving') : t('save')}
              onPress={saveLateFee}
              loading={savingLateFee}
              style={{ marginTop: spacing.md }}
            />
          </Card>

          <Card>
            <Text style={[type.body, { fontWeight: '700', marginBottom: 4 }]}>
              {t('settings_dues_generate_title')}
            </Text>
            <Text style={styles.fieldLabel}>
              {tf('settings_dues_generate_hint', { day: building?.settings?.monthlyDuesDay ?? 1 })}
            </Text>
            {projUnits.length > 0 ? (
              <Text style={[type.small, { marginTop: spacing.sm }]}>
                {tf('settings_dues_projected', {
                  amount: fmtMoney(projectedMonthly, currentCurrency),
                  units: projUnits.length,
                })}
              </Text>
            ) : null}
            <Button
              label={t('settings_dues_generate_btn')}
              onPress={generateDuesNow}
              loading={generatingDues}
              disabled={generatingDues}
              variant="secondary"
              style={{ marginTop: spacing.md }}
            />
          </Card>

          <SectionHeader title={t('settings_section_access')} />
          <Card>
            <Text style={styles.fieldLabel}>{t('settings_access_hint')}</Text>
            {(['gate', 'door', 'elevator'] as const).map((key) => (
              <View key={key} style={styles.accessRow}>
                <View style={styles.accessHead}>
                  <Text style={[type.body, { fontWeight: '600' }]}>
                    {t(key === 'gate' ? 'settings_access_gate' : key === 'door' ? 'settings_access_door' : 'settings_access_elevator')}
                  </Text>
                  <Switch
                    value={access[key].enabled}
                    onValueChange={(v) => setAccess((a) => ({ ...a, [key]: { ...a[key], enabled: v } }))}
                  />
                </View>
                <TextInput
                  value={access[key].label}
                  onChangeText={(v) => setAccess((a) => ({ ...a, [key]: { ...a[key], label: v } }))}
                  placeholder={t('settings_access_label_ph')}
                  placeholderTextColor={palette.textSubtle}
                  maxLength={60}
                  style={styles.nameInput}
                />
              </View>
            ))}
            <Button
              label={savingAccess ? t('saving') : t('save')}
              onPress={saveAccess}
              loading={savingAccess}
              disabled={savingAccess}
              style={{ marginTop: spacing.md }}
            />
          </Card>

          <SectionHeader title={t('settings_section_geo_center')} />
          <Card>
            <Text style={styles.fieldLabel}>{t('settings_geo_center_hint')}</Text>
            <View style={styles.geoRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.geoLabel}>{t('settings_geo_lat_label')}</Text>
                <TextInput
                  value={latDraft}
                  onChangeText={setLatDraft}
                  keyboardType="numeric"
                  placeholder={t('settings_geo_lat_ph')}
                  placeholderTextColor={palette.textSubtle}
                  style={styles.nameInput}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.geoLabel}>{t('settings_geo_lng_label')}</Text>
                <TextInput
                  value={lngDraft}
                  onChangeText={setLngDraft}
                  keyboardType="numeric"
                  placeholder={t('settings_geo_lng_ph')}
                  placeholderTextColor={palette.textSubtle}
                  style={styles.nameInput}
                />
              </View>
            </View>
            <View style={{ alignItems: 'flex-start', marginTop: spacing.sm }}>
              <Button
                label={savingGeo ? t('saving') : t('save')}
                onPress={saveGeoCenter}
                disabled={
                  savingGeo ||
                  (latDraft.trim() ===
                    (building?.settings?.geoCenter?.lat == null
                      ? ''
                      : String(building.settings.geoCenter.lat)) &&
                    lngDraft.trim() ===
                      (building?.settings?.geoCenter?.lng == null
                        ? ''
                        : String(building.settings.geoCenter.lng)))
                }
                loading={savingGeo}
                style={{ paddingHorizontal: 16 }}
              />
            </View>
          </Card>

          <SectionHeader title={t('settings_section_currency')} />
          <Card padded={false}>
            {CURRENCY_OPTIONS.map((opt, i) => {
              const active = opt.code === currentCurrency;
              const loading = pending === opt.code;
              return (
                <TouchableOpacity
                  key={opt.code}
                  onPress={() => changeCurrency(opt.code)}
                  disabled={!!pending}
                  activeOpacity={0.85}
                  style={[styles.row, i < CURRENCY_OPTIONS.length - 1 && styles.rowDivider]}
                >
                  <Text style={[type.body, { flex: 1 }]}>{t(opt.labelKey)}</Text>
                  {active ? <Pill label={t('settings_current')} tone="positive" /> : loading ? <Text style={type.small}>{t('saving')}</Text> : <Text style={type.small}>{t('settings_set')}</Text>}
                </TouchableOpacity>
              );
            })}
          </Card>
        </>
      )}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {savedAt ? (
        <View style={styles.savedBanner}>
          <Text style={styles.savedText}>{t('settings_saved')}</Text>
        </View>
      ) : null}

      {/* ── Quick sign-in PIN (building users only; never the super-admin) ── */}
      {userPhone && !isAdmin ? (
        <>
          <SectionHeader title={t('settings_pin_title')} />
          <Card>
            <Text style={styles.fieldLabel}>{hasPin ? t('settings_pin_on') : t('settings_pin_hint')}</Text>
            <View style={styles.nameRow}>
              <Button
                label={hasPin ? t('settings_pin_change') : t('settings_pin_set')}
                onPress={() => setPinModalOpen(true)}
                style={{ paddingHorizontal: 16 }}
              />
              {hasPin ? (
                <Button
                  label={t('settings_pin_remove')}
                  onPress={removePin}
                  variant="secondary"
                  style={{ paddingHorizontal: 16 }}
                />
              ) : null}
            </View>
          </Card>
        </>
      ) : null}

      {/* ── About (all roles, read-only) ── */}
      <SectionHeader title={t('settings_section_about')} />
      <Card>
        <DetailRow label={t('settings_about_building_name')} value={building?.name ?? '—'} />
        <DetailRow label={t('settings_about_currency')} value={currentCurrency} />
        <DetailRow label={t('settings_about_dues_day')} value={String(building?.settings?.monthlyDuesDay ?? '—')} />
        <DetailRow label={t('settings_about_timezone')} value={building?.settings?.timezone ?? '—'} />
      </Card>

      {/* ── Account (all roles) ── */}
      <SectionHeader title={t('settings_section_account')} />
      <Card>
        <Button
          label={t('settings_account_signout')}
          variant="danger"
          onPress={() => void confirmSignOut()}
        />
      </Card>

      <View style={{ height: spacing.xl }} />

      <PinModal
        visible={pinModalOpen}
        mode="set"
        title={t('settings_pin_title')}
        onSubmit={onSetPin}
        onClose={() => setPinModalOpen(false)}
      />
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[type.small, { flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { fontWeight: '500' }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.divider },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginVertical: spacing.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.md },
  errorBanner: { marginTop: spacing.md, padding: spacing.md, backgroundColor: palette.dangerSoft, borderRadius: radii.md },
  errorText: { color: palette.danger, fontSize: 13 },
  savedBanner: { marginTop: spacing.md, padding: spacing.md, backgroundColor: palette.successSoft, borderRadius: radii.md },
  savedText: { color: palette.success, fontSize: 13, fontWeight: '600' },
  fieldLabel: { ...type.small, color: palette.textMuted, marginBottom: 6 },
  accessRow: { marginTop: spacing.md, gap: 6 },
  accessHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  geoRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  geoLabel: { ...type.small, color: palette.textMuted, marginBottom: 4 },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
    ...textStart,
  },
});
