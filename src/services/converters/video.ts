import { File } from 'expo-file-system';

import type { ConversionJob, Quality } from '../../types/conversion';

const SUPPORTED_SOURCES = new Set([
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v', '3gp', 'ts', 'mts',
]);
const SUPPORTED_TARGETS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'gif', 'mp3', 'wav', 'aac', 'm4a']);

export function canHandle(sourceExt: string, targetExt: string): boolean {
  return SUPPORTED_SOURCES.has(sourceExt) && SUPPORTED_TARGETS.has(targetExt);
}

export function videoSupportedTargets(sourceExt: string): string[] {
  if (!SUPPORTED_SOURCES.has(sourceExt)) return [];
  return Array.from(SUPPORTED_TARGETS).filter((t) => t !== sourceExt);
}

function videoQualityCrf(quality: Quality): string {
  // Lower CRF = higher quality (and bigger file). 23 is FFmpeg's default.
  return quality === 'max' ? '18' : quality === 'high' ? '23' : '28';
}

function videoArgs(targetExt: string, quality: Quality, inputPath: string, outputPath: string): string[] {
  const base = ['-y', '-i', inputPath];
  switch (targetExt) {
    case 'mp4':
      return [
        ...base,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', videoQualityCrf(quality),
        '-c:a', 'aac', '-b:a', '160k',
        '-movflags', '+faststart',
        outputPath,
      ];
    case 'mov':
      return [
        ...base,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', videoQualityCrf(quality),
        '-c:a', 'aac', '-b:a', '160k',
        outputPath,
      ];
    case 'mkv':
      return [
        ...base,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', videoQualityCrf(quality),
        '-c:a', 'aac', '-b:a', '160k',
        outputPath,
      ];
    case 'avi':
      return [...base, '-c:v', 'libx264', '-c:a', 'mp3', outputPath];
    case 'webm':
      return [
        ...base,
        '-c:v', 'libvpx-vp9', '-crf', videoQualityCrf(quality), '-b:v', '0',
        '-c:a', 'libopus',
        outputPath,
      ];
    case 'gif':
      return [
        ...base,
        '-vf', 'fps=12,scale=480:-1:flags=lanczos',
        '-loop', '0',
        outputPath,
      ];
    // Extract audio:
    case 'mp3':
      return [...base, '-vn', '-codec:a', 'libmp3lame', '-qscale:a', '2', outputPath];
    case 'wav':
      return [...base, '-vn', '-codec:a', 'pcm_s16le', outputPath];
    case 'aac':
    case 'm4a':
      return [...base, '-vn', '-codec:a', 'aac', '-b:a', '192k', outputPath];
    default:
      throw new Error(`Unsupported video target: ${targetExt}`);
  }
}

function stripFileScheme(uri: string): string {
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
}

export async function convertVideo(
  job: ConversionJob,
  outputPath: string,
): Promise<{ uri: string; size: number }> {
  const { FFmpegKit, ReturnCode } = await import('ffmpeg-kit-react-native');

  const inputPath = stripFileScheme(job.source.uri);
  const outPath = stripFileScheme(outputPath);

  const dest = new File(outputPath);
  if (dest.exists) dest.delete();

  const args = videoArgs(job.targetExt, job.quality, inputPath, outPath);
  const session = await FFmpegKit.executeWithArguments(args);
  const returnCode = await session.getReturnCode();

  if (!ReturnCode.isSuccess(returnCode)) {
    const logs = await session.getOutput();
    throw new Error(`FFmpeg failed: ${logs?.split('\n').slice(-3).join(' ').trim() || 'unknown error'}`);
  }

  const final = new File(outputPath);
  return { uri: final.uri, size: final.size };
}
