import { Platform } from 'react-native';
import { requireNativeModule, NativeModule as ExpoNativeModule } from 'expo';

export type MediaQuality = 'fast' | 'high' | 'max';

interface ConvertResult {
  uri: string;
  size: number;
}

interface ExpoMediaConvertModuleType extends ExpoNativeModule {
  convertAudio(inputUri: string, outputUri: string, format: string, quality: MediaQuality): Promise<ConvertResult>;
  convertVideo(inputUri: string, outputUri: string, format: string, quality: MediaQuality): Promise<ConvertResult>;
  extractAudio(inputUri: string, outputUri: string, format: string): Promise<ConvertResult>;
}

const Native: ExpoMediaConvertModuleType | null =
  Platform.OS === 'ios' ? requireNativeModule('ExpoMediaConvert') : null;

function ensure(): ExpoMediaConvertModuleType {
  if (!Native) {
    throw new Error('Audio/video conversion is only available on iOS in this build.');
  }
  return Native;
}

export function convertAudio(
  inputUri: string,
  outputUri: string,
  format: string,
  quality: MediaQuality,
): Promise<ConvertResult> {
  return ensure().convertAudio(inputUri, outputUri, format, quality);
}

export function convertVideo(
  inputUri: string,
  outputUri: string,
  format: string,
  quality: MediaQuality,
): Promise<ConvertResult> {
  return ensure().convertVideo(inputUri, outputUri, format, quality);
}

export function extractAudio(
  inputUri: string,
  outputUri: string,
  format: string,
): Promise<ConvertResult> {
  return ensure().extractAudio(inputUri, outputUri, format);
}
