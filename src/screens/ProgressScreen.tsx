import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { FileChip } from '../components/FileChip';
import { Overline } from '../components/Overline';
import { runConversion, type RunHandle } from '../services/converter';
import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { radius } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { formatBytes } from '../utils/format';
import { notifyError, notifySuccess } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Progress'>;
type RouteT = RouteProp<RootStackParamList, 'Progress'>;

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// Generic 4-step progression. The converter service emits a percentage; we
// derive named steps from it so the user sees "something moving" rather than
// a bare bar. Steps are intentionally vague — they apply to every converter.
function stepsFor(sourceExt: string, targetExt: string) {
  return [
    'Datei lesen',
    `${sourceExt.toUpperCase()} dekodieren`,
    `${targetExt.toUpperCase()} aufbauen`,
    'Datei speichern',
  ];
}

export function ProgressScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const job = useJobStore((s) => s.jobs[route.params.jobId]);
  const updateJob = useJobStore((s) => s.updateJob);
  const addHistory = useAppStore((s) => s.addHistory);
  const handleRef = useRef<RunHandle | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

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
        notifySuccess();
        navigation.replace('Result', { jobId: job.id });
      },
      onError: (err) => {
        notifyError();
        updateJob(job.id, { status: 'error', error: err });
      },
    });
    return () => handleRef.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  const steps = useMemo(
    () => (job ? stepsFor(job.source.ext, job.targetExt) : []),
    [job],
  );

  if (!job) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textSec, padding: 16 }}>Job nicht gefunden.</Text>
      </SafeAreaView>
    );
  }

  const pct = Math.max(0, Math.min(100, job.progress));
  const activeStep = Math.min(steps.length - 1, Math.floor(pct / (100 / steps.length)));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.body}>
        <View style={[styles.fileCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
          <View style={styles.fileRow}>
            <FileChip ext={job.source.ext} size={48} radius={radius.formatBadge} />
            <View style={styles.fileBody}>
              <Text style={[styles.fileName, { color: c.text }]} numberOfLines={1}>
                {job.source.name}
              </Text>
              <Text style={[styles.fileMeta, { color: c.textSec, fontFamily: MONO }]} numberOfLines={1}>
                {formatBytes(job.source.size)} · {Math.round(pct)}%
              </Text>
            </View>
            <ArrowRight color={c.accent} />
            <FileChip ext={job.targetExt} size={48} radius={radius.formatBadge} />
          </View>
          <View style={[styles.bar, { backgroundColor: c.surfaceAlt }]}>
            <View
              style={[
                styles.barFill,
                { width: `${pct}%`, backgroundColor: c.accent },
              ]}
            />
          </View>
        </View>

        <Overline style={{ marginTop: 18, paddingLeft: 4 }}>SCHRITTE</Overline>
        <View style={styles.steps}>
          {steps.map((label, i) => {
            const done = i < activeStep || pct >= 100;
            const active = i === activeStep && pct < 100;
            return (
              <View key={label} style={styles.stepRow}>
                <StepIcon done={done} active={active} pulse={pulse} c={c} />
                <Text style={[
                  styles.stepLabel,
                  { color: done || active ? c.text : c.textTer, fontWeight: active ? '600' : '500' },
                ]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>

        {job.status === 'error' ? (
          <Text style={[styles.error, { color: c.neg }]}>{job.error ?? 'Konvertierung fehlgeschlagen.'}</Text>
        ) : null}
      </View>

      <View style={styles.ctaBar}>
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
            {job.status === 'error' ? 'Zurück' : 'Abbrechen'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

interface StepIconProps {
  done: boolean;
  active: boolean;
  pulse: Animated.Value;
  c: ReturnType<typeof useTheme>;
}

function StepIcon({ done, active, pulse, c }: StepIconProps) {
  if (done) {
    return (
      <View style={[styles.stepDot, { backgroundColor: c.pos }]}>
        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="#fff"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );
  }
  if (active) {
    return (
      <Animated.View
        style={[
          styles.stepDot,
          { borderWidth: 2, borderColor: c.accent, opacity: pulse, backgroundColor: c.accentSoft },
        ]}
      >
        <Svg width={18} height={18} viewBox="0 0 18 18">
          <Circle cx={9} cy={9} r={3} fill={c.accent} />
        </Svg>
      </Animated.View>
    );
  }
  return (
    <View style={[styles.stepDot, { backgroundColor: c.surfaceAlt }]}>
      <View style={{ width: 6, height: 1.5, backgroundColor: c.textTer, borderRadius: 1 }} />
    </View>
  );
}

function ArrowRight({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12h14M13 6l6 6-6 6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 24, gap: 12 },
  fileCard: {
    borderRadius: radius.card,
    padding: 14,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileBody: { flex: 1, minWidth: 0, gap: 2 },
  fileName: { fontSize: 16, fontWeight: '600' },
  fileMeta: { fontSize: 12 },
  bar: { height: 3, borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
  steps: { gap: 14, marginTop: 4, paddingLeft: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontSize: 15 },
  error: { fontSize: 13, lineHeight: 18, marginTop: 12, paddingHorizontal: 8 },
  ctaBar: { paddingHorizontal: 16, paddingBottom: 24, alignItems: 'center' },
  cancel: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 99,
  },
  cancelLabel: { fontSize: 15, fontWeight: '600' },
});
