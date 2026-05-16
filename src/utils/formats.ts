import type { FormatGroup, FormatInfo } from '../types/conversion';

const FORMATS: FormatInfo[] = [
  // Images
  { ext: 'jpg', label: 'JPG', group: 'image', mime: 'image/jpeg', description: 'Standard photo format.' },
  { ext: 'jpeg', label: 'JPEG', group: 'image', mime: 'image/jpeg' },
  { ext: 'png', label: 'PNG', group: 'image', mime: 'image/png', description: 'Lossless, transparent background.' },
  { ext: 'webp', label: 'WebP', group: 'image', mime: 'image/webp', description: '~30% smaller than JPG at the same quality.' },
  { ext: 'heic', label: 'HEIC', group: 'image', mime: 'image/heic', description: 'Apple’s compressed photo format.' },
  { ext: 'heif', label: 'HEIF', group: 'image', mime: 'image/heif' },
  { ext: 'avif', label: 'AVIF', group: 'image', mime: 'image/avif' },
  { ext: 'gif', label: 'GIF', group: 'image', mime: 'image/gif' },
  { ext: 'tiff', label: 'TIFF', group: 'image', mime: 'image/tiff' },
  { ext: 'bmp', label: 'BMP', group: 'image', mime: 'image/bmp' },
  { ext: 'svg', label: 'SVG', group: 'image', mime: 'image/svg+xml' },
  { ext: 'ico', label: 'ICO', group: 'image', mime: 'image/x-icon' },

  // Audio
  { ext: 'mp3', label: 'MP3', group: 'audio', mime: 'audio/mpeg' },
  { ext: 'wav', label: 'WAV', group: 'audio', mime: 'audio/wav', description: 'Uncompressed, large files.' },
  { ext: 'flac', label: 'FLAC', group: 'audio', mime: 'audio/flac', description: 'Lossless compression.' },
  { ext: 'aac', label: 'AAC', group: 'audio', mime: 'audio/aac' },
  { ext: 'ogg', label: 'OGG', group: 'audio', mime: 'audio/ogg' },
  { ext: 'm4a', label: 'M4A', group: 'audio', mime: 'audio/mp4' },
  { ext: 'opus', label: 'Opus', group: 'audio', mime: 'audio/opus' },
  { ext: 'aiff', label: 'AIFF', group: 'audio', mime: 'audio/aiff' },

  // Video
  { ext: 'mp4', label: 'MP4', group: 'video', mime: 'video/mp4', description: 'Best compatibility everywhere.' },
  { ext: 'mov', label: 'MOV', group: 'video', mime: 'video/quicktime' },
  { ext: 'mkv', label: 'MKV', group: 'video', mime: 'video/x-matroska' },
  { ext: 'avi', label: 'AVI', group: 'video', mime: 'video/x-msvideo' },
  { ext: 'webm', label: 'WebM', group: 'video', mime: 'video/webm' },

  // Documents
  { ext: 'pdf', label: 'PDF', group: 'document', mime: 'application/pdf' },
  { ext: 'docx', label: 'DOCX', group: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { ext: 'odt', label: 'ODT', group: 'document', mime: 'application/vnd.oasis.opendocument.text' },
  { ext: 'rtf', label: 'RTF', group: 'document', mime: 'application/rtf' },
  { ext: 'txt', label: 'TXT', group: 'document', mime: 'text/plain' },
  { ext: 'md', label: 'Markdown', group: 'document', mime: 'text/markdown' },
  { ext: 'html', label: 'HTML', group: 'document', mime: 'text/html' },

  // E-Books
  { ext: 'epub', label: 'EPUB', group: 'ebook', mime: 'application/epub+zip' },
  { ext: 'mobi', label: 'MOBI', group: 'ebook', mime: 'application/x-mobipocket-ebook' },

  // Data
  { ext: 'csv', label: 'CSV', group: 'data', mime: 'text/csv' },
  { ext: 'json', label: 'JSON', group: 'data', mime: 'application/json' },
  { ext: 'xml', label: 'XML', group: 'data', mime: 'application/xml' },
  { ext: 'xlsx', label: 'XLSX', group: 'data', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },

  // Archive
  { ext: 'zip', label: 'ZIP', group: 'archive', mime: 'application/zip' },
  { ext: '7z', label: '7Z', group: 'archive', mime: 'application/x-7z-compressed' },
  { ext: 'tar', label: 'TAR', group: 'archive', mime: 'application/x-tar' },

  // Fonts
  { ext: 'ttf', label: 'TTF', group: 'font', mime: 'font/ttf' },
  { ext: 'otf', label: 'OTF', group: 'font', mime: 'font/otf' },
  { ext: 'woff', label: 'WOFF', group: 'font', mime: 'font/woff' },
  { ext: 'woff2', label: 'WOFF2', group: 'font', mime: 'font/woff2' },
];

const BY_EXT = new Map(FORMATS.map((f) => [f.ext, f]));

export const UNKNOWN: FormatInfo = {
  ext: '',
  label: 'Unknown',
  group: 'unknown',
  mime: 'application/octet-stream',
};

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function detectFormat(filename: string, mime?: string | null): FormatInfo {
  const ext = getExtension(filename);
  if (ext && BY_EXT.has(ext)) return BY_EXT.get(ext)!;
  if (mime) {
    const match = FORMATS.find((f) => f.mime === mime);
    if (match) return match;
  }
  return { ...UNKNOWN, ext };
}

export function getFormatsByGroup(group: FormatGroup): FormatInfo[] {
  return FORMATS.filter((f) => f.group === group);
}

export function targetFormatsFor(source: FormatInfo): FormatInfo[] {
  if (source.group === 'unknown') return [];
  return FORMATS.filter((f) => f.group === source.group && f.ext !== source.ext);
}

export function popularTargets(source: FormatInfo): FormatInfo[] {
  const targets = targetFormatsFor(source);
  return targets.slice(0, 4);
}

export function findFormat(ext: string): FormatInfo | null {
  return BY_EXT.get(ext.toLowerCase()) ?? null;
}

export const GROUP_LABEL: Record<FormatGroup, string> = {
  image: 'Images',
  audio: 'Audio',
  video: 'Video',
  document: 'Documents',
  ebook: 'E-Books',
  archive: 'Archives',
  font: 'Fonts',
  data: 'Data',
  unknown: 'Other',
};

export function allGroups(): FormatGroup[] {
  return ['image', 'audio', 'video', 'document', 'ebook', 'data', 'archive', 'font'];
}
