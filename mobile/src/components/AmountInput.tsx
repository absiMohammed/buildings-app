import { StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { palette, radii, spacing } from './theme';
import { currencySymbol } from '../utils/format';

/** The app-wide idiom for reading a typed amount. null = not a number. */
export function parseAmount(text: string): number | null {
  const n = parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Money entry field: decimal keyboard, currency symbol suffix, themed like
 * the app's other inputs. Controlled by raw text (not a number) so partial
 * typing like "12." survives re-renders.
 */
export function AmountInput({
  value,
  onChangeValue,
  currency,
  placeholder = '0.00',
  style,
}: {
  value: string;
  onChangeValue: (text: string) => void;
  currency?: string;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <TextInput
        value={value}
        onChangeText={onChangeValue}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
      />
      {currency ? <Text style={styles.suffix}>{currencySymbol(currency)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },
  suffix: { fontSize: 14, fontWeight: '700', color: palette.textMuted },
});
