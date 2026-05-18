import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { ModeBadge } from '../components/ModeBadge';
import { Wordmark } from '../components/Wordmark';
import { pickFile } from '../services/filePicker';
import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from '../types/navigation';
import { impactLight } from '../utils/haptics';
import { useIsTabletLandscape } from '../utils/responsive';

import { TabletConvertScreen } from './TabletConvertScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Source = 'photos' | 'files';

const HERO_RING = 168;
const HALO = 192;
const INNER = 76;

export function ConvertScreen() {
  const isTablet = useIsTabletLandscape();
  if (isTablet) return <TabletConvertScreen />;
  return <PhoneConvertScreen />;
}

function PhoneConvertScreen() {
  const navigation = useNavigation<Nav>();
  const c = useTheme();
  const mode = useAppStore((s) => s.mode);
  const addFile = useJobStore((s) => s.addFile);
  const [picking, setPicking] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const ringBg = c.scheme === 'dark' ? '#0E0E0F' : c.surface;

  const runSource = async (source: Source) => {
    if (source === 'photos') {
      navigation.navigate('PhotoPicker');
      return;
    }
    setPicking(true);
    try {
      const file = await pickFile();
      if (!file) return;
      addFile(file);
      navigation.navigate('TargetFormat', { fileId: file.id });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Die Auswahl konnte nicht geöffnet werden.';
      Alert.alert('Fehler beim Öffnen', message);
    } finally {
      setPicking(false);
    }
  };

  const handlePick = () => {
    impactLight();
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

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 6,
      tension: 220,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 180,
    }).start();
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Wordmark size={18} />
        <ModeBadge mode={mode} />
      </View>

      <View style={styles.hero}>
        <Pressable
          onPress={handlePick}
          onPressIn={pressIn}
          onPressOut={pressOut}
          disabled={picking}
          accessibilityRole="button"
          accessibilityLabel="Datei hinzufügen"
          style={styles.heroPress}
        >
          <View
            style={[
              styles.halo,
              { backgroundColor: c.accentSoft, shadowColor: c.accent, opacity: picking ? 0.6 : 1 },
            ]}
          >
            <View style={[styles.ring, { backgroundColor: ringBg }]}>
              <Svg width={HERO_RING} height={HERO_RING} style={StyleSheet.absoluteFill}>
                <Circle
                  cx={HERO_RING / 2}
                  cy={HERO_RING / 2}
                  r={HERO_RING / 2 - 2}
                  stroke={c.accent}
                  strokeWidth={2.5}
                  strokeDasharray="6 6"
                  fill="none"
                />
              </Svg>
              <Animated.View
                style={[
                  styles.inner,
                  { backgroundColor: c.accent, transform: [{ scale }] },
                ]}
              >
                <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M12 5v14M5 12h14"
                    stroke="#fff"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                </Svg>
              </Animated.View>
            </View>
          </View>
        </Pressable>

        <Text style={[styles.title, { color: c.text }]}>Datei hinzufügen</Text>
        <Text style={[styles.subtitle, { color: c.textSec }]}>
          Jedes Format. Bleibt auf deinem Gerät.
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <LockGlyph color={c.textSec} />
        <Text style={[styles.bottomText, { color: c.textSec }]}>
          Kein Upload, kein Account, kein Tracking
        </Text>
      </View>
    </SafeAreaView>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  heroPress: {
    width: HALO,
    height: HALO,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  halo: {
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 24 },
    shadowRadius: 30,
    elevation: 8,
  },
  ring: {
    width: HERO_RING,
    height: HERO_RING,
    borderRadius: HERO_RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 6 },
  subtitle: { fontSize: 14, marginTop: 2 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 26,
    paddingHorizontal: 16,
  },
  bottomText: { fontSize: 12 },
});
