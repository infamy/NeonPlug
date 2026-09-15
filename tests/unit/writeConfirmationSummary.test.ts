import { describe, it, expect } from 'vitest';
import { buildWriteConfirmation, type WriteSummaryInput } from '../../src/components/layout/writeConfirmation';

const summary = (over: Partial<WriteSummaryInput> = {}): WriteSummaryInput => ({
  model: 'DM-32UV',
  channels: 312,
  zones: 20,
  scanLists: 1,
  droppedChannels: [],
  droppedZones: [],
  droppedScanLists: [],
  ...over,
});
const confirm = (s?: WriteSummaryInput) => buildWriteConfirmation({ preview: null, integrity: [], warnings: [], summary: s });

describe('the write confirmation summary', () => {
  it('names the radio and what the write sends', () => {
    expect(confirm(summary()).headline).toBe('Writes 312 channels, 20 zones and 1 scan list to the DM-32UV.');
    expect(confirm(summary({ model: null, zones: 0, scanLists: 0, channels: 1 })).headline).toBe(
      'Writes 1 channel to the radio.'
    );
  });

  it('lists what the write leaves out, and says nothing when it leaves out nothing', () => {
    expect(confirm(summary()).leftOut).toBeNull();
    const c = confirm(summary({ droppedChannels: [{ number: 7, name: 'Tower' }], droppedZones: ['Air'] }));
    expect(c.leftOut?.channels.list.items).toEqual(['7 Tower']);
    expect(c.leftOut?.zones.list.items).toEqual(['Air']);
    expect(c.leftOut?.scanLists.count).toBe(0);
  });

  it('names the settings the write changes, or says it writes them all', () => {
    expect(confirm(summary({ settings: { labels: ['Squelch Level', 'Backlight'], all: false } })).settingsLine).toBe(
      'Changes 2 settings: Squelch Level, Backlight.'
    );
    expect(confirm(summary({ settings: { labels: [], all: true } })).settingsLine).toBe(
      'Writes every setting in the imported codeplug.'
    );
    expect(confirm(summary()).settingsLine).toBeNull();
  });

  it('has no headline where no summary was given', () => {
    expect(confirm().headline).toBeNull();
  });
});
