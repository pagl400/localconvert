import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/useTheme';

interface WordmarkProps {
  size?: number;
  color?: string;
}

export function Wordmark({ size = 18, color }: WordmarkProps) {
  const c = useTheme();
  const tone = color ?? c.text;
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel="LocalConvert">
      <Text style={[styles.bold, { fontSize: size, color: tone }]} allowFontScaling={false}>
        Local
      </Text>
      <Text style={[styles.regular, { fontSize: size, color: tone }]} allowFontScaling={false}>
        Convert
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
  bold: { fontWeight: '700', letterSpacing: -0.5 },
  regular: { fontWeight: '400', letterSpacing: -0.5, opacity: 0.7 },
});
