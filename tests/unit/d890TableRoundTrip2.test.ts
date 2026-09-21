import { describe, it, expect } from 'vitest';
import {
  parseZone,
  parseRadioId,
  parseRxGroup,
  parseRoamingZone,
  parseRoamingChannel,
} from '../../src/radios/d890uv/structures';
import {
  applyZoneMembersToRecord,
  applyZoneNameToRecord,
  applyRadioIdToRecord,
  applyRxGroupToRecord,
  applyRoamingZoneToRecord,
  applyRoamingChannelToRecord,
} from '../../src/radios/d890uv/tableWrite';

/**
 * More records taken verbatim from the vendor CPS programming a DA-7X2.
 *
 * Same acceptance test as the others: an unmodified record must re-encode to
 * identical bytes, and a one-field change must move only that field's bytes.
 *
 * Two of these have a wrinkle worth stating, because both are places a naive
 * encoder corrupts data silently:
 *
 *   - **Member lists are TERMINATED, not counted.** Shortening one must write
 *     the 0xFFFF terminator or the radio keeps reading the old tail.
 *   - **A zone is TWO records** in two different regions — members at
 *     0x2000000, name at 0x3600000. Writing one without the other leaves the
 *     radio showing a renamed zone with the old members.
 */
const ZONE_MEMBERS_0 =
  '0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const ZONE_MEMBERS_1 =
  '00000100ffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const ZONE_MEMBERS_2 =
  '7b007c007d007e007f008000810082008300ffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const ZONE_NAME_0 =
  '5a0031002000530069006e0067006c0065000000000000000000000000000000';
const ZONE_NAME_1 =
  '5a00320020005000610069007200000000000000000000000000000000000000';
const ZONE_NAME_2 =
  '5a003300200042006f0075006e00640061007200790000000000000000000000';
const RADIO_ID_0 =
  '1234567852004900440020004d00610069006e00000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const RADIO_ID_1 =
  '0000000152004900440020004f006e0065000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const RX_GROUP_0 =
  '0000000001000000ffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    '520058004700200041006c007000680061000000000000000000000000000000';
const RX_GROUP_1 =
  '000000000100000002000000ffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    '520058004700200042007200610076006f000000000000000000000000000000';
const ROAM_ZONE_0 =
  '00010203ffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    '52004f0041004d0020005a004f004e0045002000310000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';
const ROAM_CH_0 =
  '4102125041821250100252006f0061006d0069006e0067002000430048002000' +
    '3100000000000000000000000000000000000000000000000000000000000000';
const ROAM_CH_1 =
  '4103125041831250100252006f0061006d0069006e0067002000430048002000' +
    '3200000000000000000000000000000000000000000000000000000000000000';
const bytes = (hex: string) =>
  new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('zone encoders', () => {
  it('round-trips vendor zone membership records', () => {
    for (const [i, rec] of [ZONE_MEMBERS_0, ZONE_MEMBERS_1, ZONE_MEMBERS_2].entries()) {
      const original = bytes(rec);
      const zone = parseZone(bytes(ZONE_NAME_0), original, i);
      expect(hex(applyZoneMembersToRecord(original, zone)), `zone ${i}`).toBe(hex(original));
    }
  });

  it('round-trips vendor zone name records', () => {
    for (const [i, rec] of [ZONE_NAME_0, ZONE_NAME_1, ZONE_NAME_2].entries()) {
      const original = bytes(rec);
      const zone = parseZone(original, bytes(ZONE_MEMBERS_0), i);
      expect(hex(applyZoneNameToRecord(original, zone)), `zone ${i}`).toBe(hex(original));
    }
  });

  it('converts between 1-based channel numbers and 0-based wire indices', () => {
    const original = bytes(ZONE_MEMBERS_0);
    const zone = parseZone(bytes(ZONE_NAME_0), original, 0);
    const out = applyZoneMembersToRecord(original, { ...zone, channels: [1, 2, 3] });
    // Channel 1 is wire index 0.
    expect([out[0], out[1], out[2], out[3], out[4], out[5]]).toEqual([0, 0, 1, 0, 2, 0]);
  });

  it('terminates a shortened membership list', () => {
    const original = bytes(ZONE_MEMBERS_0);
    const zone = parseZone(bytes(ZONE_NAME_0), original, 0);
    const shortened = applyZoneMembersToRecord(original, { ...zone, channels: [5] });
    const reparsed = parseZone(bytes(ZONE_NAME_0), shortened, 0);
    expect(reparsed.channels).toEqual([5]);
  });

  it('refuses more members than the record holds', () => {
    const original = bytes(ZONE_MEMBERS_0);
    const zone = parseZone(bytes(ZONE_NAME_0), original, 0);
    const tooMany = Array.from({ length: 400 }, (_, i) => i + 1);
    expect(() => applyZoneMembersToRecord(original, { ...zone, channels: tooMany })).toThrow();
  });
});

