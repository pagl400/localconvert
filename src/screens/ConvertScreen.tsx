import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DropZone } from '../components/DropZone';
import { Logo } from '../components/Logo';
import { PrivacyBadge } from '../components/PrivacyBadge';
import { pickFile, pickFromPhotos } from '../services/filePicker';
import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { formatBytes } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const QUICK_PRESETS = [
  { from: 'HEIC', to: 'jpg', label: 'HEIC → JPG' },
  { from: 'MOV', to: 'mp4', label: 'MOV → MP4' },
  { from: 'PDF', to: 'docx', label: 'PDF → DOCX' },
  { from: 'MP4', to: 'mp3', label: 'MP4 → MP3' },
];

export function ConvertScreen() {
  const navigation = useNavigation<Nav>();
  const c = useTheme();
  const addFile = useJobStore((s) => s.addFile);
  const history = useAppStore((s) => s.history);
  const [picking, setPicking] = useState(false);

  const handlePick = async () => {
    setPicking(true);
    try {
      const file = await pickFile();
      if (!file) return;
      addFile(file);
      navigation.navigate('TargetFormat', { fileId: file.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open the file picker.';
      Alert.alert('File picker error', message);
    } finally {
      setPicking(false);
    }
  };

  const handlePickPhotos = async () => {
    setPicking(true);
    try {
      const file = await pickFromPhotos('all');
      if (!file) return;
      addFile(file);
      navigation.navigate('TargetFormat', { fileId: file.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open the photo library.';
      Alert.alert('Photo library error', message);
    } finally {
      setPicking(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: c.bg }]}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Logo size={c.platform === 'android' ? 28 : 30} />
          <Text style={[styles.appName, { color: c.text }]}>LocalConvert</Text>
        </View>
        <PrivacyBadge />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <DropZone onPress={() => void handlePick()} loading={picking} />

        <Pressable
          onPress={() => void handlePickPhotos()}
          disabled={picking}
          style={({ pressed }) => [
            styles.photosButton,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              opacity: pressed || picking ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open photo library"
        >
          <Text style={[styles.photosLabel, { color: c.text }]}>Aus Fotos auswählen</Text>
          <Text style={[styles.photosSub, { color: c.textSec }]}>
            Fotos & Videos aus der Mediathek
          </Text>
        </Pressable>

        <Section title="Quick presets" textColor={c.textSec}>
          <View style={styles.presetGrid}>
            {QUICK_PRESETS.map((p) => (
              <Pressable
                key={p.label}
                onPress={() => void handlePick()}
                style={({ pressed }) => [
                  styles.presetCard,
                  { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.presetLabel, { color: c.text }]}>{p.label}</Text>
                <Text style={[styles.presetHint, { color: c.textSec }]}>Tap to pick a file</Text>
              </Pressable>
            ))}
          </View>
        </Section>

        {history.length > 0 ? (
          <Section title="Recent" textColor={c.textSec}>
            {history.slice(0, 3).map((h) => (
              <View
                key={h.id}
                style={[styles.recentRow, { backgroundColor: c.surface, borderColor: c.border }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.recentName, { color: c.text }]} numberOfLines={1}>
                    {h.sourceName}
                  </Text>
                  <Text style={[styles.recentMeta, { color: c.textSec }]}>
                    {h.sourceExt.toUpperCase()} → {h.targetExt.toUpperCase()} ·{' '}
                    {formatBytes(h.outputSize ?? 0)}
                  </Text>
                </View>
              </View>
            ))}
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
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    minHeight: 44,
    gap: 12,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  appName: { fontSize: 19, fontWeight: '600', letterSpacing: -0.3 },
  scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 24 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingLeft: 4,
    letterSpacing: 0.6,
  },
  sectionBody: { gap: 8 },
  photosButton: {
    flexDirection: 'column',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
    alignItems: 'flex-start',
  },
  photosLabel: { fontSize: 15, fontWeight: '600' },
  photosSub: { fontSize: 12 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetCard: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  presetLabel: { fontSize: 14, fontWeight: '600' },
  presetHint: { fontSize: 11 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recentName: { fontSize: 14, fontWeight: '600' },
  recentMeta: { fontSize: 12, marginTop: 2 },
});
