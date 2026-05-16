import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  convertVideo as nativeConvertVideo,
  extractAudio as nativeExtractAudio,
} from '../../../modules/expo-media-convert/src';
import type { ConversionJob } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set([
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v', '3gp',
]);
// AVAssetExportSession output options. Audio extraction also supported, but
// only into formats that the audio path supports.
const VIDEO_TARGETS = new Set(['mp4', 'mov', 'm4v']);
const AUDIO_FROM_VIDEO_TARGETS = new Set(['m4a', 'aac', 'wav', 'aiff', 'caf']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  if (Platform.OS !== 'ios') return false;
  if (!SUPPORTED_SOURCES.has(sourceExt)) return false;
  return VIDEO_TARGETS.has(targetExt) || AUDIO_FROM_VIDEO_TARGETS.has(targetExt);
}

export function videoSupportedTargets(sourceExt: string): string[] {
  if (Platform.OS !== 'ios') return [];
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return [...VIDEO_TARGETS, ...AUDIO_FROM_VIDEO_TARGETS].filter((t) => t !== sourceExt);
}

export async function convertVideo(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const dest = new File(outputPath);
  if (dest.exists) dest.delete();
  if (AUDIO_FROM_VIDEO_TARGETS.has(job.targetExt)) {
    return nativeExtractAudio(job.source.uri, outputPath, job.targetExt);
  }
  return nativeConvertVideo(job.source.uri, outputPath, job.targetExt, job.quality);
}
