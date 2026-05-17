#!/usr/bin/env node
// Test harness for the pure-JS conversion pipelines used by LocalConvert.
//
// We can't run the in-app converters end-to-end from Node (they import
// expo-file-system), but the *core* of each converter — the JS libraries doing
// the actual transformation (mammoth, pdf-lib, jszip, xlsx, marked) — is
// portable, and what produces conversion bugs in practice. This script
// exercises that core against the fixtures under test-fixtures/ and asserts
// on shape.
//
// Run with `pnpm test:converters` (or `node tests/run-converters.mjs`).

import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const FIX = resolve(root, 'test-fixtures');
const OUT = resolve(here, 'output');
mkdirSync(OUT, { recursive: true });

const PASS = '✓';
const FAIL = '✗';
let failures = 0;

function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.log(`  ${FAIL} ${msg}`);
    return false;
  }
  console.log(`  ${PASS} ${msg}`);
  return true;
}

function section(title) {
  console.log(`\n# ${title}`);
}

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mirror of the in-app DOCX → HTML wrapper from src/services/converters/docx.ts.
// Keep these in sync — when the production wrapper changes, update here too so
// the test artifacts in tests/output/ reflect what the app actually produces.
const DOCX_HTML_STYLE = `      :root { color-scheme: light dark; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        max-width: 820px;
        margin: 2rem auto;
        padding: 2rem 2.5rem;
        background: #fff;
        color: #1f1f1f;
        line-height: 1.6;
        box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
        border-radius: 6px;
        outline: none;
      }
      body:focus { outline: 2px solid #4a90e2; outline-offset: 4px; }
      h1, h2, h3, h4, h5, h6 { margin-top: 1.4em; margin-bottom: 0.6em; line-height: 1.25; }
      h1 { font-size: 1.8rem; }
      h2 { font-size: 1.5rem; }
      h3 { font-size: 1.25rem; }
      h1.title { font-size: 2.2rem; text-align: center; margin: 0.5em 0 1.5em; font-weight: 300; color: #2a2a2a; }
      p { margin: 0 0 0.8em; }
      p.toc1 { margin: 0.2em 0; font-weight: 600; }
      p.toc2 { margin: 0.1em 0 0.1em 1.5em; }
      p.list-paragraph { margin-left: 1.5em; }
      p.decimal-aligned { font-variant-numeric: tabular-nums; }
      em.subtle { color: #666; font-style: italic; }
      strong.intense { color: #b8390a; font-weight: 700; }
      ul, ol { padding-left: 1.6em; margin: 0 0 0.8em; }
      li { margin-bottom: 0.25em; }
      blockquote { border-left: 3px solid #d0d0d0; margin: 1em 0; padding: 0.4em 1em; color: #555; background: #fafafa; }
      img { max-width: 100%; height: auto; display: inline-block; vertical-align: middle; }
      p:has(> img:only-child) { text-align: center; }
      table { border-collapse: collapse; margin: 1em 0; max-width: 100%; width: 100%; }
      table td, table th { border: 1px solid #d0d0d0; padding: 0.4em 0.6em; vertical-align: top; }
      table tr:nth-child(even) td { background: #fafafa; }
      table th, table tr:first-child td { background: #f0f0f0; font-weight: 600; }
      code { background: #f4f4f4; padding: 0.1em 0.35em; border-radius: 3px; font-family: SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
      pre { background: #f4f4f4; padding: 1em; border-radius: 4px; overflow-x: auto; }
      .docx-edit-banner {
        max-width: 820px;
        margin: 1rem auto;
        padding: 0.6rem 1rem;
        background: #fff8e1;
        border: 1px solid #f0d171;
        border-radius: 4px;
        color: #5a4500;
        font-size: 0.85rem;
        text-align: center;
      }`;

// Same style map as src/services/converters/docx.ts so the test artifact
// renders identically to what the app produces.
const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1.title:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='toc 1'] => p.toc1:fresh",
  "p[style-name='toc 2'] => p.toc2:fresh",
  "p[style-name='toc 3'] => p.toc3:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote.intense:fresh",
  "r[style-name='Subtle Emphasis'] => em.subtle",
  "r[style-name='Intense Emphasis'] => strong.intense",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  "r[style-name='Book Title'] => cite",
];

