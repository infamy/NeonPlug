import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decodeOccupancyMask,
  occupiedIndices,
  decodeWideCharString,
  parseChannel,
  parseZone,
  parseTalkgroup,
  parseScanList,
  decodeU16Members,
} from '../../src/radios/d890uv/structures';
import {
  D890_LIMITS,
  D890_TALKGROUP_MASK_INVERTED,
  D890_ID_PREFIXES,
  D890_VERSION_PREFIX,
} from '../../src/radios/d890uv/constants';

/**
 * Parsers run against BYTES CAPTURED FROM A REAL DA-7X2 (2026-08-25), not
 * hand-built fixtures. This is the difference between "matches the reference
 * document" and "matches the radio" — the reference was wrong or silent on
 * several of the things asserted below.
 *
 * Radio state when captured: 8 channels, 1 zone, 1 scan list, 1 talkgroup,
 * 1 radio ID, no tones active.
 */
const DIR = join(__dirname, '..', 'fixtures', 'd890uv');
const fx = (name: string) => new Uint8Array(readFileSync(join(DIR, `${name}.bin`)));

describe('identify (real radio)', () => {
  const id = fx('identify');

  it('reports the documented Anytone strings even on the BTECH rebrand', () => {
    // The open question that gated all other work: a DA-7X2 reports ID890UV,
    // exactly like the Anytone-branded AT-D890UV. No rebrand-specific ID needed.
    const strip = (b: Uint8Array) =>
      new TextDecoder().decode(b.filter((x) => x !== 0)).trim();
    const model = strip(id.slice(0, 8));
    // The fixture was captured before a firmware update, when this radio still
    // reported ID890UV. After the update the SAME radio reports IDMR-7X2 with an
    // identical memory map — so the driver accepts a list of prefixes, and this
    // asserts the captured one is in it rather than pinning a single string.
    expect(D890_ID_PREFIXES.some((p) => model.startsWith(p))).toBe(true);
    expect(strip(id.slice(9, 13))).toBe(D890_VERSION_PREFIX);
  });

  it('ends with the ACK trailer', () => {
    expect(id[id.length - 1]).toBe(0x06);
  });
});

