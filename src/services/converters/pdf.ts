import { File } from 'expo-file-system';

import {
  extractPdfText,
  ocrPdfPages,
  type ExtractedPage,
} from '../../../modules/expo-pdf-text/src';
import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_TARGETS = new Set(['txt', 'md', 'html', 'json']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return sourceExt === 'pdf' && SUPPORTED_TARGETS.has(targetExt);
}

export function pdfSupportedTargets(sourceExt: string): string[] {
  return sourceExt === 'pdf' ? Array.from(SUPPORTED_TARGETS) : [];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tidyText(input: string): string {
  return input
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// A PDF page is treated as "image-only" when its text layer has too few
// real words to be useful — pure scans return empty/near-empty strings, while
// design-heavy PDFs have only a handful of stray glyphs. Below the threshold
// the page-rendered image is the better representation.
const IMAGE_ONLY_WORD_THRESHOLD = 8;

function countWords(text: string): number {
  const matches = text.match(/[A-Za-zÀ-ÿ]{2,}/g);
  return matches ? matches.length : 0;
}

function isImageOnlyPage(page: ExtractedPage): boolean {
  return countWords(page.text) < IMAGE_ONLY_WORD_THRESHOLD;
}

const HTML_STYLE = `      :root { color-scheme: light dark; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 880px; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.55; }
      section.page { margin: 0 0 3rem; padding-bottom: 2rem; border-bottom: 1px solid #e5e5e5; }
      section.page:last-child { border-bottom: none; }
      section.page > .page-label { font-size: 0.8rem; color: #888; margin: 0 0 0.75rem; }
      section.page img.page-render { display: block; max-width: 100%; height: auto; margin: 0 auto; }
      section.page p { margin: 0 0 0.75rem; }
      section.page p.line { margin: 0; min-height: 1em; }
      section.page p.line + p.line { margin-top: 0; }
      h1.doc-title { font-size: 1.4rem; margin: 0 0 1.5rem; color: #333; border-bottom: 2px solid #e5e5e5; padding-bottom: 0.5rem; }`;

function pageImageTag(page: ExtractedPage): string {
  if (!page.imageBase64) return '';
  return `      <img class="page-render" src="data:image/jpeg;base64,${page.imageBase64}" alt="Seite ${page.page}" />`;
}

// Render text faithfully by preserving line structure. Blank lines become
// paragraph breaks; single newlines become separate <p class="line">. This
// keeps the visual rhythm of the source much closer to the PDF than the
// previous paragraph-only approach.
function textToHtml(text: string): string {
  const trimmed = tidyText(text);
  if (!trimmed) return '';
  const blocks = trimmed.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length === 0) return '';
      if (lines.length === 1) {
        return `      <p>${escapeHtml(lines[0])}</p>`;
      }
      return lines.map((l) => `      <p class="line">${escapeHtml(l)}</p>`).join('\n');
    })
    .filter(Boolean)
    .join('\n      <p class="line">&nbsp;</p>\n');
}

function pagesToHtml(pages: ExtractedPage[], title: string): string {
  const body = pages
    .map((p) => {
      const imageOnly = isImageOnlyPage(p);
      const parts: string[] = [
        `      <div class="page-label">Seite ${p.page}</div>`,
      ];
      if (imageOnly) {
        const img = pageImageTag(p);
        if (img) parts.push(img);
        // If we somehow have no rendered image either, fall back to text so
        // we never produce an empty section.
        if (!img && p.text.trim()) parts.push(textToHtml(p.text));
      } else {
        const html = textToHtml(p.text);
        if (html) parts.push(html);
      }
      return `    <section class="page" data-page="${p.page}">\n${parts.join('\n')}\n    </section>`;
    })
    .join('\n');
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
  <body>
    <h1 class="doc-title">${escapeHtml(title)}</h1>
${body}
  </body>
</html>
`;
}

function pagesToMarkdown(pages: ExtractedPage[]): string {
  return pages
    .map((p) => {
      const blocks: string[] = [`<!-- Seite ${p.page} -->`];
      if (isImageOnlyPage(p)) {
        if (p.imageBase64) {
          blocks.push(`![Seite ${p.page}](data:image/jpeg;base64,${p.imageBase64})`);
        }
      } else {
        const text = tidyText(p.text);
        if (text) blocks.push(text);
      }
      return blocks.join('\n\n');
    })
    .join('\n\n---\n\n');
}

export async function convertPdf(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  // OCR path: render every page via Vision Framework instead of using the
  // PDF's text layer. Used when the PDF is a scan or the user explicitly
  // picks 'ocr' as the variant.
  if (job.variant === 'ocr' && job.targetExt === 'txt') {
    const ocr = await ocrPdfPages(job.source.uri);
    const output = `${ocr.pages.map((p) => p.text).join('\n\n').trim()}\n`;
    const dest = new File(outputPath);
    if (dest.exists) dest.delete();
    dest.create();
    dest.write(output);
    return { uri: dest.uri, size: dest.size };
  }

  const wantsImages = job.targetExt === 'html' || job.targetExt === 'md';
  const { title, pageCount, pages } = await extractPdfText(job.source.uri, {
    renderImages: wantsImages,
  });
  const docTitle = title ?? job.outputName;

  let output: string;
  if (job.targetExt === 'txt') {
    output = `${pages.map((p) => tidyText(p.text)).join('\n\n').trim()}\n`;
  } else if (job.targetExt === 'md') {
    output = `${pagesToMarkdown(pages).trim()}\n`;
  } else if (job.targetExt === 'html') {
    output = pagesToHtml(pages, docTitle);
  } else if (job.targetExt === 'json') {
    const stripped = pages.map((p) => ({
      page: p.page,
      text: tidyText(p.text),
      imageOnly: isImageOnlyPage(p),
    }));
    output = `${JSON.stringify({ title: docTitle, pageCount, pages: stripped }, null, 2)}\n`;
  } else {
    throw new Error(`Unsupported PDF target: ${job.targetExt}`);
  }

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(output);
  return { uri: dest.uri, size: dest.size };
}
