# Test fixtures

These files exist so anyone (including future-you) can reproduce the
conversions that have been verified to work. Two ways to use them:

1. **Automated** — run `pnpm test:converters` from the repo root.
2. **In the app on your iPhone** — copy these files to the device and pick them
   from the document picker.

## What's in here

| File | Source / License | Purpose |
|------|------------------|---------|
| `pdf-image-only.pdf` | W3C `dummy.pdf` ([source](https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf)) | Triggers the **image-only** branch of the PDF converter (3 stray words on the page → renders as JPEG, no garbled OCR-like text output). |
| `pdf-text-multipage.pdf` | css4.pub USENIX paper example ([source](https://css4.pub/2015/usenix/example.pdf)) | A 3-page paper with real prose. Triggers the **text** branch on every page; expect clean paragraph extraction. |
| `sample.docx` | Calibre demo.docx ([source](https://calibre-ebook.com/downloads/demos/demo.docx)) | DOCX with headings, tables, lists, footnotes, **and embedded images**. Verifies the mammoth pipeline plus `images.dataUri` embedding. |
| `sample.jpg` | Generated synthetically (see `tests/scripts/build-fixtures.mjs`) | Tests **JPG → PDF** via `pdf-lib`. |
| `sample.xlsx` | Generated synthetically | 3 sheets including formulas. Tests **XLSX → CSV / JSON / HTML / XLSX** (SheetJS). |
| `sample.epub` | Generated synthetically | Minimal 2-chapter EPUB with one inlined SVG cover. Tests **EPUB → HTML** stitching and the image-rewrite pass used when exporting EPUB → PDF. |

Total size: under 2 MB.

The generated fixtures (`sample.jpg`, `sample.xlsx`, `sample.epub`) can be
re-built any time with:

```bash
node tests/scripts/build-fixtures.mjs
```

The downloaded fixtures (`pdf-image-only.pdf`, `pdf-text-multipage.pdf`,
`sample.docx`) are kept as-is so the test results stay deterministic. If you
need to refresh them, the URLs are in the table above.

## Expected results per fixture

### `pdf-image-only.pdf` → HTML
- Heuristic classifies the single page as **IMAGE-ONLY** (3 words found).
- HTML output contains a `<section class="page">` with one `<img class="page-render" src="data:image/jpeg;base64,…">` and **no** `<p>` tags. No paragraph text is dumped.

### `pdf-text-multipage.pdf` → HTML
- All 3 pages classified as **TEXT** (389 / 351 / 99 words).
- HTML output contains 3 `<section>` elements with `<p class="line">` per source line. **No** rendered page image.

### `sample.docx` → HTML — **two variants**

The app surfaces **HTML (clean)** and **HTML (styled)** as separate cards when
the source is a DOCX. The test harness produces one file per variant:

- `tests/output/sample.docx.plain.html` — **HTML (clean)** via mammoth with
  a style map. 17 headings, 6 tables, 4 inlined images, ToC entries styled,
  no inline colors/highlights/font sizes. Best for downstream tools.
- `tests/output/sample.docx.styled.html` — **HTML (styled)** via our custom
  jszip + fast-xml-parser renderer. Same 17 headings + 6 tables + 4 images
  PLUS preserved per-run formatting:
  - **51** inline `color:#…` declarations
  - **3** `background-color:#…` highlights / shading
  - **39** `text-decoration:underline` runs (single / double / wavy variants kept)
  - **4** custom `font-family:` runs (Ubuntu, monospace, etc.)
  - **241** explicit `font-size:` declarations in pt
  - **6** lists (bulleted and numbered) properly grouped from `w:numPr`
  - Table cell shading from `w:shd` preserved as inline `background-color`
  - Inline images sized in points from `wp:extent` EMU values
- Both files have `<body contenteditable="true">` so they're directly editable
  in any browser.

### `sample.jpg` → PDF
- 1-page PDF, page size = image size in points (320×200 pt).
- Title metadata = "LocalConvert test image".
- File size is close to the original JPG (no re-encoding overhead).

### `sample.epub` → HTML (via the PDF pipeline)
- 2 chapters stitched in spine order.
- The `<img src="cover.svg">` reference is rewritten to a base64 SVG data URI so it renders in print/WebView contexts.

### `sample.xlsx` → CSV / JSON / HTML
- Sheets: `Sales`, `Monthly`, `Notes`.
- CSV preserves rows (`Espresso,12,2.5,…`).
- HTML output contains a real `<table>` per sheet.

## Running the in-app smoke test

The most reliable way to verify on a real device:

1. **Get the files onto your iPhone** — quickest: AirDrop them from this Mac.
   From the repo root:
   ```bash
   open test-fixtures/
   ```
   Then drag any file onto the AirDrop sheet, send to your iPhone. They'll
   land in the Files app → "Downloads".

2. **Open LocalConvert**, tap **Convert → Pick a file**, navigate to Files →
   Downloads, and pick the fixture you want to test.

3. **Verify against the table above.** A few quick sanity checks:
   - `pdf-image-only.pdf` → HTML: open the resulting `.html` in Safari. You should see one large rendered page image and zero garbled text.
   - `pdf-text-multipage.pdf` → HTML: open the resulting `.html`. You should see 3 sections of clean paragraphs and zero page-render images.
   - `sample.jpg` → PDF: the resulting `.pdf` should preview as a single page that exactly matches the JPG.
   - `sample.docx` → HTML: open in Safari. Try editing the text — the page should be writable thanks to `contenteditable="true"`.

## Where the test runners live

- **`tests/run-converters.mjs`** — Node test harness. Runs the pure-JS portions of every converter (mammoth, pdf-lib, jszip, xlsx) against these fixtures and asserts on output shape. Writes generated artifacts to `tests/output/` for manual inspection. Invoked via `pnpm test:converters`.
- **`tests/scripts/test-pdf.swift`** — Standalone CLI inspector that mirrors the production iOS heuristic (`PDFKit` text extraction + word-count classification + page rendering to JPEG). Useful for verifying any PDF the app will encounter without needing to install on a device.
  ```bash
  swift tests/scripts/test-pdf.swift test-fixtures/pdf-text-multipage.pdf
  ```
- **`tests/scripts/build-fixtures.mjs`** — Regenerates the synthetic fixtures (jpg/xlsx/epub) from scratch.

## Adding more fixtures

Drop files into `test-fixtures/`, prefer:

- **Permissive licenses** (W3C, public domain, CC0, your own work).
- **Small files** — under ~500 KB per fixture, ideally generated by a script
  in `tests/scripts/` rather than redistributed.
- **Documented expectations** in this README's "Expected results" section.
