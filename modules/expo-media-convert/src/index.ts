import { Platform } from 'react-native';
import { requireNativeModule, NativeModule as ExpoNativeModule } from 'expo';

export type MediaQuality = 'fast' | 'high' | 'max';

export type VideoQualityPreset =
  | 'maximum'    // ~CRF 17
  | 'high'       // ~CRF 20
  | 'standard'   // ~CRF 23
  | 'compressed' // ~CRF 28
  | 'strong';    // ~CRF 32

export type VideoCodec = 'h264' | 'h265';

export type AudioMode = 'keep' | 'reencode' | 'remove';

export interface TranscodeOptions {
  width?: number;
  height?: number;
  preserveAspectRatio?: boolean;
  videoBitrate?: number; // kbps; if set, overrides qualityPreset
  qualityPreset?: VideoQualityPreset;
  codec?: VideoCodec;
  fps?: number;
  audioMode?: AudioMode;
  audioBitrate?: number; // kbps; only used when audioMode = 'reencode'
  trimStartSec?: number;
  trimEndSec?: number;
}

export interface GifOptions {
  width?: number;       // px
  fps?: number;         // 10/15/24/30
  loop?: boolean;
  colors?: number;      // 128/256
  trimStartSec?: number;
  trimEndSec?: number;
}

export interface VideoInfo {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoBitrateKbps: number;
}

export interface AudioTranscodeOptions {
  bitrateKbps?: number;   // for AAC/M4A
  sampleRate?: number;    // 16000 / 22050 / 32000 / 44100 / 48000
  channels?: number;      // 1 (mono) or 2 (stereo)
  bitDepth?: number;      // 16 / 24 / 32 — for WAV / AIFF / CAF
  trimStartSec?: number;
  trimEndSec?: number;
}

export interface AudioInfo {
  durationSec: number;
  bitrateKbps: number;
  sampleRate: number;
  channels: number;
}

interface ConvertResult {
  uri: string;
  size: number;
}

interface ExpoMediaConvertModuleType extends ExpoNativeModule {
  convertAudio(inputUri: string, outputUri: string, format: string, quality: MediaQuality): Promise<ConvertResult>;
  convertAudioWithBitrate(inputUri: string, outputUri: string, format: string, bitrateKbps: number): Promise<ConvertResult>;
  transcodeAudio(inputUri: string, outputUri: string, format: string, options: AudioTranscodeOptions): Promise<ConvertResult>;
  audioInfo(inputUri: string): Promise<AudioInfo>;
  convertVideo(inputUri: string, outputUri: string, format: string, quality: MediaQuality): Promise<ConvertResult>;
  transcodeVideo(inputUri: string, outputUri: string, format: string, options: TranscodeOptions): Promise<ConvertResult>;
  videoToGif(inputUri: string, outputUri: string, options: GifOptions): Promise<ConvertResult>;
  videoInfo(inputUri: string): Promise<VideoInfo>;
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

export function convertAudioWithBitrate(
  inputUri: string,
  outputUri: string,
  format: string,
  bitrateKbps: number,
): Promise<ConvertResult> {
  return ensure().convertAudioWithBitrate(inputUri, outputUri, format, bitrateKbps);
}

export function transcodeAudio(
  inputUri: string,
  outputUri: string,
  format: string,
  options: AudioTranscodeOptions,
): Promise<ConvertResult> {
  return ensure().transcodeAudio(inputUri, outputUri, format, options);
}

export function audioInfo(inputUri: string): Promise<AudioInfo> {
  return ensure().audioInfo(inputUri);
}

export function convertVideo(
  inputUri: string,
  outputUri: string,
  format: string,
  quality: MediaQuality,
): Promise<ConvertResult> {
  return ensure().convertVideo(inputUri, outputUri, format, quality);
}

export function transcodeVideo(
  inputUri: string,
  outputUri: string,
  format: string,
  options: TranscodeOptions,
): Promise<ConvertResult> {
  return ensure().transcodeVideo(inputUri, outputUri, format, options);
}

export function videoToGif(
  inputUri: string,
  outputUri: string,
  options: GifOptions,
): Promise<ConvertResult> {
  return ensure().videoToGif(inputUri, outputUri, options);
}

export function videoInfo(inputUri: string): Promise<VideoInfo> {
  return ensure().videoInfo(inputUri);
}

export function extractAudio(
  inputUri: string,
  outputUri: string,
  format: string,
): Promise<ConvertResult> {
  return ensure().extractAudio(inputUri, outputUri, format);
}
