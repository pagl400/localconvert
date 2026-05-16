import { format } from 'date-fns';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../theme/useTheme';
import type { HistoryEntry } from '../types/conversion';
import { formatBytes, formatDuration } from '../utils/format';

export function HistoryScreen() {
  const c = useTheme();
  const history = useAppStore((s) => s.history);
  const clearHistory = useAppStore((s) => s.clearHistory);

  const groups = groupByDay(history);

  const confirmClear = () => {
    Alert.alert('Clear history?', 'All entries will be removed. Output files on your device stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearHistory() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>History</Text>
        {history.length > 0 ? (
          <Pressable onPress={confirmClear} hitSlop={12}>
            <Text style={[styles.clearLink, { color: c.neg }]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Nothing yet</Text>
          <Text style={[styles.emptyText, { color: c.textSec }]}>
            Your past conversions will appear here once you’ve run one.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {groups.map(([dayLabel, entries]) => (
            <View key={dayLabel} style={styles.group}>
              <Text style={[styles.groupTitle, { color: c.textSec }]}>{dayLabel}</Text>
              <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
                {entries.map((entry, idx) => (
                  <View key={entry.id}>
                    {idx > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
                    <View style={styles.row}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                          {entry.sourceName}
                        </Text>
                        <Text style={[styles.meta, { color: c.textSec }]}>
                          {entry.sourceExt.toUpperCase()} → {entry.targetExt.toUpperCase()} ·{' '}
                          {formatBytes(entry.outputSize ?? 0)} · {formatDuration(entry.durationMs)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function groupByDay(history: HistoryEntry[]): [string, HistoryEntry[]][] {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const yesterday = format(new Date(now.getTime() - 86_400_000), 'yyyy-MM-dd');
  const map = new Map<string, HistoryEntry[]>();
  for (const entry of history) {
    const key = format(new Date(entry.finishedAt), 'yyyy-MM-dd');
    const arr = map.get(key) ?? [];
    arr.push(entry);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([key, entries]) => {
    let label: string;
    if (key === today) label = 'Today';
    else if (key === yesterday) label = 'Yesterday';
    else label = format(new Date(key), 'MMM d, yyyy');
    return [label, entries];
  });
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700' },
  clearLink: { fontSize: 14, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 20 },
  group: { gap: 8 },
  groupTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingLeft: 4,
    letterSpacing: 0.6,
  },
  list: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  row: { paddingHorizontal: 14, paddingVertical: 12 },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  name: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 280 },
});
