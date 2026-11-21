import { expect, it, vi } from 'vitest';
import { getSnapshotData, getSnapshots } from '../../src/services/codeplugSnapshots';
import { backupUnsavedEdits, trackUnsavedEdits } from '../../src/services/unsavedEdits';
import { useContactsStore } from '../../src/store/contactsStore';
import { useUnsavedChangesStore } from '../../src/store/unsavedChangesStore';

it('backs up unsaved contacts even when the codeplug has no channels or zones', async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const stopTracking = trackUnsavedEdits();
  const contact = { id: 1, name: 'Test contact', dmrId: 1234567 };
  try {
    useContactsStore.getState().setContacts([contact]);
    await backupUnsavedEdits('reading the radio');
    useContactsStore.getState().setContacts([]);

    const [snapshot] = getSnapshots();
    expect(snapshot?.eventType).toBe('backup');
    expect((await getSnapshotData(snapshot.id))?.contacts).toEqual([contact]);
  } finally {
    stopTracking();
    useContactsStore.getState().setContacts([]);
    useUnsavedChangesStore.getState().markClean();
    vi.unstubAllGlobals();
  }
});
