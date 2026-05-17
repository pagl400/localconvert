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

interface ExpoPdfTextModuleType extends ExpoNativeModule {
  extractText(uri: string, renderImages: boolean): Promise<ExtractResult>;
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

export type { ExtractedPage, ExtractResult };
