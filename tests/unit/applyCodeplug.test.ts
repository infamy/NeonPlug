/**
 * Every path that loads a codeplug into the stores goes through one function.
 *
 * The startup screen's import set radio settings without marking them changed,
 * so settings imported there never reached the radio: the write path only
 * encodes changed fields. The toolbar's import had that fix and the startup
 * screen's copy did not.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyCodeplugToStores } from '../../src/services/applyCodeplug';
import { useRadioSettingsStore } from '../../src/store/radioSettingsStore';
import { useChannelsStore } from '../../src/store/channelsStore';
import { useRadioStore } from '../../src/store/radioStore';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { CodeplugData } from '../../src/services/codeplugExport';
import type { RadioSettings } from '../../src/models/RadioSettings';

function codeplug(): CodeplugData {
  return {
    channels: [createDefaultChannel({ number: 1, name: 'Simplex' })],
    zones: [], scanLists: [], contacts: [], digitalEmergencies: [], digitalEmergencyConfig: null,
    analogEmergencies: [],
    radioSettings: { squelchLevel: 5, backlightBrightness: 2 } as unknown as RadioSettings,
    radioInfo: { model: 'DA-7X2', firmware: '', buildDate: '' },
    messages: [], radioIds: [], quickContacts: [], rxGroups: [], encryptionKeys: [],
    exportDate: '2026-09-12T00:00:00.000Z', version: '1.1.0',
  };
}

beforeEach(() => {
  useRadioSettingsStore.setState({ settings: null, originalSettings: null, changedFields: new Set() });
});

describe('applyCodeplugToStores', () => {
  it('marks imported radio settings changed, so a write sends them', () => {
    applyCodeplugToStores(codeplug(), 'import');
    expect(useRadioSettingsStore.getState().getChangedFields())
      .toEqual(expect.arrayContaining(['squelchLevel', 'backlightBrightness']));
  });

  it('marks nothing on a restore, whose settings are what the radio already holds', () => {
    applyCodeplugToStores(codeplug(), 'restore');
    expect(useRadioSettingsStore.getState().hasChanges()).toBe(false);
    expect(useRadioSettingsStore.getState().settings).toMatchObject({ squelchLevel: 5 });
  });

  it('loads everything else the same either way', () => {
    applyCodeplugToStores(codeplug(), 'restore');
    expect(useChannelsStore.getState().channels.map((c) => c.name)).toEqual(['Simplex']);
    expect(useRadioStore.getState().radioInfo?.model).toBe('DA-7X2');
  });
});
