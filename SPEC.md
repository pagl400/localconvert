# Build Specification: LocalConvert (React Native / Expo)

> **Note for Claude Code:** This file is the single source of truth for the project. Read it in full before starting. Work in phases, ask before leaving a phase, and make git commits in meaningful units (one commit = one completed logical step, not one commit per file).

---

## 1. Project Overview

**What:** Native mobile app for converting arbitrary file formats locally.
**Platforms:** iOS and Android (one codebase via React Native + Expo).
**Distribution:** Apple App Store and Google Play Store.
**Monetization:** One-time purchase (price tier to be decided in-store — no ads). An optional free tier may apply limits (e.g. max file size, no batch).
**Backend:** None. All conversions happen on the device. The app requires no network permissions for its core function.
**Target users:** Creators, office users, privacy-conscious people, journalists — anyone who wants to convert files without uploading them somewhere.

---

## 2. Tech Stack

Use the latest stable version unless noted otherwise.

| Component | Choice | Reason |
|---|---|---|
| Runtime | Node.js LTS (v20+) | — |
| Framework | **Expo (managed workflow)** | No native setup needed, EAS Build for store builds |
| Language | **TypeScript** (strict mode) | Type safety, self-documenting |
| Navigation | `@react-navigation/native` + native-stack + bottom-tabs | De-facto standard |
| State management | **Zustand** + `zustand/middleware/persist` | Small, no boilerplate, persists via AsyncStorage |
| Storage | `@react-native-async-storage/async-storage` | Settings and history |
| File picker | `expo-document-picker` | Cross-platform picker |
| File system | `expo-file-system` | Sandbox access, temp directory |
| Image picker | `expo-image-picker` (optional) | Direct photo access |
| Share | `expo-sharing` | Platform share sheet as output target |
| Icons | Inline SVG via `react-native-svg` | Minimal asset footprint |
| Date | `date-fns` | Tree-shakeable |
| Linting | ESLint + Prettier (Expo defaults) | — |

**Conversion engine (planned, separate phase):**

| Library | Purpose | Planned integration |
|---|---|---|
| FFmpeg (mobile build) | Video, audio, GIF | `ffmpeg-kit-react-native` via Expo dev client |
| libvips / Sharp-native | Images | Native module via Expo Modules API |
| Ghostscript / PDFium | PDF processing | Native bridge |
| Pandoc / WASM subset | Documents | WASM in React Native via JSI |
| Tesseract | OCR | `tesseract.js` or native |

**Deliberately NOT used:**
- Redux/MobX (Zustand is enough)
- Axios (no network in the hot path)
- Cloud SDKs of any kind (Firebase, Sentry, Amplitude, …)

---

## 3. App Structure

```
App.tsx                 — Root + navigation (stack + bottom tabs)
index.ts                — Expo entry
app.json / eas.json     — Build configuration
src/
  components/           — Atomic UI building blocks
  screens/              — One file per screen
  services/             — File picker, converter stub, later: native bindings
  store/                — Zustand stores (persisted + ephemeral)
  theme/                — iOS/Android-adaptive palettes + useTheme()
  types/                — Navigation, conversion
  utils/                — Format detection, bytes/duration formatting
docs/                   — Jekyll site with privacy / imprint
```

---

## 4. Conversion Pipeline

```
Input file (via picker or share intent)
  ↓
Format detection (extension + MIME type)
  ↓
Pick target format (screen: TargetFormat)
  ↓
Options (quality, file name) (screen: Options)
  ↓
Conversion (screen: Progress)  ← stubbed in MVP, replaced by native engine
  ↓
Result (screen: Result) → Share / Save / Convert another
```

The MVP ships a **stub converter** (`src/services/converter.ts`) that simulates the flow. Once the native libraries (FFmpeg, libvips, etc.) are wired in, `runConversion()` is replaced by the respective engine.

---

## 5. Privacy Guarantees

- No network requests for conversions.
- No analytics SDKs.
- No ads.
- No persistent storage of foreign files outside the app sandbox.
- History is optional and fully local.

These guarantees are documented in the app (privacy badge in the top bar), in the Settings screen, and on the Jekyll site.

