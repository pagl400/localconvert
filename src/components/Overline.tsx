import { StyleSheet, Text } from 'react-native';

import { useTheme } from '../theme/useTheme';

interface OverlineProps {
  children: string;
  style?: { marginTop?: number; paddingLeft?: number };
}

export function Overline({ children, style }: OverlineProps) {
  const c = useTheme();
  return (
    <Text style={[styles.text, { color: c.textSec }, style]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
