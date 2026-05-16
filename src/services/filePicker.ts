import * as DocumentPicker from 'expo-document-picker';

import type { SelectedFile } from '../types/conversion';
import { detectFormat, getExtension } from '../utils/formats';

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function pickFile(): Promise<SelectedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: '*/*',
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const name = asset.name ?? 'file';
  const format = detectFormat(name, asset.mimeType);
  return {
    id: uid(),
    name,
    uri: asset.uri,
    size: asset.size ?? 0,
    mime: asset.mimeType ?? null,
    ext: getExtension(name) || format.ext,
    format,
    pickedAt: Date.now(),
  };
}