---

## 6. Roadmap

### Phase 1 — Shell + first real converters (✅ in this repo)
- Navigation, tabs, screens (Convert, TargetFormat, Options, Progress, Result, History, Settings).
- Theme system (iOS/Android-adaptive, light/dark/system).
- File picker, format routing, share-sheet output.
- History (local, optional).
- **Real image conversion** (JPG ↔ PNG ↔ WebP, HEIC → JPG/PNG/WebP) via `expo-image-manipulator`.
- **Real text/data conversion** (MD ↔ HTML, HTML/MD → TXT, TXT → MD/HTML, JSON ↔ CSV) in pure JS via `marked` + `turndown`.
- Unsupported pairs surface a clear error and are filtered out of the target list — no misleading fake outputs.

### Phase 2 — Office formats + EPUB + XML (✅ in this repo)
- **DOCX** via `mammoth`: DOCX → TXT / MD / HTML.
- **XLSX / XLS / ODS** via SheetJS: spreadsheets → CSV / JSON / HTML / XLSX.
- **YAML** via `yaml`: YAML ↔ JSON.
- **EPUB** via `jszip` + a small hand-rolled OPF parser: EPUB → TXT / MD / HTML.
- **XML** via `fast-xml-parser`: XML ↔ JSON, plus XML ↔ YAML via the JSON edges.
- All run pure JS in Expo Go — no Dev Client required.

PDF support was attempted twice (via `unpdf` and then `pdfjs-dist` directly)
and both paths broke down in Hermes: `unpdf` hit Metro's `exports`-map
resolution for its bundled PDF.js subpath, and `pdfjs-dist` mandates a real
Worker context that Expo Go can't provide. PDF therefore moves to Phase 3.

### Phase 3 — PDF + native audio/video (in repo, needs Dev Client)
Two local Expo Modules under `modules/`:

- **`modules/expo-pdf-text`** — wraps iOS PDFKit (`PDFDocument.string`)
  for text extraction. Android stubs out cleanly until PdfBox-Android
  is wired. JS side: `pdf.ts` produces TXT / MD / HTML / JSON outputs.
- **`modules/expo-media-convert`** — wraps Apple AVFoundation:
  - `AVAssetReader` + `AVAssetWriter` for audio conversion to **M4A
    (AAC), WAV, AIFF, CAF**. Sources: MP3, WAV, FLAC, AAC, OGG, M4A,
    OPUS, AIFF (iOS' CoreAudio can read these).
  - `AVAssetExportSession` for video conversion to **MP4, MOV, M4V**,
    plus audio extraction from any video to the audio targets above.

The scope is narrower than FFmpeg (iOS can't encode MP3/FLAC/OGG/OPUS
out of the box and only writes a small set of video containers), but
it ships with the OS, has no third-party CDN dependency, and is
licensed under Apple's own terms. FFmpeg's archived binaries can no
longer be downloaded reliably, so the AVFoundation route is the more
durable choice.

### Phase 4 — Nice-to-haves
- **FFmpeg fallback** (community fork) for the remaining audio/video
  encoder gaps (MP3 / FLAC / OGG / OPUS / MKV / WebM / GIF).
- **OCR** via Tesseract for scanned PDFs / images → text.
- **PDF write-back** (merge/split/compress) once a robust native lib is
  picked.
- **Android PDF text** via PdfBox-Android.
- **Android audio/video** via MediaCodec wrappers.

### Phase 4 — Power Features
- Batch conversion.
- Presets (e.g. "Instagram Video", "WhatsApp Image").
- Metadata editor.
- iOS Shortcuts / Android Intents for automation.

### Phase 5 — Nice to have
- 3D models, fonts, tables, archives.
- Widgets / Quick Tiles.

---

## 7. Conventions

- TypeScript strict.
- Conventional Commits (`feat:`, `fix:`, `chore:`, …).
- One component / one screen per file.
- Comments explain "why", not "what".
- No external logos / brands in the app. Own logo via inline SVG.
- Theme values only from `useTheme()`. No hardcoded colors in screens.

---

*Version 1.0 — May 2026*
