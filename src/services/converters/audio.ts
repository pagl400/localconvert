import { File } from 'expo-file-system';

import type { ConversionJob, Quality } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'aiff', 'wma']);
const SUPPORTED_TARGETS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'aiff']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return SUPPORTED_SOURCES.has(sourceExt) && SUPPORTED_TARGETS.has(targetExt);
}

export function audioSupportedTargets(sourceExt: string): string[] {
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return Array.from(SUPPORTED_TARGETS).filter((t) => t !== sourceExt);
}

// Quality maps roughly to bitrate / FFmpeg quality level.
function audioArgs(targetExt: string, quality: Quality, inputPath: string, outputPath: string): string[] {
  const base = ['-y', '-i', inputPath];
  switch (targetExt) {
    case 'mp3': {
      const q = quality === 'max' ? '0' : quality === 'high' ? '2' : '5';
      return [...base, '-codec:a', 'libmp3lame', '-qscale:a', q, outputPath];
    }
    case 'wav':
      return [...base, '-codec:a', 'pcm_s16le', outputPath];
    case 'flac':
      return [...base, '-codec:a', 'flac', outputPath];
    case 'aac':
    case 'm4a': {
      const br = quality === 'max' ? '256k' : quality === 'high' ? '192k' : '128k';
      return [...base, '-codec:a', 'aac', '-b:a', br, outputPath];
    }
    case 'ogg': {
      const q = quality === 'max' ? '8' : quality === 'high' ? '6' : '4';
      return [...base, '-codec:a', 'libvorbis', '-qscale:a', q, outputPath];
    }
    case 'opus': {
      const br = quality === 'max' ? '192k' : quality === 'high' ? '128k' : '96k';
      return [...base, '-codec:a', 'libopus', '-b:a', br, outputPath];
    }
    case 'aiff':
      return [...base, '-codec:a', 'pcm_s16be', outputPath];
    default:
      throw new Error(`Unsupported audio target: ${targetExt}`);
  }
}

function stripFileScheme(uri: string): string {
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
}

export async function convertAudio(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const { FFmpegKit, ReturnCode } = await import('ffmpeg-kit-react-native');

  const inputPath = stripFileScheme(job.source.uri);
  const outPath = stripFileScheme(outputPath);

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();

  const args = audioArgs(job.targetExt, job.quality, inputPath, outPath);
  const session = await FFmpegKit.executeWithArguments(args);
  const returnCode = await session.getReturnCode();

  if (!ReturnCode.isSuccess(returnCode)) {
    const logs = await session.getOutput();
    throw new Error(`FFmpeg failed: ${logs?.split('\n').slice(-3).join(' ').trim() || 'unknown error'}`);
  }

  const final = new File(outputPath);
  return { uri: final.uri, size: final.size };
}
