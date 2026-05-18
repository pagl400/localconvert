import { File } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

import { canHandle, parsePageRanges, type PdfToolVariant } from './pdfToolsLogic';

// PDF → PDF "tools", implemented entirely with pdf-lib so they work offline.
// The operation is selected via job.variant:
//   'compress-light'    → object streams, keep metadata
//   'compress'          → object streams + strip metadata (Standard)
//   'compress-strong'   → object streams + strip metadata + drop forms,
//                         annotations, attachments, JS — the most pdf-lib can do
//   'rotate90/180/270'  → rotate every page
//   'split'             → keep only the page range in pdfToolsOptions.pages
//   'delete'            → remove the page range in pdfToolsOptions.pages
//   'merge'             → concatenate source + pdfToolsOptions.additionalSources
//
// True image-recompression (rasterising pages at lower DPI) needs a native
// CGPDF + ImageIO path; not implemented yet. Pure pdf-lib gains 5–20 % depending
// on input metadata bloat.

export { canHandle };

export async function runPdfTool(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const variant = (job.variant ?? '') as PdfToolVariant;
  const { PDFDocument, degrees } = await import('pdf-lib');

  // Merge takes a different shape — multiple sources → single output.
  if (variant === 'merge') {
    return runMerge(job, outputPath, PDFDocument);
  }

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

  // Light compression keeps metadata; standard strips author/subject/keywords;
  // strong does standard + tries to drop additional bloat where pdf-lib lets us.
  if (variant === 'compress' || variant === 'compress-strong') {
    out.setAuthor('');
    out.setSubject('');
    out.setKeywords([]);
  }
  if (variant === 'compress-strong') {
    // pdf-lib doesn't expose JS / form / attachment removal as first-class API,
    // but clearing AcroForm at the catalog level is safe and drops most of it.
    // Other heavy strip operations would need raw object-graph manipulation
    // outside the scope of this round.
    try {
      const catalog = (out as unknown as { catalog: { delete: (key: unknown) => void } }).catalog;
      const PDFName = (await import('pdf-lib')).PDFName;
      catalog.delete(PDFName.of('AcroForm'));
      catalog.delete(PDFName.of('Names'));
      catalog.delete(PDFName.of('OpenAction'));
    } catch {
      // Catalog API isn't part of pdf-lib's public surface; best-effort only.
    }
  }

  const saved = await out.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(saved);
  return { uri: dest.uri, size: dest.size };
}

async function runMerge(
  job: ConversionJob,
  outputPath: string,
  PDFDocument: typeof import('pdf-lib').PDFDocument,
): Promise<{ uri: string; size: number }> {
  const additional = job.pdfToolsOptions?.additionalSources ?? [];
  if (additional.length === 0) {
    throw new Error('Mindestens eine zusätzliche PDF zum Zusammenfügen wählen.');
  }

  const out = await PDFDocument.create();
  out.setTitle(job.outputName.replace(/\.pdf$/i, ''));
  out.setCreator('LocalConvert');
  out.setProducer('LocalConvert (on-device)');

  const sources = [job.source, ...additional];
  for (const src of sources) {
    const bytes = await new File(src.uri).bytes();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const indices = Array.from({ length: doc.getPageCount() }, (_, i) => i);
    const pages = await out.copyPages(doc, indices);
    for (const p of pages) out.addPage(p);
  }

  const saved = await out.save({ useObjectStreams: true, addDefaultPage: false });
  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(saved);
  return { uri: dest.uri, size: dest.size };
}
