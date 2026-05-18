import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useJobStore } from '../store/useJobStore';
import { useTheme } from '../theme/useTheme';
import type { SelectedFile } from '../types/conversion';
import type { RootStackParamList } from '../types/navigation';
import { detectFormat, getExtension } from '../utils/formats';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PhotoPicker'>;

const PAGE_SIZE = 60;
// Grid column count for the thumbnail grid, iPhone screens fit 4 nicely;
// react-native handles the per-cell width automatically.
const COLUMNS = 4;

type PermStatus = 'undetermined' | 'denied' | 'granted-all' | 'granted-limited';

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PhotoPickerScreen() {
  const navigation = useNavigation<Nav>();
  const c = useTheme();
  const addFile = useJobStore((s) => s.addFile);

  const [perm, setPerm] = useState<PermStatus>('undetermined');
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);

  const refreshPermissionAndAssets = useCallback(async () => {
    setLoading(true);
    try {
      let response = await MediaLibrary.getPermissionsAsync();
      if (response.status === 'undetermined') {
        response = await MediaLibrary.requestPermissionsAsync();
      }
      // PermissionResponse has accessPrivileges on iOS: 'all' | 'limited' | 'none'.
      // Cast because the type uses lowercase status strings.
      const access = (response as MediaLibrary.PermissionResponse).accessPrivileges;
      if (response.granted) {
        setPerm(access === 'limited' ? 'granted-limited' : 'granted-all');
      } else {
        setPerm('denied');
      }
      // Reset list state, what we can see may have just changed.
      setAssets([]);
      setEndCursor(undefined);
      setHasNextPage(response.granted);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPermissionAndAssets();
  }, [refreshPermissionAndAssets]);

  const loadMore = useCallback(async () => {
    if (loading || !hasNextPage) return;
    setLoading(true);
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        after: endCursor,
        mediaType: ['photo', 'video'],
        sortBy: ['creationTime'],
      });
      setAssets((prev) => [...prev, ...page.assets]);
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
    } finally {
      setLoading(false);
    }
  }, [endCursor, hasNextPage, loading]);

  // First load after the permission check resolves.
  useEffect(() => {
    if (perm === 'granted-all' || perm === 'granted-limited') {
      void loadMore();
    }
    // intentionally only run on perm change, loadMore is stable per perm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perm]);

  // "Auswahl erweitern", when access is limited, show iOS' system sheet so
  // the user can grant access to more (or fewer) photos. Afterwards we reload
  // the grid against the new permission scope. Wrapped in useCallback so the
  // banner's useMemo doesn't see a fresh identity on every render.
  const expandSelection = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    try {
      await MediaLibrary.presentPermissionsPickerAsync();
    } catch {
      // user cancelled, nothing to do
    }
    await refreshPermissionAndAssets();
  }, [refreshPermissionAndAssets]);

  // Tap on a thumbnail. We resolve the asset's localUri (iCloud-backed assets
  // may need to download here) and then route to the existing TargetFormat
  // flow with a SelectedFile pointing at the on-device URI.
  const pickAsset = async (asset: MediaLibrary.Asset) => {
    if (busyAssetId) return;
    setBusyAssetId(asset.id);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
      const localUri = info.localUri ?? asset.uri;
      const name = info.filename ?? asset.filename ?? 'photo';
      const format = detectFormat(name, null);
      // expo-media-library doesn't expose size; stat the resolved local URI.
      let size = 0;
      try {
        const f = new File(localUri);
        if (f.exists) size = f.size ?? 0;
      } catch {
        // size stays at 0 if the URI scheme isn't filesystem-readable
      }
      const file: SelectedFile = {
        id: uid(),
        name,
        uri: localUri,
        size,
        mime: null,
        ext: getExtension(name) || format.ext,
        format,
        pickedAt: Date.now(),
      };
      addFile(file);
      navigation.replace('TargetFormat', { fileId: file.id });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Konnte das Asset nicht laden.';
      Alert.alert('Auswahl fehlgeschlagen', message);
    } finally {
      setBusyAssetId(null);
    }
  };

  // -------------------- Render --------------------

  const headerNote = useMemo(() => {
    if (perm === 'granted-limited') {
      return (
        <View style={[styles.banner, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.bannerText, { color: c.text }]}>
            Du hast LocalConvert nur Zugriff auf einzelne Fotos erlaubt.
          </Text>
          <Pressable
            onPress={() => void expandSelection()}
            style={({ pressed }) => [
              styles.bannerButton,
              { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Auswahl erweitern"
          >
            <Text style={styles.bannerButtonText}>Auswahl erweitern</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  }, [perm, c, expandSelection]);

  if (perm === 'undetermined' || (perm === 'granted-all' && assets.length === 0 && loading)) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <Header c={c} title="Fotos & Videos" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (perm === 'denied') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <Header c={c} title="Fotos & Videos" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={[styles.deniedTitle, { color: c.text }]}>Foto-Zugriff blockiert</Text>
          <Text style={[styles.deniedText, { color: c.textSec }]}>
            Du hast LocalConvert den Zugriff auf deine Fotos und Videos verweigert. In den
            iOS-Einstellungen kannst du das ändern. Die App lädt nichts hoch.
          </Text>
          <Pressable
            onPress={() => void Linking.openSettings()}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.ctaText}>Einstellungen öffnen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // granted-all or granted-limited with the grid.
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <Header c={c} title="Fotos & Videos" onBack={() => navigation.goBack()} />
      <FlatList
        data={assets}
        keyExtractor={(a) => a.id}
        numColumns={COLUMNS}
        contentContainerStyle={styles.gridContent}
        ListHeaderComponent={headerNote}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void pickAsset(item)}
            style={({ pressed }) => [
              styles.cell,
              { opacity: pressed || busyAssetId === item.id ? 0.5 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Asset ${item.filename ?? item.id}`}
          >
            <Image source={{ uri: item.uri }} style={styles.thumb} />
            {item.mediaType === 'video' ? (
              <View style={styles.videoBadge}>
                <Text style={styles.videoBadgeText}>VIDEO</Text>
              </View>
            ) : null}
            {busyAssetId === item.id ? (
              <View style={styles.thumbOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
          </Pressable>
        )}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading ? (
            <View style={styles.footer}>
              <ActivityIndicator color={c.accent} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.center}>
              <Text style={[styles.deniedText, { color: c.textSec }]}>
                {perm === 'granted-limited'
                  ? 'Keine freigegebenen Fotos. Über "Auswahl erweitern" kannst du welche hinzufügen.'
                  : 'Keine Fotos oder Videos gefunden.'}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

interface HeaderProps {
  c: ReturnType<typeof useTheme>;
  title: string;
  onBack: () => void;
}

function Header({ c, title, onBack }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.headerSide}>
        <Text style={[styles.back, { color: c.accent }]}>Zurück</Text>
      </Pressable>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      <View style={styles.headerSide} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    minHeight: 44,
  },
  headerSide: { minWidth: 70 },
  back: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700' },
  gridContent: { paddingHorizontal: 1, paddingBottom: 24 },
  cell: {
    flex: 1 / COLUMNS,
    aspectRatio: 1,
    padding: 1,
  },
  thumb: { width: '100%', height: '100%', borderRadius: 4, backgroundColor: '#222' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 4,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  videoBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  banner: {
    margin: 12,
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  bannerText: { fontSize: 13, lineHeight: 18 },
  bannerButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bannerButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  footer: { paddingVertical: 20, alignItems: 'center' },
  center: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  deniedTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  deniedText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  cta: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
