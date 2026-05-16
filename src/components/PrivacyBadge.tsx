import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/useTheme';

export function PrivacyBadge() {
  const c = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: c.accentSoft }]}>
      <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
        <Path
          d="M3 5V4a3 3 0 016 0v1m-7 0h8v5a1 1 0 01-1 1H3a1 1 0 01-1-1V5z"
          stroke={c.accent}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={[styles.text, { color: c.accent }]}>Local</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
});
