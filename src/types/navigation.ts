import type { ConversionVariant } from './conversion';

export type RootStackParamList = {
  ModePicker: undefined;
  Tabs: undefined;
  PhotoPicker: undefined;
  TargetFormat: { fileId: string };
  Options: { fileId: string; targetFormat: string; variant?: ConversionVariant };
  Progress: { jobId: string };
  Result: { jobId: string };
};

export type TabsParamList = {
  Convert: undefined;
  History: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
