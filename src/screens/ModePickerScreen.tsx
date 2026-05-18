import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Logo } from '../components/Logo';
import { Wordmark } from '../components/Wordmark';
import { type Mode, useAppStore } from '../store/useAppStore';
import { radius } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { impactLight } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ModePickerScreen() {
  const navigation = useNavigation<Nav>();
  const c = useTheme();
  const setMode = useAppStore((s) => s.setMode);
  const markSeen = useAppStore((s) => s.markModePickerSeen);

  const choose = (mode: Mode) => {
    impactLight();
    setMode(mode);
    markSeen();
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.header}>
        <Logo size={64} />
        <View style={styles.wordmarkWrap}>
          <Wordmark size={26} />
        </View>
        <Text style={[styles.subtitle, { color: c.textSec }]}>
          Konvertiere jede Datei. Wähle, wie du arbeitest.
        </Text>
      </View>

      <View style={styles.cards}>
        <SimpleCard onPress={() => choose('simple')} />
        <ExpertCard onPress={() => choose('expert')} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerLine, { color: c.textSec }]}>
          Du kannst jederzeit in den Einstellungen wechseln.
        </Text>
        <View style={styles.footerLockRow}>
          <LockGlyph color={c.textSec} />
          <Text style={[styles.footerLine, { color: c.textSec }]}>
            Alles läuft lokal auf deinem Gerät.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

interface CardProps {
  onPress: () => void;
}

function SimpleCard({ onPress }: CardProps) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Simple-Modus wählen"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.accent,
          shadowColor: c.accent,
          shadowOpacity: 0.4,
          shadowOffset: { width: 0, height: 18 },
          shadowRadius: 40,
          elevation: 12,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={styles.cardRow}>
        <View style={[styles.cardIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <BoltGlyph color="#fff" />
        </View>
        <Text style={[styles.cardTitle, { color: '#fff' }]}>Simple</Text>
        <View style={styles.recommendedPill}>
          <Text style={styles.recommendedText}>Empfohlen</Text>
        </View>
      </View>
      <Text style={[styles.cardDesc, { color: '#fff', opacity: 0.92 }]}>
        Datei wählen, Format wählen, fertig. Drei Taps.
      </Text>
    </Pressable>
  );
}

function ExpertCard({ onPress }: CardProps) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Expert-Modus wählen"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.separator,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={styles.cardRow}>
        <View style={[styles.cardIcon, { backgroundColor: c.surfaceAlt }]}>
          <SlidersGlyph color={c.text} />
        </View>
        <Text style={[styles.cardTitle, { color: c.text }]}>Expert</Text>
      </View>
      <Text style={[styles.cardDesc, { color: c.textSec }]}>
        Codec, Bitrate, DPI, Farbprofil, Voreinstellungen. Alles.
      </Text>
    </Pressable>
  );
}

function BoltGlyph({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function SlidersGlyph({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 6h12M19 6h2M3 18h6M13 18h8M3 12h2M9 12h12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
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
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  header: { alignItems: 'center', paddingTop: 36, gap: 16 },
  wordmarkWrap: { marginTop: -2 },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 19,
  },
  cards: { marginTop: 36, gap: 14 },
  card: {
    borderRadius: radius.cardL,
    padding: 22,
    gap: 12,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  recommendedPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  recommendedText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  cardDesc: { fontSize: 14, lineHeight: 19 },
  footer: {
    marginTop: 'auto',
    paddingBottom: 18,
    paddingTop: 14,
    alignItems: 'center',
    gap: 4,
  },
  footerLockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerLine: { fontSize: 12, textAlign: 'center' },
});
