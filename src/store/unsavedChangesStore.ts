import { create } from 'zustand';

/**
 * Whether the codeplug has changed since it was last read, written, opened or
 * restored. `services/unsavedEdits.ts` keeps it up to date.
 *
 * The contact list is tracked on its own. A codeplug write doesn't send it (the
 * radios write contacts separately), so a write mustn't mark it saved: it used
 * to, and the next read then cleared the edited contacts without a backup.
 */
interface UnsavedChangesState {
  dirty: boolean;
  contactsDirty: boolean;
  markDirty: () => void;
  markContactsDirty: () => void;
  /** Everything matches a saved copy: after a read, an import or a restore. */
  markClean: () => void;
  /** After a codeplug write, which sends everything but the contact list. */
  markWritten: () => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set, get) => ({
  dirty: false,
  contactsDirty: false,
  markDirty: () => {
    if (!get().dirty) set({ dirty: true });
  },
  markContactsDirty: () => {
    if (!get().contactsDirty) set({ contactsDirty: true });
  },
  markClean: () => {
    if (get().dirty || get().contactsDirty) set({ dirty: false, contactsDirty: false });
  },
  markWritten: () => {
    if (get().dirty) set({ dirty: false });
  },
}));
