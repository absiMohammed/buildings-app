import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { palette, radii, spacing, type, textStart } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';

export interface NewPollInput {
  title: string;
  description?: string;
  options: { text: string }[];
  closesAt: string;
}

export interface NewPollModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewPollInput) => void | Promise<void>;
}

const dayMs = 24 * 60 * 60 * 1000;

export function NewPollModal({ open, onClose, onCreate }: NewPollModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState('7');
  // Default to two options so simple yes/no polls stay one tap away, while
  // still allowing the user to add/remove/rename options for richer polls.
  const [options, setOptions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setDays('7');
    setOptions([t('polls_yes'), t('polls_no')]);
    setSubmitting(false);
  }, [open, t]);

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOption() {
    setOptions((prev) => [...prev, '']);
  }
  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const cleanOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
  const daysN = parseInt(days, 10);
  const valid =
    trimmedTitle.length > 0 &&
    cleanOptions.length >= 2 &&
    Number.isFinite(daysN) &&
    daysN >= 1 &&
    daysN <= 60;

  async function submit() {
    if (!valid || submitting) return;
    const closesAt = new Date(Date.now() + daysN * dayMs).toISOString();
    setSubmitting(true);
    try {
      await onCreate({
        title: trimmedTitle,
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
        options: cleanOptions.map((text) => ({ text })),
        closesAt,
      });
    } finally {
      setSubmitting(false);
    }
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

      <Text style={styles.label}>{t('dash_action_vote')}</Text>
      {options.map((opt, i) => (
        <View key={i} style={styles.optionRow}>
          <TextInput
            value={opt}
            onChangeText={(v) => setOption(i, v)}
            placeholder={t('new_poll_field_title_ph')}
            placeholderTextColor={palette.textSubtle}
            style={[styles.input, { flex: 1 }]}
            maxLength={120}
          />
          {options.length > 2 && (
            <Button
              label={t('remove')}
              variant="ghost"
              onPress={() => removeOption(i)}
              style={styles.optionRemove}
            />
          )}
        </View>
      ))}
      <Button label={t('new')} variant="secondary" onPress={addOption} style={{ marginTop: spacing.xs }} />

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
        <Button
          label={t('new_poll_create')}
          onPress={submit}
          disabled={!valid || submitting}
          loading={submitting}
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
    backgroundColor: palette.inputBg,    ...textStart,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  optionRemove: { paddingHorizontal: 8 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
