import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { FileChip } from '../components/FileChip';
import { useJobStore } from '../store/useJobStore';
import { radius } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { formatBytes, formatDuration } from '../utils/format';
import { findFormat } from '../utils/formats';
import { impactLight } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Result'>;
type RouteT = RouteProp<RootStackParamList, 'Result'>;

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export function ResultScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const job = useJobStore((s) => s.jobs[route.params.jobId]);

  if (!job || !job.outputUri) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.empty}>
          <Text style={{ color: c.textSec }}>Job nicht gefunden.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleShare = async () => {
    impactLight();
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Teilen nicht verfügbar', 'Auf diesem Gerät steht Teilen nicht zur Verfügung.');
        return;
      }
      const format = findFormat(job.targetExt);
      await Sharing.shareAsync(job.outputUri!, {
        mimeType: format?.mime,
        dialogTitle: 'Konvertierte Datei teilen',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Teilen konnte nicht geöffnet werden.';
      Alert.alert('Fehler beim Teilen', message);
    }
  };

  const duration = job.finishedAt ? job.finishedAt - job.startedAt : 0;
  const sizeLabel = formatBytes(job.outputSize ?? 0);
  const dur = formatDuration(duration);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.body}>
        <View style={[styles.ringOuter, { backgroundColor: 'rgba(48,209,88,0.18)' }]}>
          <View style={[styles.ringInner, { backgroundColor: c.pos }]}>
            <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="#fff"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        </View>

        <Text style={[styles.title, { color: c.text }]}>Fertig</Text>
        <Text style={[styles.subtitle, { color: c.textSec, fontFamily: MONO }]}>
          {sizeLabel} · {dur}
        </Text>

        <View style={[styles.fileCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
          <FileChip ext={job.targetExt} size={48} radius={radius.formatBadge} />
          <View style={styles.fileBody}>
            <Text style={[styles.fileName, { color: c.text }]} numberOfLines={1}>
              {job.outputName}
            </Text>
            <Text style={[styles.fileMeta, { color: c.textSec, fontFamily: MONO }]}>
              {sizeLabel} · in {dur}
            </Text>
          </View>
          <Pressable
            onPress={() => void handleShare()}
            accessibilityRole="button"
            accessibilityLabel="Teilen"
            style={({ pressed }) => [
              styles.shareCircle,
              { backgroundColor: c.accentSoft, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 4v12M12 4L8 8M12 4l4 4M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6"
                stroke={c.accent}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </View>

        <Pressable
          onPress={() => void handleShare()}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaLabel}>In Dateien sichern</Text>
        </Pressable>

        <View style={styles.secondaryRow}>
          <SecondaryButton
            label="Teilen"
            onPress={() => void handleShare()}
          />
          <SecondaryButton
            label="Weitere konvertieren"
            onPress={() => navigation.popToTop()}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
}

function SecondaryButton({ label, onPress }: SecondaryButtonProps) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondary,
        { backgroundColor: c.surfaceAlt, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.secondaryLabel, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 12,
    alignItems: 'stretch',
  },
  ringOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ringInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center', marginTop: 18 },
  subtitle: { fontSize: 14, textAlign: 'center' },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    marginTop: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fileBody: { flex: 1, minWidth: 0, gap: 2 },
  fileName: { fontSize: 16, fontWeight: '600' },
  fileMeta: { fontSize: 12 },
  shareCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    paddingVertical: 17,
    borderRadius: radius.button,
    alignItems: 'center',
    marginTop: 18,
  },
  ctaLabel: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondaryRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  secondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.button,
    alignItems: 'center',
  },
  secondaryLabel: { fontSize: 15, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
