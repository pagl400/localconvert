import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { FileBar } from '../components/FileBar';
import { FileChip } from '../components/FileChip';
import { NavBar } from '../components/NavBar';
import { Overline } from '../components/Overline';
import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { radius } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { ConversionJob, FormatInfo } from '../types/conversion';
import type { RootStackParamList } from '../types/navigation';
import { safeBaseName } from '../utils/format';
import { defaultTarget, moreTargets, simplePicks } from '../utils/simplePicks';
import { findFormat } from '../utils/formats';
import { selection } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'TargetFormat'>;
type RouteT = RouteProp<RootStackParamList, 'TargetFormat'>;

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TargetFormatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const file = useJobStore((s) => s.files[route.params.fileId]);
  const mode = useAppStore((s) => s.mode);

  if (!file) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.empty}>
          <Text style={{ color: c.textSec }}>Datei nicht gefunden.</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.link, { color: c.accent }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'simple') return <SimpleLayout />;
  return <ExpertLayout />;
}

function ChevronRight({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ──────────────────── Simple layout ────────────────────

function SimpleLayout() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const file = useJobStore((s) => s.files[route.params.fileId])!;
  const startJob = useJobStore((s) => s.startJob);
  const defaultQuality = useAppStore((s) => s.defaultQuality);

  const picks = useMemo(() => simplePicks(file.ext), [file.ext]);
  const [selected, setSelected] = useState<string | null>(() => defaultTarget(file.ext));
  const [moreOpen, setMoreOpen] = useState(false);

  const selectedFormat = useMemo(
    () => (selected ? findFormat(selected) : null),
    [selected],
  );

  const choose = (ext: string) => {
    selection();
    setSelected(ext);
  };

  const start = () => {
    if (!selectedFormat) return;
    const job: ConversionJob = {
      id: uid(),
      source: file,
      targetExt: selectedFormat.ext,
      quality: defaultQuality,
      outputName: `${safeBaseName(file.name)}.${selectedFormat.ext}`,
      status: 'pending',
      progress: 0,
      error: null,
      outputUri: null,
      outputSize: null,
      startedAt: Date.now(),
      finishedAt: null,
    };
    // Simple mode skips Options entirely. The default quality from Settings
    // + per-converter defaults are good enough for "three taps"; Expert users
    // get the full panel. ProgressScreen kicks off the actual conversion.
    startJob(job);
    navigation.replace('Progress', { jobId: job.id });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <NavBar mode="simple" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FileBar file={file} />
        <Text style={[styles.headline, { color: c.text }]}>Konvertieren zu…</Text>

        {picks.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: c.surfaceAlt, borderRadius: radius.card, padding: 16 }]}>
            <Text style={{ color: c.textSec, textAlign: 'center' }}>
              Für diesen Dateityp sind aktuell keine Konvertierungen verfügbar.
            </Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {picks.map((p) => (
              <FormatCardRow
                key={p.format.ext}
                format={p.format}
                hint={p.hint}
                isBest={p.isBest}
                selected={selected === p.format.ext}
                onPress={() => choose(p.format.ext)}
              />
            ))}
            <Pressable
              onPress={() => setMoreOpen(true)}
              style={({ pressed }) => [styles.moreRow, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <Text style={[styles.moreLabel, { color: c.accent }]}>Mehr Formate</Text>
              <ChevronRight color={c.accent} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={[styles.ctaBar, { backgroundColor: c.bg }]}>
        <Pressable
          disabled={!selectedFormat}
          onPress={start}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: selectedFormat ? c.accent : c.surfaceAlt,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.ctaLabel, { color: selectedFormat ? '#fff' : c.textSec }]}>
            {selectedFormat
              ? `Start → ${selectedFormat.label.toUpperCase()}`
              : 'Format wählen'}
          </Text>
        </Pressable>
      </View>

      <MoreFormatsSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        sourceExt={file.ext}
        exclude={new Set(picks.map((p) => p.format.ext))}
        onPick={(ext) => {
          setMoreOpen(false);
          choose(ext);
        }}
      />
    </SafeAreaView>
  );
}

interface FormatCardRowProps {
  format: FormatInfo;
  hint: string;
  isBest: boolean;
  selected: boolean;
  onPress: () => void;
}

