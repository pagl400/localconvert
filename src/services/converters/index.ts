import { Directory, Paths } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

import { canHandle as canHandleDocx, convertDocx, docxSupportedTargets } from './docx';
import { canHandle as canHandleImage, convertImage, imageSupportedTargets } from './image';
import { canHandle as canHandlePdf, convertPdf, pdfSupportedTargets } from './pdf';
import {
  canHandle as canHandleSpreadsheet,
  convertSpreadsheet,
  spreadsheetSupportedTargets,
} from './spreadsheet';
import { canHandle as canHandleText, convertText, textSupportedTargets } from './text';

const OUTPUT_DIR = 'output';

export function ensureOutputDir(): Directory {
  const dir = new Directory(Paths.cache, OUTPUT_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function isSupported(sourceExt: string, targetExt: string): boolean {
  return (
    canHandleImage(sourceExt, targetExt) ||
    canHandlePdf(sourceExt, targetExt) ||
    canHandleDocx(sourceExt, targetExt) ||
    canHandleSpreadsheet(sourceExt, targetExt) ||
    canHandleText(sourceExt, targetExt)
  );
}

export function supportedTargets(sourceExt: string): Set<string> {
  return new Set([
    ...imageSupportedTargets(sourceExt),
    ...pdfSupportedTargets(sourceExt),
    ...docxSupportedTargets(sourceExt),
    ...spreadsheetSupportedTargets(sourceExt),
    ...textSupportedTargets(sourceExt),
  ]);
}

export async function runConvert(job: ConversionJob): Promise<{ uri: string; size: number }> {
  const dir = ensureOutputDir();
  const outputPath = `${dir.uri}${job.outputName}`;

  if (canHandleImage(job.source.ext, job.targetExt)) {
    return convertImage(job, outputPath);
  }
  if (canHandlePdf(job.source.ext, job.targetExt)) {
    return convertPdf(job, outputPath);
  }
  if (canHandleDocx(job.source.ext, job.targetExt)) {
    return convertDocx(job, outputPath);
  }
  if (canHandleSpreadsheet(job.source.ext, job.targetExt)) {
    return convertSpreadsheet(job, outputPath);
  }
  if (canHandleText(job.source.ext, job.targetExt)) {
    return convertText(job, outputPath);
  }

  throw new Error(
    `Converting ${job.source.ext.toUpperCase()} to ${job.targetExt.toUpperCase()} isn't available in this build yet. Audio, video and write-back to DOCX/PDF need the native engine (later phase, development build required).`,
  );
}
