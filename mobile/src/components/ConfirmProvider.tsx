import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { palette, radii, spacing, type } from './theme';
import { useT } from '../i18n';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, shows a text input and resolves with the entered string
   *  (or null if cancelled). Without it, resolves boolean. */
  input?: { placeholder?: string; defaultValue?: string; multiline?: boolean };
}

type Resolver = (value: boolean | string | null) => void;

interface ConfirmCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: ConfirmOptions & { input: NonNullable<ConfirmOptions['input']> }) => Promise<string | null>;
}

const Ctx = createContext<ConfirmCtx | undefined>(undefined);

/**
 * App-wide confirmation/prompt sheets — a bottom-sheet replacement for native
 * Alert.alert. `confirm()` resolves true/false; `prompt()` resolves the entered
 * text or null. Rendered once at the app root.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<Resolver | null>(null);

  const open = useCallback((o: ConfirmOptions): Promise<boolean | string | null> => {
    setOpts(o);
    setValue(o.input?.defaultValue ?? '');
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean | string | null) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => open(o).then((r) => r === true || typeof r === 'string'), [open]);
  const prompt = useCallback(
    (o: ConfirmOptions & { input: NonNullable<ConfirmOptions['input']> }) =>
      open(o).then((r) => (typeof r === 'string' ? r : null)),
    [open],
  );

  const isPrompt = !!opts?.input;

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <BottomSheet open={!!opts} onClose={() => settle(isPrompt ? null : false)}>
        {opts ? (
          <View style={styles.body}>
            <Text style={[type.title, styles.title]}>{opts.title}</Text>
            {opts.message ? <Text style={[type.small, styles.message]}>{opts.message}</Text> : null}
            {opts.input ? (
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder={opts.input.placeholder}
                placeholderTextColor={palette.textSubtle}
                multiline={opts.input.multiline}
                autoFocus
                style={[styles.input, opts.input.multiline && styles.inputMultiline]}
              />
            ) : null}
            <TouchableOpacity
              style={[styles.confirmBtn, opts.destructive && styles.destructiveBtn]}
              onPress={() => settle(isPrompt ? value : true)}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmText}>{opts.confirmLabel ?? t('continue')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => settle(isPrompt ? null : false)} activeOpacity={0.7}>
              <Text style={styles.cancelText}>{opts.cancelLabel ?? t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </BottomSheet>
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.sm },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', color: palette.textMuted },
  input: {
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  confirmBtn: { backgroundColor: palette.accent, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  destructiveBtn: { backgroundColor: palette.danger },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { paddingVertical: 8, alignItems: 'center' },
  cancelText: { color: palette.textMuted, fontSize: 14, fontWeight: '600' },
});
