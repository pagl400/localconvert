import { StyleSheet, Text, View } from 'react-native';

import type { Mode } from '../store/useAppStore';
import { useTheme } from '../theme/useTheme';

interface ModeBadgeProps {
  mode: Mode;
}

export function ModeBadge({ mode }: ModeBadgeProps) {
  const c = useTheme();
  const isSimple = mode === 'simple';
  const bg = isSimple ? c.accentSoft : c.surfaceAlt;
  const fg = isSimple ? c.accent : c.text;

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text
        allowFontScaling={false}
        style={[styles.label, { color: fg }]}
      >
        {isSimple ? 'SIMPLE' : 'EXPERT'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
});
