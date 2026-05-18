import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DropZone } from '../components/DropZone';
import { Logo } from '../components/Logo';
import { PrivacyBadge } from '../components/PrivacyBadge';
import {
  openAppSettings,
  pickFile,
  pickFromPhotos,
  type PhotoPickerOutcome,
} from '../services/filePicker';
import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { formatBytes } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Source = 'photos' | 'files';

export function ConvertScreen() {
  const navigation = useNavigation<Nav>();
  const c = useTheme();
  const addFile = useJobStore((s) => s.addFile);
  const history = useAppStore((s) => s.history);
  const [picking, setPicking] = useState(false);

  // Run the actual picker for the chosen source. Photos returns extra
  // metadata about iOS permission state so we can surface a hint when the
  // user has only granted "limited" access.
  const runSource = async (source: Source) => {
    setPicking(true);
    try {
      if (source === 'photos') {
        const outcome: PhotoPickerOutcome = await pickFromPhotos('all');
        if (!outcome.file) return;
        addFile(outcome.file);
        navigation.navigate('TargetFormat', { fileId: outcome.file.id });
        if (outcome.limitedAccess) {
          // Inform asynchronously so the navigation animation still feels
          // responsive — the user is already on the next screen.
          setTimeout(() => {
            Alert.alert(
              'Eingeschränkter Foto-Zugriff',
              'Du hast LocalConvert nur Zugriff auf einzelne Fotos erlaubt. ' +
                'In den Einstellungen kannst du den vollen Zugriff erlauben — die App lädt nichts hoch.',
              [
                { text: 'OK', style: 'cancel' },
                { text: 'Einstellungen öffnen', onPress: () => void openAppSettings() },
              ],
            );
          }, 400);
        }
      } else {
        const file = await pickFile();
        if (!file) return;
        addFile(file);
        navigation.navigate('TargetFormat', { fileId: file.id });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Die Auswahl konnte nicht geöffnet werden.';
      Alert.alert('Fehler beim Öffnen', message);
    } finally {
      setPicking(false);
    }
  };

  // Show an iOS-native ActionSheet so the user picks the source. On Android
  // we fall back to Alert.alert which renders as a native dialog.
  const handlePick = () => {
    const options = ['Aus Fotos & Videos', 'Aus Dateien', 'Abbrechen'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 2,
          title: 'Datei auswählen',
          message: 'Was möchtest du umwandeln?',
        },
        (index) => {
          if (index === 0) void runSource('photos');
          else if (index === 1) void runSource('files');
        },
      );
      return;
    }
    Alert.alert('Datei auswählen', 'Was möchtest du umwandeln?', [
      { text: 'Aus Fotos & Videos', onPress: () => void runSource('photos') },
      { text: 'Aus Dateien', onPress: () => void runSource('files') },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
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
        <DropZone onPress={handlePick} loading={picking} />

        {history.length > 0 ? (
          <Section title="Verlauf" textColor={c.textSec}>
            {history.slice(0, 5).map((h) => (
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
        ) : (
          <View style={[styles.introCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.introTitle, { color: c.text }]}>So funktioniert&apos;s</Text>
            <Text style={[styles.introStep, { color: c.textSec }]}>
              1. <Text style={{ color: c.text, fontWeight: '600' }}>Datei wählen</Text> — aus Fotos
              oder lokalen Dateien.
            </Text>
            <Text style={[styles.introStep, { color: c.textSec }]}>
              2. <Text style={{ color: c.text, fontWeight: '600' }}>Zielformat</Text> picken —
              MP4, MP3, PDF, JPG, …
            </Text>
            <Text style={[styles.introStep, { color: c.textSec }]}>
              3. <Text style={{ color: c.text, fontWeight: '600' }}>Optionen</Text> einstellen
              (Qualität, Auflösung, Trim).
            </Text>
            <Text style={[styles.introStep, { color: c.textSec }]}>
              4. <Text style={{ color: c.text, fontWeight: '600' }}>Konvertieren</Text> — die
              Datei bleibt auf deinem Gerät. Nichts wird hochgeladen.
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
  introCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  introTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  introStep: { fontSize: 13, lineHeight: 20 },
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
