import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  audioBitDepthApplies,
  audioBitrateApplies,
  probeAudio,
} from '../services/converters/audio';
import { probeVideo } from '../services/converters/video';
import { useAppStore } from '../store/useAppStore';
import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type {
  AudioMode,
  AudioOptions,
  ConversionJob,
  DocxToPdfOptions,
  GifOptions,
  ImageOptions,
  ImageToPdfOptions,
  PageFormat,
  PageOrientation,
  Quality,
  VideoCodec,
  VideoOptions,
  VideoQualityPreset,
} from '../types/conversion';
import type { RootStackParamList } from '../types/navigation';
import { kindFor, type Kind } from '../utils/conversionKind';
import { safeBaseName } from '../utils/format';
import { findFormat } from '../utils/formats';
import { formatBytes, formatSeconds, parseTime } from '../utils/time';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Options'>;
type RouteT = RouteProp<RootStackParamList, 'Options'>;

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Maximum' },
];

// Kind enum + source/target sets moved to src/utils/conversionKind.ts so the
// router stays unit-testable.

type ResolutionPreset = {
  key: string;
  label: string;
  width: number | null;
  height: number | null;
};

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { key: 'original', label: 'Original', width: null, height: null },
  { key: '4k', label: '4K UHD', width: 3840, height: 2160 },
  { key: '2k', label: '2K QHD', width: 2560, height: 1440 },
  { key: 'fhd', label: 'Full HD', width: 1920, height: 1080 },
  { key: 'hd', label: 'HD', width: 1280, height: 720 },
  { key: 'sd', label: 'SD', width: 854, height: 480 },
  { key: 'low', label: 'Niedrig', width: 640, height: 360 },
  { key: 'mobile', label: 'Mobil', width: 480, height: 270 },
];

const QUALITY_PRESETS: { value: VideoQualityPreset; label: string; sub: string }[] = [
  { value: 'maximum', label: 'Maximum', sub: '~CRF 17' },
  { value: 'high', label: 'Hoch', sub: '~CRF 20' },
  { value: 'standard', label: 'Standard', sub: '~CRF 23' },
  { value: 'compressed', label: 'Komprimiert', sub: '~CRF 28' },
  { value: 'strong', label: 'Stark', sub: '~CRF 32' },
];

const CODEC_OPTIONS: { value: VideoCodec; label: string; sub: string }[] = [
  { value: 'h264', label: 'H.264', sub: 'Universal' },
  { value: 'h265', label: 'H.265', sub: 'Kleiner' },
];

const FPS_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Original' },
  { value: 60, label: '60' },
  { value: 30, label: '30' },
  { value: 24, label: '24' },
  { value: 15, label: '15' },
];

const AUDIO_MODE_OPTIONS: { value: AudioMode; label: string; sub: string }[] = [
  { value: 'keep', label: 'Original', sub: 'unverändert' },
  { value: 'reencode', label: 'Neu', sub: 'AAC' },
  { value: 'remove', label: 'Entfernen', sub: 'stumm' },
];

const AUDIO_BITRATE_OPTIONS = [64, 96, 128, 192, 320];
const AUDIO_BITRATE_FULL = [64, 96, 128, 192, 256, 320];
const SAMPLE_RATE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Original' },
  { value: 48000, label: '48 kHz' },
  { value: 44100, label: '44.1 kHz' },
  { value: 32000, label: '32 kHz' },
  { value: 22050, label: '22 kHz' },
  { value: 16000, label: '16 kHz' },
];
const CHANNEL_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Original' },
  { value: 2, label: 'Stereo' },
  { value: 1, label: 'Mono' },
];
const BIT_DEPTH_OPTIONS = [16, 24, 32];

const GIF_WIDTHS = [480, 360, 240];
const GIF_FPS_OPTIONS = [30, 24, 15, 10];
const GIF_COLOR_OPTIONS = [256, 128];
const GIF_WARNING_BYTES = 10 * 1024 * 1024; // 10 MB

const IMAGE_QUALITY_PRESETS = [
  { key: 'lossless', label: 'Verlustfrei', value: 1.0 },
  { key: 'max', label: 'Maximum', value: 0.95 },
  { key: 'high', label: 'Hoch', value: 0.9 },
  { key: 'std', label: 'Standard', value: 0.8 },
  { key: 'mid', label: 'Mittel', value: 0.7 },
  { key: 'low', label: 'Niedrig', value: 0.6 },
  { key: 'tiny', label: 'Sehr klein', value: 0.4 },
];

const IMAGE_RESIZE_PRESETS: { key: string; label: string; max: number | null }[] = [
  { key: 'orig', label: 'Original', max: null },
  { key: '4k', label: '4096px', max: 4096 },
  { key: '2k', label: '2048px', max: 2048 },
  { key: 'fhd', label: '1920px', max: 1920 },
  { key: 'web', label: '1280px', max: 1280 },
  { key: 'prev', label: '800px', max: 800 },
  { key: 'thumb', label: '400px', max: 400 },
];

const ROTATE_OPTIONS = [0, 90, 180, 270];

const CROP_ASPECTS: { key: string; label: string; w: number; h: number }[] = [
  { key: 'free', label: 'Original', w: 0, h: 0 },
  { key: '1:1', label: '1:1', w: 1, h: 1 },
  { key: '4:3', label: '4:3', w: 4, h: 3 },
  { key: '16:9', label: '16:9', w: 16, h: 9 },
  { key: '3:2', label: '3:2', w: 3, h: 2 },
  { key: '9:16', label: '9:16', w: 9, h: 16 },
];

