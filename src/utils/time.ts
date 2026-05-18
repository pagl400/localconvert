// Time helpers used by the UI for trim inputs and live previews.

// Parse "12.5", "1:23", "1:23:45" into seconds. Returns NaN for invalid input.
export function parseTime(input: string): number {
  if (!input.trim()) return NaN;
  const parts = input.split(':').map((p) => p.trim());
  if (parts.length === 1) {
    const n = parseFloat(parts[0]);
    return isFinite(n) ? n : NaN;
  }
  if (parts.length === 2) {
    const [m, s] = parts.map(parseFloat);
    if (!isFinite(m) || !isFinite(s)) return NaN;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts.map(parseFloat);
    if (![h, m, s].every(isFinite)) return NaN;
    return h * 3600 + m * 60 + s;
  }
  return NaN;
}

// Format seconds as M:SS (no hours).
export function formatSeconds(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// Format a byte count as a short human string. "1.5 MB" etc. Returns "–" for
// zero or invalid input so UI can show a placeholder without an extra branch.
export function formatBytes(bytes: number): string {
  if (!bytes || !isFinite(bytes) || bytes < 1) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
