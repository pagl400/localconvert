import { requireNativeModule, NativeModule as ExpoNativeModule } from 'expo';

interface ExtractedPage {
  page: number;
  text: string;
  imageBase64: string | null;
  imageWidth?: number;
  imageHeight?: number;
}

interface ExtractResult {
  title: string | null;
  pageCount: number;
  pages: ExtractedPage[];
}

interface OcrPage {
  page: number;
  text: string;
}

interface OcrResult {
  pageCount: number;
  pages: OcrPage[];
}

interface ExpoPdfTextModuleType extends ExpoNativeModule {
  extractText(uri: string, renderImages: boolean): Promise<ExtractResult>;
  ocrPdf(uri: string, languages: string[]): Promise<OcrResult>;
}

const ExpoPdfText: ExpoPdfTextModuleType = requireNativeModule('ExpoPdfText');

export interface ExtractOptions {
  renderImages?: boolean;
}

export async function extractPdfText(
  uri: string,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  return ExpoPdfText.extractText(uri, options.renderImages === true);
}

// Runs Apple Vision OCR over every PDF page and returns one entry per page.
// Pass language codes like ['de-DE', 'en-US']; iOS will pick the best match.
export async function ocrPdfPages(
  uri: string,
  languages: string[] = ['de-DE', 'en-US'],
): Promise<OcrResult> {
  return ExpoPdfText.ocrPdf(uri, languages);
}

export type { ExtractedPage, ExtractResult, OcrPage, OcrResult };
