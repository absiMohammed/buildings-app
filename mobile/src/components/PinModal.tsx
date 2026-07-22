import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { palette, radii, spacing, type } from './theme';
import { useT } from '../i18n';

const PIN_LENGTH = 4;

/**
 * Enter or set a 4-digit PIN. In `mode="set"` the user confirms the PIN twice;
 * in `mode="enter"` a single entry is submitted. Purely presentational — the
 * parent verifies/stores via the pin module.
 */
export function PinModal({
  visible,
  mode,
  title,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  mode: 'set' | 'enter';
  title: string;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPin('');
      setConfirm('');
      setLocalError(null);
    }
  }, [visible]);

  function submit() {
    if (pin.length !== PIN_LENGTH) return;
    if (mode === 'set') {
      if (pin !== confirm) {
        setLocalError(t('pin_mismatch'));
        setConfirm('');
        return;
      }
    }
    onSubmit(pin);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[type.title, { textAlign: 'center' }]}>{title}</Text>

          <TextInput
            value={pin}
            onChangeText={(v) => setPin(v.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH))}
            keyboardType="number-pad"
            secureTextEntry
            autoFocus
            maxLength={PIN_LENGTH}
            style={styles.input}
            placeholder="••••"
            placeholderTextColor={palette.textSubtle}
          />
          {mode === 'set' ? (
            <TextInput
              value={confirm}
              onChangeText={(v) => setConfirm(v.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={PIN_LENGTH}
              style={styles.input}
              placeholder={t('pin_confirm_placeholder')}
              placeholderTextColor={palette.textSubtle}
            />
          ) : null}

          {(error || localError) ? (
            <Text style={styles.error}>{localError ?? error}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, pin.length !== PIN_LENGTH && styles.btnDisabled]}
            disabled={pin.length !== PIN_LENGTH}
            onPress={submit}
          >
            <Text style={styles.btnText}>{t('continue')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.cancel}>
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: palette.surface, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: palette.text,
    backgroundColor: palette.inputBg,
  },
  error: { color: palette.danger, fontSize: 13, textAlign: 'center' },
  btn: { backgroundColor: palette.accent, borderRadius: radii.md, paddingVertical: 13, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: palette.accentText, fontWeight: '700', fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: 4 },
  cancelText: { color: palette.textMuted, fontSize: 14 },
});
