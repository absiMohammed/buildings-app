import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { palette, shadow, spacing } from './theme';

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Center the content vertically instead of pinning it to the bottom. */
  centered?: boolean;
  /** Override the default rounded-top card style. */
  cardStyle?: StyleProp<ViewStyle>;
  /** Hide the grab handle at the top of the sheet. */
  hideHandle?: boolean;
  children: ReactNode;
}

/**
 * A bottom-sheet (or centered card) container with a smooth blurred backdrop
 * and a springy "splash" entrance for the sheet itself. No platform-default
 * modal slide animation; everything fades + scales in via Animated.
 */
export function BottomSheet({ open, onClose, centered, cardStyle, hideHandle, children }: BottomSheetProps) {
  // We keep the underlying Modal mounted until the close animation finishes.
  const [mounted, setMounted] = useState(open);
  const backdrop = useRef(new Animated.Value(0)).current;
  const blurAmount = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(80)).current;
  const sheetScale = useRef(new Animated.Value(0.94)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(blurAmount, {
          toValue: 18,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.spring(sheetY, {
          toValue: 0,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }),
        Animated.spring(sheetScale, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(blurAmount, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(sheetY, {
          toValue: centered ? 24 : 80,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetScale, {
          toValue: 0.96,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  const sheetTransforms = { transform: [{ translateY: sheetY }, { scale: sheetScale }], opacity: sheetOpacity };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <AnimatedBlur
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={blurAmount as unknown as number}
          reducedTransparencyFallbackColor={palette.text}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(15,23,42,0.55)', opacity: backdrop },
          ]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.host, centered ? styles.centeredHost : styles.bottomHost]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[centered ? styles.centered : styles.sheet, cardStyle, sheetTransforms]}
        >
          {!hideHandle && !centered ? <View style={styles.handle} /> : null}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  bottomHost: { justifyContent: 'flex-end' },
  centeredHost: { justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
    ...shadow,
  },
  centered: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 360,
    ...shadow,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: palette.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
});
