import { File } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_TARGETS = new Set(['txt', 'md', 'html']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return sourceExt === 'epub' && SUPPORTED_TARGETS.has(targetExt);
}

export function epubSupportedTargets(sourceExt: string): string[] {
  return sourceExt === 'epub' ? Array.from(SUPPORTED_TARGETS) : [];
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveRelative(base: string, href: string): string {
  const cleanHref = href.split('#')[0]!;
  if (!base.includes('/')) return cleanHref;
  const dir = base.slice(0, base.lastIndexOf('/') + 1);
  const parts = (dir + cleanHref).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

async function readEpubChapters(uri: string): Promise<{ title: string; chapters: string[] }> {
  const { default: JSZip } = await import('jszip');

  const file = new File(uri);
  const bytes = await file.bytes();
  const zip = await JSZip.loadAsync(bytes);

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('EPUB is missing META-INF/container.xml');
  const containerXml = await containerFile.async('string');
  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) throw new Error('Could not locate the OPF file inside the EPUB.');
  const opfPath = opfPathMatch[1]!;
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`OPF file not found at ${opfPath}`);
  const opfXml = await opfFile.async('string');

  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
  const title = titleMatch?.[1]?.trim() ?? '';

  const manifest = new Map<string, string>();
  const itemRegex = /<item[^>]*\sid="([^"]+)"[^>]*\shref="([^"]+)"[^>]*\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(opfXml)) !== null) {
    manifest.set(match[1]!, match[2]!);
  }

  const spineRegex = /<itemref[^>]*\sidref="([^"]+)"/g;
  const order: string[] = [];
  while ((match = spineRegex.exec(opfXml)) !== null) {
    order.push(match[1]!);
  }

  const chapters: string[] = [];
  for (const id of order) {
    const href = manifest.get(id);
    if (!href) continue;
    const path = resolveRelative(opfPath, href);
    const entry = zip.file(path);
    if (!entry) continue;
    const html = await entry.async('string');
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    chapters.push(bodyMatch?.[1] ?? html);
  }

  return { title, chapters };
}

export async function convertEpub(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const { title, chapters } = await readEpubChapters(job.source.uri);

  let output: string;
  if (job.targetExt === 'txt') {
    const text = chapters.map(stripTags).filter(Boolean).join('\n\n');
    output = `${text.trim()}\n`;
  } else if (job.targetExt === 'md') {
    const { default: TurndownService } = await import('turndown');
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const md = chapters
      .map((c) => turndown.turndown(c).trim())
      .filter(Boolean)
      .join('\n\n---\n\n');
    output = title ? `# ${title}\n\n${md}\n` : `${md}\n`;
  } else if (job.targetExt === 'html') {
    const safeTitle = (title || job.outputName).replace(/[<>&"']/g, '');
    const body = chapters
      .map((c, i) => `    <section data-chapter="${i + 1}">\n${c}\n    </section>`)
      .join('\n');
    output = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
  </head>
  <body>
${body}
  </body>
</html>
`;
  } else {
    throw new Error(`Unsupported EPUB target: ${job.targetExt}`);
  }

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(output);
  return { uri: dest.uri, size: dest.size };
}
