import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FileCard } from '../components/FileCard';
import { FormatChip } from '../components/FormatChip';
import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { GROUP_LABEL, popularTargets, targetFormatsFor } from '../utils/formats';

type Nav = NativeStackNavigationProp<RootStackParamList, 'TargetFormat'>;
type RouteT = RouteProp<RootStackParamList, 'TargetFormat'>;

export function TargetFormatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const file = useJobStore((s) => s.files[route.params.fileId]);

  const popular = useMemo(() => (file ? popularTargets(file.format) : []), [file]);
  const all = useMemo(() => (file ? targetFormatsFor(file.format) : []), [file]);

  if (!file) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.empty}>
          <Text style={{ color: c.textSec }}>File not found.</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.link, { color: c.accent }]}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const pick = (ext: string) =>
    navigation.navigate('Options', { fileId: file.id, targetFormat: ext });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerSide}>
          <Text style={[styles.back, { color: c.accent }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: c.text }]}>Convert to</Text>
        <View style={styles.headerSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <FileCard file={file} />

        {popular.length > 0 ? (
          <Section title="Popular" textColor={c.textSec}>
            <View style={styles.chipRow}>
              {popular.map((t) => (
                <FormatChip key={t.ext} label={t.label} onPress={() => pick(t.ext)} />
              ))}
            </View>
          </Section>
        ) : null}

        {all.length > 0 ? (
          <Section title={`All ${GROUP_LABEL[file.format.group].toLowerCase()} formats`} textColor={c.textSec}>
            <View style={styles.chipRow}>
              {all.map((t) => (
                <FormatChip key={t.ext} label={t.label} onPress={() => pick(t.ext)} />
              ))}
            </View>
          </Section>
        ) : (
          <View style={[styles.notice, { backgroundColor: c.surfaceAlt }]}>
            <Text style={[styles.noticeText, { color: c.textSec }]}>
              No conversions available for this file type yet.
            </Text>
          </View>
        )}
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
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 24 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingLeft: 4,
    letterSpacing: 0.6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  link: { fontSize: 16, fontWeight: '600' },
  notice: { padding: 14, borderRadius: 12 },
  noticeText: { fontSize: 13, lineHeight: 18 },
});
