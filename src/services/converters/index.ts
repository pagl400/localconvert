import { Directory, Paths } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

import { canHandle as canHandleAudio, convertAudio, audioSupportedTargets } from './audio';
import { canHandle as canHandleDocx, convertDocx, docxSupportedTargets } from './docx';
import { canHandle as canHandleEpub, convertEpub, epubSupportedTargets } from './epub';
import {
  canHandle as canHandleHtmlToPdf,
  convertToPdf,
  htmlToPdfSupportedTargets,
} from './htmlToPdf';
import { canHandle as canHandleImage, convertImage, imageSupportedTargets } from './image';
import {
  canHandle as canHandleImageToPdf,
  convertImageToPdf,
  imageToPdfSupportedTargets,
} from './imageToPdf';
import { canHandle as canHandleOdt, convertOdt, odtSupportedTargets } from './odt';
import { canHandle as canHandlePdf, convertPdf, pdfSupportedTargets } from './pdf';
import { canHandle as canHandlePdfTools, runPdfTool } from './pdfTools';
import {
  canHandle as canHandleSpreadsheet,
  convertSpreadsheet,
  spreadsheetSupportedTargets,
} from './spreadsheet';
import { canHandle as canHandleText, convertText, textSupportedTargets } from './text';
import { canHandle as canHandleVideo, convertVideo, videoSupportedTargets } from './video';

const OUTPUT_DIR = 'output';

function ensureOutputDir(): Directory {
  const dir = new Directory(Paths.cache, OUTPUT_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function isSupported(sourceExt: string, targetExt: string, variant?: string): boolean {
  return (
    canHandleImageToPdf(sourceExt, targetExt) ||
    canHandleHtmlToPdf(sourceExt, targetExt) ||
    canHandleOdt(sourceExt, targetExt) ||
    canHandleImage(sourceExt, targetExt) ||
    canHandlePdf(sourceExt, targetExt) ||
    canHandlePdfTools(sourceExt, targetExt, variant) ||
    canHandleDocx(sourceExt, targetExt) ||
    canHandleEpub(sourceExt, targetExt) ||
    canHandleSpreadsheet(sourceExt, targetExt) ||
    canHandleAudio(sourceExt, targetExt) ||
    canHandleVideo(sourceExt, targetExt) ||
    canHandleText(sourceExt, targetExt)
  );
}

export function supportedTargets(sourceExt: string): Set<string> {
  return new Set([
    ...imageToPdfSupportedTargets(sourceExt),
    ...htmlToPdfSupportedTargets(sourceExt),
    ...odtSupportedTargets(sourceExt),
    ...imageSupportedTargets(sourceExt),
    ...pdfSupportedTargets(sourceExt),
    ...docxSupportedTargets(sourceExt),
    ...epubSupportedTargets(sourceExt),
    ...spreadsheetSupportedTargets(sourceExt),
    ...audioSupportedTargets(sourceExt),
    ...videoSupportedTargets(sourceExt),
    ...textSupportedTargets(sourceExt),
  ]);
}

export async function runConvert(job: ConversionJob): Promise<{ uri: string; size: number }> {
  const dir = ensureOutputDir();
  const outputPath = `${dir.uri}${job.outputName}`;

  // Order matters: image→pdf and html→pdf must run before the generic image/
  // docx/etc. handlers, so .jpg→.pdf, .docx→.pdf, .md→.pdf route here instead
  // of the older text-only paths.
  if (canHandlePdfTools(job.source.ext, job.targetExt, job.variant))
    return runPdfTool(job, outputPath);
  if (canHandleImageToPdf(job.source.ext, job.targetExt))
    return convertImageToPdf(job, outputPath);
  if (canHandleHtmlToPdf(job.source.ext, job.targetExt)) return convertToPdf(job, outputPath);
  // ODT bridge runs before the legacy DOCX handler so docx→odt and odt→docx
  // go through the bidirectional path instead of falling back to text-only.
  if (canHandleOdt(job.source.ext, job.targetExt)) return convertOdt(job, outputPath);
  if (canHandleImage(job.source.ext, job.targetExt)) return convertImage(job, outputPath);
  if (canHandlePdf(job.source.ext, job.targetExt)) return convertPdf(job, outputPath);
  if (canHandleDocx(job.source.ext, job.targetExt)) return convertDocx(job, outputPath);
  if (canHandleEpub(job.source.ext, job.targetExt)) return convertEpub(job, outputPath);
  if (canHandleSpreadsheet(job.source.ext, job.targetExt)) return convertSpreadsheet(job, outputPath);
  if (canHandleVideo(job.source.ext, job.targetExt)) return convertVideo(job, outputPath);
  if (canHandleAudio(job.source.ext, job.targetExt)) return convertAudio(job, outputPath);
  if (canHandleText(job.source.ext, job.targetExt)) return convertText(job, outputPath);

  throw new Error(
    `Converting ${job.source.ext.toUpperCase()} to ${job.targetExt.toUpperCase()} isn't supported yet.`,
  );
}
