#!/usr/bin/env node
// Audit: walk every (source, target, variant) tuple the converters claim to
// support, then check whether the TargetFormatScreen actually surfaces it.
//
// Mirrors the logic in src/screens/TargetFormatScreen.tsx exactly:
//   - same-group targets: targetFormatsFor(file.format).filter(isSupported)
//   - cross-group:        supportedTargets(ext) − same-group, mapped via findFormat
//   - PDF-Tools:          hardcoded six variants when source is pdf
//   - OCR card:           hardcoded for pdf source
//   - DOCX→HTML:          two variants surfaced as separate chips

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// Minimal parse of format registry — we only need ext, group.
const formatsTs = readFileSync(resolve(root, 'src/utils/formats.ts'), 'utf8');
const FORMATS = [];
for (const m of formatsTs.matchAll(/\{\s*ext:\s*'([^']+)',\s*label:\s*'([^']+)',\s*group:\s*'([^']+)'/g)) {
  FORMATS.push({ ext: m[1], label: m[2], group: m[3] });
}
const BY_EXT = new Map(FORMATS.map((f) => [f.ext, f]));

function findFormat(ext) { return BY_EXT.get(ext.toLowerCase()) ?? null; }
function targetFormatsFor(source) {
  if (!source || source.group === 'unknown') return [];
  return FORMATS.filter((f) => f.group === source.group && f.ext !== source.ext);
}

// Hardcoded converter capability matrix (mirror of canHandle signatures).
const VIDEO_SOURCES = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v', '3gp'];
const VIDEO_TARGETS = ['mp4', 'mov', 'm4v'];
const AUDIO_FROM_VIDEO_TARGETS = ['m4a', 'wav', 'aiff', 'caf'];
const AUDIO_SOURCES = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'aiff', 'aif'];
const AUDIO_TARGETS = ['m4a', 'wav', 'aiff', 'caf'];
const IMAGE_SOURCES = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const IMAGE_TARGETS = ['jpg', 'jpeg', 'png', 'webp'];

const PDF_TOOL_VARIANTS = ['compress', 'rotate90', 'rotate180', 'rotate270', 'split', 'delete'];

// Every (source, target, variant?) tuple the engine can run.
const TUPLES = [];
for (const s of VIDEO_SOURCES) {
  for (const t of [...VIDEO_TARGETS, 'gif', ...AUDIO_FROM_VIDEO_TARGETS]) {
    if (s !== t) TUPLES.push({ s, t, variant: undefined, via: 'video' });
  }
}
for (const s of AUDIO_SOURCES) {
  for (const t of AUDIO_TARGETS) {
    if (s !== t) TUPLES.push({ s, t, variant: undefined, via: 'audio' });
  }
}
for (const s of IMAGE_SOURCES) {
  for (const t of IMAGE_TARGETS) {
    if (s !== t) TUPLES.push({ s, t, variant: undefined, via: 'image' });
  }
  TUPLES.push({ s, t: 'pdf', variant: undefined, via: 'imageToPdf' });
}
TUPLES.push({ s: 'docx', t: 'html', variant: 'plain', via: 'docx' });
TUPLES.push({ s: 'docx', t: 'html', variant: 'styled', via: 'docxRich' });
for (const t of ['txt', 'md']) TUPLES.push({ s: 'docx', t, variant: undefined, via: 'docx' });
for (const t of ['html', 'md', 'txt']) TUPLES.push({ s: 'epub', t, variant: undefined, via: 'epub' });
for (const s of ['html', 'htm', 'md', 'markdown', 'docx', 'epub', 'xlsx', 'xls', 'ods']) {
  TUPLES.push({ s, t: 'pdf', variant: undefined, via: 'htmlToPdf' });
}
for (const s of ['xlsx', 'xls', 'ods']) {
  for (const t of ['csv', 'json', 'html']) TUPLES.push({ s, t, variant: undefined, via: 'spreadsheet' });
}
for (const t of ['txt', 'md', 'html', 'json']) TUPLES.push({ s: 'pdf', t, variant: undefined, via: 'pdf' });
TUPLES.push({ s: 'pdf', t: 'txt', variant: 'ocr', via: 'pdf-ocr' });
for (const v of PDF_TOOL_VARIANTS) TUPLES.push({ s: 'pdf', t: 'pdf', variant: v, via: 'pdfTools' });
// ODT bidirectional
for (const t of ['html', 'md', 'txt', 'docx']) TUPLES.push({ s: 'odt', t, variant: undefined, via: 'odt' });
for (const s of ['docx', 'html', 'htm', 'md', 'markdown', 'txt']) {
  TUPLES.push({ s, t: 'odt', variant: undefined, via: 'odt' });
}
// text.ts edges
const TEXT_EDGES = [
  ['md', 'html'], ['html', 'md'], ['html', 'txt'], ['md', 'txt'],
  ['txt', 'html'], ['txt', 'md'],
  ['csv', 'json'], ['json', 'csv'],
  ['json', 'yaml'], ['yaml', 'json'],
  ['json', 'xml'], ['xml', 'json'],
  ['yaml', 'xml'], ['xml', 'yaml'],
];
for (const [s, t] of TEXT_EDGES) TUPLES.push({ s, t, variant: undefined, via: 'text' });

