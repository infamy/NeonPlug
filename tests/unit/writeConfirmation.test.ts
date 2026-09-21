/**
 * What the write confirmation says, and in what order.
 *
 * It used to be a single pre-wrapped string. The most dangerous thing it can
 * say — that a write REMOVES channels or zones — sat mid-paragraph in the same
 * grey text as the frame counts. These tests pin the order (removals first),
 * the limits (no list grew), and one case the string got wrong: it announced
 * "Nothing changes" whenever no byte changed, even for a write that only added
 * new records.
 */

import { describe, it, expect } from 'vitest';
import {
  buildWriteConfirmation,
  WRITE_CONFIRM_LIMITS,
} from '../../src/components/layout/writeConfirmation';
import type { D890WritePreview } from '../../src/hooks/useRadioConnection';

const preview = (over: Partial<D890WritePreview> = {}): D890WritePreview => ({
  recordFrames: 984,
  maskFrames: 7873,
  totalFrames: 8857,
  bytesOnWire: 212568,
  estimatedSeconds: 20.5,
  changedChannels: [],
  clearedChannels: [],
  clearedZoneSlots: [],
  skipped: [],
  wholeCodeplug: true,
  bytesChanged: 0,
  changedRegions: [],
  bytesNew: 0,
  newRegions: [],
  ...over,
});

const region = (what: string, b = 1) => ({ what, bytes: b, frames: 1 });
const none = { integrity: [], warnings: [] };

describe('the order of what it says', () => {
  it('leads with removals, channels before zones', () => {
    const c = buildWriteConfirmation({
      ...none,
      preview: preview({ clearedChannels: [102, 103], clearedZoneSlots: [4] }),
    });
    expect(c.removals.map((r) => [r.unit, r.count])).toEqual([['channel', 2], ['zone', 1]]);
  });

  it('says nothing about removals when a write removes nothing', () => {
    expect(buildWriteConfirmation({ ...none, preview: preview() }).removals).toEqual([]);
  });

  it('caps a long removal list and counts the rest', () => {
    const many = Array.from({ length: 20 }, (_, i) => i + 1);
    const [r] = buildWriteConfirmation({ ...none, preview: preview({ clearedChannels: many }) }).removals;
    expect(r!.list.items).toHaveLength(WRITE_CONFIRM_LIMITS.removals);
    expect(r!.list.more).toBe(20 - WRITE_CONFIRM_LIMITS.removals);
    expect(r!.count).toBe(20);
  });
});

describe('what the plan sends', () => {
  it('calls an untouched codeplug a write-back', () => {
    const plan = buildWriteConfirmation({ ...none, preview: preview() }).plan!;
    expect(plan.writeBack).toBe(true);
    expect(plan.changed).toBeNull();
    expect(plan.added).toBeNull();
  });

  it('does NOT call it a write-back when records are being added', () => {
    // The string version keyed "Nothing changes" off bytesChanged alone.
    const plan = buildWriteConfirmation({
      ...none,
      preview: preview({ bytesChanged: 0, bytesNew: 256, newRegions: [region('channel 202', 128)] }),
    }).plan!;
    expect(plan.writeBack).toBe(false);
    expect(plan.added?.bytes).toBe(256);
  });

  it('reports changed and new bytes separately, each with its regions', () => {
    const plan = buildWriteConfirmation({
      ...none,
      preview: preview({
        bytesChanged: 7,
        changedRegions: [region('channel presence mask'), region('zone 1 members', 4)],
        bytesNew: 256,
        newRegions: [region('channel 202', 128), region('channel 203', 128)],
      }),
    }).plan!;
    expect(plan.changed?.bytes).toBe(7);
    expect(plan.changed?.regions.items.map((r) => r.what)).toEqual(['channel presence mask', 'zone 1 members']);
    expect(plan.added?.regions.items).toHaveLength(2);
  });

  it('caps the region list at the old limit', () => {
    const regions = Array.from({ length: 11 }, (_, i) => region(`region ${i}`));
    const plan = buildWriteConfirmation({
      ...none,
      preview: preview({ bytesChanged: 11, changedRegions: regions }),
    }).plan!;
    expect(plan.changed?.regions.items).toHaveLength(WRITE_CONFIRM_LIMITS.regions);
    expect(plan.changed?.regions.more).toBe(3);
  });

  it('lists channels only for a channels-only write, where there is nothing to diff', () => {
    const plan = buildWriteConfirmation({
      ...none,
      preview: preview({ wholeCodeplug: false, bytesChanged: undefined, changedChannels: [1, 2, 3] }),
    }).plan!;
    expect(plan.channelsWritten?.items).toEqual([1, 2, 3]);
    expect(plan.writeBack).toBe(false);
  });

  it('has no plan for a radio that does not plan its writes', () => {
    expect(buildWriteConfirmation({ ...none, preview: null }).plan).toBeNull();
  });
});

describe('checks and read warnings', () => {
  it('turns a codeplug check into a message with its list', () => {
    const c = buildWriteConfirmation({
      preview: null,
      integrity: [],
      warnings: [{
        id: 'channels_not_in_zones',
        message: '2 channels are not in any zone',
        channels: [{ number: 5, name: 'CH5' }, { number: 6, name: '' }] as never,
      }],
    });
    expect(c.checks[0]!.message).toBe('2 channels are not in any zone');
    expect(c.checks[0]!.list.items).toEqual(['Ch 5 – CH5', 'Ch 6 – (no name)']);
  });

  it('keeps each read warning whole, not joined into one string', () => {
    const c = buildWriteConfirmation({
      preview: null,
      warnings: [],
      integrity: [{ level: 'warning', region: 'zone hidden', problem: 'mask is erased', consequence: 'writing is safe' }],
    });
    expect(c.readWarnings).toEqual([
      { blocker: false, region: 'zone hidden', problem: 'mask is erased', consequence: 'writing is safe' },
    ]);
  });
});
