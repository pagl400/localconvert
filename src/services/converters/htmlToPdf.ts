import { File } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

// Sources we can render to PDF directly via the WKWebView-backed expo-print.
// We accept anything that we can produce HTML from elsewhere; the controller
// will optionally route through the existing HTML pipelines for non-HTML
// inputs (DOCX, MD, EPUB, etc.) before invoking expo-print.
const DIRECT_SOURCES = new Set(['html', 'htm', 'md', 'markdown']);
const VIA_HTML_SOURCES = new Set(['docx', 'epub', 'xlsx', 'xls', 'ods']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  if (targetExt !== 'pdf') return false;
  return DIRECT_SOURCES.has(sourceExt) || VIA_HTML_SOURCES.has(sourceExt);
}

export function htmlToPdfSupportedTargets(sourceExt: string): string[] {
  if (DIRECT_SOURCES.has(sourceExt) || VIA_HTML_SOURCES.has(sourceExt)) return ['pdf'];
  return [];
}

const PAGE_STYLE = `      :root { color-scheme: light; }
      @page { margin: 16mm 14mm; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.55;
        color: #111;
        max-width: 800px;
        margin: 0 auto;
      }
      h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin-top: 1.4em; margin-bottom: 0.5em; }
      h1 { font-size: 1.8em; }
      h2 { font-size: 1.5em; }
      h3 { font-size: 1.25em; }
      p { margin: 0 0 0.8em; }
      ul, ol { padding-left: 1.6em; }
      blockquote { border-left: 3px solid #d0d0d0; margin: 1em 0; padding: 0.4em 1em; color: #555; background: #fafafa; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; margin: 1em 0; }
      table td, table th { border: 1px solid #d0d0d0; padding: 0.4em 0.6em; }
      table th { background: #f5f5f5; font-weight: 600; }
      code { background: #f4f4f4; padding: 0.1em 0.35em; border-radius: 3px; font-family: SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
      pre { background: #f4f4f4; padding: 1em; border-radius: 4px; overflow-x: auto; }`;

function wrapHtml(inner: string, title: string): string {
  const hasDoctype = /^\s*<!doctype/i.test(inner);
  if (hasDoctype) return inner;
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${title}</title><style>${PAGE_STYLE}</style></head><body>${inner}</body></html>`;
}

async function sourceToHtml(job: ConversionJob): Promise<string> {
  const src = new File(job.source.uri);
  const ext = job.source.ext;

  if (ext === 'html' || ext === 'htm') {
    return await src.text();
  }
  if (ext === 'md' || ext === 'markdown') {
    const text = await src.text();
    const { marked } = await import('marked');
    return marked.parse(text, { async: false }) as string;
  }
  if (ext === 'docx') {
    // @ts-expect-error - mammoth has no types for the browser bundle
    const mammothModule = await import('mammoth/mammoth.browser.js');
    const mammoth = mammothModule.default ?? mammothModule;
    const bytes = await src.bytes();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await mammoth.convertToHtml(
      { arrayBuffer: buf },
      { convertImage: mammoth.images.dataUri },
    );
    return result.value as string;
  }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    const XLSX = await import('xlsx');
    const bytes = await src.bytes();
    const wb = XLSX.read(bytes, { type: 'array' });
    return wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const sheetHtml = XLSX.utils.sheet_to_html(ws, { id: name });
      return `<section><h2>${name}</h2>${sheetHtml}</section>`;
    }).join('\n');
  }
  if (ext === 'epub') {
    const JSZip = (await import('jszip')).default;
    const bytes = await src.bytes();
    const zip = await JSZip.loadAsync(bytes);

    // Inline all referenced raster images as data URIs so the printed PDF
    // doesn't hit broken relative paths inside the WebView sandbox.
    const imageMimes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };
    const imageDataUriByBasename = new Map<string, string>();
    for (const path of Object.keys(zip.files)) {
      const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
      if (!m) continue;
      const mime = imageMimes[m[1]];
      if (!mime) continue;
      const b64 = await zip.files[path].async('base64');
      const dataUri = `data:${mime};base64,${b64}`;
      // Store under multiple variants of the filename so different relative
      // path styles (../images/foo.jpg, images/foo.jpg, foo.jpg) all match.
      const lower = path.toLowerCase();
      imageDataUriByBasename.set(lower, dataUri);
      const base = lower.split('/').pop();
      if (base) imageDataUriByBasename.set(base, dataUri);
    }

    const htmlFiles = Object.keys(zip.files)
      .filter((p) => /\.x?html?$/i.test(p))
      .sort();
    const parts: string[] = [];
    for (const path of htmlFiles) {
      const text = await zip.files[path].async('text');
      // Strip outer html/body wrappers so we can stitch chapters together.
      const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      let inner = bodyMatch ? bodyMatch[1] : text;
      // Rewrite img src to inlined data URI when we find a matching asset.
      inner = inner.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi, (full, prefix, q, ref) => {
        const cleaned = ref.replace(/^\.\.?\/+/, '').toLowerCase();
        const direct = imageDataUriByBasename.get(cleaned);
        if (direct) return `${prefix}${q}${direct}${q}`;
        const baseRef = cleaned.split('/').pop();
        const byBase = baseRef ? imageDataUriByBasename.get(baseRef) : undefined;
        return byBase ? `${prefix}${q}${byBase}${q}` : full;
      });
      parts.push(`<section>${inner}</section>`);
    }
    return parts.join('\n');
  }
  throw new Error(`Cannot build PDF from .${ext} source`);
}

export async function convertToPdf(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const { printToFileAsync } = await import('expo-print');

  const innerHtml = await sourceToHtml(job);
  const title = job.outputName.replace(/\.pdf$/i, '');
  const html = wrapHtml(innerHtml, title);

  const { uri } = await printToFileAsync({
    html,
    base64: false,
    // expo-print picks reasonable defaults (US Letter). The @page rule in our
    // stylesheet still applies via the WebView, giving consistent margins.
  });

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  const tmp = new File(uri);
  tmp.move(dest);

  const final = new File(dest.uri);
  return { uri: final.uri, size: final.size };
}
