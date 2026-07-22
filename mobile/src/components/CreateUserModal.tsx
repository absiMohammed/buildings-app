import { useEffect, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';
import { createSystemAdmin } from '../api/users';
import { CountryPicker } from './CountryPicker';
import { Icon } from './Icon';
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from '../data/countries';
import { palette, radii, spacing, type, textStart } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const digitsOnly = (s: string) => s.replace(/[^0-9]/g, '');

type BuildingRole = 'owner' | 'renter' | 'dependent' | 'independent';
const BUILDING_ROLES: BuildingRole[] = ['owner', 'renter', 'dependent', 'independent'];

const ROLE_KEY: Record<BuildingRole, StringKey> = {
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
  independent: 'role_independent',
};

interface BuildingLite {
  _id: string;
  name: string;
}

interface UnitLite {
  _id: string;
  number: string;
}

/** One building assignment being drafted: a building + role + its units. */
interface DraftMembership {
  buildingId: string | null;
  role: BuildingRole;
  unitIds: string[];
  isBuildingAdmin: boolean;
}

/** An existing user to edit (system-admin full edit). */
export interface EditUserInput {
  _id: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  memberships: { buildingId: string; role: BuildingRole; unitIds: string[]; isBuildingAdmin: boolean }[];
}

export interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** When set, the user is created for THIS building only (locked, single
   *  building). Without it the modal offers the full multi-building editor. */
  building?: BuildingLite;
  /** When set, the user is created for THIS unit within the locked building. */
  lockedUnit?: UnitLite;
  /** When set, the modal edits this existing user instead of creating one. */
  editUser?: EditUserInput;
}

function blankDraft(): DraftMembership {
  return { buildingId: null, role: 'owner', unitIds: [], isBuildingAdmin: false };
}

/** Split an E.164 phone into (country, national) using the longest dial match. */
function parsePhone(e164: string): { country: Country; national: string } {
  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => e164.startsWith(c.dial));
  if (match) return { country: match, national: e164.slice(match.dial.length) };
  return { country: DEFAULT_COUNTRY, national: e164.replace(/^\+/, '') };
}

