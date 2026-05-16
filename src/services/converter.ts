import type { ConversionJob } from '../types/conversion';

import { runConvert } from './converters';

/**
 * Conversion runner. Drives a small synthetic progress curve so the UI feels
 * alive, then performs the real conversion on the last tick. The actual work
 * lives in `./converters/*` — image conversions use expo-image-manipulator,
 * text/data conversions are pure JS. Anything outside those buckets throws a
 * clear error instead of writing a misleading copy.
 *
 * Nothing in this module makes a network call. All work is on-device.
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
const CONVERT_AT = 90;

export function runConversion(job: ConversionJob, cb: RunCallbacks): RunHandle {
  let cancelled = false;
  let progress = 0;
  let converting = false;
  const step = (100 * TICK_MS) / Math.min(4000, Math.max(800, job.source.size / 2048));

  const finish = async () => {
    converting = true;
    try {
      const out = await runConvert(job);
      if (cancelled) return;
      cb.onProgress(100);
      cb.onDone(out.uri, out.size);
    } catch (err) {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : 'Conversion failed.';
      cb.onError(message);
    }
  };

  const tick = () => {
    if (cancelled || converting) return;
    progress = Math.min(CONVERT_AT, progress + step);
    cb.onProgress(progress);
    if (progress >= CONVERT_AT) {
      void finish();
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
