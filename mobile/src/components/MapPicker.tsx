import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, radii, spacing, type } from './theme';
import { useT } from '../i18n';

export interface LatLng {
  lat: number;
  lng: number;
}

const DEFAULT_REGION: Region = {
  // Fallback view when no pin is set yet (roughly the Levant region).
  latitude: 31.9,
  longitude: 35.2,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
};

/**
 * Full-screen map for picking a building's location. Tap or drag the pin;
 * "Save" returns the chosen coordinates.
 */
export function MapPicker({
  visible,
  initial,
  onPick,
  onClose,
}: {
  visible: boolean;
  initial?: LatLng | null;
  onPick: (coords: LatLng) => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [coord, setCoord] = useState<LatLng | null>(initial ?? null);

  const region: Region = initial
    ? { latitude: initial.lat, longitude: initial.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : DEFAULT_REGION;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.header}>
          <Text style={type.title}>{t('map_pick_title')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <MapView
          style={styles.map}
          initialRegion={region}
          onPress={(e) => {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            setCoord({ lat: latitude, lng: longitude });
          }}
        >
          {coord ? (
            <Marker
              coordinate={{ latitude: coord.lat, longitude: coord.lng }}
              draggable
              onDragEnd={(e) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                setCoord({ lat: latitude, lng: longitude });
              }}
            />
          ) : null}
        </MapView>

        <View style={styles.footer}>
          <Text style={[type.small, styles.coordText]}>
            {coord ? `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}` : t('map_tap_to_pin')}
          </Text>
          <TouchableOpacity
            style={[styles.saveBtn, !coord && styles.saveDisabled]}
            disabled={!coord}
            onPress={() => coord && onPick(coord)}
          >
            <Text style={styles.saveText}>{t('save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  close: { fontSize: 20, color: palette.textMuted, paddingHorizontal: 8 },
  map: { flex: 1 },
  footer: { padding: spacing.lg, gap: spacing.md },
  coordText: { textAlign: 'center', color: palette.textMuted },
  saveBtn: { backgroundColor: palette.accent, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
