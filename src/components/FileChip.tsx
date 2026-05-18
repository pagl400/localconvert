import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { formatColors } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface FileChipProps {
  ext: string;
  size?: number;
  radius?: number;
}

// Render a 2-digit hex alpha onto a hex color, e.g. mix('#60A5FA', 0x33).
function withAlpha(hex: string, alpha: number) {
  const a = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

export function FileChip({ ext, size = 48, radius = 14 }: FileChipProps) {
  const c = useTheme();
  const [c1, c2] = formatColors(ext);
  const isDark = c.scheme === 'dark';

  // Light: vibrant 135deg gradient + white text. Dark: muted 150deg tinted gradient + saturated text.
  const lightStart = c1;
  const lightEnd = c2;
  const darkStart = withAlpha(c1, 0x33);
  const darkEnd = withAlpha(c2, 0x66);
  const darkBorder = withAlpha(c1, 0x55);

  const gradId = `filechip-${ext}-${isDark ? 'd' : 'l'}`;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: isDark ? 1 : 0,
          borderColor: isDark ? darkBorder : 'transparent',
          shadowColor: isDark ? 'transparent' : c2,
          shadowOpacity: isDark ? 0 : 0.18,
          shadowRadius: isDark ? 0 : 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: isDark ? 0 : 2,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${ext.toUpperCase()} file`}
    >
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <Defs>
          {/* 135deg in CSS goes top-left → bottom-right; 150deg slightly more vertical. */}
          <LinearGradient
            id={gradId}
            x1="0"
            y1="0"
            x2={isDark ? '0.87' : '1'}
            y2={isDark ? '1' : '1'}
          >
            <Stop offset="0" stopColor={isDark ? darkStart : lightStart} />
            <Stop offset="1" stopColor={isDark ? darkEnd : lightEnd} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${gradId})`} />
      </Svg>
      <Text
        allowFontScaling={false}
        style={[
          styles.label,
          {
            color: isDark ? c1 : '#FFFFFF',
            fontSize: Math.round(size * (isDark ? 0.28 : 0.24)),
            textShadowColor: isDark ? 'transparent' : 'rgba(0,0,0,0.18)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 1,
          },
        ]}
        numberOfLines={1}
      >
        {ext.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '800', letterSpacing: 0.4 },
});
