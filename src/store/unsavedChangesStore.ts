import { create } from 'zustand';

/**
 * Whether the codeplug has changed since it was last read, written, opened,
 * restored or exported. `services/unsavedEdits.ts` keeps it up to date.
 */
interface UnsavedChangesState {
  dirty: boolean;
  markDirty: () => void;
  markClean: () => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set, get) => ({
  dirty: false,
  markDirty: () => {
    if (!get().dirty) set({ dirty: true });
  },
  markClean: () => {
    if (get().dirty) set({ dirty: false });
  },
}));