const PAGE_FORMATS: { value: PageFormat; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'a5', label: 'A5' },
  { value: 'a3', label: 'A3' },
];
const ORIENTATIONS: { value: PageOrientation; label: string }[] = [
  { value: 'portrait', label: 'Hoch' },
  { value: 'landscape', label: 'Quer' },
];
const MARGIN_OPTIONS = [0, 5, 10, 20];
const IMAGES_PER_PAGE: (1 | 2 | 4)[] = [1, 2, 4];

// Reference kbps at 1080p — mirrors the Swift videoBitrate(...) function.
const QUALITY_REFERENCE_KBPS: Record<VideoQualityPreset, number> = {
  maximum: 25_000,
  high: 12_000,
  standard: 8_000,
  compressed: 3_000,
  strong: 1_000,
};
const REFERENCE_PIXELS = 1920 * 1080;

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function OptionsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const c = useTheme();
  const file = useJobStore((s) => s.files[route.params.fileId]);
  const startJob = useJobStore((s) => s.startJob);
  const defaultQuality = useAppStore((s) => s.defaultQuality);

  const targetFormat = useMemo(() => findFormat(route.params.targetFormat), [route.params.targetFormat]);
  const kind: Kind = file && targetFormat
    ? kindFor(file.ext, targetFormat.ext, route.params.variant)
    : 'other';

  const [quality, setQuality] = useState<Quality>(defaultQuality);
  const [name, setName] = useState(() => (file ? safeBaseName(file.name) : 'output'));

  // Video state
  const [resolutionKey, setResolutionKey] = useState<string>('original');
  const [qualityPreset, setQualityPreset] = useState<VideoQualityPreset>('standard');
  const [codec, setCodec] = useState<VideoCodec>('h264');
  const [fps, setFps] = useState<number | null>(null);
  const [audioMode, setAudioMode] = useState<AudioMode>('keep');
  const [vAudioBitrate, setVAudioBitrate] = useState<number>(128);
  const [trimStart, setTrimStart] = useState<string>('');
  const [trimEnd, setTrimEnd] = useState<string>('');

  // GIF state
  const [gifWidth, setGifWidth] = useState<number>(360);
  const [gifFps, setGifFps] = useState<number>(15);
  const [gifLoop, setGifLoop] = useState<boolean>(true);
  const [gifColors, setGifColors] = useState<number>(256);

  // Audio (advanced)
  const [aBitrate, setABitrate] = useState<number>(192);
  const [aSampleRate, setASampleRate] = useState<number | null>(null);
  const [aChannels, setAChannels] = useState<number | null>(null);
  const [aBitDepth, setABitDepth] = useState<number>(16);

  // Image
  const [imgQualityKey, setImgQualityKey] = useState<string>('high');
  const [imgResizeKey, setImgResizeKey] = useState<string>('orig');
  const [imgRotate, setImgRotate] = useState<number>(0);
  const [imgFlipH, setImgFlipH] = useState<boolean>(false);
  const [imgFlipV, setImgFlipV] = useState<boolean>(false);
  const [imgCropKey, setImgCropKey] = useState<string>('free');

  // Image → PDF
  const [i2pFormat, setI2pFormat] = useState<PageFormat>('a4');
  const [i2pOrient, setI2pOrient] = useState<PageOrientation>('portrait');
  const [i2pMargin, setI2pMargin] = useState<number>(10);
  const [i2pPerPage, setI2pPerPage] = useState<1 | 2 | 4>(1);

  // DOCX → PDF
  const [d2pFormat, setD2pFormat] = useState<PageFormat>('a4');
  const [d2pOrient, setD2pOrient] = useState<PageOrientation>('portrait');

  // PDF tools
  const [pdfPages, setPdfPages] = useState<string>('');

  // Source probes
  const [videoMeta, setVideoMeta] = useState<{
    durationSec: number; width: number; height: number;
    fps: number; hasAudio: boolean; videoBitrateKbps: number;
  } | null>(null);
  const [audioMeta, setAudioMeta] = useState<{
    durationSec: number; bitrateKbps: number; sampleRate: number; channels: number;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    if (kind === 'video' || kind === 'gif' || kind === 'audio-extract') {
      probeVideo(file.uri).then(setVideoMeta).catch(() => setVideoMeta(null));
    } else if (kind === 'audio') {
      probeAudio(file.uri).then(setAudioMeta).catch(() => setAudioMeta(null));
    }
  }, [file, kind]);

  if (!file || !targetFormat) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.empty}>
          <Text style={{ color: c.textSec }}>Conversion details missing.</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.link, { color: c.accent }]}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const resolutionPreset =
    RESOLUTION_PRESETS.find((p) => p.key === resolutionKey) ?? RESOLUTION_PRESETS[0];
  const imgQualityPreset =
    IMAGE_QUALITY_PRESETS.find((q) => q.key === imgQualityKey) ?? IMAGE_QUALITY_PRESETS[2];
  const imgResizePreset =
    IMAGE_RESIZE_PRESETS.find((r) => r.key === imgResizeKey) ?? IMAGE_RESIZE_PRESETS[0];
  const imgCropPreset =
    CROP_ASPECTS.find((c2) => c2.key === imgCropKey) ?? CROP_ASPECTS[0];

  const trimRange = (sourceDur: number): { start: number; end: number; duration: number } => {
    const startN = Math.max(0, parseTime(trimStart) || 0);
    const endRaw = parseTime(trimEnd);
    const endN = isFinite(endRaw) && endRaw > 0 ? Math.min(sourceDur, endRaw) : sourceDur;
    const dur = Math.max(0, endN - startN);
    return { start: startN, end: endN, duration: dur };
  };

  const effectiveVideoDims = (): { w: number; h: number } | null => {
    if (!videoMeta) return null;
    if (resolutionPreset.width == null) {
      return { w: videoMeta.width, h: videoMeta.height };
    }
    const srcW = videoMeta.width || 1920;
    const srcH = videoMeta.height || 1080;
    const scale = Math.min(resolutionPreset.width / srcW, resolutionPreset.height! / srcH);
    return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
  };

  const estimateVideoSize = (): number => {
    if (!videoMeta) return 0;
    const dims = effectiveVideoDims();
    if (!dims) return 0;
    const pixels = Math.max(dims.w * dims.h, 320 * 180);
    const refKbps = QUALITY_REFERENCE_KBPS[qualityPreset];
    const videoKbps = Math.max(200, refKbps * (pixels / REFERENCE_PIXELS));
    const codecFactor = codec === 'h265' ? 0.6 : 1.0;
    const audioKbps =
      audioMode === 'remove' ? 0
        : audioMode === 'reencode' ? vAudioBitrate
        : videoMeta.hasAudio ? 128 : 0;
    const dur = trimRange(videoMeta.durationSec).duration || videoMeta.durationSec;
    return Math.round(((videoKbps * codecFactor + audioKbps) * dur * 1000) / 8);
  };

  const estimateGifSize = (): number => {
    if (!videoMeta) return 0;
    const aspect = videoMeta.height / Math.max(1, videoMeta.width);
    const w = gifWidth;
    const h = Math.max(60, Math.round(w * aspect));
    const dur = trimRange(videoMeta.durationSec).duration || videoMeta.durationSec;
    const bytesPerFrame = w * h * 0.6;
    return Math.round(bytesPerFrame * gifFps * dur);
  };

  const estimateAudioSize = (): number => {
    if (kind === 'audio' && audioMeta) {
      const dur = trimRange(audioMeta.durationSec).duration || audioMeta.durationSec;
      if (audioBitrateApplies(targetFormat.ext)) {
        return Math.round((aBitrate * 1000 * dur) / 8);
      }
      const channels = aChannels ?? audioMeta.channels;
      const rate = aSampleRate ?? audioMeta.sampleRate;
      const bytesPerSample = aBitDepth / 8;
      return Math.round(rate * bytesPerSample * channels * dur);
    }
    if (kind === 'audio-extract' && videoMeta) {
      return Math.round(176_000 * videoMeta.durationSec);
    }
    return 0;
  };

  const estimateDuration = (): number => {
    if (kind === 'gif' && videoMeta) {
      const d = trimRange(videoMeta.durationSec).duration || videoMeta.durationSec;
      return Math.max(2, d * 0.6);
    }
    if (kind === 'video' && videoMeta) {
      const d = trimRange(videoMeta.durationSec).duration || videoMeta.durationSec;
      const factor = codec === 'h265' ? 0.7 : 0.35;
      return Math.max(2, d * factor);
    }
    if (kind === 'audio' && audioMeta) {
      return Math.max(1, audioMeta.durationSec * 0.05);
    }
    return 0;
  };

  const buildJob = (): ConversionJob => {
    let videoOptions: VideoOptions | undefined;
    let gifOptions: GifOptions | undefined;
    let audioOptions: AudioOptions | undefined;
    let imageOptions: ImageOptions | undefined;
    let imageToPdfOptions: ImageToPdfOptions | undefined;
    let docxToPdfOptions: DocxToPdfOptions | undefined;

    if (kind === 'video' && videoMeta) {
      const tr = trimRange(videoMeta.durationSec);
      videoOptions = {
        width: resolutionPreset.width ?? undefined,
        height: resolutionPreset.height ?? undefined,
        preserveAspectRatio: true,
        qualityPreset,
        codec,
        fps: fps ?? undefined,
        audioMode,
        audioBitrate: audioMode === 'reencode' ? vAudioBitrate : undefined,
        trimStartSec: tr.start > 0 ? tr.start : undefined,
        trimEndSec: trimEnd ? tr.end : undefined,
      };
    } else if (kind === 'gif' && videoMeta) {
      const tr = trimRange(videoMeta.durationSec);
      gifOptions = {
        width: gifWidth,
        fps: gifFps,
        loop: gifLoop,
        colors: gifColors,
        trimStartSec: tr.start > 0 ? tr.start : undefined,
        trimEndSec: trimEnd ? tr.end : undefined,
      };
    } else if (kind === 'audio') {
      const tr = audioMeta ? trimRange(audioMeta.durationSec) : { start: 0, end: 0, duration: 0 };
      audioOptions = {
        bitrate: audioBitrateApplies(targetFormat.ext) ? aBitrate : undefined,
        sampleRate: aSampleRate ?? undefined,
        channels: aChannels ?? undefined,
        bitDepth: audioBitDepthApplies(targetFormat.ext) ? aBitDepth : undefined,
        trimStartSec: tr.start > 0 ? tr.start : undefined,
        trimEndSec: trimEnd ? tr.end : undefined,
      };
    } else if (kind === 'image') {
      imageOptions = {
        quality: imgQualityPreset.value,
        maxWidth: imgResizePreset.max ?? undefined,
        maxHeight: imgResizePreset.max ?? undefined,
        rotate: imgRotate !== 0 ? imgRotate : undefined,
        flipHorizontal: imgFlipH || undefined,
        flipVertical: imgFlipV || undefined,
        cropAspect: imgCropPreset.w > 0 ? { w: imgCropPreset.w, h: imgCropPreset.h } : undefined,
      };
    } else if (kind === 'image-to-pdf') {
      imageToPdfOptions = {
        pageFormat: i2pFormat,
        orientation: i2pOrient,
        marginMm: i2pMargin,
        imagesPerPage: i2pPerPage,
      };
    } else if (kind === 'docx-to-pdf') {
      docxToPdfOptions = {
        pageFormat: d2pFormat,
        orientation: d2pOrient,
      };
    }

    const pdfToolsOptions =
      kind === 'pdf-tool' && (route.params.variant === 'split' || route.params.variant === 'delete')
        ? { pages: pdfPages }
        : undefined;

    return {
      id: uid(),
      source: file,
      targetExt: targetFormat.ext,
      quality,
      variant: route.params.variant,
      videoOptions,
      gifOptions,
      audioOptions,
      imageOptions,
      imageToPdfOptions,
      docxToPdfOptions,
      pdfToolsOptions,
      outputName: `${name || 'output'}.${targetFormat.ext}`,
      status: 'pending',
      progress: 0,
      error: null,
      outputUri: null,
      outputSize: null,
      startedAt: Date.now(),
      finishedAt: null,
    };
  };

  const start = () => {
    const job = buildJob();
    startJob(job);
    navigation.replace('Progress', { jobId: job.id });
  };

  const variantLabel =
    route.params.variant === 'styled'
      ? ' — full styling'
      : route.params.variant === 'plain'
      ? ' — clean HTML'
      : '';

  const showSimpleQuality =
    kind === 'other' || kind === 'audio-extract';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerSide}>
          <Text style={[styles.back, { color: c.accent }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: c.text }]}>Options</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.heading, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.headingText, { color: c.text }]}>
            {file.format.label} → {targetFormat.label}
            {variantLabel}
          </Text>
          {targetFormat.description ? (
            <Text style={[styles.headingSub, { color: c.textSec }]}>{targetFormat.description}</Text>
          ) : null}
          {videoMeta ? (
            <Text style={[styles.headingSub, { color: c.textSec }]}>
              {videoMeta.width}×{videoMeta.height} · {Math.round(videoMeta.fps)} fps ·{' '}
              {formatSeconds(videoMeta.durationSec)} · {videoMeta.hasAudio ? 'mit Audio' : 'ohne Audio'}
            </Text>
          ) : null}
          {audioMeta ? (
            <Text style={[styles.headingSub, { color: c.textSec }]}>
              {audioMeta.channels === 1 ? 'Mono' : 'Stereo'} · {(audioMeta.sampleRate / 1000).toFixed(1)} kHz ·{' '}
              {audioMeta.bitrateKbps} kbps · {formatSeconds(audioMeta.durationSec)}
            </Text>
          ) : null}
        </View>

        {kind === 'video' ? (
          <VideoSections
            c={c}
            resolutionKey={resolutionKey} setResolutionKey={setResolutionKey}
            qualityPreset={qualityPreset} setQualityPreset={setQualityPreset}
            codec={codec} setCodec={setCodec}
            fps={fps} setFps={setFps}
            audioMode={audioMode} setAudioMode={setAudioMode}
            vAudioBitrate={vAudioBitrate} setVAudioBitrate={setVAudioBitrate}
            trimStart={trimStart} setTrimStart={setTrimStart}
            trimEnd={trimEnd} setTrimEnd={setTrimEnd}
            videoMeta={videoMeta}
            effectiveDims={effectiveVideoDims()}
          />
        ) : null}

        {kind === 'gif' ? (
          <GifSections
            c={c}
            gifWidth={gifWidth} setGifWidth={setGifWidth}
            gifFps={gifFps} setGifFps={setGifFps}
            gifLoop={gifLoop} setGifLoop={setGifLoop}
            gifColors={gifColors} setGifColors={setGifColors}
            trimStart={trimStart} setTrimStart={setTrimStart}
            trimEnd={trimEnd} setTrimEnd={setTrimEnd}
            videoMeta={videoMeta}
          />
        ) : null}

        {kind === 'audio' ? (
          <AudioSections
            c={c}
            targetExt={targetFormat.ext}
            aBitrate={aBitrate} setABitrate={setABitrate}
            aSampleRate={aSampleRate} setASampleRate={setASampleRate}
            aChannels={aChannels} setAChannels={setAChannels}
            aBitDepth={aBitDepth} setABitDepth={setABitDepth}
            trimStart={trimStart} setTrimStart={setTrimStart}
            trimEnd={trimEnd} setTrimEnd={setTrimEnd}
            audioMeta={audioMeta}
          />
        ) : null}

        {kind === 'image' ? (
          <ImageSections
            c={c}
            imgQualityKey={imgQualityKey} setImgQualityKey={setImgQualityKey}
            imgResizeKey={imgResizeKey} setImgResizeKey={setImgResizeKey}
            imgRotate={imgRotate} setImgRotate={setImgRotate}
            imgFlipH={imgFlipH} setImgFlipH={setImgFlipH}
            imgFlipV={imgFlipV} setImgFlipV={setImgFlipV}
            imgCropKey={imgCropKey} setImgCropKey={setImgCropKey}
          />
        ) : null}

        {kind === 'image-to-pdf' ? (
          <ImageToPdfSections
            c={c}
            format={i2pFormat} setFormat={setI2pFormat}
            orient={i2pOrient} setOrient={setI2pOrient}
            margin={i2pMargin} setMargin={setI2pMargin}
            perPage={i2pPerPage} setPerPage={setI2pPerPage}
          />
        ) : null}

        {kind === 'docx-to-pdf' ? (
          <DocxToPdfSections
            c={c}
            format={d2pFormat} setFormat={setD2pFormat}
            orient={d2pOrient} setOrient={setD2pOrient}
          />
        ) : null}

        {kind === 'pdf-tool' ? (
          <PdfToolSections
            c={c}
            variant={route.params.variant}
            pages={pdfPages} setPages={setPdfPages}
          />
        ) : null}

        {showSimpleQuality ? (
          <Section title="Quality" textColor={c.textSec}>
            <View style={[styles.segmented, { backgroundColor: c.surfaceAlt }]}>
              {QUALITY_OPTIONS.map((opt) => {
                const active = opt.value === quality;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.segment, active && { backgroundColor: c.surface }]}
                    onPress={() => setQuality(opt.value)}
                  >
                    <Text style={[
                      styles.segmentLabel,
                      { color: active ? c.text : c.textSec, fontWeight: active ? '600' : '500' },
                    ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>
        ) : null}

        {(kind === 'video' || kind === 'gif' || kind === 'audio' || kind === 'audio-extract') &&
        (videoMeta || audioMeta) ? (
          <View style={[styles.estimate, { backgroundColor: c.surfaceAlt }]}>
            {(() => {
              const size =
                kind === 'video' ? estimateVideoSize() :
                kind === 'gif' ? estimateGifSize() :
                estimateAudioSize();
              const tooBig = kind === 'gif' && size > GIF_WARNING_BYTES;
              return (
                <>
                  <View style={styles.estimateRow}>
                    <Text style={[styles.estimateLabel, { color: c.textSec }]}>Geschätzte Größe</Text>
                    <Text style={[styles.estimateValue, { color: tooBig ? c.neg : c.text }]}>
                      {formatBytes(size)}
                    </Text>
                  </View>
                  {tooBig ? (
                    <Text style={[styles.hint, { color: c.neg }]}>
                      ⚠ Über 10 MB — kleinere Breite/FPS wählen.
                    </Text>
                  ) : null}
                </>
              );
            })()}
            <View style={styles.estimateRow}>
              <Text style={[styles.estimateLabel, { color: c.textSec }]}>Geschätzte Dauer</Text>
              <Text style={[styles.estimateValue, { color: c.text }]}>
                ~{formatSeconds(estimateDuration())}
              </Text>
            </View>
            <Text style={[styles.hint, { color: c.textTer }]}>
              Schätzwerte. Tatsächliche Werte hängen vom Inhalt ab.
            </Text>
          </View>
        ) : null}

        <Section title="Output name" textColor={c.textSec}>
          <View style={[styles.nameRow, { backgroundColor: c.surfaceAlt }]}>
            <TextInput
              value={name}
              onChangeText={(v) => setName(v.replace(/[^a-zA-Z0-9._-]/g, '_'))}
              style={[styles.nameInput, { color: c.text }]}
              placeholder="output"
              placeholderTextColor={c.textTer}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <Text style={[styles.nameSuffix, { color: c.textSec }]}>.{targetFormat.ext}</Text>
          </View>
        </Section>

        <Pressable
          onPress={start}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaLabel}>Convert now</Text>
        </Pressable>
        <Text style={[styles.disclaimer, { color: c.textSec }]}>
          Runs entirely on your device. No upload, no account, no tracking.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// MARK: - Sub-sections by kind

interface CCProp { c: ReturnType<typeof useTheme> }

function VideoSections(props: CCProp & {
  resolutionKey: string; setResolutionKey: (v: string) => void;
  qualityPreset: VideoQualityPreset; setQualityPreset: (v: VideoQualityPreset) => void;
  codec: VideoCodec; setCodec: (v: VideoCodec) => void;
  fps: number | null; setFps: (v: number | null) => void;
  audioMode: AudioMode; setAudioMode: (v: AudioMode) => void;
  vAudioBitrate: number; setVAudioBitrate: (v: number) => void;
  trimStart: string; setTrimStart: (v: string) => void;
  trimEnd: string; setTrimEnd: (v: string) => void;
  videoMeta: { durationSec: number; width: number; height: number } | null;
  effectiveDims: { w: number; h: number } | null;
}) {
  const { c } = props;
  return (
    <>
      <Section title="Auflösung" textColor={c.textSec}>
        <Chips
          items={RESOLUTION_PRESETS.map((p) => ({ key: p.key, label: p.label }))}
          value={props.resolutionKey} onChange={props.setResolutionKey} c={c}
        />
        {props.effectiveDims ? (
          <Text style={[styles.hint, { color: c.textTer }]}>
            Ausgabe: {props.effectiveDims.w}×{props.effectiveDims.h}
          </Text>
        ) : null}
      </Section>
      <Section title="Qualität" textColor={c.textSec}>
        <Chips
          items={QUALITY_PRESETS.map((q) => ({ key: q.value, label: q.label, sub: q.sub }))}
          value={props.qualityPreset} onChange={(v) => props.setQualityPreset(v as VideoQualityPreset)} c={c}
        />
      </Section>
      <Section title="Codec" textColor={c.textSec}>
        <Chips
          items={CODEC_OPTIONS.map((o) => ({ key: o.value, label: o.label, sub: o.sub }))}
          value={props.codec} onChange={(v) => props.setCodec(v as VideoCodec)} c={c}
        />
      </Section>
      <Section title="Bildrate" textColor={c.textSec}>
        <Chips
          items={FPS_OPTIONS.map((o) => ({
            key: o.value == null ? 'orig' : String(o.value),
            label: o.label,
          }))}
          value={props.fps == null ? 'orig' : String(props.fps)}
          onChange={(v) => props.setFps(v === 'orig' ? null : parseInt(v, 10))}
          c={c}
        />
      </Section>
      <Section title="Audio" textColor={c.textSec}>
        <Chips
          items={AUDIO_MODE_OPTIONS.map((o) => ({ key: o.value, label: o.label, sub: o.sub }))}
          value={props.audioMode} onChange={(v) => props.setAudioMode(v as AudioMode)} c={c}
        />
        {props.audioMode === 'reencode' ? (
          <View style={{ marginTop: 10 }}>
            <Chips
              items={AUDIO_BITRATE_OPTIONS.map((b) => ({ key: String(b), label: `${b} kbps` }))}
              value={String(props.vAudioBitrate)} onChange={(v) => props.setVAudioBitrate(parseInt(v, 10))} c={c}
            />
          </View>
        ) : null}
      </Section>
      <TrimSection
        c={c}
        trimStart={props.trimStart} setTrimStart={props.setTrimStart}
        trimEnd={props.trimEnd} setTrimEnd={props.setTrimEnd}
        duration={props.videoMeta?.durationSec ?? 0}
      />
    </>
  );
}

function GifSections(props: CCProp & {
  gifWidth: number; setGifWidth: (v: number) => void;
  gifFps: number; setGifFps: (v: number) => void;
  gifLoop: boolean; setGifLoop: (v: boolean) => void;
  gifColors: number; setGifColors: (v: number) => void;
  trimStart: string; setTrimStart: (v: string) => void;
  trimEnd: string; setTrimEnd: (v: string) => void;
  videoMeta: { durationSec: number } | null;
}) {
  const { c } = props;
  return (
    <>
      <Section title="Breite" textColor={c.textSec}>
        <Chips
          items={GIF_WIDTHS.map((w) => ({ key: String(w), label: `${w}px` }))}
          value={String(props.gifWidth)} onChange={(v) => props.setGifWidth(parseInt(v, 10))} c={c}
        />
      </Section>
      <Section title="Bildrate" textColor={c.textSec}>
        <Chips
          items={GIF_FPS_OPTIONS.map((f) => ({ key: String(f), label: `${f} fps` }))}
          value={String(props.gifFps)} onChange={(v) => props.setGifFps(parseInt(v, 10))} c={c}
        />
      </Section>
      <Section title="Farbpalette" textColor={c.textSec}>
        <Chips
          items={GIF_COLOR_OPTIONS.map((n) => ({ key: String(n), label: `${n}` }))}
          value={String(props.gifColors)} onChange={(v) => props.setGifColors(parseInt(v, 10))} c={c}
        />
      </Section>
      <Section title="Endlosschleife" textColor={c.textSec}>
        <View style={[styles.toggleRow, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.toggleLabel, { color: c.text }]}>
            {props.gifLoop ? 'Schleife an' : 'Einmalig'}
          </Text>
          <Switch value={props.gifLoop} onValueChange={props.setGifLoop} />
        </View>
      </Section>
      <TrimSection
        c={c}
        trimStart={props.trimStart} setTrimStart={props.setTrimStart}
        trimEnd={props.trimEnd} setTrimEnd={props.setTrimEnd}
        duration={props.videoMeta?.durationSec ?? 0}
      />
    </>
  );
}

function AudioSections(props: CCProp & {
  targetExt: string;
  aBitrate: number; setABitrate: (v: number) => void;
  aSampleRate: number | null; setASampleRate: (v: number | null) => void;
  aChannels: number | null; setAChannels: (v: number | null) => void;
  aBitDepth: number; setABitDepth: (v: number) => void;
  trimStart: string; setTrimStart: (v: string) => void;
  trimEnd: string; setTrimEnd: (v: string) => void;
  audioMeta: { durationSec: number } | null;
}) {
  const { c } = props;
  const showBitrate = audioBitrateApplies(props.targetExt);
  const showBitDepth = audioBitDepthApplies(props.targetExt);
  return (
    <>
      {showBitrate ? (
        <Section title="Bitrate" textColor={c.textSec}>
          <Chips
            items={AUDIO_BITRATE_FULL.map((b) => ({ key: String(b), label: `${b} kbps` }))}
            value={String(props.aBitrate)} onChange={(v) => props.setABitrate(parseInt(v, 10))} c={c}
          />
        </Section>
      ) : null}
      <Section title="Abtastrate" textColor={c.textSec}>
        <Chips
          items={SAMPLE_RATE_OPTIONS.map((o) => ({
            key: o.value == null ? 'orig' : String(o.value),
            label: o.label,
          }))}
          value={props.aSampleRate == null ? 'orig' : String(props.aSampleRate)}
          onChange={(v) => props.setASampleRate(v === 'orig' ? null : parseInt(v, 10))}
          c={c}
        />
      </Section>
      <Section title="Kanäle" textColor={c.textSec}>
        <Chips
          items={CHANNEL_OPTIONS.map((o) => ({
            key: o.value == null ? 'orig' : String(o.value),
            label: o.label,
          }))}
          value={props.aChannels == null ? 'orig' : String(props.aChannels)}
          onChange={(v) => props.setAChannels(v === 'orig' ? null : parseInt(v, 10))}
          c={c}
        />
      </Section>
      {showBitDepth ? (
        <Section title="Bit-Tiefe" textColor={c.textSec}>
          <Chips
            items={BIT_DEPTH_OPTIONS.map((b) => ({ key: String(b), label: `${b}-bit` }))}
            value={String(props.aBitDepth)} onChange={(v) => props.setABitDepth(parseInt(v, 10))} c={c}
          />
        </Section>
      ) : null}
      <TrimSection
        c={c}
        trimStart={props.trimStart} setTrimStart={props.setTrimStart}
        trimEnd={props.trimEnd} setTrimEnd={props.setTrimEnd}
        duration={props.audioMeta?.durationSec ?? 0}
      />
    </>
  );
}

function ImageSections(props: CCProp & {
  imgQualityKey: string; setImgQualityKey: (v: string) => void;
  imgResizeKey: string; setImgResizeKey: (v: string) => void;
  imgRotate: number; setImgRotate: (v: number) => void;
  imgFlipH: boolean; setImgFlipH: (v: boolean) => void;
  imgFlipV: boolean; setImgFlipV: (v: boolean) => void;
  imgCropKey: string; setImgCropKey: (v: string) => void;
}) {
  const { c } = props;
  return (
    <>
      <Section title="Qualität" textColor={c.textSec}>
        <Chips
          items={IMAGE_QUALITY_PRESETS.map((q) => ({
            key: q.key, label: q.label, sub: `${Math.round(q.value * 100)}%`,
          }))}
          value={props.imgQualityKey} onChange={props.setImgQualityKey} c={c}
        />
      </Section>
      <Section title="Größe" textColor={c.textSec}>
        <Chips
          items={IMAGE_RESIZE_PRESETS.map((r) => ({ key: r.key, label: r.label }))}
          value={props.imgResizeKey} onChange={props.setImgResizeKey} c={c}
        />
      </Section>
      <Section title="Drehen" textColor={c.textSec}>
        <Chips
          items={ROTATE_OPTIONS.map((r) => ({ key: String(r), label: `${r}°` }))}
          value={String(props.imgRotate)} onChange={(v) => props.setImgRotate(parseInt(v, 10))} c={c}
        />
      </Section>
      <Section title="Spiegeln" textColor={c.textSec}>
        <View style={[styles.toggleRow, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.toggleLabel, { color: c.text }]}>Horizontal</Text>
          <Switch value={props.imgFlipH} onValueChange={props.setImgFlipH} />
        </View>
        <View style={[styles.toggleRow, { backgroundColor: c.surfaceAlt, marginTop: 8 }]}>
          <Text style={[styles.toggleLabel, { color: c.text }]}>Vertikal</Text>
          <Switch value={props.imgFlipV} onValueChange={props.setImgFlipV} />
        </View>
      </Section>
      <Section title="Seitenverhältnis (Crop)" textColor={c.textSec}>
        <Chips
          items={CROP_ASPECTS.map((a) => ({ key: a.key, label: a.label }))}
          value={props.imgCropKey} onChange={props.setImgCropKey} c={c}
        />
      </Section>
    </>
  );
}

function ImageToPdfSections(props: CCProp & {
  format: PageFormat; setFormat: (v: PageFormat) => void;
  orient: PageOrientation; setOrient: (v: PageOrientation) => void;
  margin: number; setMargin: (v: number) => void;
  perPage: 1 | 2 | 4; setPerPage: (v: 1 | 2 | 4) => void;
}) {
  const { c } = props;
  return (
    <>
      <Section title="Seitenformat" textColor={c.textSec}>
        <Chips
          items={PAGE_FORMATS.map((p) => ({ key: p.value, label: p.label }))}
          value={props.format} onChange={(v) => props.setFormat(v as PageFormat)} c={c}
        />
      </Section>
      <Section title="Orientierung" textColor={c.textSec}>
        <Chips
          items={ORIENTATIONS.map((o) => ({ key: o.value, label: o.label }))}
          value={props.orient} onChange={(v) => props.setOrient(v as PageOrientation)} c={c}
        />
      </Section>
      <Section title="Ränder" textColor={c.textSec}>
        <Chips
          items={MARGIN_OPTIONS.map((m) => ({ key: String(m), label: `${m} mm` }))}
          value={String(props.margin)} onChange={(v) => props.setMargin(parseInt(v, 10))} c={c}
        />
      </Section>
      <Section title="Bilder pro Seite" textColor={c.textSec}>
        <Chips
          items={IMAGES_PER_PAGE.map((n) => ({ key: String(n), label: `${n}` }))}
          value={String(props.perPage)}
          onChange={(v) => props.setPerPage(parseInt(v, 10) as 1 | 2 | 4)}
          c={c}
        />
      </Section>
    </>
  );
}

function PdfToolSections(props: CCProp & {
  variant: string | undefined;
  pages: string; setPages: (v: string) => void;
}) {
  const { c } = props;
  const v = props.variant;
  const label =
    v === 'compress' ? 'PDF komprimieren' :
    v === 'rotate90' ? '90° drehen' :
    v === 'rotate180' ? '180° drehen' :
    v === 'rotate270' ? '270° drehen' :
    v === 'split' ? 'Seiten extrahieren' :
    v === 'delete' ? 'Seiten löschen' :
    'PDF-Tool';
  const needsPages = v === 'split' || v === 'delete';
  return (
    <>
      <Section title="Aktion" textColor={c.textSec}>
        <View style={[styles.toggleRow, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.toggleLabel, { color: c.text }]}>{label}</Text>
        </View>
      </Section>
      {needsPages ? (
        <Section title="Seitenbereich" textColor={c.textSec}>
          <View style={[styles.nameRow, { backgroundColor: c.surfaceAlt }]}>
            <TextInput
              value={props.pages}
              onChangeText={props.setPages}
              style={[styles.nameInput, { color: c.text }]}
              placeholder="z. B. 1-5, 8, 12-20"
              placeholderTextColor={c.textTer}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <Text style={[styles.hint, { color: c.textTer }]}>
            {v === 'split'
              ? 'Diese Seiten werden in die neue PDF übernommen.'
              : 'Diese Seiten werden aus der PDF entfernt.'}
          </Text>
        </Section>
      ) : null}
    </>
  );
}

function DocxToPdfSections(props: CCProp & {
  format: PageFormat; setFormat: (v: PageFormat) => void;
  orient: PageOrientation; setOrient: (v: PageOrientation) => void;
}) {
  const { c } = props;
  return (
    <>
      <Section title="Seitenformat" textColor={c.textSec}>
        <Chips
          items={PAGE_FORMATS.map((p) => ({ key: p.value, label: p.label }))}
          value={props.format} onChange={(v) => props.setFormat(v as PageFormat)} c={c}
        />
      </Section>
      <Section title="Orientierung" textColor={c.textSec}>
        <Chips
          items={ORIENTATIONS.map((o) => ({ key: o.value, label: o.label }))}
          value={props.orient} onChange={(v) => props.setOrient(v as PageOrientation)} c={c}
        />
      </Section>
    </>
  );
}

function TrimSection(props: CCProp & {
  trimStart: string; setTrimStart: (v: string) => void;
  trimEnd: string; setTrimEnd: (v: string) => void;
  duration: number;
}) {
  const { c } = props;
  return (
    <Section title="Zuschneiden" textColor={c.textSec}>
      <View style={[styles.trimRow, { backgroundColor: c.surfaceAlt }]}>
        <View style={styles.trimCol}>
          <Text style={[styles.trimLabel, { color: c.textSec }]}>Start</Text>
          <TextInput
            value={props.trimStart}
            onChangeText={(v) => props.setTrimStart(v.replace(/[^0-9.:]/g, ''))}
            keyboardType="numbers-and-punctuation"
            style={[styles.trimInput, { color: c.text }]}
            placeholder="0 / 0:00 / 0:00:00"
            placeholderTextColor={c.textTer}
          />
        </View>
        <View style={styles.trimCol}>
          <Text style={[styles.trimLabel, { color: c.textSec }]}>Ende</Text>
          <TextInput
            value={props.trimEnd}
            onChangeText={(v) => props.setTrimEnd(v.replace(/[^0-9.:]/g, ''))}
            keyboardType="numbers-and-punctuation"
            style={[styles.trimInput, { color: c.text }]}
            placeholder={props.duration ? formatSeconds(props.duration) : 'Ende'}
            placeholderTextColor={c.textTer}
          />
        </View>
      </View>
      <Text style={[styles.hint, { color: c.textTer }]}>
        Format: Sekunden (12.5) oder HH:MM:SS (1:23:45)
      </Text>
    </Section>
  );
}

// MARK: - Reusable widgets

interface SectionProps {
  title: string;
  textColor: string;
  children: React.ReactNode;
}

function Section({ title, textColor, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
      {children}
    </View>
  );
}

interface ChipsProps {
  items: { key: string; label: string; sub?: string }[];
  value: string;
  onChange: (key: string) => void;
  c: ReturnType<typeof useTheme>;
}

function Chips({ items, value, onChange, c }: ChipsProps) {
  return (
    <View style={styles.chipRow}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            style={[
              styles.chip,
              { backgroundColor: active ? c.accent : c.surfaceAlt },
            ]}
          >
            <Text style={[
              styles.chipLabel,
              { color: active ? '#ffffff' : c.text, fontWeight: active ? '600' : '500' },
            ]}>
              {it.label}
            </Text>
            {it.sub ? (
              <Text style={[
                styles.chipSub,
                { color: active ? 'rgba(255,255,255,0.85)' : c.textSec },
              ]}>
                {it.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerSide: { minWidth: 60 },
  back: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 20 },
  heading: { padding: 16, borderRadius: 14, gap: 4 },
  headingText: { fontSize: 18, fontWeight: '700' },
  headingSub: { fontSize: 13, lineHeight: 18 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingLeft: 4,
    letterSpacing: 0.6,
  },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentLabel: { fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 64,
  },
  chipLabel: { fontSize: 14 },
  chipSub: { fontSize: 11, marginTop: 2 },
  hint: { fontSize: 11, lineHeight: 16, paddingLeft: 4, marginTop: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  nameInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  nameSuffix: { fontSize: 14, fontWeight: '500' },
  trimRow: { flexDirection: 'row', borderRadius: 10, padding: 8, gap: 8 },
  trimCol: { flex: 1, paddingHorizontal: 8, paddingVertical: 4 },
  trimLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  trimInput: { fontSize: 16, paddingVertical: 6 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  toggleLabel: { fontSize: 15, fontWeight: '500' },
  estimate: { padding: 14, borderRadius: 12, gap: 8 },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  estimateLabel: { fontSize: 13 },
  estimateValue: { fontSize: 16, fontWeight: '600' },
  cta: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  disclaimer: { fontSize: 12, textAlign: 'center', paddingHorizontal: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  link: { fontSize: 16, fontWeight: '600' },
});
