// Maps a (source, target, variant) triple to the kind of conversion job, which
// determines which option panels appear in the UI and which converter is
// invoked. Kept pure and side-effect-free so unit tests can exercise every
// branch without dragging in the file-system or native bridge.

export type Kind =
  | 'video'
  | 'gif'
  | 'audio-extract' // video → audio
  | 'audio'         // audio → audio
  | 'image'         // image → image
  | 'image-to-pdf'  // image → pdf
  | 'docx-to-pdf'   // docx → pdf
  | 'pdf-tool'      // pdf → pdf operation
  | 'other';

export const VIDEO_TARGETS = new Set(['mp4', 'mov', 'm4v']);
export const GIF_TARGET = 'gif';
// Audio formats producible from a video source. mp3 is here because expo-lame
// can decode the video's audio track via AVFoundation and re-encode as MP3.
export const AUDIO_FROM_VIDEO_TARGETS = new Set(['m4a', 'mp3', 'wav', 'aiff', 'caf']);
export const VIDEO_SOURCES = new Set([
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v', '3gp',
]);
export const AUDIO_SOURCES = new Set([
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'aiff', 'aif',
]);
export const IMAGE_SOURCES = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
export const IMAGE_TARGETS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function kindFor(sourceExt: string, targetExt: string, variant?: string): Kind {
  if (sourceExt === 'pdf' && targetExt === 'pdf') return 'pdf-tool';
  if (VIDEO_SOURCES.has(sourceExt)) {
    if (VIDEO_TARGETS.has(targetExt)) return 'video';
    if (targetExt === GIF_TARGET) return 'gif';
    // MP3 needs the full audio panel (bitrate / sample rate / channels / trim)
    // because LAME exposes all of those; the simple Quality buttons aren't
    // enough. Other audio extractions stay on the lightweight audio-extract
    // kind since AVFoundation just transcodes to the target container.
    if (targetExt === 'mp3') return 'audio';
    if (AUDIO_FROM_VIDEO_TARGETS.has(targetExt)) return 'audio-extract';
  }
  if (AUDIO_SOURCES.has(sourceExt) && AUDIO_FROM_VIDEO_TARGETS.has(targetExt)) return 'audio';
  if (IMAGE_SOURCES.has(sourceExt) && IMAGE_TARGETS.has(targetExt)) return 'image';
  if (IMAGE_SOURCES.has(sourceExt) && targetExt === 'pdf') return 'image-to-pdf';
  if (sourceExt === 'docx' && targetExt === 'pdf') return 'docx-to-pdf';
  if (variant === 'ocr') return 'other';
  return 'other';
}
