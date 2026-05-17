export type RootStackParamList = {
  Tabs: undefined;
  TargetFormat: { fileId: string };
  Options: { fileId: string; targetFormat: string; variant?: 'plain' | 'styled' };
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
