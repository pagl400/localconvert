import { Platform, useColorScheme } from 'react-native';

import { useAppStore } from '../store/useAppStore';

import { paletteFor, type Palette } from './colors';

export function useTheme(): Palette {
  const themePref = useAppStore((s) => s.theme);
  const systemScheme = useColorScheme();
  const scheme = themePref === 'system' ? (systemScheme ?? 'dark') : themePref;
  const platform = Platform.OS === 'android' ? 'android' : 'ios';
  return paletteFor(scheme, platform);
}
