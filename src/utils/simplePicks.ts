import { isSupported, supportedTargets } from '../services/converters';
import type { FormatInfo } from '../types/conversion';

import { findFormat } from './formats';

// Curated "best" target for each source. Simple mode highlights one of these
// with a BEST tag and defaults selection to it. Mirrors the handoff spec:
// image → pdf, heic → jpg, audio → mp3, etc.
const BEST: Record<string, string> = {
  // Images
  jpg: 'pdf',
  jpeg: 'pdf',
  png: 'pdf',
  webp: 'jpg',
  heic: 'jpg',
  heif: 'jpg',
  avif: 'jpg',
  gif: 'mp4',
  tiff: 'jpg',
  bmp: 'png',
  svg: 'png',
  ico: 'png',
  // Audio
  wav: 'mp3',
  flac: 'mp3',
  aac: 'mp3',
  m4a: 'mp3',
  ogg: 'mp3',
  opus: 'mp3',
  aiff: 'mp3',
  aif: 'mp3',
  caf: 'mp3',
  // Video
  mov: 'mp4',
  mkv: 'mp4',
  avi: 'mp4',
  webm: 'mp4',
  flv: 'mp4',
  wmv: 'mp4',
  mpeg: 'mp4',
  mpg: 'mp4',
  '3gp': 'mp4',
  m4v: 'mp4',
  // Documents
  docx: 'pdf',
  odt: 'pdf',
  rtf: 'pdf',
  md: 'pdf',
  markdown: 'pdf',
  txt: 'pdf',
  html: 'pdf',
  htm: 'pdf',
  // Ebook
  epub: 'pdf',
  mobi: 'pdf',
  // Data
  csv: 'xlsx',
  xlsx: 'csv',
  xls: 'xlsx',
  json: 'yaml',
  yaml: 'json',
  yml: 'json',
  xml: 'json',
  // PDF self-route — most useful day-to-day is text extraction
  pdf: 'txt',
};

// Three quick picks per source, in descending order. The first one is also
// the BEST. Picks beyond the source's supported set get filtered out.
const QUICK: Record<string, string[]> = {
  jpg: ['pdf', 'png', 'webp'],
  jpeg: ['pdf', 'png', 'webp'],
  png: ['pdf', 'jpg', 'webp'],
  webp: ['jpg', 'png', 'pdf'],
  heic: ['jpg', 'png', 'pdf'],
  heif: ['jpg', 'png', 'pdf'],
  avif: ['jpg', 'png', 'pdf'],
  gif: ['mp4', 'png', 'jpg'],
  tiff: ['jpg', 'pdf', 'png'],
  bmp: ['png', 'jpg', 'pdf'],
  svg: ['png', 'pdf', 'jpg'],
  ico: ['png', 'jpg', 'pdf'],

  wav: ['mp3', 'm4a', 'flac'],
  flac: ['mp3', 'wav', 'm4a'],
  aac: ['mp3', 'm4a', 'wav'],
  m4a: ['mp3', 'aac', 'wav'],
  ogg: ['mp3', 'wav', 'm4a'],
  opus: ['mp3', 'm4a', 'wav'],
  aiff: ['mp3', 'wav', 'm4a'],
  aif: ['mp3', 'wav', 'm4a'],
  caf: ['mp3', 'wav', 'm4a'],
  mp3: ['m4a', 'wav', 'aac'],

  mp4: ['mov', 'gif', 'mp3'],
  mov: ['mp4', 'gif', 'mp3'],
  mkv: ['mp4', 'mov', 'mp3'],
  avi: ['mp4', 'mov', 'mp3'],
  webm: ['mp4', 'mov', 'mp3'],
  flv: ['mp4', 'mov', 'mp3'],
  wmv: ['mp4', 'mov', 'mp3'],
  mpeg: ['mp4', 'mov', 'mp3'],
  mpg: ['mp4', 'mov', 'mp3'],
  '3gp': ['mp4', 'mov', 'mp3'],
  m4v: ['mp4', 'mov', 'mp3'],

  docx: ['pdf', 'odt', 'txt'],
  odt: ['pdf', 'docx', 'txt'],
  rtf: ['pdf', 'docx', 'txt'],
  md: ['pdf', 'html', 'docx'],
  markdown: ['pdf', 'html', 'docx'],
  txt: ['pdf', 'md', 'html'],
  html: ['pdf', 'md', 'txt'],
  htm: ['pdf', 'md', 'txt'],

  epub: ['pdf', 'txt', 'html'],
  mobi: ['pdf', 'txt', 'html'],

  csv: ['xlsx', 'json', 'yaml'],
  xlsx: ['csv', 'json', 'pdf'],
  xls: ['xlsx', 'csv', 'json'],
  ods: ['xlsx', 'csv', 'json'],
  json: ['yaml', 'xml', 'csv'],
  yaml: ['json', 'xml', 'csv'],
  yml: ['json', 'xml', 'csv'],
  xml: ['json', 'yaml', 'csv'],

  pdf: ['txt', 'docx', 'md'],
};

