import { File } from 'expo-file-system';
import {
  ImageManipulator,
  SaveFormat,
  FlipType,
  type SaveOptions,
} from 'expo-image-manipulator';

import type { ConversionJob, Quality } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const SUPPORTED_TARGETS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const COMPRESS_BY_QUALITY: Record<Quality, number> = {
  fast: 0.6,
  high: 0.85,
  max: 1.0,
};

const FORMAT_BY_EXT: Record<string, SaveFormat> = {
  jpg: SaveFormat.JPEG,
  jpeg: SaveFormat.JPEG,
  png: SaveFormat.PNG,
  webp: SaveFormat.WEBP,
};

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return SUPPORTED_SOURCES.has(sourceExt) && SUPPORTED_TARGETS.has(targetExt);
}

function clampQuality(q: number | undefined, fallback: number): number {
  if (q == null || !isFinite(q)) return fallback;
  return Math.min(1, Math.max(0, q));
}

export async function convertImage(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const format = FORMAT_BY_EXT[job.targetExt];
  if (!format) throw new Error(`Unsupported image target: ${job.targetExt}`);

  const opts = job.imageOptions ?? {};
  const compress = clampQuality(opts.quality, COMPRESS_BY_QUALITY[job.quality]);

  // Build an ordered action list. expo-image-manipulator applies them in
  // sequence; we crop first (smaller pixels for downstream work), then resize,
  // then rotate, then flip.
  const ctx = ImageManipulator.manipulate(job.source.uri);

  // 1) Centre-crop to aspect ratio (so 16:9, 4:3, 1:1 etc. work without needing
  //    the user to draw a rectangle).
  if (opts.cropAspect) {
    // We need the source dimensions to compute the rect — render a snapshot,
    // read dims, then start over with cropped context.
    const snap = await ctx.renderAsync();
    const srcW = snap.width;
    const srcH = snap.height;
    const targetAspect = opts.cropAspect.w / opts.cropAspect.h;
    const sourceAspect = srcW / srcH;
    let cropW = srcW;
    let cropH = srcH;
    if (sourceAspect > targetAspect) {
      cropW = Math.round(srcH * targetAspect);
    } else {
      cropH = Math.round(srcW / targetAspect);
    }
    const originX = Math.round((srcW - cropW) / 2);
    const originY = Math.round((srcH - cropH) / 2);
    ctx.crop({ originX, originY, width: cropW, height: cropH });
  }

  // 2) Resize to fit inside (maxWidth × maxHeight). Single-dimension scales
  //    preserving aspect.
  if (opts.maxWidth != null || opts.maxHeight != null) {
    if (opts.maxWidth != null && opts.maxHeight != null) {
      const snap = await ctx.renderAsync();
      const scale = Math.min(opts.maxWidth / snap.width, opts.maxHeight / snap.height);
      if (scale < 1) {
        ctx.resize({
          width: Math.round(snap.width * scale),
          height: Math.round(snap.height * scale),
        });
      }
    } else if (opts.maxWidth != null) {
      ctx.resize({ width: opts.maxWidth });
    } else if (opts.maxHeight != null) {
      ctx.resize({ height: opts.maxHeight });
    }
  }

  // 3) Rotate.
  if (opts.rotate && opts.rotate % 360 !== 0) {
    ctx.rotate(opts.rotate);
  }

  // 4) Flip.
  if (opts.flipHorizontal) ctx.flip(FlipType.Horizontal);
  if (opts.flipVertical) ctx.flip(FlipType.Vertical);

  const saveOpts: SaveOptions = { format, compress };
  const final = await ctx.renderAsync();
  const saved = await final.saveAsync(saveOpts);

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  const tmp = new File(saved.uri);
  tmp.move(dest);
  const out = new File(dest.uri);
  return { uri: out.uri, size: out.size };
}

export function imageSupportedTargets(sourceExt: string): string[] {
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return Array.from(SUPPORTED_TARGETS).filter((t) => t !== sourceExt);
}

