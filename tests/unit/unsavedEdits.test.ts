import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hasUnsavedEdits, trackUnsavedEdits } from '../../src/services/unsavedEdits';
import { applyCodeplugToStores } from '../../src/services/applyCodeplug';
import type { CodeplugData } from '../../src/services/codeplugExport';
import { useUnsavedChangesStore } from '../../src/store/unsavedChangesStore';
import { useChannelsStore } from '../../src/store/channelsStore';
import { useRXGroupsStore } from '../../src/store/rxGroupsStore';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

const codeplug = (channelNames: string[]) =>
  ({
    channels: channelNames.map((name, i) => createDefaultChannel({ number: i + 1, name })),
    zones: [],
    scanLists: [],
    contacts: [],
    digitalEmergencies: [],
    analogEmergencies: [],
    exportDate: '',
  }) as unknown as CodeplugData;

describe('unsaved edits', () => {
  let stop: () => void;

  beforeEach(() => {
    applyCodeplugToStores(codeplug(['Loaded']), 'restore');
    stop = trackUnsavedEdits();
  });
  afterEach(() => stop());

  it('starts clean after a codeplug is loaded', () => {
    expect(hasUnsavedEdits()).toBe(false);
  });

  it('counts a change to the codeplug as an unsaved edit', () => {
    useChannelsStore.getState().updateChannel(1, { name: 'Edited' });
    expect(hasUnsavedEdits()).toBe(true);
  });

  it('does not count a change outside the codeplug, like which RX group is selected', () => {
    useRXGroupsStore.getState().setSelectedGroup(3);
    expect(hasUnsavedEdits()).toBe(false);
  });

  it('is clean again once another codeplug is opened', () => {
    useChannelsStore.getState().updateChannel(1, { name: 'Edited' });
    applyCodeplugToStores(codeplug(['Opened']), 'import');
    expect(hasUnsavedEdits()).toBe(false);
  });

  it('has nothing to lose when the codeplug is empty', () => {
    useChannelsStore.getState().setChannels([]);
    expect(useUnsavedChangesStore.getState().dirty).toBe(true);
    expect(hasUnsavedEdits()).toBe(false);
  });
});
