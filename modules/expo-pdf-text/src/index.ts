import { requireNativeModule, NativeModule } from 'expo';

interface ExtractedPage {
  page: number;
  text: string;
}

interface ExtractResult {
  title: string | null;
  pageCount: number;
  pages: ExtractedPage[];
}

interface ExpoPdfTextModuleType extends NativeModule {
  extractText(uri: string): Promise<ExtractResult>;
}

const ExpoPdfText: ExpoPdfTextModuleType = requireNativeModule('ExpoPdfText');

export async function extractPdfText(uri: string): Promise<ExtractResult> {
  return ExpoPdfText.extractText(uri);
}

export type { ExtractedPage, ExtractResult };
