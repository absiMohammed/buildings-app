import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { palette } from './theme';

interface Props {
  onPress?: () => void;
  intensity?: number; // 0..100 blur amount (default 18)
  dim?: number;       // 0..1 extra dark overlay opacity (default 0.55)
}

/**
 * Shared backdrop for bottom-sheet style modals. Combines a true blur
 * (UIVisualEffectView on iOS) with a dark dim layer so the modal reads as
 * clearly separated from the page below.
 */
export function BlurBackdrop({ onPress, intensity = 18, dim = 0.55 }: Props) {
  return (
    <>
      <BlurView
        style={StyleSheet.absoluteFill}
        blurType="dark"
        blurAmount={intensity}
        reducedTransparencyFallbackColor={palette.text}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(15,23,42,${dim})` }]}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress} />
    </>
  );
}
