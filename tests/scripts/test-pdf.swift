// Command-line PDF inspector that mirrors the production heuristic from
// modules/expo-pdf-text/ios/ExpoPdfTextModule.swift and src/services/
// converters/pdf.ts.
//
// Usage: swift tests/scripts/test-pdf.swift <pdf-path> [<pdf-path>...]
//
// For each page it prints char count, word count, and whether the page would
// be classified as IMAGE-ONLY by the in-app heuristic (< 8 words of ≥2 letters).
// It also renders each page to a JPEG in /tmp and reports the size, exercising
// the rendering path the production module uses.

import PDFKit
import AppKit
import Foundation

func render(_ page: PDFPage) -> Data? {
  let bounds = page.bounds(for: .mediaBox)
  if bounds.width <= 0 || bounds.height <= 0 { return nil }
  let maxEdge: CGFloat = 1400
  let longest = max(bounds.width, bounds.height)
  let scale: CGFloat = min(2.0, max(1.0, maxEdge / longest))
  let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)

  let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(size.width),
    pixelsHigh: Int(size.height),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  )!
  let ctx = NSGraphicsContext(bitmapImageRep: bitmap)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = ctx
  let cg = ctx.cgContext
  cg.setFillColor(NSColor.white.cgColor)
  cg.fill(CGRect(origin: .zero, size: size))
  cg.scaleBy(x: scale, y: scale)
  cg.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
  page.draw(with: .mediaBox, to: cg)
  NSGraphicsContext.restoreGraphicsState()

  return bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.72])
}

// Mirrors `countWords` in src/services/converters/pdf.ts: any unicode letter
// run of length >= 2.
func countWords(_ text: String) -> Int {
  var count = 0
  var current = ""
  for char in text.unicodeScalars {
    if CharacterSet.letters.contains(char) {
      current.append(Character(char))
    } else {
      if current.count >= 2 { count += 1 }
      current = ""
    }
  }
  if current.count >= 2 { count += 1 }
  return count
}

let IMAGE_ONLY_WORD_THRESHOLD = 8

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else {
  print("usage: test-pdf <pdf-path> [<pdf-path>...]")
  exit(2)
}

var hadError = false
for arg in args {
  let url = URL(fileURLWithPath: arg)
  print("\n=== \(url.lastPathComponent) ===")
  guard let doc = PDFDocument(url: url) else {
    print("  FAIL: cannot open")
    hadError = true
    continue
  }
  print("  Pages: \(doc.pageCount)")
  if let title = doc.documentAttributes?[PDFDocumentAttribute.titleAttribute] {
    print("  Title: \(title)")
  }
  for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let text = page.string ?? ""
    let chars = text.count
    let words = countWords(text)
    let isImageOnly = words < IMAGE_ONLY_WORD_THRESHOLD
    let img = render(page)
    print("  Page \(i + 1): \(chars) chars, \(words) words → \(isImageOnly ? "IMAGE-ONLY" : "TEXT") | rendered \(img?.count ?? 0) bytes")
    if chars > 0 && chars < 400 {
      let cleaned = text.replacingOccurrences(of: "\n", with: " ⏎ ")
      print("    Text: \(cleaned)")
    } else if chars > 0 {
      let preview = String(text.prefix(120)).replacingOccurrences(of: "\n", with: " ⏎ ")
      print("    Text preview: \(preview)…")
    }
  }
}

exit(hadError ? 1 : 0)
