export type FormatGroup =
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'ebook'
  | 'archive'
  | 'font'
  | 'data'
  | 'unknown';

export interface FormatInfo {
  ext: string;
  label: string;
  group: FormatGroup;
  mime: string;
  description?: string;
}

export interface SelectedFile {
  id: string;
  name: string;
  uri: string;
  size: number;
  mime: string | null;
  ext: string;
  format: FormatInfo;
  pickedAt: number;
}

export type Quality = 'fast' | 'high' | 'max';

// Variants distinguish multiple ways the same source→target conversion can be
// produced. Right now the only multi-variant edge is DOCX → HTML:
//   - 'plain'  : clean semantic HTML via mammoth (small, accessibility-friendly)
//   - 'styled' : full visual fidelity (colors, highlights, fonts, borders, …)
// Other converters ignore this field.
export type ConversionVariant =
  | 'plain'
  | 'styled'
  // PDF-only "tools" variants — drive the pdf-lib pipeline.
  | 'compress'
  | 'rotate90'
  | 'rotate180'
  | 'rotate270'
  | 'split'
  | 'delete'
  // Force the OCR path for PDF → TXT when the PDF has no usable text layer.
  | 'ocr';

export type VideoQualityPreset =
  | 'maximum'    // ~CRF 17
  | 'high'       // ~CRF 20
  | 'standard'   // ~CRF 23
  | 'compressed' // ~CRF 28
  | 'strong';    // ~CRF 32

export type VideoCodec = 'h264' | 'h265';
export type AudioMode = 'keep' | 'reencode' | 'remove';

export interface VideoOptions {
  width?: number;
  height?: number;
  preserveAspectRatio?: boolean;
  videoBitrate?: number; // kbps
  qualityPreset?: VideoQualityPreset;
  codec?: VideoCodec;
  fps?: number;
  audioMode?: AudioMode;
  audioBitrate?: number; // kbps when audioMode = 'reencode'
  trimStartSec?: number;
  trimEndSec?: number;
}

export interface GifOptions {
  width?: number;       // 240 / 360 / 480 / custom
  fps?: number;         // 10 / 15 / 24 / 30
  loop?: boolean;
  colors?: number;      // 128 / 256
  trimStartSec?: number;
  trimEndSec?: number;
}

export interface AudioOptions {
  bitrate?: number;     // kbps for AAC/M4A
  sampleRate?: number;  // 16000 / 22050 / 32000 / 44100 / 48000
  channels?: number;    // 1 (mono) or 2 (stereo)
  bitDepth?: number;    // 16 / 24 / 32 for WAV / AIFF / CAF
  trimStartSec?: number;
  trimEndSec?: number;
}

export interface ImageOptions {
  // 0..1; 1 = highest quality. Only applies to JPG/WebP/HEIC.
  quality?: number;
  // Resize: max bounds. If width and height both given we aspect-fit inside.
  maxWidth?: number;
  maxHeight?: number;
  // Rotation in degrees (typically 90/180/270). Applied before flip.
  rotate?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  // Optional centre crop to an aspect ratio (width / height).
  cropAspect?: { w: number; h: number };
}

export type PageFormat = 'a4' | 'letter' | 'a5' | 'a3';
export type PageOrientation = 'portrait' | 'landscape';

export interface ImageToPdfOptions {
  pageFormat?: PageFormat;
  orientation?: PageOrientation;
  marginMm?: number;        // 0 / 5 / 10 / 20
  imagesPerPage?: 1 | 2 | 4;
}

export interface DocxToPdfOptions {
  pageFormat?: PageFormat;
  orientation?: PageOrientation;
}

export interface PdfToolsOptions {
  // For split/delete: page-range expression, e.g. "1-5, 8, 12-20" (1-based).
  pages?: string;
}

export interface ConversionJob {
  id: string;
  source: SelectedFile;
  targetExt: string;
  quality: Quality;
  variant?: ConversionVariant;
  videoOptions?: VideoOptions;
  gifOptions?: GifOptions;
  audioOptions?: AudioOptions;
  imageOptions?: ImageOptions;
  imageToPdfOptions?: ImageToPdfOptions;
  docxToPdfOptions?: DocxToPdfOptions;
  pdfToolsOptions?: PdfToolsOptions;
  outputName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  error: string | null;
  outputUri: string | null;
  outputSize: number | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface HistoryEntry {
  id: string;
  sourceName: string;
  sourceExt: string;
  targetExt: string;
  sourceSize: number;
  outputSize: number | null;
  durationMs: number;
  finishedAt: number;
}
