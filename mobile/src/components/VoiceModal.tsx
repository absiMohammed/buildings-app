import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { palette, radii, spacing, type } from './theme';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const EXAMPLE_COMMAND_KEYS: StringKey[] = [
  'voice_cmd_overdue',
  'voice_cmd_open_unit',
  'voice_cmd_invite',
  'voice_cmd_currency',
  'voice_cmd_mark_paid',
];

export function VoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<'listening' | 'thinking' | 'idle'>('listening');
  const pulse = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const { t } = useI18n();

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      return;
    }
    setPhase('listening');

    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const ringAnim = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    pulseAnim.start();
    ringAnim.start();

    const timer = setTimeout(() => setPhase('thinking'), 3500);
    return () => {
      pulseAnim.stop();
      ringAnim.stop();
      pulse.setValue(0);
      ring.setValue(0);
      clearTimeout(timer);
    };
  }, [open, pulse, ring]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <BottomSheet open={open} onClose={onClose} centered cardStyle={styles.card}>
      <View>
          <View style={styles.micWrap}>
            <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
            <Animated.View style={[styles.micOuter, { transform: [{ scale }] }]}>
              <LinearGradient
                colors={[palette.accent, '#7c3aed']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.micGradient}
              >
                <Text style={styles.micGlyph}>🎙</Text>
              </LinearGradient>
            </Animated.View>
          </View>

          <Text style={styles.title}>
            {phase === 'listening' ? t('voice_listening') : t('voice_try_saying')}
          </Text>
          <Text style={styles.subtitle}>
            {phase === 'listening'
              ? t('voice_listening_body')
              : t('voice_didnt_catch')}
          </Text>

          <View style={styles.list}>
            {EXAMPLE_COMMAND_KEYS.map((k) => (
              <View key={k} style={styles.exampleRow}>
                <Text style={styles.exampleQuote}>“</Text>
                <Text style={styles.exampleText}>{t(k)}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.85}>
            <Text style={styles.closeText}>{t('close')}</Text>
          </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center' },
  micWrap: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  ring: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: palette.accent,
  },
  micOuter: { width: 96, height: 96, borderRadius: 48 },
  micGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.accent,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  micGlyph: { fontSize: 38 },
  title: { ...type.title, marginBottom: spacing.xs },
  subtitle: { ...type.small, textAlign: 'center', maxWidth: 260, marginBottom: spacing.lg },
  list: { alignSelf: 'stretch', gap: 6, marginBottom: spacing.lg },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md,
  },
  exampleQuote: { color: palette.accent, fontSize: 20, fontWeight: '800' },
  exampleText: { color: palette.text, fontSize: 13, flex: 1 },
  closeBtn: {
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  closeText: { color: palette.text, fontWeight: '600' },
});
