import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { Mode } from '../store/useAppStore';
import { useTheme } from '../theme/useTheme';

import { ModeBadge } from './ModeBadge';

interface NavBarProps {
  mode?: Mode;
  title?: string;
  backLabel?: string;
}

// Shared top nav. Left: Back chevron + label. Center: ModeBadge OR plain title.
// Right: 44 px spacer for symmetry per the handoff. Renders nothing on screens
// without a back stack — calling code can pass a dedicated title.
export function NavBar({ mode, title, backLabel = 'Zurück' }: NavBarProps) {
  const navigation = useNavigation();
  const c = useTheme();

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={styles.side}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path
            d="M15 6l-6 6 6 6"
            stroke={c.accent}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={[styles.backLabel, { color: c.accent }]}>{backLabel}</Text>
      </Pressable>

      {mode ? (
        <ModeBadge mode={mode} />
      ) : title ? (
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View />
      )}

      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 12,
  },
  side: {
    minWidth: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
  backLabel: { fontSize: 16, fontWeight: '500' },
  title: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
});
