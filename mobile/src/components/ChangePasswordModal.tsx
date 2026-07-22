import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';
import { useAuth } from '../auth/AuthContext';
import { palette, radii, spacing, textStart, type } from './theme';
import { useI18n } from '../i18n';

/**
 * Set-a-new-password sheet. In `forced` mode (first login after an admin
 * create/reset) it can't be dismissed until the user picks their own password.
 */
export function ChangePasswordModal({
  open,
  forced = false,
  onClose,
}: {
  open: boolean;
  forced?: boolean;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirmPw('');
      setErr(null);
    }
  }, [open]);

  async function submit() {
    if (next.length < 8) {
      setErr(t('change_pw_too_short'));
      return;
    }
    if (next !== confirmPw) {
      setErr(t('change_pw_mismatch'));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await changePassword(current, next);
      onClose?.();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setErr(msg ?? t('change_pw_err'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={forced ? () => undefined : onClose ?? (() => undefined)} hideHandle={forced}>
      <Text style={[type.title, { marginBottom: forced ? spacing.xs : spacing.md }]}>{t('change_pw_title')}</Text>
      {forced ? <Text style={[type.small, { marginBottom: spacing.md }]}>{t('change_pw_forced_body')}</Text> : null}

      <Text style={styles.label}>{t('change_pw_current')}</Text>
      <TextInput
        value={current}
        onChangeText={setCurrent}
        placeholder="••••••••"
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
      />
      <Text style={styles.label}>{t('change_pw_new')}</Text>
      <TextInput
        value={next}
        onChangeText={setNext}
        placeholder="••••••••"
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
      />
      <Text style={styles.label}>{t('change_pw_confirm')}</Text>
      <TextInput
        value={confirmPw}
        onChangeText={setConfirmPw}
        placeholder="••••••••"
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
      />
      {err ? <Text style={styles.err}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        {!forced ? (
          <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} disabled={saving} />
        ) : null}
        <Button
          label={saving ? t('saving') : t('change_pw_submit')}
          onPress={submit}
          disabled={!current || !next || !confirmPw || saving}
          loading={saving}
          style={{ flex: 1 }}
        />
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
    backgroundColor: palette.inputBg,
    ...textStart,
  },
  err: { color: palette.danger, fontSize: 13, marginTop: spacing.sm },
});
