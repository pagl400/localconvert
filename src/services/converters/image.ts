import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

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

export async function convertImage(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const format = FORMAT_BY_EXT[job.targetExt];
  if (!format) throw new Error(`Unsupported image target: ${job.targetExt}`);

  const result = await manipulateAsync(job.source.uri, [], {
    format,
    compress: COMPRESS_BY_QUALITY[job.quality],
  });

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  const tmp = new File(result.uri);
  tmp.move(dest);

  // Re-open after move to read the new size.
  const final = new File(dest.uri);
  return { uri: final.uri, size: final.size };
}

export function imageSupportedTargets(sourceExt: string): string[] {
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return Array.from(SUPPORTED_TARGETS).filter((t) => t !== sourceExt);
}
