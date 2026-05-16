import { StyleSheet, Text, View } from 'react-native';

import type { SelectedFile } from '../types/conversion';
import { useTheme } from '../theme/useTheme';
import { formatBytes } from '../utils/format';

interface FileCardProps {
  file: SelectedFile;
}

export function FileCard({ file }: FileCardProps) {
  const c = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.badge, { backgroundColor: c.accentSoft }]}>
        <Text style={[styles.badgeText, { color: c.accent }]}>
          {(file.ext || '?').toUpperCase()}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={[styles.meta, { color: c.textSec }]}>
          {file.format.label} · {formatBytes(file.size)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12 },
});
