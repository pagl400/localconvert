import ExpoModulesCore
import PDFKit
import UIKit
import Vision

public class ExpoPdfTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPdfText")

    // OCR every page via Vision. Returns the same shape as extractText (per
    // page), so the JS side can interleave OCR + native text-layer output.
    AsyncFunction("ocrPdf") { (uri: String, languages: [String]) -> [String: Any] in
      let cleanUri = uri.hasPrefix("file://") ? uri : "file://\(uri)"
      guard let url = URL(string: cleanUri), let doc = PDFDocument(url: url) else {
        throw NSError(
          domain: "ExpoPdfText",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Could not open PDF at \(uri)."]
        )
      }
      var pages: [[String: Any]] = []
      for index in 0..<doc.pageCount {
        guard let page = doc.page(at: index) else { continue }
        var text = ""
        if let image = ExpoPdfTextModule.renderPage(page), let cg = image.cgImage {
          text = ExpoPdfTextModule.recognizeText(cgImage: cg, languages: languages)
        }
        pages.append([
          "page": index + 1,
          "text": text.trimmingCharacters(in: .whitespacesAndNewlines),
        ])
      }
      return [
        "pageCount": doc.pageCount,
        "pages": pages,
      ]
    }

    AsyncFunction("extractText") { (uri: String, renderImages: Bool) -> [String: Any] in
      let cleanUri = uri.hasPrefix("file://") ? uri : "file://\(uri)"
      guard let url = URL(string: cleanUri), let doc = PDFDocument(url: url) else {
        throw NSError(
          domain: "ExpoPdfText",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Could not open PDF at \(uri)."]
        )
      }
      var pages: [[String: Any]] = []
      for index in 0..<doc.pageCount {
        let pdfPage = doc.page(at: index)
        let pageText = pdfPage?.string ?? ""
        var entry: [String: Any] = [
          "page": index + 1,
          "text": pageText.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        if renderImages, let page = pdfPage,
           let image = ExpoPdfTextModule.renderPage(page),
           let jpeg = image.jpegData(compressionQuality: 0.72) {
          entry["imageBase64"] = jpeg.base64EncodedString()
          entry["imageWidth"] = Int(image.size.width * image.scale)
          entry["imageHeight"] = Int(image.size.height * image.scale)
        } else {
          entry["imageBase64"] = NSNull()
        }
        pages.append(entry)
      }
      let title = doc.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String
      return [
        "title": title ?? NSNull(),
        "pageCount": doc.pageCount,
        "pages": pages
      ]
    }
  }

  // Synchronous Vision OCR. Vision's request is async-callback by default, so we
  // wait on a semaphore, fine on the background queue Expo runs the
  // AsyncFunction on.
  private static func recognizeText(cgImage: CGImage, languages: [String]) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if !languages.isEmpty {
      request.recognitionLanguages = languages
    }
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
      try handler.perform([request])
    } catch {
      return ""
    }
    let observations = request.results ?? []
    let lines: [String] = observations.compactMap { obs in
      obs.topCandidates(1).first?.string
    }
    return lines.joined(separator: "\n")
  }

  // Renders the page to a UIImage. Resolution caps the longer edge to keep
  // the resulting base64 payload reasonable when embedded in HTML/JSON.
  private static func renderPage(_ page: PDFPage) -> UIImage? {
    let bounds = page.bounds(for: .mediaBox)
    if bounds.width <= 0 || bounds.height <= 0 { return nil }
    let maxEdge: CGFloat = 1400
    let longest = max(bounds.width, bounds.height)
    let scale: CGFloat = min(2.0, max(1.0, maxEdge / longest))
    let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)

    let format = UIGraphicsImageRendererFormat()
    format.opaque = true
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    return renderer.image { ctx in
      UIColor.white.setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      let cg = ctx.cgContext
      cg.saveGState()
      cg.translateBy(x: 0, y: size.height)
      cg.scaleBy(x: scale, y: -scale)
      cg.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
      page.draw(with: .mediaBox, to: cg)
      cg.restoreGState()
    }
  }
}
