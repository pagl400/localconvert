import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  convertVideo as nativeConvertVideo,
  extractAudio as nativeExtractAudio,
  transcodeVideo as nativeTranscodeVideo,
  videoToGif as nativeVideoToGif,
  videoInfo as nativeVideoInfo,
  type TranscodeOptions,
  type GifOptions,
  type VideoInfo,
} from '../../../modules/expo-media-convert/src';
import type { ConversionJob, VideoOptions } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set([
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v', '3gp',
]);
// AVAssetExportSession output options for the iOS-native pipeline.
const VIDEO_TARGETS = new Set(['mp4', 'mov', 'm4v']);
// MP4→GIF is exposed via AVAssetImageGenerator + ImageIO.
const GIF_TARGET = 'gif';
// Audio extraction targets the iOS encoders can write. MP3 is not in the iOS
// encoder set so it stays out — pick M4A for compressed audio extraction.
const AUDIO_FROM_VIDEO_TARGETS = new Set(['m4a', 'wav', 'aiff', 'caf']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  if (Platform.OS !== 'ios') return false;
  if (!SUPPORTED_SOURCES.has(sourceExt)) return false;
  return (
    VIDEO_TARGETS.has(targetExt) ||
    AUDIO_FROM_VIDEO_TARGETS.has(targetExt) ||
    targetExt === GIF_TARGET
  );
}

export function videoSupportedTargets(sourceExt: string): string[] {
  if (Platform.OS !== 'ios') return [];
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return [...VIDEO_TARGETS, ...AUDIO_FROM_VIDEO_TARGETS, GIF_TARGET].filter((t) => t !== sourceExt);
}

function hasNonDefaultOptions(v?: VideoOptions): boolean {
  if (!v) return false;
  return (
    v.width != null ||
    v.height != null ||
    v.videoBitrate != null ||
    v.qualityPreset != null ||
    v.codec != null ||
    v.fps != null ||
    v.audioMode != null ||
    v.audioBitrate != null ||
    (v.trimStartSec != null && v.trimStartSec > 0) ||
    v.trimEndSec != null
  );
}

function toTranscodeOptions(v: VideoOptions): TranscodeOptions {
  // Drop undefined fields so Swift sees a clean dict — its defaults kick in for
  // anything that isn't explicitly set.
  const out: TranscodeOptions = {};
  if (v.width != null) out.width = v.width;
  if (v.height != null) out.height = v.height;
  if (v.preserveAspectRatio != null) out.preserveAspectRatio = v.preserveAspectRatio;
  if (v.videoBitrate != null) out.videoBitrate = v.videoBitrate;
  if (v.qualityPreset != null) out.qualityPreset = v.qualityPreset;
  if (v.codec != null) out.codec = v.codec;
  if (v.fps != null) out.fps = v.fps;
  if (v.audioMode != null) out.audioMode = v.audioMode;
  if (v.audioBitrate != null) out.audioBitrate = v.audioBitrate;
  if (v.trimStartSec != null) out.trimStartSec = v.trimStartSec;
  if (v.trimEndSec != null) out.trimEndSec = v.trimEndSec;
  return out;
}

export async function convertVideo(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const dest = new File(outputPath);
  if (dest.exists) dest.delete();

  if (job.targetExt === GIF_TARGET) {
    const gif: GifOptions = job.gifOptions ?? {};
    return nativeVideoToGif(job.source.uri, outputPath, gif);
  }

  if (AUDIO_FROM_VIDEO_TARGETS.has(job.targetExt)) {
    return nativeExtractAudio(job.source.uri, outputPath, job.targetExt);
  }

  // Full transcode pipeline when the user touched any of the advanced options.
  // Otherwise the fast AVAssetExportSession path runs.
  if (hasNonDefaultOptions(job.videoOptions)) {
    return nativeTranscodeVideo(
      job.source.uri,
      outputPath,
      job.targetExt,
      toTranscodeOptions(job.videoOptions ?? {}),
    );
  }

  return nativeConvertVideo(job.source.uri, outputPath, job.targetExt, job.quality);
}

export function probeVideo(inputUri: string): Promise<VideoInfo> {
  return nativeVideoInfo(inputUri);
}
