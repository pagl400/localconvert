import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { formatBytes, formatDuration } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Result'>;
type RouteT = RouteProp<RootStackParamList, 'Result'>;

export function ResultScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const job = useJobStore((s) => s.jobs[route.params.jobId]);

  if (!job || !job.outputUri) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.empty}>
          <Text style={{ color: c.textSec }}>Job not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleShare = async () => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(job.outputUri!);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open share sheet.';
      Alert.alert('Sharing error', message);
    }
  };

  const duration = job.finishedAt ? job.finishedAt - job.startedAt : 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.body}>
        <View style={[styles.check, { backgroundColor: c.accentSoft }]}>
          <Text style={[styles.checkMark, { color: c.accent }]}>✓</Text>
        </View>
        <Text style={[styles.title, { color: c.text }]}>Done</Text>
        <Text style={[styles.subtitle, { color: c.textSec }]} numberOfLines={2}>
          {job.outputName}
        </Text>

        <View style={[styles.statBox, { backgroundColor: c.surfaceAlt }]}>
          <Stat label="Size" value={formatBytes(job.outputSize ?? 0)} palette={c} />
          <Divider color={c.border} />
          <Stat label="Source" value={formatBytes(job.source.size)} palette={c} />
          <Divider color={c.border} />
          <Stat label="Took" value={formatDuration(duration)} palette={c} />
        </View>

        <Pressable
          onPress={() => void handleShare()}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaLabel}>Share / Save</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.popToTop()}
          style={({ pressed }) => [
            styles.secondary,
            { backgroundColor: c.surfaceAlt, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.secondaryLabel, { color: c.text }]}>Convert another</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

interface StatProps {
  label: string;
  value: string;
  palette: ReturnType<typeof useTheme>;
}

function Stat({ label, value, palette }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: palette.textSec }]}>{label}</Text>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, padding: 24, gap: 12, alignItems: 'stretch', justifyContent: 'center' },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 32, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center' },
  statBox: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 14, fontWeight: '600' },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: 8 },
  cta: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  secondary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  secondaryLabel: { fontSize: 15, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
