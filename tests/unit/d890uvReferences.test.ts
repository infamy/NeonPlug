import { describe, it, expect } from 'vitest';
import {
  D890_CHANNEL_REFERENCES,
  findDanglingReferences,
  describeDanglingReference,
  type D890TableCounts,
} from '../../src/radios/d890uv/references';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { Channel } from '../../src/models/Channel';

/** Six talkgroups, two scan lists, two RX groups, four radio IDs, no keys. */
const CONFIRM1_TABLES: D890TableCounts = {
  DMRTalkGroups: 6,
  ScanList: 14,
  DMRReceiveGroupCallList: 2,
  RadioIDList: 4,
  AESEncryptionCode: 0,
};

const ch = (n: number, patch: Partial<Channel>): Channel =>
  createDefaultChannel({ number: n, name: `CH${n}`, ...patch });

describe('DA-7X2 cross-table references', () => {
  it('accepts a channel whose references all resolve', () => {
    const found = findDanglingReferences(
      [ch(1, { contactId: 6, scanListId: 14, rxGroupListId: 2, dmrRadioIdIndex: 3 })],
      CONFIRM1_TABLES,
    );
    expect(found).toEqual([]);
  });

  it('treats zero as "none" for every reference', () => {
    // 0 means none on this radio, and none always resolves. A validator that
    // flagged it would make every ordinary channel unwritable.
    const found = findDanglingReferences(
      [ch(1, { contactId: 0, scanListId: 0, rxGroupListId: 0, dmrRadioIdIndex: 0, dtmfId: 0 })],
      CONFIRM1_TABLES,
    );
    expect(found).toEqual([]);
  });

  it('catches the references that killed the vendor marshaller', () => {
    // This is confirm1.rdt's failure, reproduced. The vendor CPS parsed that file
    // and re-exported all 39 CSVs without complaint, then died on Write To Radio
    // in its channel marshaller — because a channel referenced DTMF entry 2 and
    // AES key 1 in a codeplug that has neither.
    const found = findDanglingReferences(
      [ch(9, { dtmfId: 2 }), ch(13, { encryptionId: 1 })],
      CONFIRM1_TABLES,
    );
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ channelNumber: 9, table: 'DTMFEncode', reason: 'table-not-modelled' });
    expect(found[1]).toMatchObject({
      channelNumber: 13,
      table: 'AESEncryptionCode',
      available: 0,
      reason: 'out-of-range',
    });
  });

  it('respects one-based and zero-based references differently', () => {
    // Contact 6 is the last of six one-based entries; radio ID 4 is one past the
    // last of four zero-based ones. Getting this backwards makes the validator
    // either reject a valid codeplug or pass the exact bug it exists to stop.
    expect(findDanglingReferences([ch(1, { contactId: 6 })], CONFIRM1_TABLES)).toEqual([]);
    expect(findDanglingReferences([ch(1, { contactId: 7 })], CONFIRM1_TABLES)).toHaveLength(1);
    expect(findDanglingReferences([ch(1, { dmrRadioIdIndex: 3 })], CONFIRM1_TABLES)).toEqual([]);
    expect(findDanglingReferences([ch(1, { dmrRadioIdIndex: 4 })], CONFIRM1_TABLES)).toHaveLength(1);
  });

  it('flags every field NeonPlug cannot check, rather than passing it', () => {
    // The dangerous default. A reference into a table NeonPlug does not model
    // looks fine to any check it can perform, and is exactly what broke the
    // vendor's writer — so silence here would be worse than a false positive.
    const unmodelled = D890_CHANNEL_REFERENCES.filter((r) => !r.modelled);
    expect(unmodelled.length).toBeGreaterThan(0);
    for (const ref of unmodelled) {
      const found = findDanglingReferences([ch(1, { [ref.field]: 1 } as Partial<Channel>)], CONFIRM1_TABLES);
      expect(found, `${String(ref.field)} passed unchecked`).toHaveLength(1);
      expect(found[0].reason).toBe('table-not-modelled');
    }
  });

  it('reports the count so a user can act on it', () => {
    const [d] = findDanglingReferences([ch(13, { encryptionId: 1 })], CONFIRM1_TABLES);
    expect(describeDanglingReference(d)).toBe(
      'Channel 13: Digital Encryption = 1, but AESEncryptionCode has 0 entries',
    );
  });

  it('never mutates the channels it checks', () => {
    // The caller decides whether to refuse or clamp. Clamping here would produce
    // a codeplug that differs from what the user saw on screen.
    const channel = ch(1, { dtmfId: 5 });
    const before = JSON.stringify(channel);
    findDanglingReferences([channel], CONFIRM1_TABLES);
    expect(JSON.stringify(channel)).toBe(before);
  });
});
