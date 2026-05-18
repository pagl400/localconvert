import { Platform } from 'react-native';
import { requireNativeModule, NativeModule as ExpoNativeModule } from 'expo';

// MP3 encoder backed by libmp3lame 3.100 (LGPL-2.1). Accepts any media URI
// that AVFoundation can read (mp4, mov, m4a, wav, caf, mkv, …) and produces a
// constant-bitrate MP3 at the requested settings.

export interface Mp3EncodeOptions {
  /** Output bitrate in kbps (e.g. 64 / 128 / 192 / 320). Defaults to 192. */
  bitrateKbps?: number;
  /** Output sample rate (16000 / 22050 / 32000 / 44100 / 48000). Defaults to 44100. */
  sampleRate?: number;
  /** 1 = mono, 2 = stereo (default). */
  channels?: number;
  /**
   * LAME quality, 0..9. 0 = slowest / best psychoacoustic model, 9 = fastest.
   * 2 (default) is the LAME-recommended sweet spot.
   */
  quality?: number;
  /** Optional trim in seconds. */
  trimStartSec?: number;
  trimEndSec?: number;
}

interface EncodeResult {
  uri: string;
  size: number;
}

interface ExpoLameModuleType extends ExpoNativeModule {
  encodeMp3(
    inputUri: string,
    outputUri: string,
    options: Mp3EncodeOptions,
  ): Promise<EncodeResult>;
}

const Native: ExpoLameModuleType | null =
  Platform.OS === 'ios' ? requireNativeModule('ExpoLame') : null;

function ensure(): ExpoLameModuleType {
  if (!Native) {
    throw new Error('MP3 encoding is only available on iOS in this build.');
  }
  return Native;
}

export function encodeMp3(
  inputUri: string,
  outputUri: string,
  options: Mp3EncodeOptions = {},
): Promise<EncodeResult> {
  return ensure().encodeMp3(inputUri, outputUri, options);
}
