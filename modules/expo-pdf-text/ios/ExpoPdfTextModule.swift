import ExpoModulesCore
import PDFKit

public class ExpoPdfTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPdfText")

    AsyncFunction("extractText") { (uri: String) -> [String: Any] in
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
        let pageText = doc.page(at: index)?.string ?? ""
        pages.append([
          "page": index + 1,
          "text": pageText.trimmingCharacters(in: .whitespacesAndNewlines)
        ])
      }
      let title = doc.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String
      return [
        "title": title ?? NSNull(),
        "pageCount": doc.pageCount,
        "pages": pages
      ]
    }
  }
}
