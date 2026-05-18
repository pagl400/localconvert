export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceHi: string;
  surfaceSunk: string;
  border: string;
  separator: string;
  text: string;
  textSec: string;
  textTer: string;
  accent: string;
  accentSoft: string;
  accentDeep: string;
  pos: string;
  neg: string;
  scheme: 'light' | 'dark';
  platform: 'ios' | 'android';
}

const lightIos: Palette = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F2F7',
  surfaceHi: '#E5E5EA',
  surfaceSunk: '#E9E9EE',
  border: 'rgba(0,0,0,0.06)',
  separator: 'rgba(60,60,67,0.18)',
  text: '#000000',
  textSec: 'rgba(60,60,67,0.6)',
  textTer: 'rgba(60,60,67,0.3)',
  accent: '#007AFF',
  accentSoft: 'rgba(0,122,255,0.12)',
  accentDeep: '#0040DD',
  pos: '#34C759',
  neg: '#FF3B30',
  scheme: 'light',
  platform: 'ios',
};

const darkIos: Palette = {
  bg: '#000000',
  surface: '#1C1C1E',
  surfaceAlt: '#2C2C2E',
  surfaceHi: '#3A3A3C',
  surfaceSunk: '#0E0E0F',
  border: 'rgba(255,255,255,0.08)',
  separator: 'rgba(84,84,88,0.55)',
  text: '#FFFFFF',
  textSec: 'rgba(235,235,245,0.6)',
  textTer: 'rgba(235,235,245,0.3)',
  accent: '#0A84FF',
  accentSoft: 'rgba(10,132,255,0.20)',
  accentDeep: '#409CFF',
  pos: '#30D158',
  neg: '#FF453A',
  scheme: 'dark',
  platform: 'ios',
};

const lightAndroid: Palette = {
  ...lightIos,
  bg: '#FBF8FF',
  surfaceAlt: '#EEE8F4',
  surfaceHi: '#E7E0EC',
  text: '#1C1B1F',
  platform: 'android',
};

const darkAndroid: Palette = {
  ...darkIos,
  bg: '#101014',
  surface: '#1C1B1F',
  surfaceAlt: '#2A282D',
  surfaceHi: '#36343A',
  platform: 'android',
};

export function paletteFor(scheme: 'light' | 'dark', platform: 'ios' | 'android'): Palette {
  if (platform === 'android') return scheme === 'dark' ? darkAndroid : lightAndroid;
  return scheme === 'dark' ? darkIos : lightIos;
}