export function CreateUserModal({ open, onClose, onCreated, building, lockedUnit, editUser }: CreateUserModalProps) {
  const { t, tf } = useI18n();
  const locked = !!building;
  const isEdit = !!editUser;
  const lockedBuildingId = building?._id;
  const lockedUnitId = lockedUnit?._id;

  // Shared identity fields.
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Global mode: create as a system admin (no buildings) instead of a member.
  const [asSystemAdmin, setAsSystemAdmin] = useState(false);
  // Global mode: one or more building assignments.
  const [drafts, setDrafts] = useState<DraftMembership[]>([blankDraft()]);

  // Locked mode: a single membership for the fixed building.
  const [role, setRole] = useState<BuildingRole>('owner');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [isBuildingAdmin, setIsBuildingAdmin] = useState(false);

  const [buildings, setBuildings] = useState<BuildingLite[]>([]);
  const [unitsByBuilding, setUnitsByBuilding] = useState<Record<string, UnitLite[]>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ defaultPassword?: string; whatsappUrl?: string } | null>(null);

  // Reset on (re)open.
  useEffect(() => {
    if (open) {
      if (editUser) {
        const { country: c, national: n } = parsePhone(editUser.phone);
        setCountry(c);
        setNational(n);
        setFirstName(editUser.firstName ?? '');
        setLastName(editUser.lastName ?? '');
        setDrafts(
          editUser.memberships.length
            ? editUser.memberships.map((m) => ({
                buildingId: m.buildingId,
                role: m.role,
                unitIds: [...m.unitIds],
                isBuildingAdmin: m.isBuildingAdmin,
              }))
            : [blankDraft()],
        );
      } else {
        setCountry(DEFAULT_COUNTRY);
        setNational('');
        setFirstName('');
        setLastName('');
        setDrafts([blankDraft()]);
      }
      setAsSystemAdmin(false);
      setRole('owner');
      setUnitIds(lockedUnitId ? [lockedUnitId] : []);
      setIsBuildingAdmin(false);
      setUnitsByBuilding({});
      setError(null);
      setSuccess(null);
    }
  }, [open, lockedBuildingId, lockedUnitId, editUser]);

  // In edit mode, pre-load units for every building the user already belongs to.
  useEffect(() => {
    if (!open || !editUser) return;
    for (const m of editUser.memberships) void ensureUnits(m.buildingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editUser]);

  // Load the building list (global mode needs it for the pickers).
  useEffect(() => {
    if (!open || locked) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/buildings');
        if (!cancelled) setBuildings((r.data?.buildings ?? []) as BuildingLite[]);
      } catch {
        /* surfaced on submit */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, locked]);

  // Fetch (and cache) a building's units on demand.
  async function ensureUnits(buildingId: string) {
    if (unitsByBuilding[buildingId]) return;
    try {
      const r = await api.get(`/buildings/${buildingId}/units`);
      setUnitsByBuilding((prev) => ({ ...prev, [buildingId]: (r.data?.units ?? []) as UnitLite[] }));
    } catch {
      setUnitsByBuilding((prev) => ({ ...prev, [buildingId]: [] }));
    }
  }

  // Locked mode: load the fixed building's units up front.
  useEffect(() => {
    if (!open || !locked || !building) return;
    void ensureUnits(building._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locked, building?._id]);

  const nationalDigits = digitsOnly(national);
  const phoneValid = nationalDigits.length >= 6;
  const phone = `${country.dial}${nationalDigits}`;
  const nameValid = firstName.trim().length > 0;

  function unitsFor(buildingId: string | null): UnitLite[] {
    if (!buildingId) return [];
    const list = unitsByBuilding[buildingId] ?? [];
    return [...list].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }

  // ── Validity ──────────────────────────────────────────────────────────
  const lockedUnitRequired = !isBuildingAdmin && role !== 'independent';
  const lockedValid = !lockedUnitRequired || unitIds.length > 0;
  const draftValid = (d: DraftMembership) =>
    !!d.buildingId && (d.role === 'independent' || d.isBuildingAdmin || d.unitIds.length > 0);
  const draftsValid = drafts.length > 0 && drafts.every(draftValid);
  const valid =
    phoneValid &&
    nameValid &&
    !submitting &&
    (locked ? lockedValid : asSystemAdmin ? true : draftsValid);

  // ── Draft helpers (global mode) ─────────────────────────────────────────
  const updateDraft = (i: number, patch: Partial<DraftMembership>) =>
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const removeDraft = (i: number) => setDrafts((prev) => prev.filter((_, j) => j !== i));
  const addDraft = () => setDrafts((prev) => [...prev, blankDraft()]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit && editUser) {
        await api.patch(`/users/${editUser._id}`, {
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          phone,
          memberships: drafts.map((d) => ({
            buildingId: d.buildingId,
            role: d.role,
            unitIds: d.unitIds,
            isBuildingAdmin: d.isBuildingAdmin,
          })),
        });
        onCreated?.();
        onClose();
        return;
      }
      if (!locked && asSystemAdmin) {
        const res = await createSystemAdmin({
          phone,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        });
        setSuccess({ defaultPassword: res.defaultPassword });
      } else if (locked) {
        const body: Record<string, unknown> = {
          role,
          phone,
          buildingId: building!._id,
          firstName: firstName.trim(),
        };
        if (lastName.trim()) body.lastName = lastName.trim();
        if (unitIds.length) body.unitIds = unitIds;
        if (isBuildingAdmin) body.isBuildingAdmin = true;
        const r = await api.post('/invites', body);
        setSuccess({
          defaultPassword: r.data?.defaultPassword as string | undefined,
          whatsappUrl: r.data?.whatsappUrl as string | undefined,
        });
      } else {
        // Global: one /invites call per building. The first creates the user
        // (returns a password + wa.me link); the rest add memberships.
        let first: { defaultPassword?: string; whatsappUrl?: string } = {};
        for (let i = 0; i < drafts.length; i++) {
          const d = drafts[i]!;
          const body: Record<string, unknown> = {
            role: d.role,
            phone,
            buildingId: d.buildingId,
            firstName: firstName.trim(),
          };
          if (lastName.trim()) body.lastName = lastName.trim();
          if (d.unitIds.length) body.unitIds = d.unitIds;
          if (d.isBuildingAdmin) body.isBuildingAdmin = true;
          const r = await api.post('/invites', body);
          if (i === 0)
            first = {
              defaultPassword: r.data?.defaultPassword as string | undefined,
              whatsappUrl: r.data?.whatsappUrl as string | undefined,
            };
        }
        setSuccess(first);
      }
      onCreated?.();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('invite_could_not_send'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View>
        <Text style={[type.title, { marginBottom: locked ? 2 : spacing.md }]}>
          {isEdit ? t('edit_user_title') : t('create_user_title')}
        </Text>
        {locked ? (
          <Text style={styles.lockedBuilding}>
            {lockedUnit ? `${building!.name} · ${lockedUnit.number}` : building!.name}
          </Text>
        ) : null}

        {success ? (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>{t('create_user_created')}</Text>
            {success.defaultPassword ? (
              <Text style={styles.linkText} selectable>
                {success.defaultPassword}
              </Text>
            ) : null}
            {success.whatsappUrl ? (
              <Button
                label={t('create_user_send_whatsapp')}
                variant="secondary"
                onPress={() => success.whatsappUrl && void Linking.openURL(success.whatsappUrl)}
                style={{ marginTop: spacing.md }}
              />
            ) : null}
            <Button label={t('done')} onPress={onClose} style={{ marginTop: spacing.sm }} />
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t('invite_first_name')} *</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t('invite_first_name_ph')}
                  placeholderTextColor={palette.textSubtle}
                  style={styles.input}
                  autoCapitalize="words"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t('invite_last_name')}</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={t('invite_last_name_ph')}
                  placeholderTextColor={palette.textSubtle}
                  style={styles.input}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <Text style={styles.label}>{t('invite_phone_label')}</Text>
            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.countryBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
                <Text style={styles.countryFlag}>{country.flag}</Text>
                <Text style={styles.countryDial}>{country.dial}</Text>
                <Text style={styles.countryCaret}>▾</Text>
              </TouchableOpacity>
              <TextInput
                value={national}
                onChangeText={setNational}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder={t('invite_phone_ph')}
                placeholderTextColor={palette.textSubtle}
                style={styles.phoneInput}
              />
            </View>

            {/* System-admin option (global create mode only). */}
            {!locked && !isEdit && (
              <TouchableOpacity
                onPress={() => setAsSystemAdmin((v) => !v)}
                style={styles.toggleRow}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, asSystemAdmin && styles.checkboxOn]}>
                  {asSystemAdmin ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={styles.toggleLabel}>{t('create_user_as_admin')}</Text>
              </TouchableOpacity>
            )}

            {/* ── Locked mode: single-building membership ── */}
            {locked && (
              <>
                <Text style={styles.label}>{t('create_user_role')}</Text>
                <View style={styles.chipRow}>
                  {(lockedUnit ? (['owner', 'renter', 'dependent'] as BuildingRole[]) : BUILDING_ROLES).map((r) => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => {
                        setRole(r);
                        if (r === 'independent') setUnitIds([]);
                      }}
                      style={[styles.chip, role === r && styles.chipActive]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{t(ROLE_KEY[r])}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity onPress={() => setIsBuildingAdmin((v) => !v)} style={styles.toggleRow} activeOpacity={0.7}>
                  <View style={[styles.checkbox, isBuildingAdmin && styles.checkboxOn]}>
                    {isBuildingAdmin ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <Text style={styles.toggleLabel}>{t('create_user_building_admin')}</Text>
                </TouchableOpacity>

                {lockedUnitRequired && lockedUnit ? (
                  <>
                    <Text style={styles.label}>{t('invite_unit_label')}</Text>
                    <View style={styles.lockedUnitPill}>
                      <Text style={styles.lockedUnitText}>{lockedUnit.number}</Text>
                    </View>
                  </>
                ) : lockedUnitRequired ? (
                  <>
                    <Text style={styles.label}>{t('invite_unit_label')}</Text>
                    <UnitChips
                      units={unitsFor(building!._id)}
                      selected={unitIds}
                      onToggle={(id) =>
                        setUnitIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                      }
                      emptyLabel={t('invite_unit_pick')}
                    />
                  </>
                ) : null}
              </>
            )}

            {/* ── Global mode: multiple building assignments ── */}
            {!locked && !asSystemAdmin && (
              <>
                {drafts.map((d, i) => (
                  <View key={i} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{tf('create_user_building_n', { n: i + 1 })}</Text>
                      {drafts.length > 1 ? (
                        <TouchableOpacity onPress={() => removeDraft(i)} hitSlop={8}>
                          <Icon name="trash" size={18} color={palette.danger} />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <Text style={styles.label}>{t('sub_field_building')}</Text>
                    {buildings.length > 0 ? (
                      <View style={styles.chipRow}>
                        {buildings.map((b) => {
                          const on = d.buildingId === b._id;
                          return (
                            <TouchableOpacity
                              key={b._id}
                              onPress={() => {
                                updateDraft(i, { buildingId: b._id, unitIds: [] });
                                void ensureUnits(b._id);
                              }}
                              style={[styles.chip, on && styles.chipActive]}
                              activeOpacity={0.85}
                            >
                              <Text style={[styles.chipText, on && styles.chipTextActive]}>{b.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={[type.small, { color: palette.textSubtle, marginTop: 2 }]}>{t('loading')}</Text>
                    )}

                    <Text style={styles.label}>{t('create_user_role')}</Text>
                    <View style={styles.chipRow}>
                      {BUILDING_ROLES.map((r) => {
                        const on = d.role === r;
                        return (
                          <TouchableOpacity
                            key={r}
                            onPress={() => updateDraft(i, { role: r, ...(r === 'independent' ? { unitIds: [] } : {}) })}
                            style={[styles.chip, on && styles.chipActive]}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.chipText, on && styles.chipTextActive]}>{t(ROLE_KEY[r])}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <TouchableOpacity
                      onPress={() => updateDraft(i, { isBuildingAdmin: !d.isBuildingAdmin })}
                      style={styles.toggleRow}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, d.isBuildingAdmin && styles.checkboxOn]}>
                        {d.isBuildingAdmin ? <Text style={styles.checkmark}>✓</Text> : null}
                      </View>
                      <Text style={styles.toggleLabel}>{t('create_user_building_admin')}</Text>
                    </TouchableOpacity>

                    {d.role !== 'independent' && (
                      <>
                        <Text style={styles.label}>{t('invite_unit_label')}</Text>
                        <UnitChips
                          units={unitsFor(d.buildingId)}
                          selected={d.unitIds}
                          onToggle={(id) =>
                            updateDraft(i, {
                              unitIds: d.unitIds.includes(id)
                                ? d.unitIds.filter((x) => x !== id)
                                : [...d.unitIds, id],
                            })
                          }
                          emptyLabel={d.buildingId ? t('invite_unit_pick') : t('create_user_pick_building')}
                        />
                      </>
                    )}
                  </View>
                ))}

                <TouchableOpacity onPress={addDraft} style={styles.addBuildingBtn} activeOpacity={0.8}>
                  <Text style={styles.addBuildingText}>{t('create_user_add_building')}</Text>
                </TouchableOpacity>
              </>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} disabled={submitting} />
              <Button
                label={submitting ? t('invite_sending') : isEdit ? t('save') : t('create_user_title')}
                onPress={submit}
                disabled={!valid}
                loading={submitting}
                style={{ flex: 1 }}
              />
            </View>
          </ScrollView>
        )}
      </View>

      <CountryPicker
        visible={pickerOpen}
        selectedIso={country.iso}
        onSelect={setCountry}
        onClose={() => setPickerOpen(false)}
      />
    </BottomSheet>
  );
}

function UnitChips({
  units,
  selected,
  onToggle,
  emptyLabel,
}: {
  units: UnitLite[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  if (units.length === 0) {
    return <Text style={[type.small, { color: palette.textSubtle, marginTop: 2 }]}>{emptyLabel}</Text>;
  }
  return (
    <View style={styles.chipRow}>
      {units.map((u) => {
        const on = selected.includes(u._id);
        return (
          <TouchableOpacity
            key={u._id}
            onPress={() => onToggle(u._id)}
            style={[styles.chip, on && styles.chipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, on && styles.chipTextActive]}>{u.number}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  lockedBuilding: { ...type.small, color: palette.accent, fontWeight: '700', marginBottom: spacing.md },
  lockedUnitPill: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: palette.accentSoft,
  },
  lockedUnitText: { color: palette.accent, fontWeight: '700', fontSize: 13 },
  label: { ...type.small, color: palette.textMuted, marginTop: spacing.md, marginBottom: 4 },
  input: {
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
  nameRow: { flexDirection: 'row', gap: spacing.md },
  phoneRow: { flexDirection: 'row', direction: 'ltr', gap: spacing.sm },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.inputBg,
  },
  countryFlag: { fontSize: 20 },
  countryDial: { fontSize: 15, color: palette.text, fontVariant: ['tabular-nums'] },
  countryCaret: { fontSize: 11, color: palette.textSubtle },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...type.small, color: palette.text, fontWeight: '700' },
  addBuildingBtn: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.accent,
    borderStyle: 'dashed',
  },
  addBuildingText: { color: palette.accent, fontWeight: '700', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 13, color: palette.textMuted, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.inputBg,
  },
  checkboxOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleLabel: { ...type.small, color: palette.text, flex: 1 },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  successBox: { padding: spacing.md, backgroundColor: palette.successSoft, borderRadius: radii.md },
  successTitle: { color: palette.success, fontSize: 15, fontWeight: '700' },
  linkText: { marginTop: spacing.sm, color: palette.accent, fontSize: 14, fontWeight: '600' },
});
