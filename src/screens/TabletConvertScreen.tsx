import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { FileChip } from '../components/FileChip';
import { Logo } from '../components/Logo';
import { Overline } from '../components/Overline';
import { Wordmark } from '../components/Wordmark';
import { pickFile } from '../services/filePicker';
import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { radius } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { ConversionJob, FormatInfo } from '../types/conversion';
import type { RootStackParamList } from '../types/navigation';
import { safeBaseName } from '../utils/format';
import { impactLight } from '../utils/haptics';
import { defaultTarget, moreTargets, simplePicks } from '../utils/simplePicks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TabletConvertScreen() {
  const c = useTheme();
  const navigation = useNavigation<Nav>();
  const files = useJobStore((s) => s.files);
  const addFile = useJobStore((s) => s.addFile);
  const startJob = useJobStore((s) => s.startJob);
  const defaultQuality = useAppStore((s) => s.defaultQuality);

  const fileList = useMemo(
    () => Object.values(files).sort((a, b) => b.pickedAt - a.pickedAt),
    [files],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedFile = selectedId ? files[selectedId] : null;

  // Per-file selected target + filename, reset when a new file is picked.
  const [targetExt, setTargetExt] = useState<string | null>(null);
  const [name, setName] = useState<string>('output');

  const handlePick = async () => {
    impactLight();
    const trigger = (source: 'photos' | 'files') => {
      if (source === 'photos') {
        navigation.navigate('PhotoPicker');
        return;
      }
      void (async () => {
        try {
          const f = await pickFile();
          if (!f) return;
          addFile(f);
          setSelectedId(f.id);
          setName(safeBaseName(f.name));
          setTargetExt(defaultTarget(f.ext));
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Die Auswahl konnte nicht geöffnet werden.';
          Alert.alert('Fehler beim Öffnen', message);
        }
      })();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Aus Fotos & Videos', 'Aus Dateien', 'Abbrechen'],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) trigger('photos');
          else if (index === 1) trigger('files');
        },
      );
      return;
    }
    Alert.alert('Datei auswählen', undefined, [
      { text: 'Aus Fotos & Videos', onPress: () => trigger('photos') },
      { text: 'Aus Dateien', onPress: () => trigger('files') },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  };

  const selectFile = (id: string) => {
    const f = files[id];
    if (!f) return;
    setSelectedId(id);
    setName(safeBaseName(f.name));
    setTargetExt(defaultTarget(f.ext));
  };

  const start = () => {
    if (!selectedFile || !targetExt) return;
    impactLight();
    const job: ConversionJob = {
      id: uid(),
      source: selectedFile,
      targetExt,
      quality: defaultQuality,
      outputName: `${name || 'output'}.${targetExt}`,
      status: 'pending',
      progress: 0,
      error: null,
      outputUri: null,
      outputSize: null,
      startedAt: Date.now(),
      finishedAt: null,
    };
    startJob(job);
    navigation.navigate('Progress', { jobId: job.id });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.row}>
        <View style={[styles.sidebar, { borderRightColor: c.separator }]}>
          <View style={styles.brandRow}>
            <Logo size={32} />
            <Wordmark size={18} />
          </View>

          <Pressable
            onPress={handlePick}
            style={({ pressed }) => [
              styles.pickPill,
              { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 5v14M5 12h14"
                stroke="#fff"
                strokeWidth={2.4}
                strokeLinecap="round"
              />
            </Svg>
            <Text style={styles.pickPillLabel}>Datei wählen</Text>
          </Pressable>

          <Overline style={{ marginTop: 18, paddingLeft: 4 }}>
            {`WARTESCHLANGE${fileList.length > 0 ? `  ·  ${fileList.length}` : ''}`}
          </Overline>
          <View style={{ flex: 1, marginTop: 8 }}>
            {fileList.length === 0 ? (
              <Text style={[styles.emptyQueue, { color: c.textTer }]}>Noch keine Datei.</Text>
            ) : (
              <FlatList
                data={fileList}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => selectFile(item.id)}
                    style={({ pressed }) => [
                      styles.queueRow,
                      {
                        backgroundColor:
                          selectedId === item.id ? c.accentSoft : pressed ? c.surfaceAlt : 'transparent',
                      },
                    ]}
                  >
                    <FileChip ext={item.ext} size={28} radius={8} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[styles.queueName, { color: c.text }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            )}
          </View>

          <View style={styles.sidebarFooter}>
            <View style={styles.lockRow}>
              <LockGlyph color={c.textSec} />
              <Text style={[styles.lockText, { color: c.textSec }]}>
                Lokal · kein Upload
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.main}>
          {selectedFile ? (
            <SelectedPane
              file={selectedFile}
              targetExt={targetExt}
              setTargetExt={setTargetExt}
              name={name}
              setName={setName}
              onConvert={start}
            />
          ) : (
            <EmptyPane onPick={handlePick} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function EmptyPane({ onPick }: { onPick: () => void }) {
  const c = useTheme();
  return (
    <View style={styles.emptyPane}>
      <Logo size={96} />
      <Text style={[styles.emptyTitle, { color: c.text }]}>Datei hinzufügen</Text>
      <Text style={[styles.emptyHint, { color: c.textSec }]}>
        Aus der Seitenleiste eine Datei wählen oder hier loslegen.
      </Text>
      <Pressable
        onPress={onPick}
        style={({ pressed }) => [
          styles.emptyCta,
          { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.emptyCtaLabel}>Datei wählen</Text>
      </Pressable>
    </View>
  );
}

interface SelectedPaneProps {
  file: import('../types/conversion').SelectedFile;
  targetExt: string | null;
  setTargetExt: (ext: string) => void;
  name: string;
  setName: (n: string) => void;
  onConvert: () => void;
}

function SelectedPane({ file, targetExt, setTargetExt, name, setName, onConvert }: SelectedPaneProps) {
  const c = useTheme();
  const picks = useMemo(() => simplePicks(file.ext), [file.ext]);
  const moreFmts = useMemo(
    () => moreTargets(file.ext, new Set(picks.map((p) => p.format.ext))),
    [file.ext, picks],
  );
  const allTargets: FormatInfo[] = useMemo(() => {
    const seen = new Set<string>();
    const list: FormatInfo[] = [];
    for (const p of picks) {
      if (seen.has(p.format.ext)) continue;
      seen.add(p.format.ext);
      list.push(p.format);
    }
    for (const f of moreFmts) {
      if (seen.has(f.ext)) continue;
      seen.add(f.ext);
      list.push(f);
    }
    return list;
  }, [picks, moreFmts]);

  return (
    <View style={styles.paneRoot}>
      <View style={styles.paneHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Overline>AUSGEWÄHLTE DATEI</Overline>
          <Text style={[styles.paneTitle, { color: c.text }]} numberOfLines={1}>
            {file.name}
          </Text>
          <Text style={[styles.paneMeta, { color: c.textSec, fontFamily: MONO }]} numberOfLines={1}>
            {file.format.label}
          </Text>
        </View>
        <Pressable
          onPress={onConvert}
          disabled={!targetExt}
          style={({ pressed }) => [
            styles.headerCta,
            {
              backgroundColor: targetExt ? c.accent : c.surfaceAlt,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.headerCtaLabel,
              { color: targetExt ? '#fff' : c.textSec },
            ]}
          >
            Konvertieren →
          </Text>
        </Pressable>
      </View>

      <View style={styles.paneBody}>
        <View style={[styles.previewCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
          <View style={styles.previewRow}>
            <View style={styles.previewSide}>
              <FileChip ext={file.ext} size={120} radius={radius.cardL} />
              <Text style={[styles.previewCaption, { color: c.textSec, fontFamily: MONO }]} numberOfLines={1}>
                {file.ext.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.previewArrow, { backgroundColor: c.accentSoft }]}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke={c.accent}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <View style={styles.previewSide}>
              {targetExt ? (
                <>
                  <FileChip ext={targetExt} size={120} radius={radius.cardL} />
                  <Text style={[styles.previewCaption, { color: c.textSec, fontFamily: MONO }]}>
                    {targetExt.toUpperCase()}
                  </Text>
                </>
              ) : (
                <Text style={[styles.previewCaption, { color: c.textTer }]}>Format wählen</Text>
              )}
            </View>
          </View>
        </View>

        <ScrollView style={styles.options} contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
          <Overline>ZIELFORMAT</Overline>
          <View style={styles.chipWrap}>
            {allTargets.map((fmt) => {
              const active = fmt.ext === targetExt;
              return (
                <Pressable
                  key={fmt.ext}
                  onPress={() => setTargetExt(fmt.ext)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: active ? c.accent : c.surface,
                      borderColor: active ? c.accent : c.separator,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: active ? '#fff' : c.text, fontFamily: MONO },
                    ]}
                  >
                    {fmt.ext.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Overline style={{ marginTop: 14 }}>DATEINAME</Overline>
          <View style={[styles.nameRow, { backgroundColor: c.surface, borderColor: c.separator }]}>
            <TextInput
              value={name}
              onChangeText={(v) => setName(v.replace(/[^a-zA-Z0-9._-]/g, '_'))}
              style={[styles.nameInput, { color: c.text, fontFamily: MONO }]}
              placeholder="output"
              placeholderTextColor={c.textTer}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <Text style={[styles.nameSuffix, { color: c.textSec, fontFamily: MONO }]}>
              .{targetExt ?? '...'}
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function LockGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 10.5h14v10H5zM8 10.5V8a4 4 0 018 0v2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 280,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  pickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 14,
  },
  pickPillLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyQueue: { fontSize: 12, paddingLeft: 4 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  queueName: { fontSize: 13, fontWeight: '500' },
  sidebarFooter: { paddingTop: 12 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  lockText: { fontSize: 12 },

  main: { flex: 1, paddingHorizontal: 32, paddingVertical: 20 },
  emptyPane: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 12 },
  emptyHint: { fontSize: 14, textAlign: 'center', maxWidth: 320 },
  emptyCta: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radius.button,
  },
  emptyCtaLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },

  paneRoot: { flex: 1 },
  paneHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  paneTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, marginTop: 2 },
  paneMeta: { fontSize: 13, marginTop: 2 },
  headerCta: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  headerCtaLabel: { fontSize: 15, fontWeight: '600' },

  paneBody: { flex: 1, flexDirection: 'row', gap: 20, marginTop: 20 },
  previewCard: {
    flex: 1.2,
    borderRadius: radius.cardL,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  previewSide: { alignItems: 'center', gap: 10 },
  previewCaption: { fontSize: 12 },
  previewArrow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { flex: 1 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: { fontSize: 13, fontWeight: '700' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nameInput: { flex: 1, paddingVertical: 12, fontSize: 14 },
  nameSuffix: { fontSize: 14, fontWeight: '500' },
});
