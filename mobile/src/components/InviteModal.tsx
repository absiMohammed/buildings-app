import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';
import type { Role } from '../auth/AuthContext';
import { palette, radii, spacing, type, textStart } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

/** Roles that can be assigned via invite. `admin` is intentionally absent —
 *  admin is reached only by promoting an existing owner (PATCH /users/:id/role). */
export type InvitableRole = Exclude<Role, 'admin'>;

const ROLE_KEY: Record<InvitableRole, StringKey> = {
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
};

export interface InviteUnitOption {
  _id: string;
  number: string;
  /**
   * Optional per-unit slot signals. The caller (UsersPage / UnitDetailPage)
   * supplies these from its data source so the modal can grey out the
   * owner / renter chips when those slots are already filled and can decide
   * whether to allow a dependent invite. The server enforces the same rules
   * on POST /invites; this is UI affordance only.
   */
  hasOwner?: boolean;
  hasRenter?: boolean;
}

export interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  defaultRole?: InvitableRole;
  lockedRole?: InvitableRole; // hide role selector
  allowedRoles?: InvitableRole[]; // restrict which roles can be picked
  /** Picker source for non-admin invites. Ignored when a locked unit is set. */
  units?: InviteUnitOption[];
  /**
   * Pre-fill the unit and disable the picker. Used when opening the modal
   * from a unit-scoped surface (e.g. UnitDetailPage) where the invitee
   * already has a unit context.
   */
  lockedUnit?: InviteUnitOption | null;
  /**
   * Required when the caller is the system admin (who has no home building
   * of their own). Sent to /invites in the body so the server can validate
   * that the chosen unit belongs to this building. Ignored for owner/renter
   * — the server reads `me.buildingId` instead.
   */
  buildingId?: string;
  /**
   * Admin-only: marks the invited user as this building's admin (owner with
   * the elevated overlay). The server rejects this flag unless the caller
   * is a system admin AND the building has no current building admin.
   */
  markBuildingAdmin?: boolean;
  onInvited?: (result: { channel: 'email' | 'sms'; inviteUrl?: string }) => void;
}

type Channel = 'email' | 'phone';

const INVITABLE_ROLES: InvitableRole[] = ['owner', 'renter', 'dependent'];

