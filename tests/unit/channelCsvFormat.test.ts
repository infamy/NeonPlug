import { describe, it, expect } from 'vitest';
import { detectChannelCsvFormat } from '../../src/services/csv/channelCsvFormat';
import { exportChannelsToCSV, exportChannelsToChirpCSV } from '../../src/services/csv';
import { createDefaultChannel } from '../../src/utils/channelHelpers';

const channels = [createDefaultChannel({ number: 1, name: 'Simplex', rxFrequency: 146.52, txFrequency: 146.52 })];

describe('telling channel CSV formats apart', () => {
  it("recognises the app's own channel export and a CHIRP export", () => {
    expect(detectChannelCsvFormat(exportChannelsToCSV(channels))).toBe('neonplug');
    expect(detectChannelCsvFormat(exportChannelsToChirpCSV(channels))).toBe('chirp');
  });

  it('reads past a byte order mark, and recognises nothing else', () => {
    expect(detectChannelCsvFormat('﻿Location,Name,Frequency,Duplex\n1,A,146.52,')).toBe('chirp');
    expect(detectChannelCsvFormat('Name,DMR ID\nBob,1234567')).toBeNull();
    expect(detectChannelCsvFormat('')).toBeNull();
  });
});
