import { create } from 'zustand';

import type { ConversionJob, SelectedFile } from '../types/conversion';

interface JobState {
  files: Record<string, SelectedFile>;
  jobs: Record<string, ConversionJob>;
  addFile: (file: SelectedFile) => void;
  removeFile: (id: string) => void;
  startJob: (job: ConversionJob) => void;
  updateJob: (id: string, patch: Partial<ConversionJob>) => void;
  getFile: (id: string) => SelectedFile | undefined;
  getJob: (id: string) => ConversionJob | undefined;
}

export const useJobStore = create<JobState>()((set, get) => ({
  files: {},
  jobs: {},
  addFile: (file) => set((s) => ({ files: { ...s.files, [file.id]: file } })),
  removeFile: (id) =>
    set((s) => {
      const { [id]: _omit, ...rest } = s.files;
      return { files: rest };
    }),
  startJob: (job) => set((s) => ({ jobs: { ...s.jobs, [job.id]: job } })),
  updateJob: (id, patch) =>
    set((s) => {
      const existing = s.jobs[id];
      if (!existing) return s;
      return { jobs: { ...s.jobs, [id]: { ...existing, ...patch } } };
    }),
  getFile: (id) => get().files[id],
  getJob: (id) => get().jobs[id],
}));
