import { requireNativeModule, NativeModule as ExpoNativeModule } from 'expo';

interface ExtractedPage {
  page: number;
  text: string;
}

interface ExtractResult {
  title: string | null;
  pageCount: number;
  pages: ExtractedPage[];
}

interface ExpoPdfTextModuleType extends ExpoNativeModule {
  extractText(uri: string): Promise<ExtractResult>;
}

const ExpoPdfText: ExpoPdfTextModuleType = requireNativeModule('ExpoPdfText');

export async function extractPdfText(uri: string): Promise<ExtractResult> {
  return ExpoPdfText.extractText(uri);
}

export type { ExtractedPage, ExtractResult };
