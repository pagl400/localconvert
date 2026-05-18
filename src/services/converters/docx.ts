import { File } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

import { renderDocxToStyledHtml } from './docxRich';

const SUPPORTED_TARGETS = new Set(['txt', 'md', 'html']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return sourceExt === 'docx' && SUPPORTED_TARGETS.has(targetExt);
}

export function docxSupportedTargets(sourceExt: string): string[] {
  return sourceExt === 'docx' ? Array.from(SUPPORTED_TARGETS) : [];
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Markup wrapped around mammoth's output. `contenteditable` makes everything
// the user opens in a browser directly editable, and the styles match a
// generic word-processor look so DOCX → HTML feels familiar.
const HTML_STYLE = `      :root { color-scheme: light dark; }
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

// Style map: tells mammoth how to translate non-default Word styles. Without
// this, the calibre demo (and any real-world DOCX) renders Title paragraphs,
// table-of-contents entries, and emphasis runs as plain <p>, losing visual
// hierarchy. Each entry follows mammoth's DSL, see
// https://github.com/mwilliamson/mammoth.js#writing-style-maps
//
// Important: do NOT map "List Paragraph" here. Mammoth's built-in numbering
// handler turns paragraphs with `<w:numPr>` into proper <ul>/<ol> structures,
// and any explicit styleMap entry for List Paragraph wins over that logic,
// breaking the list output. Decimal-aligned paragraphs are usually inside
// table cells with numeric data, leaving them as default <p> renders fine.
const STYLE_MAP = [
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

const EDIT_BANNER = `    <div class="docx-edit-banner" contenteditable="false">
      Diese Datei ist editierbar. Klick in den Text und tippe los. Im Browser via Drucken &rarr; "Als PDF speichern" sichern.
    </div>`;

function wrapDocxHtml(inner: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
${HTML_STYLE}
    </style>
  </head>
  <body contenteditable="true" spellcheck="true">
${EDIT_BANNER}
    <article>
${inner}
    </article>
  </body>
</html>
`;
}

// "plain" variant: clean semantic HTML via mammoth. Best for downstream tools,
// accessibility, and editing. Strips colors / highlights / fonts.
async function convertDocxToPlainHtml(
  arrayBuffer: ArrayBuffer,
  mammoth: any,
  title: string,
): Promise<string> {
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.dataUri,
      styleMap: STYLE_MAP,
    },
  );
  return wrapDocxHtml(result.value as string, title);
}

// "styled" variant: full visual fidelity via our custom renderer. Preserves
// inline colors, highlights, underlines, fonts, sizes, table shading, etc.
async function convertDocxToStyledHtml(
  arrayBuffer: ArrayBuffer,
  title: string,
): Promise<string> {
  const inner = await renderDocxToStyledHtml(arrayBuffer);
  return wrapDocxHtml(inner, title);
}

export async function convertDocx(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  // Lazy load, mammoth's browser bundle and turndown are heavy and we don't
  // want them on the startup critical path.
  // @ts-expect-error - no types for the browser bundle, surface matches 'mammoth'.
  const mammothModule = await import('mammoth/mammoth.browser.js');
  const mammoth = mammothModule.default ?? mammothModule;
  const { default: TurndownService } = await import('turndown');
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

  const source = new File(job.source.uri);
  const bytes = await source.bytes();
  const arrayBuffer = toArrayBuffer(bytes);

  let output: string;
  if (job.targetExt === 'txt') {
    const result = await mammoth.extractRawText({ arrayBuffer });
    output = `${result.value.trim()}\n`;
  } else if (job.targetExt === 'html') {
    output =
      job.variant === 'styled'
        ? await convertDocxToStyledHtml(arrayBuffer, job.outputName)
        : await convertDocxToPlainHtml(arrayBuffer, mammoth, job.outputName);
  } else if (job.targetExt === 'md') {
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      { convertImage: mammoth.images.dataUri, styleMap: STYLE_MAP },
    );
    output = `${turndown.turndown(result.value).trim()}\n`;
  } else {
    throw new Error(`Unsupported DOCX target: ${job.targetExt}`);
  }

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(output);
  return { uri: dest.uri, size: dest.size };
}
