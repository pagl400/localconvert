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
export type ConversionVariant = 'plain' | 'styled';

export interface ConversionJob {
  id: string;
  source: SelectedFile;
  targetExt: string;
  quality: Quality;
  variant?: ConversionVariant;
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
