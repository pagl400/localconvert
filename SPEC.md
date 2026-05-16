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

### Phase 2 — PDF (✅ in this repo) + audio
- **PDF text extraction** via `unpdf` (serverless build of PDF.js, pure JS — runs in Expo Go).
  Supports PDF → TXT, PDF → MD, PDF → HTML, PDF → JSON (with page structure).
- Audio (planned, needs Dev Client): FFmpeg (`ffmpeg-kit-react-native` or successor) for MP3, WAV, AAC, FLAC, M4A, OGG.
- PDF write operations (merge / split / compress / DOCX) deferred to Phase 3 — they need PDFium/Ghostscript native.

### Phase 3 — Video & Office documents
- FFmpeg for MP4/MOV/MKV/WebM (with resolution/bitrate options).
- Pandoc subset for DOCX ↔ ODT ↔ MD ↔ HTML ↔ TXT.
- EPUB / MOBI for e-books.

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
