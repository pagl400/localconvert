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
export type Mode = 'simple' | 'expert';

interface AppState {
  theme: Theme;
  mode: Mode;
  hasSeenModePicker: boolean;
  defaultQuality: Quality;
  keepHistory: boolean;
  autoCleanTemp: boolean;
  history: HistoryEntry[];

  setTheme: (t: Theme) => void;
  setMode: (m: Mode) => void;
  markModePickerSeen: () => void;
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
      mode: 'simple',
      hasSeenModePicker: false,
      defaultQuality: DEFAULT_QUALITY,
      keepHistory: DEFAULT_KEEP_HISTORY,
      autoCleanTemp: DEFAULT_AUTO_CLEAN_TEMP,
      history: [],

      setTheme: (t) => set({ theme: t }),
      setMode: (m) => set({ mode: m }),
      markModePickerSeen: () => set({ hasSeenModePicker: true }),
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
      version: 2,
      migrate: (persisted, fromVersion) => {
        const state = (persisted ?? {}) as Partial<AppState>;
        if (fromVersion < 2) {
          // Pre-existing installs (v1) didn't have a mode picker; treat them as
          // already-onboarded users so we don't surface the picker to people
          // who've been using the app for weeks.
          return { ...state, mode: 'simple', hasSeenModePicker: true } as AppState;
        }
        return state as AppState;
      },
      partialize: (s) => ({
        theme: s.theme,
        mode: s.mode,
        hasSeenModePicker: s.hasSeenModePicker,
        defaultQuality: s.defaultQuality,
        keepHistory: s.keepHistory,
        autoCleanTemp: s.autoCleanTemp,
        history: s.history,
      }),
    },
  ),
);