function wrapDocxHtml(inner, title) {
  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
${DOCX_HTML_STYLE}
    </style>
  </head>
  <body contenteditable="true" spellcheck="true">
    <div class="docx-edit-banner" contenteditable="false">
      Diese Datei ist editierbar. Klick in den Text und tippe los. Im Browser via Drucken &rarr; "Als PDF speichern" sichern.
    </div>
    <article>
${inner}
    </article>
  </body>
</html>
`;
}

function wrapPlainHtml(inner, title) {
  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.55; }
      img { max-width: 100%; height: auto; }
      h1, h2, h3 { line-height: 1.25; }
      table { border-collapse: collapse; margin: 1em 0; }
      table td, table th { border: 1px solid #d0d0d0; padding: 0.4em 0.6em; }
      table th { background: #f5f5f5; }
      section { margin: 0 0 2em; padding-bottom: 1em; border-bottom: 1px solid #eee; }
    </style>
  </head>
  <body>
${inner}
  </body>
</html>
`;
}

// Mirrors src/services/converters/pdf.ts countWords + isImageOnlyPage.
function countWords(text) {
  const matches = text.match(/[A-Za-zÀ-ÿ]{2,}/g);
  return matches ? matches.length : 0;
}
function isImageOnly(text) {
  return countWords(text) < 8;
}

