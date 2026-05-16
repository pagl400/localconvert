import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '../components/ProgressBar';
import { runConversion, type RunHandle } from '../services/converter';
import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Progress'>;
type RouteT = RouteProp<RootStackParamList, 'Progress'>;

export function ProgressScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const job = useJobStore((s) => s.jobs[route.params.jobId]);
  const updateJob = useJobStore((s) => s.updateJob);
  const addHistory = useAppStore((s) => s.addHistory);
  const handleRef = useRef<RunHandle | null>(null);

  useEffect(() => {
    if (!job || job.status !== 'pending') return;
    updateJob(job.id, { status: 'running' });
    handleRef.current = runConversion(job, {
      onProgress: (pct) => updateJob(job.id, { progress: pct }),
      onDone: (outputUri, outputSize) => {
        const finishedAt = Date.now();
        updateJob(job.id, {
          status: 'done',
          progress: 100,
          outputUri,
          outputSize,
          finishedAt,
        });
        addHistory({
          id: job.id,
          sourceName: job.source.name,
          sourceExt: job.source.ext,
          targetExt: job.targetExt,
          sourceSize: job.source.size,
          outputSize,
          durationMs: finishedAt - job.startedAt,
          finishedAt,
        });
        navigation.replace('Result', { jobId: job.id });
      },
      onError: (err) => updateJob(job.id, { status: 'error', error: err }),
    });
    return () => handleRef.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (!job) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textSec, padding: 16 }}>Job not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: c.text }]}>Converting…</Text>
        <Text style={[styles.subtitle, { color: c.textSec }]} numberOfLines={2}>
          {job.source.name} → {job.outputName}
        </Text>

        <View style={styles.progressBlock}>
          <ProgressBar value={job.progress} />
          <Text style={[styles.pct, { color: c.text }]}>{Math.round(job.progress)}%</Text>
        </View>

        <Text style={[styles.note, { color: c.textSec }]}>
          Running on your device. Nothing is uploaded.
        </Text>

        {job.status === 'error' ? (
          <Text style={[styles.error, { color: c.neg }]}>{job.error ?? 'Conversion failed.'}</Text>
        ) : null}

        <Pressable
          onPress={() => {
            handleRef.current?.cancel();
            navigation.goBack();
          }}
          style={({ pressed }) => [
            styles.cancel,
            { backgroundColor: c.surfaceAlt, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.cancelLabel, { color: c.text }]}>
            {job.status === 'error' ? 'Back' : 'Cancel'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, padding: 24, gap: 16, alignItems: 'stretch', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center' },
  progressBlock: { gap: 8, marginTop: 16 },
  pct: { fontSize: 14, textAlign: 'right', fontWeight: '600' },
  note: { fontSize: 12, textAlign: 'center' },
  error: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 8, paddingHorizontal: 8 },
  cancel: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, marginTop: 16 },
  cancelLabel: { fontSize: 14, fontWeight: '600' },
});
