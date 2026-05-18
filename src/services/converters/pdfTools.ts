import { File } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

import { canHandle, parsePageRanges, type PdfToolVariant } from './pdfToolsLogic';

// PDF → PDF "tools" — implemented entirely with pdf-lib so they work offline.
// The operation is selected via job.variant:
//   'compress'    → re-encode and drop metadata
//   'rotate90/180/270' → rotate every page
//   'split'       → keep only the page range given in pdfToolsOptions.pages
//   'delete'      → remove the page range given in pdfToolsOptions.pages
// Pure helpers (canHandle, parsePageRanges, PdfToolVariant) live in
// ./pdfToolsLogic so unit tests can exercise them without the expo-file-system
// and pdf-lib bridges. Consumers that need them import from pdfToolsLogic
// directly; we only re-export canHandle since the converter registry already
// imports it from here.

export { canHandle };

export async function runPdfTool(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const variant = (job.variant ?? '') as PdfToolVariant;
  const { PDFDocument, degrees } = await import('pdf-lib');

  const src = new File(job.source.uri);
  const bytes = await src.bytes();
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = srcDoc.getPageCount();

  const out = await PDFDocument.create();
  out.setTitle(job.outputName.replace(/\.pdf$/i, ''));
  out.setCreator('LocalConvert');
  out.setProducer('LocalConvert (on-device)');

  const pagesInput = job.pdfToolsOptions?.pages ?? '';
  const requested = pagesInput ? parsePageRanges(pagesInput, pageCount) : [];

  let keepIndices: number[] = [];
  if (variant === 'split') {
    keepIndices = requested.length ? requested.map((i) => i - 1) : Array.from({ length: pageCount }, (_, i) => i);
  } else if (variant === 'delete') {
    const remove = new Set(requested.map((i) => i - 1));
    keepIndices = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !remove.has(i));
  } else {
    keepIndices = Array.from({ length: pageCount }, (_, i) => i);
  }

  if (keepIndices.length === 0) {
    throw new Error('Keine Seiten ausgewählt.');
  }

  const copied = await out.copyPages(srcDoc, keepIndices);
  const rotateDeg = variant === 'rotate90' ? 90 : variant === 'rotate180' ? 180 : variant === 'rotate270' ? 270 : 0;
  for (const page of copied) {
    if (rotateDeg !== 0) {
      const prev = page.getRotation().angle;
      page.setRotation(degrees((prev + rotateDeg) % 360));
    }
    out.addPage(page);
  }

  // pdf-lib's `useObjectStreams: true` writes a compressed cross-reference
  // stream which shaves bytes off the file. For our "compress" variant we
  // additionally strip metadata that the user might not want to keep.
  if (variant === 'compress') {
    out.setAuthor('');
    out.setSubject('');
    out.setKeywords([]);
  }

  const saved = await out.save({ useObjectStreams: true });

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(saved);
  return { uri: dest.uri, size: dest.size };
}
