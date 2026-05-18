#!/usr/bin/env node
// Generate app icons from the Infinity SVG.
//
// One-shot script — sharp is not a tracked dependency to keep regular installs
// lean. To run:
//     pnpm add -D sharp
//     node scripts/generate-icons.mjs
//     pnpm remove sharp
//
// Outputs:
//   assets/icon.png          — 1024×1024, rounded-square navy bg + infinity (iOS)
//   assets/adaptive-icon.png — 1024×1024, infinity-only on transparent, scaled
//                              into the Android adaptive-icon safe zone (~66%)
//   assets/favicon.png       — 512×512, same as icon.png (Expo resizes to 16/32/192)
//   assets/splash-icon.png   — 1024×1024, same as icon.png (Splash uses contain)
//
// Brand background color for Android adaptive + Splash: #0B1838 (middle stop
// of the navy gradient). app.json is updated to match.

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

// --- SVG sources ---------------------------------------------------------

const FULL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1B2D58"/>
      <stop offset="55%" stop-color="#0B1838"/>
      <stop offset="100%" stop-color="#040A1F"/>
    </linearGradient>
    <linearGradient id="stroke" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#9BC8FF"/>
      <stop offset="100%" stop-color="#3D8BF0"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="225" fill="url(#bg)"/>
  <g stroke="url(#stroke)" stroke-width="92" stroke-linecap="round" fill="none">
    <path d="M 320 388 A 130 130 0 1 1 320 636 C 460 580 564 444 704 388 A 130 130 0 1 1 704 636 C 564 580 460 444 320 388 Z"/>
  </g>
</svg>
`.trim();

// Android adaptive foreground: no background rect (system fills it via
// adaptiveIcon.backgroundColor), and the mark is scaled ~1.4× about center so
// it fills the device-mask safe zone rather than swimming inside it.
const ADAPTIVE_FG_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="stroke" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#9BC8FF"/>
      <stop offset="100%" stop-color="#3D8BF0"/>
    </linearGradient>
  </defs>
  <g transform="translate(-204.8 -204.8) scale(1.4)">
    <g stroke="url(#stroke)" stroke-width="92" stroke-linecap="round" fill="none">
      <path d="M 320 388 A 130 130 0 1 1 320 636 C 460 580 564 444 704 388 A 130 130 0 1 1 704 636 C 564 580 460 444 320 388 Z"/>
    </g>
  </g>
</svg>
`.trim();

// --- Renderers -----------------------------------------------------------

async function render(svg, size, outName, { transparent = false } = {}) {
  const buf = Buffer.from(svg, 'utf8');
  const pipeline = sharp(buf, { density: 384 }).resize(size, size, {
    fit: 'contain',
    background: transparent
      ? { r: 0, g: 0, b: 0, alpha: 0 }
      : { r: 4, g: 10, b: 31, alpha: 1 }, // #040A1F navy fallback
  });
  const out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  const target = path.join(ASSETS, outName);
  await writeFile(target, out);
  return { target, bytes: out.length };
}

async function main() {
  const results = await Promise.all([
    render(FULL_SVG, 1024, 'icon.png'),
    render(ADAPTIVE_FG_SVG, 1024, 'adaptive-icon.png', { transparent: true }),
    render(FULL_SVG, 512, 'favicon.png'),
    render(FULL_SVG, 1024, 'splash-icon.png'),
  ]);
  for (const r of results) {
    console.log(`  ${path.relative(ROOT, r.target)} — ${(r.bytes / 1024).toFixed(1)} KB`);
  }
  console.log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
