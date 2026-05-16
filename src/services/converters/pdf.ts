import { File } from 'expo-file-system';

import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_TARGETS = new Set(['txt', 'md', 'html', 'json']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return sourceExt === 'pdf' && SUPPORTED_TARGETS.has(targetExt);
}

export function pdfSupportedTargets(sourceExt: string): string[] {
  return sourceExt === 'pdf' ? Array.from(SUPPORTED_TARGETS) : [];
}

function installPolyfills(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor(init?: number[]) {
        if (Array.isArray(init) && init.length === 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }
      translateSelf(tx: number, ty = 0) {
        this.e = this.a * tx + this.c * ty + this.e;
        this.f = this.b * tx + this.d * ty + this.f;
        return this;
      }
      scaleSelf(sx: number, sy = sx) {
        this.a *= sx;
        this.b *= sx;
        this.c *= sy;
        this.d *= sy;
        return this;
      }
    };
  }
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = class {};
  }
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = class {};
  }
  if (typeof (Promise as { withResolvers?: unknown }).withResolvers === 'undefined') {
    (Promise as unknown as { withResolvers: () => unknown }).withResolvers = function () {
      let resolve: (v?: unknown) => void = () => {};
      let reject: (e?: unknown) => void = () => {};
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
  g.navigator ??= {} as Record<string, unknown>;
  const nav = g.navigator as Record<string, unknown>;
  nav.platform ??= '';
  nav.userAgent ??= '';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tidyText(input: string): string {
  return input
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pagesToHtml(pages: string[], title: string): string {
  const body = pages
    .map((page, i) => {
      const paragraphs = page
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `      <p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
        .join('\n');
      return `    <section data-page="${i + 1}">\n${paragraphs}\n    </section>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
${body}
  </body>
</html>
`;
}

interface TextItem {
  str?: string;
}

export async function convertPdf(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  installPolyfills();

  // pdfjs-dist is large; load only when actually converting a PDF.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Disable worker — we run pdfjs entirely on the JS thread.
  (pdfjsLib.GlobalWorkerOptions as { workerSrc: string }).workerSrc = '';

  const source = new File(job.source.uri);
  const bytes = await source.bytes();

  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
    useSystemFonts: false,
    disableFontFace: true,
    // Casting because the legacy bundle exposes a few extra flags not in the typings.
    ...({ isEvalSupported: false } as object),
  });
  const doc = await loadingTask.promise;
  const pageCount = doc.numPages;
  const pages: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as TextItem[];
    pages.push(
      tidyText(
        items
          .map((it) => it.str ?? '')
          .filter(Boolean)
          .join(' '),
      ),
    );
    page.cleanup();
  }

  let metaTitle = job.outputName;
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as { Title?: unknown } | undefined;
    if (info && typeof info.Title === 'string' && info.Title.trim()) {
      metaTitle = info.Title.trim();
    }
  } catch {
    /* ignore */
  }
  await doc.cleanup();
  await doc.destroy();

  let output: string;
  if (job.targetExt === 'txt') {
    output = `${pages.join('\n\n').trim()}\n`;
  } else if (job.targetExt === 'md') {
    const { default: TurndownService } = await import('turndown');
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    output = `${turndown.turndown(pagesToHtml(pages, '')).trim()}\n`;
  } else if (job.targetExt === 'html') {
    output = pagesToHtml(pages, metaTitle);
  } else if (job.targetExt === 'json') {
    output = `${JSON.stringify(
      {
        title: metaTitle,
        pageCount,
        pages: pages.map((t, i) => ({ page: i + 1, text: t })),
      },
      null,
      2,
    )}\n`;
  } else {
    throw new Error(`Unsupported PDF target: ${job.targetExt}`);
  }

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(output);
  return { uri: dest.uri, size: dest.size };
}
