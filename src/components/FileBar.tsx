import { Platform, StyleSheet, Text, View } from 'react-native';

import type { SelectedFile } from '../types/conversion';
import { radius } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { formatBytes } from '../utils/format';

import { FileChip } from './FileChip';

interface FileBarProps {
  file: SelectedFile;
  metaSuffix?: string;
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// Card-style row used at the top of every post-pick screen. Renders the file
// badge + name + size in mono. metaSuffix appends an extra "· …" segment for
// Expert mode (e.g. dimensions, color profile).
export function FileBar({ file, metaSuffix }: FileBarProps) {
  const c = useTheme();
  const size = formatBytes(file.size);
  const meta = metaSuffix ? `${size} · ${metaSuffix}` : size;
  return (
    <View style={[styles.bar, { backgroundColor: c.surface, borderColor: c.separator }]}>
      <FileChip ext={file.ext} size={48} radius={radius.formatBadge} />
      <View style={styles.body}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={[styles.meta, { color: c.textSec, fontFamily: MONO }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12 },
});
