import { describe, it, expect } from 'vitest';
import {
  checkChannelLimits,
  checkZoneLimits,
  checkScanListLimits,
  checkRxGroupLimits,
  checkRadioIdLimits,
  checkTalkGroupLimits,
  checkContactLimits,
} from '../../src/services/csv/importLimits';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { RadioCapabilities } from '../../src/types/radioCapabilities';
import type { Zone, ScanList, RXGroup } from '../../src/models';

const caps = (c: Partial<RadioCapabilities>) => c as unknown as RadioCapabilities;

describe('import limits', () => {
  it('passes a list that fits, untouched', () => {
    const zones: Zone[] = [{ id: 'a', name: 'A', channels: [1, 2] }];
    const result = checkZoneLimits(zones, caps({ maxZones: 5, maxZoneChannels: 5 }));
    expect(result.issues).toEqual([]);
    expect(result.trimmed).toEqual(zones);
  });

  it('reports too many zones and too many channels in one, and trims both', () => {
    const zones: Zone[] = [
      { id: 'a', name: 'Big', channels: [1, 2, 3, 4] },
      { id: 'b', name: 'B', channels: [1] },
      { id: 'c', name: 'C', channels: [1] },
    ];
    const result = checkZoneLimits(zones, caps({ maxZones: 2, maxZoneChannels: 3 }));
    expect(result.issues).toEqual([
      '3 zones, but the radio holds 2. Trimming drops the last 1.',
      'Zone "Big" has 4 channels, but a zone holds 3. Trimming keeps the first 3.',
    ]);
    expect(result.trimmed.map((z) => z.channels)).toEqual([[1, 2, 3], [1]]);
  });

  it('clears a DM-32 priority channel that trimming, or the file, left outside its list', () => {
    const list: ScanList = {
      name: 'Scan',
      channels: [1, 2, 3],
      ctcScanMode: 0,
      scanTxMode: 0,
      priority1Type: 2,
      priorityChannel1: 3,
      priority2Type: 2,
      priorityChannel2: 1,
    };
    const result = checkScanListLimits([list], caps({ maxScanListChannels: 2, scanListPriorityMembersOnly: true }));
    expect(result.issues).toHaveLength(2);
    expect(result.issues[1]).toMatch(/priority channel 1 \(channel 3\) isn't in the list/);
    expect(result.trimmed[0]).toMatchObject({ channels: [1, 2], priority1Type: 0, priority2Type: 2, priorityChannel2: 1 });
    expect(result.trimmed[0].priorityChannel1).toBeUndefined();
  });

  it('leaves a priority channel outside the list alone on a radio that allows it', () => {
    const list: ScanList = { name: 'S', channels: [1], ctcScanMode: 0, scanTxMode: 0, priority1Type: 2, priorityChannel1: 9 };
    expect(checkScanListLimits([list], caps({})).issues).toEqual([]);
  });

  it('checks RX group count and members', () => {
    const g = (name: string, members: number[]): RXGroup => ({
      index: 0, name, bitmask: 0, statusFlag: 0, entryFlag: 1, validationFlag: 0, talkGroupIndices: members,
    });
    const result = checkRxGroupLimits(
      [g('One', [1, 2, 3]), g('Two', [1])],
      caps({ maxRxGroupMembers: 2, digital: { limits: { RX_GROUPS_MAX: 1 } } } as Partial<RadioCapabilities>)
    );
    expect(result.issues).toHaveLength(2);
    expect(result.trimmed).toHaveLength(1);
    expect(result.trimmed[0].talkGroupIndices).toEqual([1, 2]);
  });

  it('caps channels, radio IDs, talk groups and contacts by count', () => {
    expect(checkChannelLimits([createDefaultChannel(), createDefaultChannel()], caps({ maxChannels: 1 })).trimmed).toHaveLength(1);
    expect(checkRadioIdLimits([{ index: 0, dmrId: '1', dmrIdValue: 1, dmrIdBytes: new Uint8Array(3), name: 'a' }], caps({ maxRadioIds: 0 })).issues).toHaveLength(1);
    expect(checkTalkGroupLimits([], caps({ maxTalkGroups: 0 })).issues).toEqual([]);
    expect(checkContactLimits([{ id: 1, name: 'a', dmrId: 1 }, { id: 2, name: 'b', dmrId: 2 }], 1).issues).toEqual([
      '2 contacts, but the radio holds 1. Trimming drops the last 1.',
    ]);
  });

  it('checks nothing a radio does not declare', () => {
    const zones: Zone[] = [{ id: 'a', name: 'A', channels: new Array(500).fill(1) }];
    expect(checkZoneLimits(zones, null).issues).toEqual([]);
  });
});
