import { File } from 'expo-file-system';
import TurndownService from 'turndown';
import { extractText, getMeta } from 'unpdf';

import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_TARGETS = new Set(['txt', 'md', 'html', 'json']);

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

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
    .replace(/ /g, ' ')
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

function pagesToMarkdown(pages: string[]): string {
  // Use the HTML→MD path so the output picks up paragraph breaks cleanly.
  const html = pagesToHtml(pages, '').replace(/<title><\/title>/, '');
  const md = turndown.turndown(html);
  return `${md.trim()}\n`;
}

async function loadAndExtract(uri: string): Promise<{
  pages: string[];
  meta: { title?: string; pageCount: number };
}> {
  const file = new File(uri);
  const bytes = await file.bytes();
  const { text } = await extractText(bytes, { mergePages: false });
  const meta = await getMeta(bytes);
  return {
    pages: text.map(tidyText),
    meta: {
      title: typeof meta.info?.Title === 'string' ? meta.info.Title : undefined,
      pageCount: text.length,
    },
  };
}

export async function convertPdf(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const { pages, meta } = await loadAndExtract(job.source.uri);

  let output: string;
  if (job.targetExt === 'txt') {
    output = `${pages.join('\n\n').trim()}\n`;
  } else if (job.targetExt === 'md') {
    output = pagesToMarkdown(pages);
  } else if (job.targetExt === 'html') {
    output = pagesToHtml(pages, meta.title ?? job.outputName);
  } else if (job.targetExt === 'json') {
    output = `${JSON.stringify(
      {
        title: meta.title,
        pageCount: meta.pageCount,
        pages: pages.map((text, i) => ({ page: i + 1, text })),
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
