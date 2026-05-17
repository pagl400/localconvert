import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import type { ConversionJob } from '../../types/conversion';

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
  // Lazy load — pdf-lib is hefty and we don't want it on app startup.
  const { PDFDocument } = await import('pdf-lib');

  const { bytes, kind } = await loadAsEmbeddable(job.source.uri, job.source.ext);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(job.outputName.replace(/\.pdf$/i, ''));
  pdfDoc.setCreator('LocalConvert');
  pdfDoc.setProducer('LocalConvert (on-device)');

  const embedded =
    kind === 'jpg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);

  // Fit image into A4-ish page while keeping aspect ratio. Cap at 2048pt on the
  // longer edge to avoid producing absurdly large PDFs for huge source images.
  const maxLong = 2048;
  const srcW = embedded.width;
  const srcH = embedded.height;
  const longer = Math.max(srcW, srcH);
  const scale = longer > maxLong ? maxLong / longer : 1;
  const pageW = srcW * scale;
  const pageH = srcH * scale;

  const page = pdfDoc.addPage([pageW, pageH]);
  page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });

  const pdfBytes = await pdfDoc.save();

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(pdfBytes);
  return { uri: dest.uri, size: dest.size };
}
