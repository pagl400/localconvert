import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_AUTO_CLEAN_TEMP,
  DEFAULT_KEEP_HISTORY,
  DEFAULT_QUALITY,
  HISTORY_LIMIT,
} from '../constants';
import type { HistoryEntry, Quality } from '../types/conversion';

export type Theme = 'system' | 'light' | 'dark';

interface AppState {
  theme: Theme;
  defaultQuality: Quality;
  keepHistory: boolean;
  autoCleanTemp: boolean;
  history: HistoryEntry[];

  setTheme: (t: Theme) => void;
  setDefaultQuality: (q: Quality) => void;
  setKeepHistory: (v: boolean) => void;
  setAutoCleanTemp: (v: boolean) => void;
  addHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'system',
      defaultQuality: DEFAULT_QUALITY,
      keepHistory: DEFAULT_KEEP_HISTORY,
      autoCleanTemp: DEFAULT_AUTO_CLEAN_TEMP,
      history: [],

      setTheme: (t) => set({ theme: t }),
      setDefaultQuality: (q) => set({ defaultQuality: q }),
      setKeepHistory: (v) => set({ keepHistory: v }),
      setAutoCleanTemp: (v) => set({ autoCleanTemp: v }),
      addHistory: (entry) =>
        set((s) =>
          s.keepHistory
            ? { history: [entry, ...s.history].slice(0, HISTORY_LIMIT) }
            : { history: s.history },
        ),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'localconvert-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({
        theme: s.theme,
        defaultQuality: s.defaultQuality,
        keepHistory: s.keepHistory,
        autoCleanTemp: s.autoCleanTemp,
        history: s.history,
      }),
    },
  ),
);
