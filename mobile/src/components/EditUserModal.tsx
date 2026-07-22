import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';
import { updateUserProfile } from '../api/users';
import { palette, radii, spacing, textStart, type } from './theme';
import { useI18n } from '../i18n';

/**
 * Edit a user's first / last name. A bottom sheet — the same interaction the
 * rest of the app uses — opened from the user action sheets.
 */
export function EditUserModal({
  open,
  userId,
  initialFirstName,
  initialLastName,
  onClose,
  onSaved,
}: {
  open: boolean;
  userId: string;
  initialFirstName: string;
  initialLastName: string;
  onClose: () => void;
  onSaved: (u: { firstName: string; lastName: string }) => void;
}) {
  const { t } = useI18n();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFirstName(initialFirstName);
      setLastName(initialLastName);
      setErr(null);
    }
  }, [open, initialFirstName, initialLastName]);

  async function submit() {
    if (!firstName.trim() || !userId) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await updateUserProfile(userId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      onSaved({ firstName: updated.firstName, lastName: updated.lastName });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setErr(msg ?? t('users_err_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.md }]}>{t('edit_user_title')}</Text>
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
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} disabled={saving} />
        <Button
          label={saving ? t('saving') : t('save')}
          onPress={submit}
          disabled={!firstName.trim() || saving}
          loading={saving}
          style={{ flex: 1 }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', gap: spacing.md },
  label: { ...type.small, color: palette.textMuted, marginTop: spacing.sm, marginBottom: 4 },
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
  error: { color: palette.danger, fontSize: 13, marginTop: spacing.sm },
});
