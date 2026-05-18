import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  convertAudio as nativeConvertAudio,
  convertAudioWithBitrate as nativeConvertAudioWithBitrate,
  transcodeAudio as nativeTranscodeAudio,
  audioInfo as nativeAudioInfo,
  type AudioInfo,
  type AudioTranscodeOptions,
} from '../../../modules/expo-media-convert/src';
import { encodeMp3 as nativeEncodeMp3 } from '../../../modules/expo-lame/src';
import type { AudioOptions, ConversionJob } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'aiff', 'aif']);
// AVFoundation on iOS can write m4a/wav/aiff/caf natively; mp3 is encoded via
// our own libmp3lame xcframework (expo-lame). FLAC/OGG/OPUS encoding are not
// in iOS' built-in encoder set and aren't worth a separate native lib yet.
// Note: raw ADTS (.aac) isn't an AVFileType — AAC ships inside .m4a here.
const SUPPORTED_TARGETS = new Set(['mp3', 'm4a', 'wav', 'aiff', 'caf']);
// Targets where bitrate (lossy compression) actually applies.
const COMPRESSED_TARGETS = new Set(['m4a', 'mp3']);
const PCM_TARGETS = new Set(['wav', 'aiff', 'caf']);
const MP3_TARGET = 'mp3';

export function canHandle(sourceExt: string, targetExt: string): boolean {
  if (Platform.OS !== 'ios') return false;
  return SUPPORTED_SOURCES.has(sourceExt) && SUPPORTED_TARGETS.has(targetExt);
}

export function audioSupportedTargets(sourceExt: string): string[] {
  if (Platform.OS !== 'ios') return [];
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return Array.from(SUPPORTED_TARGETS).filter((t) => t !== sourceExt);
}

export function audioBitrateApplies(targetExt: string): boolean {
  return COMPRESSED_TARGETS.has(targetExt);
}

export function audioBitDepthApplies(targetExt: string): boolean {
  return PCM_TARGETS.has(targetExt);
}

function hasAdvancedAudioOptions(opts?: AudioOptions): boolean {
  if (!opts) return false;
  return (
    opts.sampleRate != null ||
    opts.channels != null ||
    opts.bitDepth != null ||
    (opts.trimStartSec != null && opts.trimStartSec > 0) ||
    opts.trimEndSec != null
  );
}

function toTranscodeOptions(opts: AudioOptions, targetExt: string): AudioTranscodeOptions {
  const out: AudioTranscodeOptions = {};
  if (audioBitrateApplies(targetExt) && opts.bitrate != null) out.bitrateKbps = opts.bitrate;
  if (opts.sampleRate != null) out.sampleRate = opts.sampleRate;
  if (opts.channels != null) out.channels = opts.channels;
  if (audioBitDepthApplies(targetExt) && opts.bitDepth != null) out.bitDepth = opts.bitDepth;
  if (opts.trimStartSec != null) out.trimStartSec = opts.trimStartSec;
  if (opts.trimEndSec != null) out.trimEndSec = opts.trimEndSec;
  return out;
}

export async function convertAudio(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const dest = new File(outputPath);
  if (dest.exists) dest.delete();

  const opts = job.audioOptions;

  // MP3 goes through expo-lame (libmp3lame 3.100). AVFoundation can't write
  // MP3 natively, so we always route it here regardless of which options the
  // user set. expo-lame handles trim/sample-rate/channels/bitrate itself.
  if (job.targetExt === MP3_TARGET) {
    return nativeEncodeMp3(job.source.uri, outputPath, {
      bitrateKbps: opts?.bitrate ?? 192,
      sampleRate: opts?.sampleRate,
      channels: opts?.channels,
      quality: opts?.mp3EncoderQuality,
      trimStartSec: opts?.trimStartSec,
      trimEndSec: opts?.trimEndSec,
    });
  }

  // Full transcode path when sample-rate / channels / bit-depth / trim are set.
  if (hasAdvancedAudioOptions(opts)) {
    return nativeTranscodeAudio(
      job.source.uri,
      outputPath,
      job.targetExt,
      toTranscodeOptions(opts!, job.targetExt),
    );
  }

  // Bitrate-only path (legacy).
  const bitrate = opts?.bitrate;
  if (bitrate && audioBitrateApplies(job.targetExt)) {
    return nativeConvertAudioWithBitrate(job.source.uri, outputPath, job.targetExt, bitrate);
  }
  return nativeConvertAudio(job.source.uri, outputPath, job.targetExt, job.quality);
}

export function probeAudio(inputUri: string): Promise<AudioInfo> {
  return nativeAudioInfo(inputUri);
}
