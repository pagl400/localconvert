// Pure helpers for the PDF-tools pipeline. Kept free of expo-file-system and
// pdf-lib imports so unit tests can exercise them under plain Node.

export type PdfToolVariant = 'compress' | 'rotate90' | 'rotate180' | 'rotate270' | 'split' | 'delete';

const VARIANTS: ReadonlySet<string> = new Set([
  'compress', 'rotate90', 'rotate180', 'rotate270', 'split', 'delete',
]);

export function canHandle(sourceExt: string, targetExt: string, variant?: string): boolean {
  if (sourceExt !== 'pdf' || targetExt !== 'pdf') return false;
  return variant != null && VARIANTS.has(variant);
}

// Parse "1-5, 8, 12-20" → [1,2,3,4,5,8,12,...]. Returns sorted unique 1-based
// indices clamped to [1, total]. Reversed ranges ("5-3") are normalised.
export function parsePageRanges(input: string, total: number): number[] {
  const result = new Set<number>();
  for (const raw of input.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = parseInt(range[1], 10);
      const to = parseInt(range[2], 10);
      if (isNaN(from) || isNaN(to)) continue;
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        if (i >= 1 && i <= total) result.add(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n) && n >= 1 && n <= total) result.add(n);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}
