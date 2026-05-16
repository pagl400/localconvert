import { File } from 'expo-file-system';
// Mammoth's main entry pulls in Node-flavoured modules (bluebird, buffer). The
// `mammoth.browser.js` ships everything self-contained and runs in any JS env.
// @ts-expect-error - no types for the browser bundle, surface is the same as 'mammoth'.
import mammoth from 'mammoth/mammoth.browser.js';
import TurndownService from 'turndown';

import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_TARGETS = new Set(['txt', 'md', 'html']);

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return sourceExt === 'docx' && SUPPORTED_TARGETS.has(targetExt);
}

export function docxSupportedTargets(sourceExt: string): string[] {
  return sourceExt === 'docx' ? Array.from(SUPPORTED_TARGETS) : [];
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Slice to get a clean ArrayBuffer without any other view's offset.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function convertDocx(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
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