// ----- DOCX → HTML (plain, mammoth) -----
section('DOCX → HTML (plain — mammoth + styleMap)');
{
  const mammoth = require(resolve(root, 'node_modules/mammoth/mammoth.browser.js'));
  const input = resolve(FIX, 'sample.docx');
  const buf = readFileSync(input);
  const result = await mammoth.convertToHtml(
    { arrayBuffer: toArrayBuffer(buf) },
    { convertImage: mammoth.images.dataUri, styleMap: DOCX_STYLE_MAP },
  );
  const innerHtml = result.value;
  const fullHtml = wrapDocxHtml(innerHtml, 'sample.docx — plain (test output)');
  writeFileSync(resolve(OUT, 'sample.docx.plain.html'), fullHtml, 'utf8');
  const html = innerHtml;
  const imgs = (html.match(/<img\b/g) || []).length;
  const tables = (html.match(/<table\b/g) || []).length;
  const headings = (html.match(/<h[1-6]\b/g) || []).length;
  const dataUriImgs = (html.match(/src="data:image\//g) || []).length;
  console.log(`  input: sample.docx ${statSync(input).size.toLocaleString()} bytes`);
  console.log(`  output: ${html.length.toLocaleString()} chars`);
  console.log(`  structure: ${headings} headings, ${tables} tables, ${imgs} images`);
  assert(html.length > 1000, 'mammoth produced substantial HTML');
  assert(headings > 0, 'DOCX → HTML preserved at least one heading');
  assert(imgs > 0, 'DOCX → HTML embedded at least one image');
  assert(dataUriImgs === imgs, 'every embedded image uses data: URI');
}

// ----- DOCX → HTML (styled, custom renderer) -----
section('DOCX → HTML (styled — custom jszip + fast-xml-parser renderer)');
{
  // The styled renderer lives at src/services/converters/docxRich.ts. Compile
  // it on the fly with the project's tsc, rewrite the module imports to
  // absolute paths, then dynamic-import.
  const { spawnSync } = await import('node:child_process');
  const { mkdirSync, copyFileSync } = await import('node:fs');
  const buildDir = resolve(OUT, 'docxrich-build');
  mkdirSync(buildDir, { recursive: true });
  const srcCopy = resolve(buildDir, 'docxRich.src.ts');
  copyFileSync(resolve(root, 'src/services/converters/docxRich.ts'), srcCopy);
  const builtJs = resolve(buildDir, 'docxRich.src.js');
  // Direct compile: outFile-style invocation avoids tsconfig include resolution.
  const tsc = spawnSync(
    'node',
    [
      resolve(root, 'node_modules/typescript/bin/tsc'),
      srcCopy,
      '--target', 'ES2022',
      '--module', 'ESNext',
      '--moduleResolution', 'Bundler',
      '--esModuleInterop',
      '--skipLibCheck',
      '--outDir', buildDir,
    ],
    { encoding: 'utf8' },
  );
  if (!require('node:fs').existsSync(builtJs)) {
    console.log('  tsc stdout:', tsc.stdout?.slice(0, 400));
    console.log('  tsc stderr:', tsc.stderr?.slice(0, 400));
    throw new Error('tsc failed to produce docxRich.src.js');
  }
  let jsSrc = readFileSync(builtJs, 'utf8');
  jsSrc = jsSrc
    .replace(
      "from 'jszip'",
      `from '${resolve(root, 'node_modules/jszip/dist/jszip.min.js')}'`,
    )
    .replace(
      "from 'fast-xml-parser'",
      `from '${resolve(root, 'node_modules/fast-xml-parser/src/fxp.js')}'`,
    );
  writeFileSync(builtJs, jsSrc);

  const mod = await import(builtJs);
  const { renderDocxToStyledHtml } = mod;
  const input = resolve(FIX, 'sample.docx');
  const buf = readFileSync(input);
  const ab = toArrayBuffer(buf);
  const innerHtml = await renderDocxToStyledHtml(ab);

  const styledOut = wrapDocxHtml(innerHtml, 'sample.docx — styled (test output)');
  writeFileSync(resolve(OUT, 'sample.docx.styled.html'), styledOut, 'utf8');

  // Also keep sample.docx.html for backwards-compat: point it at the styled output.
  writeFileSync(resolve(OUT, 'sample.docx.html'), styledOut, 'utf8');

  const counts = {
    headings: (innerHtml.match(/<h[1-6]\b/g) || []).length,
    paragraphs: (innerHtml.match(/<p\b/g) || []).length,
    tables: (innerHtml.match(/<table\b/g) || []).length,
    images: (innerHtml.match(/<img\b/g) || []).length,
    lists: (innerHtml.match(/<ul\b|<ol\b/g) || []).length,
    spans: (innerHtml.match(/<span\b/g) || []).length,
    inlineColors: (innerHtml.match(/color:#/g) || []).length,
    backgroundColors: (innerHtml.match(/background-color:#/g) || []).length,
    underlines: (innerHtml.match(/text-decoration:underline/g) || []).length,
    fontFamilies: (innerHtml.match(/font-family:/g) || []).length,
    fontSizes: (innerHtml.match(/font-size:/g) || []).length,
  };
  console.log(`  output: ${innerHtml.length.toLocaleString()} chars`);
  console.log(`  structure: ${counts.headings} headings, ${counts.tables} tables, ${counts.images} images, ${counts.lists} lists`);
  console.log(`  inline styling: ${counts.spans} spans, ${counts.inlineColors} colors, ${counts.backgroundColors} bg, ${counts.underlines} underlines, ${counts.fontFamilies} fonts, ${counts.fontSizes} sizes`);
  assert(counts.headings > 0, 'styled renderer kept headings');
  assert(counts.tables > 0, 'styled renderer kept tables');
  assert(counts.images >= 4, 'styled renderer embedded all four images');
  assert(counts.lists >= 1, 'styled renderer recognised at least one list');
  assert(counts.inlineColors > 10, 'styled renderer preserved per-run colors (>10 found)');
  assert(counts.underlines > 5, 'styled renderer preserved underline runs (>5 found)');
  assert(counts.fontSizes > 100, 'styled renderer emitted explicit font sizes (>100 found)');
}

// ----- pdf-lib: JPG → PDF -----
section('JPG → PDF (pdf-lib JPEG embedding)');
{
  const { PDFDocument } = require(resolve(root, 'node_modules/pdf-lib'));
  const input = resolve(FIX, 'sample.jpg');
  const bytes = readFileSync(input);
  const pdf = await PDFDocument.create();
  pdf.setTitle('LocalConvert test image');
  pdf.setCreator('LocalConvert');
  pdf.setProducer('LocalConvert (on-device)');
  const embedded = await pdf.embedJpg(bytes);
  const maxLong = 2048;
  const longer = Math.max(embedded.width, embedded.height);
  const scale = longer > maxLong ? maxLong / longer : 1;
  const w = embedded.width * scale;
  const h = embedded.height * scale;
  const page = pdf.addPage([w, h]);
  page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
  const out = await pdf.save();
  const outPath = resolve(OUT, 'sample.jpg.pdf');
  writeFileSync(outPath, out);
  console.log(`  input: sample.jpg ${bytes.length.toLocaleString()} bytes (${embedded.width}x${embedded.height})`);
  console.log(`  output: ${outPath.replace(root + '/', '')} ${out.byteLength.toLocaleString()} bytes`);
  assert(out.byteLength > bytes.length * 0.9, 'PDF wraps the JPEG without massive overhead');
  // Verify the PDF is parseable by reopening it.
  const reopened = await PDFDocument.load(out);
  assert(reopened.getPageCount() === 1, 'generated PDF has exactly one page');
  assert(reopened.getTitle() === 'LocalConvert test image', 'title metadata survives round-trip');
}

// ----- DOCX ↔ ODT round-trip (open-format bridge) -----
section('DOCX ↔ ODT round-trip');
{
  // Compile odt.ts the same way we compile docxRich.ts.
  const { spawnSync } = await import('node:child_process');
  const { mkdirSync, copyFileSync, existsSync } = await import('node:fs');
  const buildDir = resolve(OUT, 'odt-build');
  mkdirSync(buildDir, { recursive: true });
  const srcCopy = resolve(buildDir, 'odt.src.ts');
  copyFileSync(resolve(root, 'src/services/converters/odt.ts'), srcCopy);
  const builtJs = resolve(buildDir, 'odt.src.js');
  const tsc = spawnSync(
    'node',
    [
      resolve(root, 'node_modules/typescript/bin/tsc'),
      srcCopy,
      '--target', 'ES2022',
      '--module', 'ESNext',
      '--moduleResolution', 'Bundler',
      '--esModuleInterop',
      '--skipLibCheck',
      '--outDir', buildDir,
    ],
    { encoding: 'utf8' },
  );
  if (!existsSync(builtJs)) {
    console.log('  tsc stdout:', tsc.stdout?.slice(0, 400));
    throw new Error('tsc failed to produce odt.src.js');
  }
  // Strip the production-only import of expo-file-system + the public entry
  // point that uses it. We only need the pure-JS helpers (htmlToOdtZip,
  // htmlToDocxZip, parseOdtToHtml) for the test.
  let jsSrc = readFileSync(builtJs, 'utf8');
  jsSrc = jsSrc
    .replace(
      "from 'jszip'",
      `from '${resolve(root, 'node_modules/jszip/dist/jszip.min.js')}'`,
    )
    .replace(
      "from 'fast-xml-parser'",
      `from '${resolve(root, 'node_modules/fast-xml-parser/src/fxp.js')}'`,
    )
    // The production entry point imports expo-file-system; in node we don't
    // need it because we feed bytes directly. Replace with a stub.
    .replace(
      "from 'expo-file-system'",
      "from 'data:text/javascript,export const File=class{constructor(){throw new Error(\"stub\")}};'",
    );
  writeFileSync(builtJs, jsSrc);

  // Helpers we want to exercise are not exported. Patch by appending exports.
  const exports = [
    'htmlToOdtZip',
    'htmlToDocxZip',
    'parseOdtToHtml',
  ];
  for (const name of exports) {
    if (!jsSrc.includes(`export { ${name} }`) && !jsSrc.includes(`export async function ${name}`)) {
      jsSrc += `\nexport { ${name} };\n`;
    }
  }
  writeFileSync(builtJs, jsSrc);

  const mod = await import(builtJs);
  const { htmlToOdtZip, htmlToDocxZip, parseOdtToHtml } = mod;

  // Prepare a representative HTML snippet that exercises the supported feature
  // surface: headings, paragraphs, bold/italic/underline/strike, color and
  // highlight, lists, tables, and a styled link.
  const sampleHtml = `
    <h1>LocalConvert test document</h1>
    <p>This document checks the <strong>DOCX ↔ ODT</strong> bridge.</p>
    <p>Mixed inline: <em>italic</em>, <u>underlined</u>, <s>strike</s>,
       <span style="color:#cc0000">red text</span>,
       <span style="background-color:#ffff00">yellow background</span>,
       <span style="font-size:14pt;font-family:Arial">14pt Arial</span>.</p>
    <h2>Bullet list</h2>
    <ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>
    <h2>Numbered list</h2>
    <ol><li>First</li><li>Second</li><li>Third</li></ol>
    <h2>Table</h2>
    <table>
      <tr><th>Item</th><th>Qty</th></tr>
      <tr><td>Pens</td><td>3</td></tr>
      <tr><td>Pencils</td><td>2</td></tr>
    </table>
    <blockquote>"Privacy-first means no cloud APIs."</blockquote>
  `;

  // 1. HTML → ODT
  const odtBytes = await htmlToOdtZip(sampleHtml, 'localconvert-test.odt');
  writeFileSync(resolve(OUT, 'sample.html.odt'), odtBytes);
  console.log(`  HTML → ODT: ${odtBytes.byteLength.toLocaleString()} bytes`);
  assert(odtBytes.byteLength > 800, 'ODT zip is non-trivial');
  // Inspect the mimetype entry: it must be present and exactly the ODT magic.
  const odtZip = await (require(resolve(root, 'node_modules/jszip')).default ??
    require(resolve(root, 'node_modules/jszip'))).loadAsync(odtBytes);
  assert(odtZip.files['mimetype'], 'mimetype file exists');
  const mimetypeText = await odtZip.files['mimetype'].async('text');
  assert(
    mimetypeText === 'application/vnd.oasis.opendocument.text',
    'mimetype content correct',
  );
  assert(odtZip.files['content.xml'], 'content.xml exists');
  assert(odtZip.files['META-INF/manifest.xml'], 'manifest exists');
  const odtContentXml = await odtZip.files['content.xml'].async('text');
  assert(/<text:h\b/.test(odtContentXml), 'ODT has at least one heading');
  assert(/<text:p\b/.test(odtContentXml), 'ODT has paragraphs');
  assert(/<text:list\b/.test(odtContentXml), 'ODT has at least one list');
  assert(/<table:table\b/.test(odtContentXml), 'ODT has a table');
  assert(/fo:color="#cc0000"/.test(odtContentXml), 'ODT preserved red text color');
  assert(/fo:background-color="#ffff00"/.test(odtContentXml), 'ODT preserved yellow highlight');
  assert(/fo:font-weight="bold"/.test(odtContentXml), 'ODT preserved bold weight');

  // 2. ODT → HTML round-trip
  const reopenedHtml = await parseOdtToHtml(
    odtBytes.buffer.slice(odtBytes.byteOffset, odtBytes.byteOffset + odtBytes.byteLength),
  );
  writeFileSync(resolve(OUT, 'sample.odt.html'), reopenedHtml);
  console.log(`  ODT → HTML: ${reopenedHtml.length.toLocaleString()} chars`);
  assert(reopenedHtml.includes('LocalConvert test document'), 'heading text survived ODT round-trip');
  assert(reopenedHtml.includes('Pens'), 'table cell text survived round-trip');
  assert(reopenedHtml.includes('14pt Arial'), 'styled text content survived round-trip');
  assert(/<h1\b/.test(reopenedHtml), 'heading element survived');
  assert(/<ul\b|<ol\b/.test(reopenedHtml), 'list element survived');
  assert(/<table\b/.test(reopenedHtml), 'table element survived');

  // 3. HTML → DOCX (the open-format-to-DOCX direction)
  const docxBytes = await htmlToDocxZip(sampleHtml, 'localconvert-test.docx');
  writeFileSync(resolve(OUT, 'sample.html.docx'), docxBytes);
  console.log(`  HTML → DOCX: ${docxBytes.byteLength.toLocaleString()} bytes`);
  assert(docxBytes.byteLength > 800, 'DOCX zip is non-trivial');
  const docxZip = await (require(resolve(root, 'node_modules/jszip')).default ??
    require(resolve(root, 'node_modules/jszip'))).loadAsync(docxBytes);
  assert(docxZip.files['[Content_Types].xml'], 'DOCX has [Content_Types].xml');
  assert(docxZip.files['_rels/.rels'], 'DOCX has _rels/.rels');
  assert(docxZip.files['word/document.xml'], 'DOCX has word/document.xml');
  assert(docxZip.files['word/styles.xml'], 'DOCX has word/styles.xml');
  const docxDocXml = await docxZip.files['word/document.xml'].async('text');
  assert(/<w:p\b/.test(docxDocXml), 'DOCX has paragraphs');
  assert(/<w:pStyle w:val="Heading1"\/>/.test(docxDocXml), 'DOCX has Heading1 style');
  assert(/<w:numPr>/.test(docxDocXml), 'DOCX has list paragraphs');
  assert(/<w:tbl\b/.test(docxDocXml), 'DOCX has a table');
  assert(/<w:b\/>/.test(docxDocXml), 'DOCX preserved bold runs');
  assert(/<w:color w:val="CC0000"\/>/.test(docxDocXml), 'DOCX preserved red color');

  // 4. Round-trip via mammoth: read the generated DOCX with mammoth and verify
  //    the basic structure made it through.
  const mammoth = require(resolve(root, 'node_modules/mammoth/mammoth.browser.js'));
  const re = await mammoth.convertToHtml({
    arrayBuffer: docxBytes.buffer.slice(docxBytes.byteOffset, docxBytes.byteOffset + docxBytes.byteLength),
  });
  assert(re.value.includes('LocalConvert test document'), 'mammoth re-reads generated DOCX heading');
  assert(re.value.includes('Pens'), 'mammoth re-reads generated DOCX table content');
}

// ----- EPUB stitching pipeline (htmlToPdf.ts EPUB branch) -----
section('EPUB → stitched HTML (jszip + image rewrites)');
{
  const JSZip = require(resolve(root, 'node_modules/jszip')).default ??
    require(resolve(root, 'node_modules/jszip'));
  const input = resolve(FIX, 'sample.epub');
  const buf = readFileSync(input);
  const zip = await JSZip.loadAsync(buf);

  const imageMimes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
  const inlined = new Map();
  for (const path of Object.keys(zip.files)) {
    const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (!m) continue;
    const mime = imageMimes[m[1]];
    if (!mime) continue;
    const b64 = await zip.files[path].async('base64');
    const dataUri = `data:${mime};base64,${b64}`;
    const lower = path.toLowerCase();
    inlined.set(lower, dataUri);
    const base = lower.split('/').pop();
    if (base) inlined.set(base, dataUri);
  }

  const htmlFiles = Object.keys(zip.files)
    .filter((p) => /\.x?html?$/i.test(p))
    .sort();
  const parts = [];
  for (const path of htmlFiles) {
    const text = await zip.files[path].async('text');
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let inner = bodyMatch ? bodyMatch[1] : text;
    inner = inner.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi, (full, prefix, q, ref) => {
      const cleaned = ref.replace(/^\.\.?\/+/, '').toLowerCase();
      const direct = inlined.get(cleaned);
      if (direct) return `${prefix}${q}${direct}${q}`;
      const baseRef = cleaned.split('/').pop();
      const byBase = baseRef ? inlined.get(baseRef) : undefined;
      return byBase ? `${prefix}${q}${byBase}${q}` : full;
    });
    parts.push(`<section>${inner}</section>`);
  }
  const stitched = parts.join('\n');
  writeFileSync(
    resolve(OUT, 'sample.epub.html'),
    wrapPlainHtml(stitched, 'sample.epub (test output)'),
    'utf8',
  );
  const imgs = (stitched.match(/<img\b/g) || []).length;
  const dataUriImgs = (stitched.match(/src="data:image\//g) || []).length;
  console.log(`  input: sample.epub ${buf.length.toLocaleString()} bytes`);
  console.log(`  chapters: ${htmlFiles.length}`);
  console.log(`  stitched output: ${stitched.length.toLocaleString()} chars`);
  console.log(`  images: ${imgs} total, ${dataUriImgs} inlined as data URIs`);
  assert(htmlFiles.length >= 2, 'EPUB has multiple chapters');
  assert(imgs > 0, 'EPUB references at least one image');
  assert(dataUriImgs === imgs, 'every image reference was rewritten to data: URI');
  assert(stitched.includes('Chapter One') || stitched.includes('Chapter Two'), 'chapter content survived stitching');
}

// ----- XLSX → CSV (SheetJS round-trip) -----
section('XLSX → CSV / JSON / HTML (SheetJS)');
{
  const XLSX = require(resolve(root, 'node_modules/xlsx'));
  const input = resolve(FIX, 'sample.xlsx');
  const buf = readFileSync(input);
  const wb = XLSX.read(buf, { type: 'buffer' });
  console.log(`  sheets: ${wb.SheetNames.join(', ')}`);
  assert(wb.SheetNames.length === 3, 'workbook has expected 3 sheets');
  assert(wb.SheetNames.includes('Sales'), 'Sales sheet present');

  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
  writeFileSync(resolve(OUT, 'sample.xlsx.csv'), csv);
  assert(csv.includes('Espresso'), 'CSV contains expected row data');

  const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  writeFileSync(resolve(OUT, 'sample.xlsx.json'), JSON.stringify(json, null, 2));
  assert(Array.isArray(json) && json.length > 0, 'JSON output is non-empty array');

  const sheetsHtml = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const sheetHtml = XLSX.utils.sheet_to_html(ws, { id: name });
    return `<section><h2>${escapeHtml(name)}</h2>${sheetHtml}</section>`;
  }).join('\n');
  const html = sheetsHtml;
  writeFileSync(
    resolve(OUT, 'sample.xlsx.html'),
    wrapPlainHtml(sheetsHtml, 'sample.xlsx (test output)'),
    'utf8',
  );
  assert(html.includes('<table'), 'HTML output contains a <table>');
}

// ----- PDF text-vs-image heuristic -----
section('PDF heuristic (text vs image-only classification)');
{
  // We can't easily extract PDF text in Node without an extra dep, but we can
  // validate the heuristic itself, which is the part most likely to misclassify
  // real-world PDFs. Plug in representative strings and confirm decisions.
  const cases = [
    { name: 'empty', text: '', expectImageOnly: true },
    { name: 'whitespace only', text: '\n   \t\n', expectImageOnly: true },
    { name: 'single short word', text: 'hi', expectImageOnly: true },
    { name: 'few stray tokens', text: '1 2 3 Hello PDF', expectImageOnly: true },
    {
      name: 'paragraph of prose',
      text: 'LocalConvert is a privacy-first on-device file conversion app that handles PDFs, DOCX, images and more without sending anything to the cloud.',
      expectImageOnly: false,
    },
    {
      name: 'flyer-style marketing copy',
      // Synthetic short-token text reflecting the kind of all-caps, headline-
      // heavy content that real-world marketing flyers contain — used to
      // confirm the heuristic still classifies stylized text as TEXT.
      text: 'SUMMER SALE DISCOUNT EVENT BIG SAVINGS LIMITED TIME ONLY VISIT OUR STORE FOR EXCLUSIVE DEALS REGISTER NOW SHOP ONLINE FAST DELIVERY FREE RETURNS',
      expectImageOnly: false,
    },
  ];
  for (const c of cases) {
    const words = countWords(c.text);
    const got = isImageOnly(c.text);
    assert(got === c.expectImageOnly, `${c.name}: ${words} words → ${got ? 'IMAGE-ONLY' : 'TEXT'}`);
  }
}

// ----- summary -----
console.log('');
if (failures === 0) {
  console.log(`All checks passed. Generated outputs in tests/output/`);
  if (existsSync(resolve(OUT, 'sample.docx.html'))) {
    console.log(`Inspect them with: open tests/output/sample.docx.html`);
  }
  process.exit(0);
} else {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
