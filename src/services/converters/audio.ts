import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { convertAudio as nativeConvertAudio } from '../../../modules/expo-media-convert/src';
import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'aiff', 'aif']);
// AVFoundation on iOS can write these. MP3/FLAC/OGG/OPUS encoding is not in
// iOS' built-in encoder set, so we deliberately don't advertise them.
// Note: raw ADTS (.aac) isn't an AVFileType — AAC ships inside .m4a here.
const SUPPORTED_TARGETS = new Set(['m4a', 'wav', 'aiff', 'caf']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  if (Platform.OS !== 'ios') return false;
  return SUPPORTED_SOURCES.has(sourceExt) && SUPPORTED_TARGETS.has(targetExt);
}

export function audioSupportedTargets(sourceExt: string): string[] {
  if (Platform.OS !== 'ios') return [];
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return Array.from(SUPPORTED_TARGETS).filter((t) => t !== sourceExt);
}

export async function convertAudio(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  const result = await nativeConvertAudio(
    job.source.uri,
    outputPath,
    job.targetExt,
    job.quality,
  );
  return result;
}
