---
title: Development build setup
layout: default
permalink: /dev-client/
---

# Dev Client setup — everything in the app, no server

The "Dev Client" path doesn't introduce any server. It just swaps the
generic **Expo Go** wrapper for a **local custom build of LocalConvert**
that includes additional native libraries (FFmpeg, native PDF, etc.).
All conversion still runs on the device. No upload, no network, no
data ever leaves the phone.

The trade-off vs Expo Go:

- One-time local build via Xcode / Android Studio (a few minutes).
- After that, normal hot-reload dev loop is the same.
- Required to support audio, video, OCR, real PDF text extraction.

## Prerequisites (you already have these)

- Xcode 26+ with command-line tools.
- CocoaPods (`pod` on `PATH`).
- Android Studio + SDK with `ANDROID_HOME` set (only needed if you want to build for Android).
- Node 22+ (you're on Node 26).

## First-time build

```bash
cd ~/workspace/localconvert

# (1) Generate the native iOS/Android project folders. Idempotent —
#     re-run whenever you add/remove a native module.
pnpm prebuild

# (2) Build and install on the iOS Simulator (auto-runs `pod install`).
pnpm ios

# Android equivalent:
pnpm android
```

`pnpm ios` opens the dev client on your simulator. Metro is started
automatically. After this you can iterate as usual with `pnpm start`
(now defaulting to `--dev-client` mode, so the QR code points the dev
client and not Expo Go).

## Adding a native module

```bash
# (1) Install the package.
pnpm add some-native-lib

# (2) Re-generate the native projects so its config plugin is applied.
pnpm prebuild:clean

# (3) Rebuild and run.
pnpm ios
```

`pnpm prebuild:clean` wipes `/ios` and `/android` and regenerates them.
These folders are gitignored — we follow the "Continuous Native
Generation" pattern, so nothing native is committed.

## Planned native additions (Phase 3)

| Feature | Package candidate | Notes |
|---|---|---|
| Audio (MP3/WAV/AAC/FLAC) | A community fork of `ffmpeg-kit-react-native` | Original archived Jan 2025 |
| Video (MP4/MOV/MKV) | Same FFmpeg lib | |
| PDF text extraction | Custom Expo Module wrapping iOS `PDFKit` + Android `PdfBox` | Cleanest path |
| OCR (scanned PDFs / images → text) | `react-native-tesseract-ocr` | Adds model assets |

Once we install each lib, the corresponding stub in
`src/services/converters/` switches from "not available" to a real
implementation. The UI (filter, Progress screen) already supports this
seam — no changes needed there.

## Troubleshooting

- `pod install` complains about Ruby — Xcode usually ships its own Ruby
  but a system Ruby mismatch can break it. `sudo gem install cocoapods`
  with the right Ruby fixes it.
- After upgrading an Expo SDK, run `pnpm prebuild:clean` to regenerate
  templates.
- `Metro` already running on `:8081`? Kill it: `lsof -ti:8081 | xargs kill -9`.
