import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

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

// Photo Library / Camera Roll picker. Opens the system PHPicker which doesn't
// require an explicit permission grant on iOS 14+ (Apple's privacy design:
// the user only "shares" a single asset, the app never sees the rest of the
// library). The system still uses NSPhotoLibraryUsageDescription as the
// prompt copy when full-library access is requested elsewhere.
export type PhotoPickerKind = 'photo' | 'video' | 'all';

export async function pickFromPhotos(kind: PhotoPickerKind = 'all'): Promise<SelectedFile | null> {
  const mediaTypes: ImagePicker.MediaType[] =
    kind === 'photo' ? ['images'] : kind === 'video' ? ['videos'] : ['images', 'videos'];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;

  // ImagePickerAsset uses different field names than DocumentPickerAsset.
  // Derive a usable filename: fileName when present, otherwise from URI.
  const name = asset.fileName ?? deriveName(asset.uri, asset.type ?? null);
  const format = detectFormat(name, asset.mimeType ?? null);
  return {
    id: uid(),
    name,
    uri: asset.uri,
    size: asset.fileSize ?? 0,
    mime: asset.mimeType ?? null,
    ext: getExtension(name) || format.ext,
    format,
    pickedAt: Date.now(),
  };
}

function deriveName(uri: string, type: string | null): string {
  // Strip query/fragment, take the last path segment.
  const path = uri.split(/[?#]/)[0];
  const last = path.substring(path.lastIndexOf('/') + 1);
  if (last.includes('.')) return last;
  // Fall back to a synthetic name with a reasonable extension.
  const ext = type === 'video' ? 'mov' : 'jpg';
  return `${last || 'photo'}.${ext}`;
}