export function InviteModal({
  open,
  onClose,
  defaultRole = 'renter',
  lockedRole,
  allowedRoles = INVITABLE_ROLES,
  units,
  lockedUnit,
  buildingId,
  markBuildingAdmin,
  onInvited,
}: InviteModalProps) {
  const [channel, setChannel] = useState<Channel>('email');
  const [value, setValue] = useState('');
  const [role, setRole] = useState<InvitableRole>(lockedRole ?? defaultRole);
  const [unitId, setUnitId] = useState<string | null>(lockedUnit?._id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ channel: 'email' | 'sms'; defaultPassword?: string; inviteUrl?: string } | null>(null);
  const { t, tf } = useI18n();

  useEffect(() => {
    if (open) {
      setChannel('email');
      setValue('');
      setRole(lockedRole ?? defaultRole);
      setUnitId(lockedUnit?._id ?? null);
      setError(null);
      setSuccess(null);
    }
  }, [open, defaultRole, lockedRole, lockedUnit?._id]);

  const sortedUnits = useMemo(() => {
    if (!units) return [] as InviteUnitOption[];
    return [...units].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }, [units]);

  // Which unit the user is currently scoping to (locked unit or the one
  // they've picked from the chip row).
  const selectedUnit: InviteUnitOption | null =
    lockedUnit ?? sortedUnits.find((u) => u._id === unitId) ?? null;

  // A role chip is disabled when the slot is already filled. Owner/renter
  // are single-occupancy. Dependent stays open here — the per-user
  // maxDependents quota is enforced server-side and surfaced via the
  // response message.
  function roleDisabled(r: InvitableRole): boolean {
    if (!selectedUnit) return false;
    if (r === 'owner') return !!selectedUnit.hasOwner;
    if (r === 'renter') return !!selectedUnit.hasRenter;
    return false;
  }

  const trimmed = value.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const phoneValid = /^\+?[0-9\s\-()]{6,}$/.test(trimmed);
  const contactValid = channel === 'email' ? emailValid : phoneValid;
  // System admin appointing a building admin happens BEFORE any units
  // exist, so unit selection is optional in that one flow. Every other
  // invite still requires a unit because residents must live somewhere.
  const unitOptional = !!markBuildingAdmin;
  const unitValid = unitOptional || !!unitId;
  const roleValid = !roleDisabled(role);
  const valid = contactValid && unitValid && roleValid;

  const selectedUnitNumber =
    lockedUnit?.number ??
    sortedUnits.find((u) => u._id === unitId)?.number ??
    undefined;

  async function submit() {
    setError(null);
    if (!unitOptional && !unitId) {
      setError(t('invite_unit_required'));
      return;
    }
    if (roleDisabled(role)) {
      setError(t(role === 'owner' ? 'invite_slot_owner_taken' : 'invite_slot_renter_taken'));
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { role };
      if (unitId) body.unitId = unitId;
      if (channel === 'email') body.email = trimmed;
      else body.phone = trimmed;
      if (buildingId) body.buildingId = buildingId;
      if (markBuildingAdmin) body.isBuildingAdmin = true;
      const r = await api.post('/invites', body);
      const out = {
        channel: r.data.channel as 'email' | 'sms',
        defaultPassword: r.data.defaultPassword as string | undefined,
        inviteUrl: r.data.inviteUrl as string | undefined,
      };
      setSuccess(out);
      onInvited?.(out);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('invite_could_not_send'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View>
          <Text style={[type.title, { marginBottom: spacing.xs }]}>{t('invite_modal_title')}</Text>
          <Text style={[type.small, { marginBottom: spacing.md }]}>
            {selectedUnitNumber ? tf('invite_modal_body_unit', { n: selectedUnitNumber }) : t('invite_modal_body_general')}
          </Text>

          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>{t('invite_user_created')}</Text>
              <Text style={[type.small, { marginTop: 4 }]}>
                {tf('invite_user_created_for', { to: trimmed })}
              </Text>
              {success.defaultPassword ? (
                <Text style={styles.linkText} selectable>
                  {tf('invite_default_password', { pwd: success.defaultPassword })}
                </Text>
              ) : null}
              <Button label={t('done')} onPress={onClose} style={{ marginTop: spacing.md }} />
            </View>
          ) : (
            <>
              <Text style={styles.label}>{t('invite_channel_label')}</Text>
              <View style={styles.chipRow}>
                {(['email', 'phone'] as Channel[]).map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => { setChannel(c); setValue(''); }}
                    style={[styles.chip, channel === c && styles.chipActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, channel === c && styles.chipTextActive]}>
                      {c === 'email' ? t('invite_channel_email') : t('invite_channel_mobile')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>
                {channel === 'email' ? t('invite_email_label') : t('invite_phone_label')}
              </Text>
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder={channel === 'email' ? t('invite_email_ph') : t('invite_phone_ph')}
                placeholderTextColor={palette.textSubtle}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
                textContentType={channel === 'email' ? 'emailAddress' : 'telephoneNumber'}
              />

              {/* Unit picker. Hidden entirely when the admin is appointing
               *  the building admin BEFORE any units exist — that's the only
               *  invite path where a unit isn't a hard requirement. */}
              {unitOptional && !lockedUnit ? (
                <Text style={[type.small, { color: palette.textSubtle, marginTop: spacing.md }]}>
                  {t('invite_unit_skip_note')}
                </Text>
              ) : (
                <>
                  <Text style={styles.label}>{t('invite_unit_label')}</Text>
                  {lockedUnit ? (
                    <View style={styles.lockedUnitPill}>
                      <Text style={styles.lockedUnitText}>
                        {tf('invite_unit_locked', { n: lockedUnit.number })}
                      </Text>
                    </View>
                  ) : sortedUnits.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                    >
                      {sortedUnits.map((u) => (
                        <TouchableOpacity
                          key={u._id}
                          onPress={() => setUnitId(u._id)}
                          style={[styles.chip, unitId === u._id && styles.chipActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.chipText, unitId === u._id && styles.chipTextActive]}>
                            {tf('invite_unit_locked', { n: u.number })}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={[type.small, { color: palette.textSubtle, marginTop: 2 }]}>
                      {t('invite_unit_pick')}
                    </Text>
                  )}
                </>
              )}

              {!lockedRole && (
                <>
                  <Text style={styles.label}>{t('invite_role_label')}</Text>
                  <View style={styles.chipRow}>
                    {allowedRoles.map((r) => {
                      const disabled = roleDisabled(r);
                      return (
                        <TouchableOpacity
                          key={r}
                          onPress={() => !disabled && setRole(r)}
                          disabled={disabled}
                          style={[
                            styles.chip,
                            role === r && styles.chipActive,
                            disabled && styles.chipDisabled,
                          ]}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              role === r && styles.chipTextActive,
                              disabled && styles.chipTextDisabled,
                            ]}
                          >
                            {t(ROLE_KEY[r])}
                            {disabled ? ' · ' + t('invite_slot_filled_short') : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {role === 'dependent' && selectedUnit?.hasRenter && (
                    <Text style={[type.small, { color: palette.textSubtle, marginTop: 4 }]}>
                      {t('invite_dependent_renter_responsible')}
                    </Text>
                  )}
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
                  label={submitting ? t('invite_sending') : t('invite_send')}
                  onPress={submit}
                  disabled={!valid || submitting}
                  loading={submitting}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 13, color: palette.textMuted, textTransform: 'capitalize', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  chipTextDisabled: { textDecorationLine: 'line-through' },
  lockedUnitPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  lockedUnitText: { color: palette.accent, fontSize: 13, fontWeight: '600' },
  errorBox: { marginTop: spacing.md, padding: spacing.md, backgroundColor: palette.dangerSoft, borderRadius: radii.md },
  errorText: { color: palette.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  successBox: { padding: spacing.md, backgroundColor: palette.successSoft, borderRadius: radii.md },
  successTitle: { color: palette.success, fontSize: 15, fontWeight: '700' },
  linkText: { marginTop: spacing.sm, color: palette.accent, fontSize: 12 },
});