export interface SimplePick {
  format: FormatInfo;
  isBest: boolean;
  hint: string;
}

// Short, plain-language hints for the most common targets. Surfaced under
// each card in Simple mode so users don't need to know what the format is.
const HINT: Record<string, string> = {
  pdf: 'Für E-Mail oder Druck',
  jpg: 'Für Fotos und Web',
  png: 'Verlustfrei, mit Transparenz',
  webp: 'Klein für Web',
  heic: 'Apple-Format, sehr klein',
  gif: 'Animation, kein Ton',
  mp3: 'Universell, kleine Datei',
  m4a: 'AAC, gute Qualität',
  wav: 'Verlustfrei, große Datei',
  flac: 'Verlustfrei, komprimiert',
  mp4: 'Spielt überall',
  mov: 'Apple-freundlich',
  docx: 'Word-kompatibel',
  odt: 'OpenOffice/LibreOffice',
  txt: 'Reiner Text',
  md: 'Markdown',
  html: 'HTML-Webseite',
  xlsx: 'Excel-Tabelle',
  csv: 'Tabellen-Export',
  json: 'Strukturierte Daten',
  yaml: 'Lesbare Daten',
};

export function defaultTarget(sourceExt: string): string | null {
  const guess = BEST[sourceExt.toLowerCase()];
  if (guess && isSupported(sourceExt, guess)) return guess;
  // Fallback: first supported target alphabetically.
  const supported = Array.from(supportedTargets(sourceExt)).sort();
  return supported[0] ?? null;
}

export function simplePicks(sourceExt: string): SimplePick[] {
  const lower = sourceExt.toLowerCase();
  const best = BEST[lower];
  const candidateExts = QUICK[lower] ?? [];
  const supported = supportedTargets(sourceExt);
  const picks: SimplePick[] = [];
  for (const ext of candidateExts) {
    if (!supported.has(ext)) continue;
    const fmt = findFormat(ext);
    if (!fmt) continue;
    picks.push({
      format: fmt,
      isBest: ext === best,
      hint: HINT[ext] ?? fmt.description ?? '',
    });
    if (picks.length === 3) break;
  }
  // If we don't have 3 yet, fill from the broader supported set.
  if (picks.length < 3) {
    const seen = new Set(picks.map((p) => p.format.ext));
    for (const ext of Array.from(supported).sort()) {
      if (seen.has(ext) || ext === sourceExt) continue;
      const fmt = findFormat(ext);
      if (!fmt) continue;
      picks.push({
        format: fmt,
        isBest: ext === best,
        hint: HINT[ext] ?? fmt.description ?? '',
      });
      if (picks.length === 3) break;
    }
  }
  return picks;
}

export function moreTargets(sourceExt: string, exclude: Set<string>): FormatInfo[] {
  const supported = supportedTargets(sourceExt);
  return Array.from(supported)
    .filter((ext) => !exclude.has(ext) && ext !== sourceExt.toLowerCase())
    .map((ext) => findFormat(ext))
    .filter((f): f is FormatInfo => f !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}
