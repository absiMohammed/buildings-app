import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { palette, radii, spacing, type, textStart } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';

export interface NewPollModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; description: string; closesInDays: number }) => void;
}

export function NewPollModal({ open, onClose, onCreate }: NewPollModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState('7');
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setDays('7');
  }, [open]);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const daysN = parseInt(days, 10);
  const valid =
    trimmedTitle.length > 0 &&
    trimmedDescription.length > 0 &&
    Number.isFinite(daysN) &&
    daysN >= 1 &&
    daysN <= 60;

  function submit() {
    if (!valid) return;
    onCreate({ title: trimmedTitle, description: trimmedDescription, closesInDays: daysN });
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.xs }]}>{t('new_poll_title')}</Text>
      <Text style={[type.small, { marginBottom: spacing.md }]}>
        {t('new_poll_body')}
      </Text>

      <Text style={styles.label}>{t('new_poll_field_title')}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('new_poll_field_title_ph')}
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
        maxLength={120}
      />

      <Text style={styles.label}>{t('new_poll_field_description')}</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={t('new_poll_field_description_ph')}
        placeholderTextColor={palette.textSubtle}
        style={[styles.input, styles.multiline]}
        multiline
        numberOfLines={3}
        maxLength={500}
      />

      <Text style={styles.label}>{t('new_poll_field_days')}</Text>
      <TextInput
        value={days}
        onChangeText={setDays}
        keyboardType="number-pad"
        placeholder="7"
        placeholderTextColor={palette.textSubtle}
        style={[styles.input, { maxWidth: 100 }]}
        maxLength={2}
      />

      <View style={styles.actions}>
        <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label={t('new_poll_create')} onPress={submit} disabled={!valid} style={{ flex: 1 }} />
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
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
