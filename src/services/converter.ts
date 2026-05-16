import type { ConversionJob } from '../types/conversion';

/**
 * Stub converter that simulates work locally. The real engine will route to
 * FFmpeg / libvips / Ghostscript / Pandoc bindings — once those native modules
 * are wired in, replace `simulate` with the real pipeline. Everything stays on
 * device; this module must never make a network call.
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

export function runConversion(job: ConversionJob, cb: RunCallbacks): RunHandle {
  let cancelled = false;
  let progress = 0;
  const size = job.source.size;
  const estimateMs = Math.min(8000, Math.max(800, size / 1024));
  const step = (100 * TICK_MS) / estimateMs;

  const tick = () => {
    if (cancelled) return;
    progress = Math.min(100, progress + step);
    cb.onProgress(progress);
    if (progress >= 100) {
      const outputSize = Math.round(size * (0.4 + Math.random() * 0.6));
      const outputUri = `${job.source.uri}.${job.targetExt}`;
      cb.onDone(outputUri, outputSize);
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
