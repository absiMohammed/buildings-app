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
import { palette, radii, shadow, spacing, type } from './theme';
import { BottomSheet } from './BottomSheet';
import { useT } from '../i18n';
import type { StringKey } from '../i18n/strings';
import { triggerGate } from '../api/gate';

type TapPhase = 'idle' | 'busy' | 'done' | 'error';

export function QuickActionsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.xs }]}>
        {t('quick_actions_title')}
      </Text>
      <Text style={[type.small, { marginBottom: spacing.lg }]}>
        {t('quick_actions_subtitle')}
      </Text>

      <TapActionCard
        glyph="🚪"
        tone={['#4f46e5', '#7c3aed']}
        titleKey="qa_door_title"
        hintKey="qa_door_hint"
        ctaKey="qa_door_cta"
        busyKey="qa_door_opening"
        doneKey="qa_door_opened"
      />

      <TapActionCard
        glyph="🚧"
        tone={['#475569', '#64748b']}
        titleKey="qa_gate_title"
        hintKey="qa_gate_hint"
        ctaKey="qa_gate_cta"
        busyKey="qa_gate_opening"
        doneKey="qa_gate_opened"
        errorKey="qa_gate_error"
        onPress={triggerGate}
      />

      <TapActionCard
        glyph="🛗"
        tone={['#0284c7', '#0ea5e9']}
        titleKey="qa_elevator_title"
        hintKey="qa_elevator_hint"
        ctaKey="qa_elevator_cta"
        busyKey="qa_elevator_calling"
        doneKey="qa_elevator_arrived"
      />
    </BottomSheet>
  );
}

function TapActionCard({
  glyph,
  tone,
  titleKey,
  hintKey,
  ctaKey,
  busyKey,
  doneKey,
  errorKey,
  onPress,
}: {
  glyph: string;
  tone: [string, string];
  titleKey: StringKey;
  hintKey: StringKey;
  ctaKey: StringKey;
  busyKey: StringKey;
  doneKey: StringKey;
  errorKey?: StringKey;
  onPress?: () => Promise<unknown>;
}) {
  const t = useT();
  const [phase, setPhase] = useState<TapPhase>('idle');
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase === 'idle') return;
    let cancelled = false;
    if (phase === 'busy') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ).start();
      if (onPress) {
        onPress()
          .then(() => !cancelled && setPhase('done'))
          .catch(() => !cancelled && setPhase('error'));
      } else {
        const id = setTimeout(() => !cancelled && setPhase('done'), 1100);
        return () => {
          cancelled = true;
          clearTimeout(id);
          pulse.stopAnimation();
          pulse.setValue(0);
        };
      }
      return () => {
        cancelled = true;
        pulse.stopAnimation();
        pulse.setValue(0);
      };
    }
    if (phase === 'done' || phase === 'error') {
      const id = setTimeout(() => !cancelled && setPhase('idle'), 1600);
      return () => {
        cancelled = true;
        clearTimeout(id);
      };
    }
  }, [phase, pulse, onPress]);

  const busy = phase === 'busy';
  const done = phase === 'done';
  const errored = phase === 'error';
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.55],
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <LinearGradient
          colors={tone}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.icon}
        >
          <Text style={styles.iconGlyph}>{glyph}</Text>
          {busy && (
            <Animated.View
              style={[styles.iconRing, { opacity: ringOpacity }]}
            />
          )}
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {t(titleKey)}
          </Text>
          <Text style={styles.cardHint} numberOfLines={2}>
            {t(hintKey)}
          </Text>
        </View>
        {(busy || done || errored) && (
          <View
            style={[
              styles.statusPill,
              done && styles.statusPillDone,
              errored && styles.statusPillError,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                done && styles.statusTextDone,
                errored && styles.statusTextError,
              ]}
              numberOfLines={1}
            >
              {errored && errorKey
                ? t(errorKey)
                : done
                ? t(doneKey)
                : t(busyKey)}
            </Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        onPress={() => phase === 'idle' && setPhase('busy')}
        disabled={phase !== 'idle'}
        activeOpacity={0.85}
        style={styles.cta}
      >
        <LinearGradient
          colors={
            phase === 'idle'
              ? tone
              : [palette.surfaceMuted, palette.surfaceMuted]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaInner}
        >
          <Text style={[styles.ctaText, phase !== 'idle' && styles.ctaTextDim]}>
            {phase === 'idle'
              ? t(ctaKey)
              : phase === 'busy'
              ? t(busyKey)
              : phase === 'error' && errorKey
              ? t(errorKey)
              : t(doneKey)}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 22 },
  iconRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.text,
  },
  cardHint: { fontSize: 12, color: palette.textSubtle, marginTop: 2 },
  statusPill: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    flexShrink: 0,
    maxWidth: 120,
  },
  statusPillDone: { backgroundColor: palette.successSoft },
  statusPillError: { backgroundColor: palette.dangerSoft },
  statusText: { fontSize: 11, color: palette.accent, fontWeight: '700' },
  statusTextDone: { color: palette.success },
  statusTextError: { color: palette.danger },

  cta: {
    borderRadius: radii.md,
    overflow: 'hidden',
    height: 52,
    alignSelf: 'stretch',
  },
  ctaInner: {
    flex: 1,
    width: '100%',
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  ctaTextDim: { color: palette.textSubtle },
});
