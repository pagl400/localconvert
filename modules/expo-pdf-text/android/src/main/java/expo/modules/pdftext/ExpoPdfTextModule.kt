package expo.modules.pdftext

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.CodedException

class ExpoPdfTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoPdfText")

    AsyncFunction("extractText") { _: String, _: Boolean ->
      // Android lacks a native text-extraction API on PdfRenderer. A real
      // implementation can drop in iText / PdfBox-Android here. For now we
      // surface a clear error so the UI shows the right message.
      throw CodedException(
        "PDF_TEXT_UNAVAILABLE_ANDROID",
        "PDF text extraction on Android needs PdfBox-Android; not yet wired up."
      )
    }
  }
}
