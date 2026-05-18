import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Overline } from '../components/Overline';
import { APP_VERSION, IMPRINT_URL, PRIVACY_URL, SOURCE_URL } from '../constants';
import { type Mode, useAppStore, type Theme } from '../store/useAppStore';
import { useTheme } from '../theme/useTheme';
import type { Quality } from '../types/conversion';
import { selection } from '../utils/haptics';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 'fast', label: 'Schnell' },
  { value: 'high', label: 'Hoch' },
  { value: 'max', label: 'Maximum' },
];

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'expert', label: 'Expert' },
];

export function SettingsScreen() {
  const c = useTheme();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const defaultQuality = useAppStore((s) => s.defaultQuality);
  const setDefaultQuality = useAppStore((s) => s.setDefaultQuality);
  const keepHistory = useAppStore((s) => s.keepHistory);
  const setKeepHistory = useAppStore((s) => s.setKeepHistory);
  const autoCleanTemp = useAppStore((s) => s.autoCleanTemp);
  const setAutoCleanTemp = useAppStore((s) => s.setAutoCleanTemp);

  const switchMode = (m: Mode) => {
    selection();
    setMode(m);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Einstellungen</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="Modus">
          <Text style={[styles.helper, { color: c.textSec }]}>
            Simple zeigt 3 Format-Vorschläge. Expert öffnet die volle Toolbox.
          </Text>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={switchMode} palette={c} />
        </Section>

        <Section title="Darstellung">
          <Segmented options={THEME_OPTIONS} value={theme} onChange={setTheme} palette={c} />
        </Section>

        <Section title="Standard-Qualität">
          <Segmented
            options={QUALITY_OPTIONS}
            value={defaultQuality}
            onChange={setDefaultQuality}
            palette={c}
          />
        </Section>

        <Section title="Privatsphäre">
          <ToggleRow
            label="Verlauf behalten"
            value={keepHistory}
            onChange={setKeepHistory}
            palette={c}
          />
          <ToggleRow
            label="Temp-Dateien nach Export löschen"
            value={autoCleanTemp}
            onChange={setAutoCleanTemp}
            palette={c}
          />
        </Section>

        <Section title="Über">
          <Row label="Version" value={APP_VERSION} palette={c} />
          <LinkRow label="Datenschutz" url={PRIVACY_URL} palette={c} />
          <LinkRow label="Impressum" url={IMPRINT_URL} palette={c} />
          <LinkRow label="Quellcode auf GitHub" url={SOURCE_URL} palette={c} />
        </Section>

        <Text style={[styles.foot, { color: c.textSec }]}>
          LocalConvert geht für Konvertierungen nie ins Netz. Alles läuft auf deinem Gerät.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Overline>{title}</Overline>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  palette: ReturnType<typeof useTheme>;
}

function Segmented<T extends string>({ options, value, onChange, palette }: SegmentedProps<T>) {
  return (
    <View style={[styles.segmented, { backgroundColor: palette.surfaceAlt }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.segment, active && { backgroundColor: palette.surface }]}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                styles.segmentLabel,
                {
                  color: active ? palette.text : palette.textSec,
                  fontWeight: active ? '600' : '500',
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  palette: ReturnType<typeof useTheme>;
}

function ToggleRow({ label, value, onChange, palette }: ToggleRowProps) {
  return (
    <View style={[styles.row, { backgroundColor: palette.surfaceAlt }]}>
      <Text style={[styles.rowLabel, { color: palette.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.accent, false: palette.surfaceHi }}
      />
    </View>
  );
}

interface RowProps {
  label: string;
  value: string;
  palette: ReturnType<typeof useTheme>;
}

function Row({ label, value, palette }: RowProps) {
  return (
    <View style={[styles.row, { backgroundColor: palette.surfaceAlt }]}>
      <Text style={[styles.rowLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: palette.textSec }]}>{value}</Text>
    </View>
  );
}

interface LinkRowProps {
  label: string;
  url: string;
  palette: ReturnType<typeof useTheme>;
}

function LinkRow({ label, url, palette }: LinkRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? palette.surfaceHi : palette.surfaceAlt },
      ]}
      onPress={() => {
        void Linking.openURL(url);
      }}
    >
      <Text style={[styles.rowLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: palette.accent }]}>Open</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 24 },
  section: { gap: 8 },
  sectionBody: { borderRadius: 12, overflow: 'hidden', gap: 1 },
  helper: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 16 },
  rowValue: { fontSize: 14 },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentLabel: { fontSize: 14 },
  foot: { fontSize: 12, textAlign: 'center', paddingHorizontal: 16, lineHeight: 18 },
});
