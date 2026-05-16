import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../theme/useTheme';

interface FormatChipProps {
  label: string;
  active?: boolean;
  onPress: () => void;
}

export function FormatChip({ label, active = false, onPress }: FormatChipProps) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select format ${label}`}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? c.accent : c.surfaceAlt,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: active ? '#ffffff' : c.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
});
