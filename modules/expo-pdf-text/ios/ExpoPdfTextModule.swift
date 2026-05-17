import ExpoModulesCore
import PDFKit
import UIKit

public class ExpoPdfTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPdfText")

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