// GUI reachability: replicate the screen logic for one tuple.
function reachable(s, t, variant, popularSize = 4) {
  const src = findFormat(s);
  if (!src) return { reachable: false, reason: 'source ext not registered in formats.ts' };

  // PDF-Tools section (must come before same-group, since pdf→txt OCR is also
  // covered by same-group but only via the OCR card).
  if (s === 'pdf' && t === 'pdf' && PDF_TOOL_VARIANTS.includes(variant)) {
    return { reachable: true, via: 'pdf-tools' };
  }
  if (s === 'pdf' && t === 'txt' && variant === 'ocr') {
    return { reachable: true, via: 'pdf-tools-ocr' };
  }

  // Same-group section
  const sameGroup = targetFormatsFor(src).map((f) => f.ext);
  if (sameGroup.includes(t)) {
    if (s === 'docx' && t === 'html') {
      return { reachable: variant === 'plain' || variant === 'styled', via: 'docx-html-variant' };
    }
    return { reachable: variant === undefined, via: 'same-group' };
  }

  // Cross-group section: ext must be a registered format AND in supportedTargets
  const tFormat = findFormat(t);
  if (!tFormat) {
    return { reachable: false, reason: `target ext '${t}' not registered in formats.ts` };
  }
  // Cross-group only triggers when source group ≠ target group
  if (tFormat.group !== src.group) {
    return { reachable: variant === undefined, via: 'cross-group' };
  }
  // Same-group but not in `supported` list — this means converter can't handle it
  return { reachable: false, reason: 'same-group target not supported by any converter' };
}

const unreachable = [];
const reachableTuples = [];
for (const tup of TUPLES) {
  const r = reachable(tup.s, tup.t, tup.variant);
  if (!r.reachable) unreachable.push({ ...tup, ...r });
  else reachableTuples.push({ ...tup, ...r });
}

console.log(`\nAudit: ${TUPLES.length} (source, target, variant) tuples that the engine supports.`);
console.log(`Reachable via GUI: ${reachableTuples.length}`);
console.log(`Unreachable via GUI: ${unreachable.length}\n`);

if (unreachable.length > 0) {
  console.log('Unreachable tuples:');
  for (const u of unreachable) {
    const v = u.variant ? ` (variant=${u.variant})` : '';
    console.log(`  ${u.s.padEnd(8)} → ${u.t.padEnd(8)}${v.padEnd(20)} via ${u.via.padEnd(10)}  reason: ${u.reason}`);
  }
}

// Also list source extensions the engine supports but formats.ts doesn't know.
const allEngineSources = new Set(TUPLES.map((t) => t.s));
const unregisteredSources = [...allEngineSources].filter((s) => !BY_EXT.has(s));
if (unregisteredSources.length > 0) {
  console.log('\nSource extensions handled by engine but not registered in formats.ts:');
  for (const s of unregisteredSources) console.log(`  - ${s}`);
}

const allEngineTargets = new Set(TUPLES.map((t) => t.t));
const unregisteredTargets = [...allEngineTargets].filter((t) => !BY_EXT.has(t));
if (unregisteredTargets.length > 0) {
  console.log('\nTarget extensions handled by engine but not registered in formats.ts:');
  for (const t of unregisteredTargets) console.log(`  - ${t}`);
}

process.exit(unreachable.length > 0 ? 1 : 0);
