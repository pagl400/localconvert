import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

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

// Photo Library / Camera Roll picker. Uses iOS PHPicker (since iOS 14) via
// expo-image-picker, which is permission-less for the picking flow itself —
// the picker UI runs out-of-process and the app only sees the asset the
// user explicitly selects. We still check the media-library permission
// because the underlying API exposes it, and so we can guide the user back
// to Settings when iOS has previously blocked photo access entirely.
export type PhotoPickerKind = 'photo' | 'video' | 'all';

export interface PhotoPickerOutcome {
  file: SelectedFile | null;
  // When iOS-level access is "limited" the user has only granted access to a
  // subset of their library. Callers can surface a hint so the user knows
  // they can expand the selection via Settings.
  limitedAccess?: boolean;
}

export async function pickFromPhotos(
  kind: PhotoPickerKind = 'all',
): Promise<PhotoPickerOutcome> {
  // Step 1: check current permission state.
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();

  // Step 2: if not granted, decide whether to ask or to deep-link to Settings.
  if (!perm.granted) {
    if (perm.canAskAgain) {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (!perm.granted) {
      return new Promise((resolve) => {
        Alert.alert(
          'Foto-Zugriff blockiert',
          'In den iOS-Einstellungen kannst du LocalConvert wieder erlauben, deine Fotos und Videos zu lesen. Die App lädt nichts ins Internet hoch.',
          [
            { text: 'Abbrechen', style: 'cancel', onPress: () => resolve({ file: null }) },
            {
              text: 'Einstellungen öffnen',
              onPress: () => {
                void Linking.openSettings();
                resolve({ file: null });
              },
            },
          ],
          { cancelable: true, onDismiss: () => resolve({ file: null }) },
        );
      });
    }
  }

  // Step 3: launch the picker. PHPicker shows every asset regardless of
  // 'limited' access — that flag only constrains direct PHAsset reads, not
  // the system picker UI itself. We still pass the flag back so the UI can
  // hint at "more rights" when applicable.
  const mediaTypes: ImagePicker.MediaType[] =
    kind === 'photo' ? ['images'] : kind === 'video' ? ['videos'] : ['images', 'videos'];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
  });
  const limitedAccess = perm.accessPrivileges === 'limited';

  if (result.canceled) return { file: null, limitedAccess };
  const asset = result.assets[0];
  if (!asset) return { file: null, limitedAccess };

  const name = asset.fileName ?? deriveName(asset.uri, asset.type ?? null);
  const format = detectFormat(name, asset.mimeType ?? null);
  return {
    file: {
      id: uid(),
      name,
      uri: asset.uri,
      size: asset.fileSize ?? 0,
      mime: asset.mimeType ?? null,
      ext: getExtension(name) || format.ext,
      format,
      pickedAt: Date.now(),
    },
    limitedAccess,
  };
}

// Open iOS Settings → LocalConvert so the user can change photo permissions
// or any other setting. Used both from the "permission blocked" alert and
// from the "limited access" hint after a successful pick.
export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}

function deriveName(uri: string, type: string | null): string {
  const path = uri.split(/[?#]/)[0];
  const last = path.substring(path.lastIndexOf('/') + 1);
  if (last.includes('.')) return last;
  const ext = type === 'video' ? 'mov' : 'jpg';
  return `${last || 'photo'}.${ext}`;
}