describe('radio ID encoder', () => {
  it('round-trips vendor records', () => {
    for (const [i, rec] of [RADIO_ID_0, RADIO_ID_1].entries()) {
      const original = bytes(rec);
      const id = parseRadioId(original, i);
      expect(hex(applyRadioIdToRecord(original, id)), `id ${i}`).toBe(hex(original));
    }
  });

  it('writes a changed name only into the name field', () => {
    const original = bytes(RADIO_ID_0);
    const id = parseRadioId(original, 0);
    const out = applyRadioIdToRecord(original, { ...id, name: 'RENAMED' });
    for (let i = 0; i < 4; i += 1) expect(out[i], 'ID bytes must not move').toBe(original[i]);
  });
});

describe('RX group encoder', () => {
  it('round-trips vendor records', () => {
    for (const [i, rec] of [RX_GROUP_0, RX_GROUP_1].entries()) {
      const original = bytes(rec);
      const group = parseRxGroup(original, i);
      expect(hex(applyRxGroupToRecord(original, group)), `group ${i}`).toBe(hex(original));
    }
  });

  it('re-packs members to the front, filling the rest with the sentinel', () => {
    // decodeU32Members SKIPS its sentinel rather than stopping, so a sparse
    // record reads back compacted. Writing re-packs so the record matches what
    // the user was shown.
    const original = bytes(RX_GROUP_0);
    const group = parseRxGroup(original, 0);
    const out = applyRxGroupToRecord(original, { ...group, talkGroupIndices: [7] });
    expect([out[0], out[1], out[2], out[3]]).toEqual([7, 0, 0, 0]);
    expect([out[4], out[5], out[6], out[7]]).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect(parseRxGroup(out, 0).talkGroupIndices).toEqual([7]);
  });

  it('refuses more members than the radio holds', () => {
    const original = bytes(RX_GROUP_0);
    const group = parseRxGroup(original, 0);
    const tooMany = Array.from({ length: 100 }, (_, i) => i);
    expect(() => applyRxGroupToRecord(original, { ...group, talkGroupIndices: tooMany })).toThrow();
  });
});

describe('roaming zone encoder', () => {
  it('round-trips the vendor record', () => {
    const original = bytes(ROAM_ZONE_0);
    const zone = parseRoamingZone(original, 0);
    expect(hex(applyRoamingZoneToRecord(original, zone))).toBe(hex(original));
  });

  it('terminates a shortened member list', () => {
    const original = bytes(ROAM_ZONE_0);
    const zone = parseRoamingZone(original, 0);
    const out = applyRoamingZoneToRecord(original, { ...zone, members: [1] });
    expect(parseRoamingZone(out, 0).members).toEqual([1]);
  });
});

describe('roaming channel encoder', () => {
  it('round-trips vendor records', () => {
    for (const [i, rec] of [ROAM_CH_0, ROAM_CH_1].entries()) {
      const original = bytes(rec);
      const ch = parseRoamingChannel(original, i);
      expect(hex(applyRoamingChannelToRecord(original, ch)), `roaming channel ${i}`)
        .toBe(hex(original));
    }
  });

  it('leaves an uninterpretable colour code or slot alone', () => {
    // The parser reports null rather than clamping when the radio holds a value
    // outside range. A value this driver could not interpret is not one it
    // should overwrite with a guess.
    const original = bytes(ROAM_CH_0);
    original[0x08] = 0x7f;
    original[0x09] = 0x7f;
    const ch = parseRoamingChannel(original, 0);
    expect(ch.colorCode).toBeNull();
    expect(ch.slot).toBeNull();
    const out = applyRoamingChannelToRecord(original, ch);
    expect(out[0x08]).toBe(0x7f);
    expect(out[0x09]).toBe(0x7f);
  });
});
