import { Directory, File, Paths } from 'expo-file-system';

import type { ConversionJob } from '../types/conversion';

/**
 * Stub converter that simulates work locally. The real engine will route to
 * FFmpeg / libvips / Ghostscript / Pandoc bindings — once those native modules
 * are wired in, replace the body with the real pipeline. Everything stays on
 * device; this module must never make a network call.
 *
 * What the stub *does* do for real: copy the source into the app cache so
 * the result screen has an actual file to share. The content isn't converted
 * yet — only the filename gets the new extension.
 */
export interface RunHandle {
  cancel: () => void;
}

export interface RunCallbacks {
  onProgress: (pct: number) => void;
  onDone: (outputUri: string, outputSize: number) => void;
  onError: (err: string) => void;
}

const TICK_MS = 120;
const OUTPUT_DIR = 'output';

function ensureOutputDir(): Directory {
  const dir = new Directory(Paths.cache, OUTPUT_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function writeOutput(job: ConversionJob): { uri: string; size: number } {
  const dir = ensureOutputDir();
  const dest = new File(dir, job.outputName);
  if (dest.exists) dest.delete();
  const source = new File(job.source.uri);
  source.copy(dest);
  return { uri: dest.uri, size: dest.size };
}

export function runConversion(job: ConversionJob, cb: RunCallbacks): RunHandle {
  let cancelled = false;
  let progress = 0;
  const size = job.source.size || 1024;
  const estimateMs = Math.min(6000, Math.max(800, size / 1024));
  const step = (100 * TICK_MS) / estimateMs;

  const tick = () => {
    if (cancelled) return;
    progress = Math.min(100, progress + step);
    cb.onProgress(progress);
    if (progress >= 100) {
      try {
        const out = writeOutput(job);
        cb.onDone(out.uri, out.size);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to write output file.';
        cb.onError(message);
      }
      return;
    }
    setTimeout(tick, TICK_MS);
  };

  setTimeout(tick, TICK_MS);

  return {
    cancel: () => {
      cancelled = true;
      cb.onError('Cancelled');
    },
  };
}
