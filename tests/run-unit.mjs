#!/usr/bin/env node
// Unit-test runner for the pure-JS helpers used by LocalConvert.
//
// The helpers live as TypeScript under src/utils/ and src/services/converters/.
// We compile each module to plain JS in tests/unit-build/, rewrite the
// type-only imports that don't matter at runtime, then invoke each *.test.mjs
// file under tests/unit/.
//
// Run with `pnpm test:unit`.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';
import { tap } from 'node:test/reporters';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const BUILD = resolve(here, 'unit-build');

if (existsSync(BUILD)) rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

// Modules under test. Each entry compiles src/<srcPath> → tests/unit-build/<out>.js
// so the test files can import them via a stable relative path.
const MODULES = [
  { src: 'src/utils/time.ts', out: 'time.js' },
  { src: 'src/utils/conversionKind.ts', out: 'conversionKind.js' },
  { src: 'src/utils/formats.ts', out: 'formats.js' },
  { src: 'src/services/converters/pageGeometry.ts', out: 'pageGeometry.js' },
  { src: 'src/services/converters/pdfToolsLogic.ts', out: 'pdfToolsLogic.js' },
];

function compile(srcRel, outName) {
  const srcCopy = resolve(BUILD, `${outName.replace(/\.js$/, '')}.ts`);
  copyFileSync(resolve(root, srcRel), srcCopy);
  const res = spawnSync(
    'node',
    [
      resolve(root, 'node_modules/typescript/bin/tsc'),
      srcCopy,
      '--target', 'ES2022',
      '--module', 'ESNext',
      '--moduleResolution', 'Bundler',
      '--esModuleInterop',
      '--skipLibCheck',
      '--outDir', BUILD,
    ],
    { encoding: 'utf8' },
  );
  const outPath = resolve(BUILD, outName);
  if (!existsSync(outPath)) {
    console.error('tsc stdout:', res.stdout?.slice(0, 600));
    console.error('tsc stderr:', res.stderr?.slice(0, 600));
    throw new Error(`tsc failed to produce ${outName}`);
  }
  // Strip type-only imports that tsc's emit keeps as side-effecting imports —
  // they reference files outside this sandbox and we don't need them at
  // runtime.
  let js = readFileSync(outPath, 'utf8');
  js = js
    .replace(/^\s*import\s+['"]\.\.\/\.\.\/types\/conversion['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"]\.\/pageGeometry['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"]\.\.\/\.\.\/types['"];?\s*$/gm, '');
  writeFileSync(outPath, js);
  // Remove the .ts copy so it doesn't get picked up by the project's tsc
  // (which respects `exclude` patterns from tsconfig but only when invoked
  // from there — keeping the .ts file would pollute the project graph).
  rmSync(srcCopy, { force: true });
  return outPath;
}

for (const m of MODULES) compile(m.src, m.out);

// Discover all test files
const testFiles = [
  'tests/unit/time.test.mjs',
  'tests/unit/conversionKind.test.mjs',
  'tests/unit/pageGeometry.test.mjs',
  'tests/unit/pdfTools.test.mjs',
  'tests/unit/formats.test.mjs',
].map((p) => resolve(root, p));

const stream = run({ files: testFiles, concurrency: false });
stream.compose(tap).pipe(process.stdout);

let failed = false;
stream.on('test:fail', () => { failed = true; });
stream.on('end', () => {
  if (failed) process.exitCode = 1;
});
