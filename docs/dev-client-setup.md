---
title: Development build setup
layout: default
permalink: /dev-client/
---

# Setting up a development build (for Phase 3 features)

LocalConvert currently ships everything that runs in **Expo Go** — image,
text, document and spreadsheet conversion all happen in pure JavaScript
on the device.

A few formats need code that can only run from a development build
(Expo Dev Client) because they pull in native libraries:

| Feature | Native lib needed | Why |
|---|---|---|
| Audio (MP3/WAV/AAC/FLAC/OGG/M4A) | `ffmpeg-kit-react-native` (or successor) | Codec decoding/encoding |
| Video (MP4/MOV/MKV/WebM) | `ffmpeg-kit-react-native` | Codec decoding/encoding |
| PDF text extraction (robust) | Native PDFKit (iOS) / PdfRenderer (Android) wrapper | pdfjs-dist works in JS but is fragile in Hermes |
| OCR (image → text) | `tesseract.js` (heavy, needs Dev Client) | OCR model |

## Steps

```bash
# 1. install dev-client + the prebuild tooling
pnpm dlx expo install expo-dev-client

# 2. one-time native project generation
pnpm dlx expo prebuild

# 3. run on a device (requires Xcode for iOS, Android Studio for Android)
pnpm ios     # or
pnpm android
```

After `expo prebuild`, you get an `/ios` and `/android` folder. These are
ignored from git per `.gitignore`. They get regenerated whenever you change
the app config.

## Adding FFmpeg

```bash
pnpm add ffmpeg-kit-react-native@<latest>
pnpm dlx expo prebuild --clean
pnpm ios   # or android
```

`ffmpeg-kit-react-native` was archived by its original maintainer in
January 2025. Check the npm tags for a community-maintained fork before
pinning a version.

Once installed, replace the stubs in `src/services/converters/audio.ts`
and `src/services/converters/video.ts` (to be added) with `FFmpegKit.execute(...)`
calls.

## Adding native PDF

The simplest path is a small Expo Modules API module that wraps
- iOS: `PDFKit.PDFDocument` → `string(by:)` for page text
- Android: `android.graphics.pdf.PdfRenderer` (limited, no text extraction
  built-in — would need a third-party Java/Kotlin lib like `iText` or
  `pdfbox-android`)

For now, the in-repo `pdf.ts` uses `pdfjs-dist` directly with worker
disabled. It works for most PDFs in Expo Go; complex or scanned PDFs
(needs OCR) will need the native + tesseract approach.
