import { File } from 'expo-file-system';

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

function pagesToHtml(pages: string[], title: string): string {
  const body = pages
    .map((page, i) => {
      const paragraphs = page
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `      <p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
        .join('\n');
      return `    <section data-page="${i + 1}">\n${paragraphs}\n    </section>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
${body}
  </body>
</html>
`;
}

export async function convertPdf(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  // Lazy load — unpdf pulls in its serverless PDF.js build (large) and we
  // don't want it touched until the user actually converts a PDF.
  const { extractText, getMeta } = await import('unpdf');
  const { default: TurndownService } = await import('turndown');

  const source = new File(job.source.uri);
  const bytes = await source.bytes();
  const { text } = await extractText(bytes, { mergePages: false });
  const meta = await getMeta(bytes);
  const pages = text.map(tidyText);
  const title = typeof meta.info?.Title === 'string' ? meta.info.Title : job.outputName;

  let output: string;
  if (job.targetExt === 'txt') {
    output = `${pages.join('\n\n').trim()}\n`;
  } else if (job.targetExt === 'md') {
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const html = pagesToHtml(pages, '');
    output = `${turndown.turndown(html).trim()}\n`;
  } else if (job.targetExt === 'html') {
    output = pagesToHtml(pages, title);
  } else if (job.targetExt === 'json') {
    output = `${JSON.stringify(
      {
        title,
        pageCount: pages.length,
        pages: pages.map((t, i) => ({ page: i + 1, text: t })),
      },
      null,
      2,
    )}\n`;
  } else {
    throw new Error(`Unsupported PDF target: ${job.targetExt}`);
  }

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(output);
  return { uri: dest.uri, size: dest.size };
}
