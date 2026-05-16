export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceHi: string;
  border: string;
  text: string;
  textSec: string;
  textTer: string;
  accent: string;
  accentSoft: string;
  pos: string;
  neg: string;
  scheme: 'light' | 'dark';
  platform: 'ios' | 'android';
}

const ACCENT = '#0a84ff';

const lightIos: Palette = {
  bg: '#f2f2f7',
  surface: '#ffffff',
  surfaceAlt: '#f2f2f7',
  surfaceHi: '#e5e5ea',
  border: 'rgba(0,0,0,0.06)',
  text: '#000000',
  textSec: 'rgba(60,60,67,0.6)',
  textTer: 'rgba(60,60,67,0.3)',
  accent: ACCENT,
  accentSoft: ACCENT + '1f',
  pos: '#16a34a',
  neg: '#dc2626',
  scheme: 'light',
  platform: 'ios',
};

const darkIos: Palette = {
  bg: '#000000',
  surface: '#1c1c1e',
  surfaceAlt: '#2c2c2e',
  surfaceHi: '#3a3a3c',
  border: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  textSec: 'rgba(235,235,245,0.6)',
  textTer: 'rgba(235,235,245,0.35)',
  accent: ACCENT,
  accentSoft: ACCENT + '26',
  pos: '#34c759',
  neg: '#ff453a',
  scheme: 'dark',
  platform: 'ios',
};

const lightAndroid: Palette = {
  bg: '#fbf8ff',
  surface: '#ffffff',
  surfaceAlt: '#eee8f4',
  surfaceHi: '#e7e0ec',
  border: 'rgba(0,0,0,0.06)',
  text: '#1c1b1f',
  textSec: 'rgba(60,60,67,0.6)',
  textTer: 'rgba(60,60,67,0.3)',
  accent: ACCENT,
  accentSoft: ACCENT + '1f',
  pos: '#16a34a',
  neg: '#dc2626',
  scheme: 'light',
  platform: 'android',
};

const darkAndroid: Palette = {
  bg: '#101014',
  surface: '#1c1b1f',
  surfaceAlt: '#2a282d',
  surfaceHi: '#36343a',
  border: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  textSec: 'rgba(235,235,245,0.6)',
  textTer: 'rgba(235,235,245,0.35)',
  accent: ACCENT,
  accentSoft: ACCENT + '26',
  pos: '#34c759',
  neg: '#ff453a',
  scheme: 'dark',
  platform: 'android',
};

export function paletteFor(scheme: 'light' | 'dark', platform: 'ios' | 'android'): Palette {
  if (platform === 'android') return scheme === 'dark' ? darkAndroid : lightAndroid;
  return scheme === 'dark' ? darkIos : lightIos;
}