function FormatCardRow({ format, hint, isBest, selected, onPress }: FormatCardRowProps) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.formatCard,
        {
          backgroundColor: c.surface,
          borderColor: selected ? c.accent : c.separator,
          borderWidth: selected ? 2.5 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <FileChip ext={format.ext} size={56} radius={radius.formatBadge} />
      <View style={styles.formatBody}>
        <View style={styles.formatTitleRow}>
          <Text style={[styles.formatTitle, { color: c.text }]}>{format.label}</Text>
          {isBest ? (
            <View style={[styles.bestPill, { backgroundColor: c.accentSoft }]}>
              <Text style={[styles.bestLabel, { color: c.accent }]}>BEST</Text>
            </View>
          ) : null}
        </View>
        {hint ? (
          <Text style={[styles.formatHint, { color: c.textSec }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Radio active={selected} c={c} />
    </Pressable>
  );
}

function Radio({ active, c }: { active: boolean; c: ReturnType<typeof useTheme> }) {
  return (
    <View
      style={[
        styles.radio,
        { borderColor: active ? c.accent : c.separator, backgroundColor: active ? c.accent : 'transparent' },
      ]}
    >
      {active ? (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

// ──────────────────── More Formats sheet ────────────────────

interface MoreFormatsSheetProps {
  open: boolean;
  onClose: () => void;
  sourceExt: string;
  exclude: Set<string>;
  onPick: (ext: string) => void;
}

function MoreFormatsSheet({ open, onClose, sourceExt, exclude, onPick }: MoreFormatsSheetProps) {
  const c = useTheme();
  const data = useMemo(() => moreTargets(sourceExt, exclude), [sourceExt, exclude]);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.sheetBackdrop} />
      <View style={[styles.sheet, { backgroundColor: c.surface }]}>
        <View style={[styles.sheetGrabber, { backgroundColor: c.separator }]} />
        <Text style={[styles.sheetTitle, { color: c.text }]}>Mehr Formate</Text>
        <FlatList
          data={data}
          keyExtractor={(item) => item.ext}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item.ext)}
              style={({ pressed }) => [
                styles.sheetRow,
                { backgroundColor: pressed ? c.surfaceAlt : 'transparent' },
              ]}
            >
              <FileChip ext={item.ext} size={36} radius={10} />
              <Text style={[styles.sheetRowLabel, { color: c.text }]}>{item.label}</Text>
              <Text style={[styles.sheetRowExt, { color: c.textSec, fontFamily: MONO }]}>
                .{item.ext}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </Modal>
  );
}

// ──────────────────── Expert layout ────────────────────

function ExpertLayout() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const file = useJobStore((s) => s.files[route.params.fileId])!;

  const allTargets = useMemo(() => {
    const set = new Set<string>();
    const list: FormatInfo[] = [];
    for (const pick of simplePicks(file.ext)) {
      if (set.has(pick.format.ext)) continue;
      set.add(pick.format.ext);
      list.push(pick.format);
    }
    for (const fmt of moreTargets(file.ext, set)) {
      if (set.has(fmt.ext)) continue;
      set.add(fmt.ext);
      list.push(fmt);
    }
    return list;
  }, [file.ext]);

  const dimsHint = useMemo(() => {
    // We don't have probed dimensions here on every screen; show file group instead.
    return `${file.format.label} · ${file.ext.toUpperCase()}`;
  }, [file]);

  const pickChip = (ext: string) => {
    selection();
    navigation.navigate('Options', { fileId: file.id, targetFormat: ext });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <NavBar mode="expert" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]} showsVerticalScrollIndicator={false}>
        <FileBar file={file} metaSuffix={dimsHint} />

        <Overline style={{ marginTop: 10 }}>ZIELFORMAT</Overline>
        <View style={styles.chipWrap}>
          {allTargets.map((fmt) => (
            <Pressable
              key={fmt.ext}
              onPress={() => pickChip(fmt.ext)}
              style={({ pressed }) => [
                styles.expertChip,
                { backgroundColor: pressed ? c.accent : c.surface, borderColor: c.separator },
              ]}
            >
              <Text
                style={[
                  styles.expertChipLabel,
                  { color: c.text, fontFamily: MONO },
                ]}
              >
                {fmt.ext.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {file.ext === 'pdf' ? (
          <>
            <Overline style={{ marginTop: 18 }}>PDF-TOOLS</Overline>
            <View style={styles.chipWrap}>
              <ExpertToolChip label="Komprimieren (leicht)" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'compress-light' })} />
              <ExpertToolChip label="Komprimieren" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'compress' })} />
              <ExpertToolChip label="Komprimieren (stark)" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'compress-strong' })} />
              <ExpertToolChip label="90° drehen" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'rotate90' })} />
              <ExpertToolChip label="180° drehen" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'rotate180' })} />
              <ExpertToolChip label="270° drehen" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'rotate270' })} />
              <ExpertToolChip label="Seiten löschen" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'delete' })} />
              <ExpertToolChip label="Seiten extrahieren" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'split' })} />
              <ExpertToolChip label="PDFs zusammenfügen" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'pdf', variant: 'merge' })} />
              <ExpertToolChip label="OCR → TXT" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'txt', variant: 'ocr' })} />
            </View>
          </>
        ) : null}

        {file.ext === 'docx' ? (
          <>
            <Overline style={{ marginTop: 18 }}>HTML-VARIANTEN</Overline>
            <View style={styles.chipWrap}>
              <ExpertToolChip label="HTML (klar)" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'html', variant: 'plain' })} />
              <ExpertToolChip label="HTML (gestylt)" onPress={() => navigation.navigate('Options', { fileId: file.id, targetFormat: 'html', variant: 'styled' })} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExpertToolChip({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.expertChip,
        { backgroundColor: c.surface, borderColor: c.separator, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.expertChipLabel, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

// ──────────────────── Styles ────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },
  headline: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, marginTop: 14 },
  cardList: { gap: 10 },
  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.card,
  },
  formatBody: { flex: 1, minWidth: 0, gap: 2 },
  formatTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formatTitle: { fontSize: 17, fontWeight: '700' },
  bestPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bestLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  formatHint: { fontSize: 13 },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  moreLabel: { fontSize: 14, fontWeight: '600' },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  cta: {
    paddingVertical: 17,
    paddingHorizontal: 24,
    borderRadius: radius.button,
    alignItems: 'center',
  },
  ctaLabel: { fontSize: 17, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  expertChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  expertChipLabel: { fontSize: 13, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  link: { fontSize: 16, fontWeight: '600' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '72%',
    borderTopLeftRadius: radius.cardXl,
    borderTopRightRadius: radius.cardXl,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetGrabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginVertical: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, paddingHorizontal: 4 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
  },
  sheetRowLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
  sheetRowExt: { fontSize: 12 },
});
