import { File } from 'expo-file-system';

import { extractPdfText } from '../../../modules/expo-pdf-text/src';
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

function pagesToHtml(pages: { page: number; text: string }[], title: string): string {
  const body = pages
    .map((p) => {
      const paragraphs = p.text
        .split(/\n{2,}/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map((para) => `      <p>${escapeHtml(para).replace(/\n/g, '<br />')}</p>`)
        .join('\n');
      return `    <section data-page="${p.page}">\n${paragraphs}\n    </section>`;
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
  const { title, pageCount, pages } = await extractPdfText(job.source.uri);
  const cleaned = pages.map((p) => ({ ...p, text: tidyText(p.text) }));
  const docTitle = title ?? job.outputName;

  let output: string;
  if (job.targetExt === 'txt') {
    output = `${cleaned.map((p) => p.text).join('\n\n').trim()}\n`;
  } else if (job.targetExt === 'md') {
    const { default: TurndownService } = await import('turndown');
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    output = `${turndown.turndown(pagesToHtml(cleaned, '')).trim()}\n`;
  } else if (job.targetExt === 'html') {
    output = pagesToHtml(cleaned, docTitle);
  } else if (job.targetExt === 'json') {
    output = `${JSON.stringify({ title: docTitle, pageCount, pages: cleaned }, null, 2)}\n`;
  } else {
    throw new Error(`Unsupported PDF target: ${job.targetExt}`);
  }

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(output);
  return { uri: dest.uri, size: dest.size };
}