describe('occupancy masks (real radio)', () => {
  it('reads 8 programmed channels', () => {
    const occ = occupiedIndices(decodeOccupancyMask(fx('channel-set'), 256));
    expect(occ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('reads 1 zone and 1 scan list', () => {
    expect(occupiedIndices(decodeOccupancyMask(fx('zone-set'), 256))).toEqual([0]);
    expect(occupiedIndices(decodeOccupancyMask(fx('scanlist-set'), 256))).toEqual([0]);
  });

  it('confirms the talkgroup mask really is INVERTED', () => {
    // The radio holds exactly one talkgroup and the first byte reads 0xfe, not
    // 0x01 — bit clear means occupied. Reading it the normal way round would
    // have produced ~10,000 phantom contacts and hidden the real one.
    const raw = fx('talkgroup-set');
    expect(raw[0]).toBe(0xfe);
    const inverted = occupiedIndices(
      decodeOccupancyMask(raw, 256, D890_TALKGROUP_MASK_INVERTED)
    );
    expect(inverted).toEqual([0]);
    expect(occupiedIndices(decodeOccupancyMask(raw, 256)).length).toBe(255);
  });
});

describe('zones (real radio)', () => {
  it('decodes a UTF-16LE name — settling the endianness question', () => {
    // Raw bytes are 5a 00 6f 00 ... — little-endian. Big-endian would render CJK.
    expect(decodeWideCharString(fx('zone-0-name'), D890_LIMITS.NAME_MAX_CHARS)).toBe('Zone 1');
  });

  it('decodes membership as 1-based channel numbers', () => {
    const zone = parseZone(fx('zone-0-name'), fx('zone-0-members'), 0);
    expect(zone.name).toBe('Zone 1');
    expect(zone.channels).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('channels (real radio)', () => {
  const expected = [
    { name: 'Channel 1', rx: 435.525 },
    { name: 'Channel 2', rx: 436.325 },
    { name: 'Channel 3', rx: 437.575 },
    { name: 'Channel 4', rx: 438.875 },
  ];

  expected.forEach((exp, i) => {
    it(`decodes channel ${i + 1} name and frequency`, () => {
      const { channel } = parseChannel(fx(`channel-${i}`), i);
      expect(channel.name).toBe(exp.name);
      expect(channel.rxFrequency).toBeCloseTo(exp.rx, 4);
      expect(channel.number).toBe(i + 1);
    });
  });

  it('reads the DMR colour code', () => {
    expect(parseChannel(fx('channel-0'), 0).channel.colorCode).toBe(1);
  });

  it('reports NO unresolved tone when byte 0x09 says no tone is active', () => {
    // The regression this fixture exists for. Every channel carries a leftover
    // CTCSS index (0x15) and DCS value (0x13) with 0x09 = 0x00. Before the
    // gating fix this flagged an unresolved tone on all 8 channels, which would
    // have made the flag meaningless in exactly the situation it matters.
    for (let i = 0; i < 4; i++) {
      const d = parseChannel(fx(`channel-${i}`), i);
      expect(d.rxToneIndex, 'stale tone byte should still be reported').toBe(0x15);
      expect(d.rxDcsRaw).toBe(0x13);
      expect(d.hasUnresolvedTone, `channel ${i + 1}`).toBe(false);
      expect(d.channel.rxCtcssDcs).toEqual({ type: 'None' });
    }
  });

  it('treats a real record as occupied', () => {
    expect(parseChannel(fx('channel-0'), 0).channel.rxFrequency).toBeGreaterThan(0);
  });
});

describe('talkgroups (real radio)', () => {
  it('decodes call type, DMR ID and name', () => {
    const tg = parseTalkgroup(fx('talkgroup-0'), 0);
    expect(tg.name).toBe('Contact1');
    expect(tg.dmrId).toBe(12345678);
    expect(tg.remark).toBe('Group');
  });
});

describe('scan lists (real radio)', () => {
  const sl = parseScanList(fx('scanlist-0'), 0);

  it('decodes the name from 0x0e', () => {
    expect(sl.name).toBe('Scan List 1');
  });

  it('decodes members from 0x30 as 1-based channel numbers', () => {
    expect(sl.channels).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('decodes the timers as deciseconds', () => {
    expect(sl.lookBackTimeA).toBe(15);
    expect(sl.lookBackTimeB).toBe(25);
    expect(sl.dropoutDelay).toBe(29);
    expect(sl.dwellTime).toBe(29);
  });
});

describe('radio IDs (real radio) — layout was undocumented', () => {
  // No reference documents the field offsets inside a radio-ID record; these
  // come from the capture: BCD-as-hex DMR ID at 0x00, UTF-16LE name at 0x04.
  const rid = fx('radioid-0');

  it('has the DMR ID as BCD-as-hex at 0x00', () => {
    expect(Array.from(rid.slice(0, 4))).toEqual([0x12, 0x34, 0x56, 0x78]);
  });

  it('has a UTF-16LE name at 0x04', () => {
    expect(decodeWideCharString(rid.subarray(0x04, 0x24), 16)).toBe('My Radio');
  });
});

describe('power levels (real radio)', () => {
  // Four levels, not three. Confirmed against the CPS export and the radio's own
  // menu: 0=Low, 1=Mid, 2=High, 3=Turbo. Folding Turbo into High would silently
  // demote every channel on this radio, since Turbo is its default.
  it('decodes Turbo as its own level, not as High', () => {
    // All eight original channels were programmed Turbo.
    for (let i = 0; i < 4; i++) {
      expect(parseChannel(fx(`channel-${i}`), i).channel.power).toBe('Turbo');
    }
  });

  it('reads the power bits from 0x08 bits 3-2', () => {
    const rec = new Uint8Array(fx('channel-0'));
    const withPower = (bits: number) => {
      const r = new Uint8Array(rec);
      r[0x08] = (r[0x08] & ~0x0c) | (bits << 2);
      return parseChannel(r, 0).channel.power;
    };
    expect(withPower(0)).toBe('Low');
    expect(withPower(1)).toBe('Medium');
    expect(withPower(2)).toBe('High');
    expect(withPower(3)).toBe('Turbo');
  });
});
