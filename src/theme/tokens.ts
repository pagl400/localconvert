import { Platform } from 'react-native';

export const radius = {
  chip: 12,
  card: 18,
  cardL: 22,
  cardXl: 28,
  pill: 99,
  button: 14,
  formatBadge: 14,
} as const;

export const spacing = {
  screenX: 16,
  screenTop: 12,
  cardPad: 14,
  rowGap: 10,
  sectionGap: 18,
} as const;

export const type = {
  titleXl: { fontSize: 32, fontWeight: '700', letterSpacing: -0.6, lineHeight: 36 },
  titleL: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  titleM: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  callout: { fontSize: 16, fontWeight: '600' },
  subhead: { fontSize: 14, fontWeight: '500' },
  footnote: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '500' },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} as const;

export const fontFamily = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export type FormatColorPair = readonly [string, string];

export const FORMAT_COLORS: Record<string, FormatColorPair> = {
  PNG: ['#60A5FA', '#1E40AF'],
  JPG: ['#FBBF24', '#92400E'],
  JPEG: ['#FBBF24', '#92400E'],
  WEBP: ['#A78BFA', '#5B21B6'],
  PDF: ['#F87171', '#991B1B'],
  HEIC: ['#34D399', '#065F46'],
  HEIF: ['#34D399', '#065F46'],
  GIF: ['#F472B6', '#9D174D'],
  TIFF: ['#FB923C', '#9A3412'],
  BMP: ['#94A3B8', '#334155'],
  SVG: ['#22D3EE', '#155E75'],
  ICO: ['#A3E635', '#3F6212'],
  AVIF: ['#C084FC', '#581C87'],
  MP4: ['#F472B6', '#831843'],
  MP3: ['#FBBF24', '#78350F'],
  WAV: ['#FB923C', '#7C2D12'],
  MOV: ['#F472B6', '#831843'],
  DOCX: ['#60A5FA', '#1E3A8A'],
  ODT: ['#60A5FA', '#1E3A8A'],
  TXT: ['#94A3B8', '#334155'],
  MD: ['#94A3B8', '#334155'],
  EPUB: ['#A78BFA', '#4C1D95'],
};

export function formatColors(ext: string): FormatColorPair {
  return FORMAT_COLORS[ext.toUpperCase()] ?? ['#60A5FA', '#1E40AF'];
}
