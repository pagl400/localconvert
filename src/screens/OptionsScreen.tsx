import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { ConversionJob, Quality } from '../types/conversion';
import type { RootStackParamList } from '../types/navigation';
import { safeBaseName } from '../utils/format';
import { findFormat } from '../utils/formats';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Options'>;
type RouteT = RouteProp<RootStackParamList, 'Options'>;

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Maximum' },
];

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function OptionsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const file = useJobStore((s) => s.files[route.params.fileId]);
  const startJob = useJobStore((s) => s.startJob);
  const defaultQuality = useAppStore((s) => s.defaultQuality);

  const [quality, setQuality] = useState<Quality>(defaultQuality);
  const [name, setName] = useState(() => (file ? safeBaseName(file.name) : 'output'));

  const targetFormat = useMemo(() => findFormat(route.params.targetFormat), [route.params.targetFormat]);

  if (!file || !targetFormat) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.empty}>
          <Text style={{ color: c.textSec }}>Conversion details missing.</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.link, { color: c.accent }]}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const start = () => {
    const job: ConversionJob = {
      id: uid(),
      source: file,
      targetExt: targetFormat.ext,
      quality,
      outputName: `${name || 'output'}.${targetFormat.ext}`,
      status: 'pending',
      progress: 0,
      error: null,
      outputUri: null,
      outputSize: null,
      startedAt: Date.now(),
      finishedAt: null,
    };
    startJob(job);
    navigation.replace('Progress', { jobId: job.id });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerSide}>
          <Text style={[styles.back, { color: c.accent }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: c.text }]}>Options</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.heading, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.headingText, { color: c.text }]}>
            {file.format.label} → {targetFormat.label}
          </Text>
          {targetFormat.description ? (
            <Text style={[styles.headingSub, { color: c.textSec }]}>{targetFormat.description}</Text>
          ) : null}
        </View>

        <Section title="Quality" textColor={c.textSec}>
          <View style={[styles.segmented, { backgroundColor: c.surfaceAlt }]}>
            {QUALITY_OPTIONS.map((opt) => {
              const active = opt.value === quality;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.segment, active && { backgroundColor: c.surface }]}
                  onPress={() => setQuality(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      { color: active ? c.text : c.textSec, fontWeight: active ? '600' : '500' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Output name" textColor={c.textSec}>
          <View style={[styles.nameRow, { backgroundColor: c.surfaceAlt }]}>
            <TextInput
              value={name}
              onChangeText={(v) => setName(v.replace(/[^a-zA-Z0-9._-]/g, '_'))}
              style={[styles.nameInput, { color: c.text }]}
              placeholder="output"
              placeholderTextColor={c.textTer}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <Text style={[styles.nameSuffix, { color: c.textSec }]}>.{targetFormat.ext}</Text>
          </View>
        </Section>

        <Pressable
          onPress={start}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start conversion"
        >
          <Text style={styles.ctaLabel}>Convert now</Text>
        </Pressable>
        <Text style={[styles.disclaimer, { color: c.textSec }]}>
          Runs entirely on your device. No upload, no account, no tracking.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SectionProps {
  title: string;
  textColor: string;
  children: React.ReactNode;
}

function Section({ title, textColor, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerSide: { minWidth: 60 },
  back: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 20 },
  heading: { padding: 16, borderRadius: 14, gap: 4 },
  headingText: { fontSize: 18, fontWeight: '700' },
  headingSub: { fontSize: 13, lineHeight: 18 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingLeft: 4,
    letterSpacing: 0.6,
  },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentLabel: { fontSize: 14 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  nameInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  nameSuffix: { fontSize: 14, fontWeight: '500' },
  cta: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  disclaimer: { fontSize: 12, textAlign: 'center', paddingHorizontal: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  link: { fontSize: 16, fontWeight: '600' },
});
