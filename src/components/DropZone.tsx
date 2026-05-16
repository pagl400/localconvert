import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/useTheme';

interface DropZoneProps {
  onPress: () => void;
  loading?: boolean;
}

export function DropZone({ onPress, loading = false }: DropZoneProps) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Pick a file to convert"
      style={({ pressed }) => [
        styles.zone,
        {
          backgroundColor: c.surface,
          borderColor: pressed ? c.accent : c.border,
          opacity: loading ? 0.6 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: c.accentSoft }]}>
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
            stroke={c.accent}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <Text style={[styles.title, { color: c.text }]}>Pick a file</Text>
      <Text style={[styles.subtitle, { color: c.textSec }]}>
        Choose any file from your device. Conversion runs locally — nothing is uploaded.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
});
