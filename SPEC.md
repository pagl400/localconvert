# Build-Spezifikation: LocalConvert (React Native / Expo)

> **Hinweis für Claude Code:** Diese Datei ist die einzige Quelle der Wahrheit für das Projekt. Lies sie vollständig, bevor du anfängst. Arbeite phasenweise, frage nach, bevor du eine Phase verlässt, und mache Git-Commits in sinnvollen Einheiten (ein Commit = ein abgeschlossener logischer Schritt, nicht ein Commit pro Datei).

---

## 1. Projekt-Überblick

**Was:** Native Mobile-App zur lokalen Konvertierung beliebiger Dateiformate.
**Plattformen:** iOS und Android (eine Codebase via React Native + Expo).
**Distribution:** Apple App Store und Google Play Store.
**Monetarisierung:** Einmaliger Kaufpreis (Pricing-Tier wird später im Store festgelegt — keine Werbung). Free-Tier optional mit Limits (z. B. max. Dateigröße, kein Batch).
**Backend:** Keines. Alle Konvertierungen finden lokal auf dem Gerät statt. Die App benötigt keine Netzwerkberechtigungen für ihre Kernfunktion.
**Ziel-Nutzer:** Kreative, Büro-Nutzer, datenschutzbewusste Personen, Journalisten — alle, die Dateien konvertieren möchten, ohne sie irgendwo hochzuladen.

---

## 2. Tech-Stack

Wenn nicht anders angegeben: jeweils aktuelle stabile Version verwenden.

| Komponente | Wahl | Begründung |
|---|---|---|
| Runtime | Node.js LTS (v20+) | — |
| Framework | **Expo (Managed Workflow)** | Kein natives Setup nötig, EAS Build für Store-Builds |
| Sprache | **TypeScript** (strict mode) | Typsicherheit, Self-Documentation |
| Navigation | `@react-navigation/native` + native-stack + bottom-tabs | De-facto Standard |
| State Management | **Zustand** + `zustand/middleware/persist` | Klein, kein Boilerplate, persistiert via AsyncStorage |
| Storage | `@react-native-async-storage/async-storage` | Einstellungen und Verlauf |
| File Picker | `expo-document-picker` | Plattform-übergreifender Picker |
| File System | `expo-file-system` | Sandbox-Zugriff, Temp-Verzeichnis |
| Image Picker | `expo-image-picker` (optional) | Direkter Zugriff auf Fotos |
| Share | `expo-sharing` | Plattform-Share-Sheet als Ausgabeziel |
| Icons | Inline-SVG via `react-native-svg` | Minimales Asset-Gewicht |
| Datum | `date-fns` | Tree-shakeable |
| Linting | ESLint + Prettier (Expo-Defaults) | — |

**Konvertierungs-Engine (geplant, separate Phase):**

| Bibliothek | Funktion | Geplante Integration |
|---|---|---|
| FFmpeg (mobile build) | Video, Audio, GIF | `ffmpeg-kit-react-native` über Expo Dev-Client |
| libvips / Sharp-native | Bilder | Native Module mit Expo Modules API |
| Ghostscript / PDFium | PDF-Verarbeitung | Native Bridge |
| Pandoc / WASM-Subset | Dokumente | WASM in React Native via JSI |
| Tesseract | OCR | `tesseract.js` oder Native |

**Bewusst NICHT verwendet:**
- Redux/MobX (Zustand reicht)
- Axios (kein Netzwerk im Hot-Path)
- Cloud-SDKs jeder Art (Firebase, Sentry, Amplitude …)

---

## 3. App-Struktur

```
App.tsx                 — Root + Navigation (Stack + Bottom-Tabs)
index.ts                — Expo entry
app.json / eas.json     — Build-Konfiguration
src/
  components/           — Atomare UI-Bausteine
  screens/              — Eine Datei pro Screen
  services/             — File-Picker, Konverter-Stub, später: native Bindings
  store/                — Zustand-Stores (persist + ephemer)
  theme/                — iOS-/Android-adaptive Paletten + useTheme()
  types/                — Navigation, Conversion
  utils/                — Format-Erkennung, Bytes/Dauer-Formatter
docs/                   — Jekyll-Site mit Privacy / Impressum
```

---

## 4. Konvertierungspipeline

```
Eingabe-Datei (über Picker oder Share-Intent)
  ↓
Format-Erkennung (Extension + MIME-Type)
  ↓
Zielformat wählen (Screen: TargetFormat)
  ↓
Optionen (Qualität, Dateiname) (Screen: Options)
  ↓
Konvertierung (Screen: Progress)  ← stubbed in MVP, ersetzt durch native engine
  ↓
Ergebnis (Screen: Result) → Share / Save / Convert another
```

Der MVP enthält einen **Stub-Konverter** (`src/services/converter.ts`), der den Ablauf simuliert. Sobald die nativen Bibliotheken (FFmpeg, libvips usw.) eingebunden sind, wird `runConversion()` durch die jeweilige Engine ersetzt.

---

## 5. Datenschutz-Garantien

- Keine Netzwerkanfragen für Konvertierungen.
- Keine Analytics-SDKs.
- Keine Werbung.
- Keine persistente Speicherung fremder Dateien außerhalb der App-Sandbox.
- Verlauf optional und vollständig lokal.

Diese Garantien werden in der App (Privacy-Badge im Top-Bar), im Settings-Screen und auf der Jekyll-Site dokumentiert.

---

## 6. Roadmap

### Phase 1 — Shell (✅ in diesem Repo)
- Navigation, Tabs, Screens (Convert, TargetFormat, Options, Progress, Result, History, Settings).
- Themen-System (iOS-/Android-adaptiv, hell/dunkel/system).
- File-Picker, Format-Routing, Share-Sheet-Ausgabe.
- Verlauf (lokal, optional).
- Stub-Konverter mit Fortschrittsanzeige.

### Phase 2 — Bild- und Audio-Konvertierung (real)
- libvips/Sharp-native für JPG, PNG, WebP, HEIC, GIF, TIFF.
- FFmpeg für MP3, WAV, AAC, FLAC, M4A, OGG.

### Phase 3 — Video & Dokumente
- FFmpeg für MP4/MOV/MKV/WebM (mit Resolution/Bitrate-Optionen).
- PDFium/Ghostscript für PDF-Operationen.
- Pandoc-Subset für DOCX ↔ MD ↔ HTML ↔ TXT.

### Phase 4 — Power Features
- Batch-Konvertierung.
- Presets (z. B. „Instagram-Video“, „WhatsApp-Bild“).
- Metadaten-Editor.
- iOS Shortcuts / Android Intents für Automatisierung.

### Phase 5 — Nice to have
- 3D-Modelle, Schriften, Tabellen, Archive.
- Widgets / Quick-Tiles.

---

## 7. Konventionen

- TypeScript strict.
- Conventional Commits (`feat:`, `fix:`, `chore:`, …).
- Eine Komponente / ein Screen pro Datei.
- Keine Kommentare über das „Was“, nur über das „Warum“.
- Keine externen Logos / Marken in der App. Eigenes Logo per Inline-SVG.
- Theme-Werte nur aus `useTheme()`. Keine hardcoded Farben in Screens.

---

*Version 1.0 — Mai 2026*
