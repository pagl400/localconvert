import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import type { ConversionJob } from '../../types/conversion';

import { pageGeometry, slotRects } from './pageGeometry';

const SUPPORTED_SOURCES = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return SUPPORTED_SOURCES.has(sourceExt) && targetExt === 'pdf';
}

export function imageToPdfSupportedTargets(sourceExt: string): string[] {
  return SUPPORTED_SOURCES.has(sourceExt) ? ['pdf'] : [];
}

// pdf-lib only embeds JPEG and PNG natively. Everything else (HEIC, WebP) gets
// transcoded to JPEG first via expo-image-manipulator, which already handles
// the heavy formats. Keep the JPEG quality high — we're optimizing for "good
// document scan" rather than file size.
// (pageGeometry / slotRects live in ./pageGeometry so unit tests can exercise
// them without the file-system stack.)
async function loadAsEmbeddable(uri: string, ext: string): Promise<{ bytes: Uint8Array; kind: 'jpg' | 'png' }> {
  if (ext === 'png') {
    const f = new File(uri);
    return { bytes: await f.bytes(), kind: 'png' };
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    const f = new File(uri);
    return { bytes: await f.bytes(), kind: 'jpg' };
  }
  // HEIC / HEIF / WebP → JPEG via expo-image-manipulator
  const result = await manipulateAsync(uri, [], { format: SaveFormat.JPEG, compress: 0.92 });
  const f = new File(result.uri);
  return { bytes: await f.bytes(), kind: 'jpg' };
}

export async function convertImageToPdf(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const { PDFDocument } = await import('pdf-lib');

  const { bytes, kind } = await loadAsEmbeddable(job.source.uri, job.source.ext);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(job.outputName.replace(/\.pdf$/i, ''));
  pdfDoc.setCreator('LocalConvert');
  pdfDoc.setProducer('LocalConvert (on-device)');

  const embedded =
    kind === 'jpg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);

  const opts = job.imageToPdfOptions ?? {};
  // Default to "no fixed page, use image dimensions" when the user didn't pick
  // a page format — preserves prior behaviour where the page hugs the image.
  const usePageFormat = opts.pageFormat != null || opts.orientation != null || opts.marginMm != null || opts.imagesPerPage != null;

  if (!usePageFormat) {
    // Legacy "page-hugs-image" path with cap on dimensions.
    const maxLong = 2048;
    const srcW = embedded.width;
    const srcH = embedded.height;
    const longer = Math.max(srcW, srcH);
    const scale = longer > maxLong ? maxLong / longer : 1;
    const pageW = srcW * scale;
    const pageH = srcH * scale;
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
  } else {
    const { pageW, pageH, marginPt } = pageGeometry(opts);
    const n = (opts.imagesPerPage ?? 1) as 1 | 2 | 4;
    const slots = slotRects(pageW, pageH, marginPt, n);
    // For a single source image we only fill the first slot — multi-file
    // batches would queue additional images into the remaining slots.
    const slot = slots[0];
    const scale = Math.min(slot.w / embedded.width, slot.h / embedded.height);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;
    const dx = slot.x + (slot.w - drawW) / 2;
    const dy = slot.y + (slot.h - drawH) / 2;
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(embedded, { x: dx, y: dy, width: drawW, height: drawH });
  }

  const pdfBytes = await pdfDoc.save();

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(pdfBytes);
  return { uri: dest.uri, size: dest.size };
}
