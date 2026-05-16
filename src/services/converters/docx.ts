import { File } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

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

export async function convertDocx(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  // Lazy load — mammoth's browser bundle and turndown are heavy and we don't
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
    const result = await mammoth.convertToHtml({ arrayBuffer });
    output = `<!DOCTYPE html>\n<html><body>\n${result.value}\n</body></html>\n`;
  } else if (job.targetExt === 'md') {
    const result = await mammoth.convertToHtml({ arrayBuffer });
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
