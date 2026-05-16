import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/useTheme';

interface ProgressBarProps {
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const c = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: c.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});
