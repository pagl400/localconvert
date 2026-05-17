import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FileCard } from '../components/FileCard';
import { FormatChip } from '../components/FormatChip';
import { isSupported, supportedTargets } from '../services/converters';
import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { findFormat, GROUP_LABEL, targetFormatsFor } from '../utils/formats';

type Nav = NativeStackNavigationProp<RootStackParamList, 'TargetFormat'>;
type RouteT = RouteProp<RootStackParamList, 'TargetFormat'>;

export function TargetFormatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const file = useJobStore((s) => s.files[route.params.fileId]);

  const supported = useMemo(
    () =>
      file
        ? targetFormatsFor(file.format).filter((t) => isSupported(file.ext, t.ext))
        : [],
    [file],
  );
  const unsupported = useMemo(
    () =>
      file
        ? targetFormatsFor(file.format).filter((t) => !isSupported(file.ext, t.ext))
        : [],
    [file],
  );
  const popular = useMemo(() => supported.slice(0, 4), [supported]);
  const crossGroup = useMemo(() => {
    if (!file) return [];
    const sameGroupExts = new Set(targetFormatsFor(file.format).map((t) => t.ext));
    return Array.from(supportedTargets(file.ext))
      .filter((ext) => !sameGroupExts.has(ext) && ext !== file.ext)
      .map((ext) => findFormat(ext))
      .filter((f): f is NonNullable<typeof f> => f !== null);
  }, [file]);

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

  const pick = (ext: string, variant?: 'plain' | 'styled') =>
    navigation.navigate('Options', { fileId: file.id, targetFormat: ext, variant });

  // DOCX → HTML supports two variants: "plain" (semantic) and "styled" (full
  // visual fidelity). Surface both as separate cards so the user picks once
  // here and doesn't see an extra option screen.
  const showDocxHtmlVariants = file.ext === 'docx';

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
              {popular.map((t) =>
                showDocxHtmlVariants && t.ext === 'html' ? (
                  <View key="html-variants" style={styles.chipRow}>
                    <FormatChip label="HTML (clean)" onPress={() => pick('html', 'plain')} />
                    <FormatChip label="HTML (styled)" onPress={() => pick('html', 'styled')} />
                  </View>
                ) : (
                  <FormatChip key={t.ext} label={t.label} onPress={() => pick(t.ext)} />
                ),
              )}
            </View>
          </Section>
        ) : null}

        {supported.length > 0 ? (
          <Section
            title={`All ${GROUP_LABEL[file.format.group].toLowerCase()} formats`}
            textColor={c.textSec}
          >
            <View style={styles.chipRow}>
              {supported.map((t) =>
                showDocxHtmlVariants && t.ext === 'html' ? (
                  <View key="html-variants-all" style={styles.chipRow}>
                    <FormatChip label="HTML (clean)" onPress={() => pick('html', 'plain')} />
                    <FormatChip label="HTML (styled)" onPress={() => pick('html', 'styled')} />
                  </View>
                ) : (
                  <FormatChip key={t.ext} label={t.label} onPress={() => pick(t.ext)} />
                ),
              )}
            </View>
          </Section>
        ) : (
          <View style={[styles.notice, { backgroundColor: c.surfaceAlt }]}>
            <Text style={[styles.noticeText, { color: c.textSec }]}>
              No conversions available for this file type in this build yet. The full engine
              (Phase 2) will add PDF, DOCX, audio and video.
            </Text>
          </View>
        )}

        {crossGroup.length > 0 ? (
          <Section title="Also available" textColor={c.textSec}>
            <View style={styles.chipRow}>
              {crossGroup.map((t) => (
                <FormatChip key={t.ext} label={t.label} onPress={() => pick(t.ext)} />
              ))}
            </View>
          </Section>
        ) : null}

        {unsupported.length > 0 ? (
          <Section title="Coming with the full engine" textColor={c.textTer}>
            <View style={styles.chipRow}>
              {unsupported.map((t) => (
                <View
                  key={t.ext}
                  style={[styles.chipDisabled, { backgroundColor: c.surfaceAlt }]}
                >
                  <Text style={[styles.chipDisabledLabel, { color: c.textTer }]}>{t.label}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.hint, { color: c.textTer }]}>
              These need native libraries (FFmpeg, Ghostscript, Pandoc) and a development build.
            </Text>
          </Section>
        ) : null}
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
  chipDisabled: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 56,
    alignItems: 'center',
    opacity: 0.6,
  },
  chipDisabledLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  hint: { fontSize: 11, lineHeight: 16, paddingLeft: 4 },
});
