import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChannel, channelAddresses } from '../../src/radios/d890uv/structures';
import {
  D890_ADDR,
  D890_LIMITS,
  D890_SCAN_REVERT_CHANNEL,
  D890_SCAN_MODE,
} from '../../src/radios/d890uv/constants';

/**
 * End-to-end read-path check against a deliberately varied codeplug.
 *
 * The bytes here were read off a real DA-7X2 after writing a codeplug built for
 * this purpose: 118 channels with numbering gaps, every power level, both
 * bandwidths, a 30-channel DCS sweep in both polarities, mismatched tone pairs,
 * all four channel types and all 16 colour codes.
 *
 * Expectations come from the vendor CPS's own CSV export of that same codeplug,
 * so this compares NeonPlug's decode against the manufacturer's decode of
 * identical bytes — not against itself.
 */
const DIR = join(__dirname, '../fixtures/d890uv/diverse');
const BYTES = new Uint8Array(readFileSync(join(DIR, 'channels.bin')));
const INDEX: number[] = JSON.parse(readFileSync(join(DIR, 'channels-index.json'), 'utf8'));
const EXPECTED: Record<string, {
  name: string; rx: number; tx: number; power: string;
  bw: string; type: string; dec: string; enc: string; cc: number; slot: number;
}> = JSON.parse(readFileSync(join(DIR, 'expected-channels.json'), 'utf8'));

/** Channel record i of the fixture, in the order the radio was read. */
function record(slot: number): Uint8Array {
  return BYTES.subarray(slot * 0x80, slot * 0x80 + 0x80);
}

describe('DA-7X2 diverse codeplug — read path', () => {
  it('read every channel the codeplug defines', () => {
    // 118 authored + the two VFO pseudo-channels at 4001/4002.
    expect(INDEX).toHaveLength(120);
    expect(INDEX.map((i) => i + 1)).toContain(128);
    expect(INDEX.map((i) => i + 1)).toContain(129);
  });

  it('addresses channels across the 128-channel block boundary', () => {
    // The bug this guards: base + index * 0x80 is right up to channel 127 and
    // silently wrong afterwards, because blocks are 0x80000 apart.
    const a127 = channelAddresses(127);
    const a128 = channelAddresses(128);
    expect(a128.primary - a127.primary).toBe(
      D890_ADDR.CHANNEL_BLOCK_STRIDE - 127 * D890_ADDR.CHANNEL_STRIDE,
    );
    expect(a128.primary).toBe(D890_ADDR.CHANNEL_DATA + D890_ADDR.CHANNEL_BLOCK_STRIDE);
  });

  it('decodes names, frequencies and mode as the vendor CPS does', () => {
    let checked = 0;
    INDEX.forEach((chIndex, slot) => {
      const want = EXPECTED[String(chIndex + 1)];
      if (!want) return; // VFO pseudo-channels have no CSV row
      const got = parseChannel(record(slot), chIndex).channel;
      // Names are capped at 16 characters by the radio, confirmed here: four of
      // the authored names are longer and came back truncated.
      expect(got.name, `channel ${chIndex + 1} name`).toBe(want.name.slice(0, 16));
      expect(got.rxFrequency, `channel ${chIndex + 1} rx`).toBeCloseTo(want.rx, 4);
      expect(got.txFrequency, `channel ${chIndex + 1} tx`).toBeCloseTo(want.tx, 4);
      // All FOUR vendor types must round-trip, not just the analog/digital
      // split. The parser used to collapse "A+D TX A" and "D+A TX D" into plain
      // Analog/Digital, which silently erased mixed-mode channels — this
      // codeplug has two of each.
      const MODE_FOR_TYPE: Record<string, string> = {
        'A-Analog': 'Analog',
        'D-Digital': 'Digital',
        'A+D TX A': 'Fixed Analog',
        'D+A TX D': 'Fixed Digital',
      };
      expect(got.mode, `channel ${chIndex + 1} mode (vendor "${want.type}")`).toBe(
        MODE_FOR_TYPE[want.type] ?? 'Analog',
      );
      checked += 1;
    });
    expect(checked).toBe(118);
  });

  it('decodes all four power levels, including High and Turbo', () => {
    const seen = new Map<string, string>();
    INDEX.forEach((chIndex, slot) => {
      const want = EXPECTED[String(chIndex + 1)];
      if (!want) return;
      const got = parseChannel(record(slot), chIndex).channel;
      seen.set(want.power, got.power);
    });
    // The vendor writes Mid where NeonPlug's model calls it Medium.
    expect(seen.get('Low')).toBe('Low');
    expect(seen.get('Mid')).toBe('Medium');
    expect(seen.get('High')).toBe('High');
    expect(seen.get('Turbo')).toBe('Turbo');
  });

  it('caps channel names at 16 characters', () => {
    const long = INDEX.map((i, slot) => [i, EXPECTED[String(i + 1)], slot] as const)
      .filter(([, w]) => w && w.name.length > 16);
    expect(long.length).toBeGreaterThan(0);
    for (const [i, w, slot] of long) {
      const got = parseChannel(record(slot), i).channel;
      expect(got.name).toBe(w!.name.slice(0, 16));
      expect(got.name).toHaveLength(16);
    }
  });

  it('decodes CTCSS in both directions, including split pairs', () => {
    const bySlot = new Map(INDEX.map((i, slot) => [i + 1, slot] as const));
    const check = (ch: number, wantRx: string, wantTx: string) => {
      const g = parseChannel(record(bySlot.get(ch)!), ch - 1).channel;
      const fmt = (t: { type: string; value?: number }) =>
        t.type === 'CTCSS' ? t.value!.toFixed(1) : 'Off';
      expect(fmt(g.rxCtcssDcs as never), `ch${ch} rx`).toBe(wantRx);
      expect(fmt(g.txCtcssDcs as never), `ch${ch} tx`).toBe(wantTx);
    };
    check(9, '67.0', 'Off');    // decode only
    check(10, 'Off', '67.0');   // encode only
    check(11, '67.0', '67.0');  // matched pair
    check(21, '131.8', '203.5'); // deliberately mismatched
  });

  it('decodes DCS in both polarities', () => {
    const bySlot = new Map(INDEX.map((i, slot) => [i + 1, slot] as const));
    const dcs = (ch: number) => {
      const g = parseChannel(record(bySlot.get(ch)!), ch - 1).channel;
      const t = g.rxCtcssDcs as { type: string; value?: number; polarity?: string };
      // polarity 'N' is normal, 'P' is inverted - the CPS writes those as N / I.
      return t.type === 'DCS'
        ? `D${String(t.value).padStart(3, '0')}${t.polarity === 'P' ? 'I' : 'N'}`
        : t.type;
    };
    expect(dcs(22)).toBe('D023N');
    expect(dcs(23)).toBe('D023I');
    expect(dcs(50)).toBe('D754N');
    expect(dcs(51)).toBe('D754I');
  });

  it('decodes both bandwidths', () => {
    const seen = new Set<string>();
    INDEX.forEach((chIndex, slot) => {
      const want = EXPECTED[String(chIndex + 1)];
      if (!want) return;
      seen.add(`${want.bw}=>${parseChannel(record(slot), chIndex).channel.bandwidth}`);
    });
    expect(seen.has('25K=>25kHz')).toBe(true);
    expect(seen.has('12.5K=>12.5kHz')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Zones and scan lists, from the same radio read
// ---------------------------------------------------------------------------

import {
  parseZone,
  parseScanList,
  scanListAddress,
  D890_SCAN_TIME_STEP_S,
} from '../../src/radios/d890uv/structures';

const ZONES: Record<string, { name: string; members: string }> = JSON.parse(
  readFileSync(join(DIR, 'zones.json'), 'utf8'),
);
const SCANLISTS: Record<string, string> = JSON.parse(
  readFileSync(join(DIR, 'scanlists.json'), 'utf8'),
);
const hex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));

describe('DA-7X2 diverse codeplug — zones', () => {
  it('reads all eight zones with the authored member counts', () => {
    const got = Object.entries(ZONES)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([i, z]) => parseZone(hex(z.name), hex(z.members), Number(i)));
    expect(got).toHaveLength(8);
    // Authored deliberately at 1, 2, 9, 6, 13, 30, 16 and 6 members.
    expect(got.map((z) => z.channels.length)).toEqual([1, 2, 9, 6, 13, 30, 16, 6]);
    expect(got.map((z) => z.name)).toEqual([
      'Z1 Single', 'Z2 Pair', 'Z3 Boundary', 'Z4 Sparse',
      'Z5 Tones', 'Z6 DCS Sweep', 'Z7 Digital', 'Zone Eight Long',
    ]);
  });

  it('resolves a zone whose members straddle the block boundary', () => {
    const z = Object.entries(ZONES)
      .map(([i, v]) => parseZone(hex(v.name), hex(v.members), Number(i)))
      .find((x) => x.name === 'Z3 Boundary')!;
    // Authored as channels 124..132 - the run that crosses 128.
    expect(z.channels).toEqual([124, 125, 126, 127, 128, 129, 130, 131, 132]);
  });

  it('resolves a sparse zone without inventing the gaps', () => {
    const z = Object.entries(ZONES)
      .map(([i, v]) => parseZone(hex(v.name), hex(v.members), Number(i)))
      .find((x) => x.name === 'Z4 Sparse')!;
    expect(z.channels).toEqual([1, 50, 102, 255, 999, 4000]);
  });

  it('truncates zone names at the field width, like channel names', () => {
    const z = Object.entries(ZONES)
      .map(([i, v]) => parseZone(hex(v.name), hex(v.members), Number(i)))
      .find((x) => x.name.startsWith('Zone Eight'))!;
    expect(z.name).toBe('Zone Eight Long'); // authored 'Zone Eight Long Name'
  });
});

describe('DA-7X2 diverse codeplug — scan lists', () => {
  it('reads both lists with their authored members', () => {
    const got = Object.entries(SCANLISTS)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([i, h]) => parseScanList(hex(h), Number(i)));
    expect(got).toHaveLength(2);
    expect(got[0].name).toBe('SL Alpha');
    expect(got[1].name).toBe('SL Bravo');
    // Membership is compared as a SET: the radio stores scan-list members in
    // descending order, not the order they were entered, so asserting a sequence
    // would pin behaviour we did not author and do not control.
    const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);
    expect(asc(got[0].channels)).toEqual([1, 2, 9, 22, 56, 124, 128, 132]);
    expect(asc(got[1].channels)).toEqual([60, 61, 62, 63, 64, 65]);
  });

  it('stores scan-list members in descending order', () => {
    // Observed, not designed - worth pinning so a future reader that assumes
    // ascending order fails here rather than silently scanning the wrong way.
    const first = Object.entries(SCANLISTS).sort((a, b) => Number(a[0]) - Number(b[0]))[0];
    const ch = parseScanList(hex(first[1]), Number(first[0])).channels;
    expect(ch).toEqual([...ch].sort((a, b) => b - a));
  });
});

// ---------------------------------------------------------------------------
// DMR radio IDs
// ---------------------------------------------------------------------------

import { parseRadioId, radioIdAddress } from '../../src/radios/d890uv/structures';

describe('DA-7X2 DMR radio IDs', () => {
  it('decodes the BCD id and UTF-16 name from a real record', () => {
    const rec = new Uint8Array(readFileSync(join(__dirname, '../fixtures/d890uv/radioid-0.bin')));
    const got = parseRadioId(rec, 0);
    expect(got.dmrIdValue).toBe(12345678);
    expect(got.dmrId).toBe('12345678');
    expect(got.name).toBe('My Radio');
    expect(got.index).toBe(0);
  });

  it('strides records by the record size', () => {
    expect(radioIdAddress(1) - radioIdAddress(0)).toBe(D890_ADDR.RADIO_ID_STRIDE);
    expect(radioIdAddress(0)).toBe(D890_ADDR.RADIO_ID_DATA);
  });
});

// ---------------------------------------------------------------------------
// Power levels as a capability
// ---------------------------------------------------------------------------

import { D890UV_CAPABILITIES } from '../../src/radios/d890uv/capabilities';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';

describe('power levels are capability-driven', () => {
  it('declares all four levels for the DA-7X2', () => {
    expect(D890UV_CAPABILITIES.powerLevels).toEqual(['Low', 'Medium', 'High', 'Turbo']);
  });

  it('includes every power level the diverse codeplug actually uses', () => {
    // Guards the bug this caught: a UI cycling a hardcoded three-entry list
    // cannot find 'Turbo', wraps to index 0, and silently downgrades the
    // channel to Low on a single click.
    const used = new Set(
      INDEX.map((i, slot) => (EXPECTED[String(i + 1)] ? parseChannel(record(slot), i).channel.power : null)).filter(
        Boolean,
      ) as string[],
    );
    expect(used.has('Turbo')).toBe(true);
    for (const p of used) expect(D890UV_CAPABILITIES.powerLevels).toContain(p);
  });

  it('resolves through the model registry, not just the descriptor', () => {
    expect(getCapabilitiesForModel('DA-7X2')?.powerLevels).toContain('Turbo');
  });
});

// ---------------------------------------------------------------------------
// Feature flags — second diverse codeplug
// ---------------------------------------------------------------------------

const B2 = new Uint8Array(readFileSync(join(DIR, 'channels2.bin')));
const IDX2: number[] = JSON.parse(readFileSync(join(DIR, 'channels2-index.json'), 'utf8'));
const FLAGS: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(join(DIR, 'expected-flags.json'), 'utf8'),
);

describe('DA-7X2 channel feature flags', () => {
  /**
   * A second codeplug, identical to the first except that per-channel feature
   * columns vary on distinct prime strides.
   *
   * Expectations come from `csv2/Channel.CSV` — the CPS's export of the very
   * file that was written to the radio — NOT from the CSV that was authored and
   * handed over. That distinction caught three wrong option strings: the CPS
   * calls them `CTCSS/DCS`, `Start&End` and `Enhanced Encryption`, not
   * `CTC/DCS`, `Both` and `AES`. Asserting against what we asked for would have
   * pinned our own guesses.
   */
  const parse = (slot: number) =>
    parseChannel(B2.subarray(slot * 0x80, slot * 0x80 + 0x80), IDX2[slot]).channel;

  const each = (fn: (got: ReturnType<typeof parse>, want: Record<string, string>) => void) => {
    let n = 0;
    IDX2.forEach((i, slot) => {
      const want = FLAGS[String(i + 1)];
      // 4001/4002 are VFO pseudo-channels; the CPS emits rows for them but they
      // are not user channels and do not carry the varied flags.
      if (!want || i + 1 >= 4000) return;
      fn(parse(slot), want);
      n += 1;
    });
    expect(n).toBeGreaterThanOrEqual(117);
  };

  it('decodes the byte 0x21 flag group', () => {
    each((g, w) => {
      expect(g.loneWorker).toBe(w.workAlone === 'On');
      expect(g.aprsReceive).toBe(w.aprsRx === 'On');
      expect(g.encryption).toBe(w.aes === 'Enhanced Encryption');
    });
  });

  it('decodes squelch mode and PTT ID out of the shared byte 0x19', () => {
    const PTT: Record<string, number> = { Off: 0, Start: 1, End: 2, 'Start&End': 3 };
    each((g, w) => {
      expect(g.rxSquelchMode).toBe(w.squelch === 'CTCSS/DCS' ? 'CTCSS/DCS' : 'Carrier/CTC');
      expect(g.pttId).toBe(PTT[w.pttId]);
    });
  });

  it('decodes optional signalling and APRS report type', () => {
    const SIG: Record<string, string> = {
      Off: 'None', DTMF: 'DTMF', '2Tone': 'Two Tone', '5Tone': 'Five Tone',
    };
    each((g, w) => {
      expect(g.signalingType).toBe(SIG[w.optSig]);
      expect(g.aprsReportMode).toBe(w.aprsReport);
    });
  });

  it('decodes the byte 0x09 flag group', () => {
    each((g, w) => {
      expect(g.forbidTx).toBe(w.pttProhibit === 'On');
      // Bit 7 is inverted: set means talkaround is ALLOWED.
      expect(g.forbidTalkaround).toBe(w.talkAround !== 'On');
    });
  });
});

describe('DA-7X2 scan-list timers and priorities', () => {
  /**
   * The second codeplug gave both scan lists eight distinct timer values and
   * different priority-channel settings, which the first could not — its two
   * lists were CPS defaults. Expectations are the vendor CPS's own display of
   * this same file, recorded in its build manifest.
   */
  const SL: Record<string, string> = JSON.parse(
    readFileSync(join(DIR, 'scanlists2.json'), 'utf8'),
  );
  const list = (i: number) =>
    parseScanList(new Uint8Array(Buffer.from(SL[String(i)], 'hex')), i);

  it('stores timers in tenths of a second', () => {
    const a = list(0);
    // CPS showed 0.5 / 2.6 / 3.1 / 3.2 seconds.
    expect(a.lookBackTimeA * D890_SCAN_TIME_STEP_S).toBeCloseTo(0.5, 5);
    expect(a.lookBackTimeB * D890_SCAN_TIME_STEP_S).toBeCloseTo(2.6, 5);
    expect(a.dropoutDelay * D890_SCAN_TIME_STEP_S).toBeCloseTo(3.1, 5);
    expect(a.dwellTime * D890_SCAN_TIME_STEP_S).toBeCloseTo(3.2, 5);

    const b = list(1);
    // CPS showed 2.0 / 3.1 / 3.7 / 3.8 seconds.
    expect(b.lookBackTimeA * D890_SCAN_TIME_STEP_S).toBeCloseTo(2.0, 5);
    expect(b.lookBackTimeB * D890_SCAN_TIME_STEP_S).toBeCloseTo(3.1, 5);
    expect(b.dropoutDelay * D890_SCAN_TIME_STEP_S).toBeCloseTo(3.7, 5);
    expect(b.dwellTime * D890_SCAN_TIME_STEP_S).toBeCloseTo(3.8, 5);
  });

  it('stores priority channels as channel numbers, with 0xffff for none', () => {
    const a = list(0);
    expect(a.priorityChannel1Raw).toBe(1); // CPS: 'Pwr Low 25K' = channel 1
    expect(a.priorityChannel2Raw).toBe(128); // CPS: 'Blk 128' = channel 128
    expect(a.prioritySelect).toBe(3); // Select1 + Select2

    const b = list(1);
    expect(b.priorityChannel1Raw).toBe(60); // CPS: 'Dig CC04 TS1' = channel 60
    expect(b.priorityChannel2Raw).toBe(0xffff); // CPS: 'Off'
    expect(b.prioritySelect).toBe(1); // Select1 only
  });

  it('reads the revert channel from 0x94, immediately after the member array', () => {
    // Was read from 0xf8, which is inside the zero fill: both lists returned 0.
    // 0x94 is where the vendor marshaller puts Scn_RevertCh, and it is the only
    // byte in the record that separates these two lists - the CPS shows them as
    // 'Last Called' and 'Priority Channel Select1 + TalkBack'.
    expect(list(0).revertChannel).toBe(4);
    expect(list(1).revertChannel).toBe(6);
    // Those two indices now have names. The list was enumerated by writing a
    // codeplug with ten scan lists whose revert index walked 0-9 and reading the
    // vendor CPS's export back; 8 and 9 came back as "Selected", so the list is
    // eight long and the CPS silently clamps rather than rejecting.
    expect(list(0).revertChannelLabel).toBe('Last Called');
    expect(list(1).revertChannelLabel).toBe('Priority Channel Select1 + TalkBack');
    expect(D890_SCAN_REVERT_CHANNEL).toHaveLength(8);
    // The pairing only looked wrong because the ordering was assumed to alternate
    // plain/TalkBack. It does not: the four plain modes come first and the two
    // TalkBack variants of the priority modes are appended at the end.
    expect(D890_SCAN_REVERT_CHANNEL[2]).toBe('Priority Channel Select1');
    expect(D890_SCAN_REVERT_CHANNEL[6]).toBe('Priority Channel Select1 + TalkBack');
  });

  it('treats Scan Mode as the boolean it turned out to be', () => {
    // Named "mode", but only index 1 reads On — 2 and 3 both clamp back to Off.
    expect(D890_SCAN_MODE).toEqual(['Off', 'On']);
    for (const i of [0, 1]) expect(list(i).scanModeLabel).toBe('Off');
  });

  it('reads the scan mode and the three hold timers around the member array', () => {
    for (const i of [0, 1]) {
      const sl = list(i);
      expect(sl.scanMode).toBe(0); // CPS: 'Off'
      expect(sl.digitalGroupHold).toBe(0);
      expect(sl.digitalPriorityHold).toBe(0);
      expect(sl.analogHold).toBe(0);
    }
  });

  it('parses a zone past the 160-channel UI cap without truncating it', () => {
    // Two different numbers, on purpose. The vendor CPS refuses to build a zone
    // above 160 and NeonPlug enforces the same, because a codeplug we produce
    // has to load in the OEM software. But the marshaller copies 250 u16 slots
    // and the region holds them, so READING clamps at the structural figure —
    // truncating on read loses data with no way to notice.
    expect(D890_LIMITS.ZONE_MEMBERS_MAX).toBe(160);
    expect(D890_LIMITS.ZONE_MEMBERS_STRUCTURAL).toBe(250);

    const members = new Uint8Array(D890_ADDR.ZONE_CHANNELS_STRIDE).fill(0xff);
    for (let i = 0; i < 250; i++) {
      members[i * 2] = i & 0xff;
      members[i * 2 + 1] = (i >> 8) & 0xff;
    }
    const name = new Uint8Array(D890_ADDR.ZONE_NAME_LEN);
    const zone = parseZone(name, members, 0);
    expect(zone.channels).toHaveLength(250);
    expect(zone.channels[249]).toBe(250);
  });

  it('blocks scan lists 32 at a time, like channels', () => {
    expect(scanListAddress(0)).toBe(D890_ADDR.SCAN_LIST_DATA);
    expect(scanListAddress(31)).toBe(D890_ADDR.SCAN_LIST_DATA + 31 * D890_ADDR.SCAN_LIST_STRIDE);
    // The bug this guards: flat addressing puts list 32 at 0x2104000, which is
    // inside list 32's own block only by accident - the record is at 0x2180000.
    expect(scanListAddress(32)).toBe(D890_ADDR.SCAN_LIST_DATA + D890_ADDR.SCAN_LIST_BLOCK_STRIDE);
    expect(scanListAddress(64)).toBe(
      D890_ADDR.SCAN_LIST_DATA + 2 * D890_ADDR.SCAN_LIST_BLOCK_STRIDE,
    );
  });
});

describe('DA-7X2 remaining channel fields', () => {
  const parse2 = (slot: number) =>
    parseChannel(B2.subarray(slot * 0x80, slot * 0x80 + 0x80), IDX2[slot]).channel;

  it('decodes reverse, call confirmation, slot suit and ranging', () => {
    let n = 0;
    IDX2.forEach((i, slot) => {
      const w = FLAGS[String(i + 1)];
      if (!w || i + 1 >= 4000) return;
      const g = parse2(slot);
      expect(g.reverse).toBe(w.reverse === 'On');
      expect(g.callConfirmation).toBe(w.callConf === 'On');
      expect(g.slotSuit).toBe(w.slotSuit === 'On');
      expect(g.ranging).toBe(w.ranging === 'On');
      n += 1;
    });
    expect(n).toBeGreaterThanOrEqual(117);
  });

  it('decodes Custom CTCSS from tenths of a Hz', () => {
    let seen = new Set<number>();
    IDX2.forEach((i, slot) => {
      const w = FLAGS[String(i + 1)];
      if (!w || i + 1 >= 4000) return;
      const g = parse2(slot);
      expect(g.customCtcssHz).toBeCloseTo(parseFloat(w.customCtcss), 3);
      seen.add(g.customCtcssHz!);
    });
    // The codeplug carries two distinct values; one would prove nothing.
    expect(seen.size).toBe(2);
  });
});

describe('DA-7X2 channel cross-references', () => {
  const parse2 = (slot: number) =>
    parseChannel(B2.subarray(slot * 0x80, slot * 0x80 + 0x80), IDX2[slot]).channel;

  it('reads the contact reference as a u32 index, not a big-endian u16', () => {
    // The codeplug's six talkgroups store 0..5 at 0x14 as a u32 LE. Reading a
    // big-endian u16 at 0x13 returns the same number only while the index stays
    // under 256, so this guards the case a large contact list would break.
    const seen = new Set<number>();
    IDX2.forEach((i, slot) => {
      if (i + 1 >= 4000) return;
      seen.add(parse2(slot).contactId);
    });
    // Stored 0-based, surfaced 1-based.
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reads the RX group reference one-based, like the scan list', () => {
    const seen = new Set<number>();
    IDX2.forEach((i, slot) => {
      if (i + 1 >= 4000) return;
      seen.add(parse2(slot).rxGroupListId);
    });
    // Two groups survived the import plus 'None'; none of them may read as 0
    // unless the channel genuinely has no group.
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
  });
});

describe('DA-7X2 fields taken from the decompiled marshaller', () => {
  const parse2 = (slot: number) =>
    parseChannel(B2.subarray(slot * 0x80, slot * 0x80 + 0x80), IDX2[slot]).channel;

  it('surfaces the one-based tone IDs the CPS refuses to set by CSV import', () => {
    // 2Tone/5Tone/DTMF ID are stored zero-based at 0x1d/0x1e/0x1f. The CPS drops
    // these columns on import, so every channel holds 0 and correlation could
    // never locate them - the byte offsets come from the vendor's own writer.
    let n = 0;
    IDX2.forEach((i, slot) => {
      if (i + 1 >= 4000) return;
      const g = parse2(slot);
      expect(g.twoToneId).toBe(1);
      expect(g.fiveToneId).toBe(1);
      expect(g.dtmfId).toBe(1);
      n += 1;
    });
    expect(n).toBeGreaterThanOrEqual(117);
  });

  it('reports 2TONE Decode one-based, matching the vendor display', () => {
    const seen = new Set<number>();
    IDX2.forEach((i, slot) => {
      if (i + 1 >= 4000) return;
      seen.add(parse2(slot).twoToneDecode!);
    });
    // Radio holds 0 and 1; the CPS shows 1 and 2.
    expect([...seen].sort()).toEqual([1, 2]);
  });

  it('reads squelch mode from the high nibble, not a single bit', () => {
    // The writer packs byte 0x19 as SQLCON * 0x10 + Ptt_ID, so a squelch value
    // of 2 or 3 would have been truncated by the old two-bit mask.
    let n = 0;
    IDX2.forEach((i, slot) => {
      const w = FLAGS[String(i + 1)];
      if (!w || i + 1 >= 4000) return;
      const g = parse2(slot);
      expect(g.rxSquelchMode).toBe(w.squelch === 'CTCSS/DCS' ? 'CTCSS/DCS' : 'Carrier/CTC');
      n += 1;
    });
    expect(n).toBeGreaterThanOrEqual(117);
  });

  it('decodes the signed offset extension', () => {
    // Zero on every captured channel, so this pins the decode rather than the
    // semantics - which is why it is not folded into the TX frequency.
    IDX2.forEach((i, slot) => {
      if (i + 1 >= 4000) return;
      expect(parse2(slot).offsetFrequencyEx).toBe(0);
    });
  });

  it('reads the TX colour code from its own byte, not the RX one', () => {
    // 0x20 is CC and 0x43 is TXCC. Hardware cannot separate them on this
    // codeplug - every channel was programmed with both equal, across all 16
    // values - so the two-byte split comes from the marshaller. What the
    // fixture CAN prove is that the decode reads 0x43 and not 0x20 again.
    const seen = new Set<number>();
    IDX2.forEach((i, slot) => {
      if (i + 1 >= 4000) return;
      const g = parse2(slot);
      expect(g.txColorCode).toBe(g.colorCode);
      seen.add(g.txColorCode!);
    });
    expect(seen.size).toBe(16);

    const rec = Uint8Array.from(B2.subarray(0, 0x80));
    rec[0x43] = (rec[0x20] + 1) & 0x0f;
    const split = parseChannel(rec, 0).channel;
    expect(split.txColorCode).toBe(rec[0x43]);
    expect(split.colorCode).toBe(rec[0x20]);
  });

  it('reads Busy Lock/TX Permit as the stored 0, not the CPS display value', () => {
    // The CPS export shows Off for analog channels and Always for digital ones,
    // which made this column look perfectly confounded with channel type. It is
    // NOT a derived column, as this test once claimed: a codeplug built to set
    // the byte directly exported "Different CDT" and "Channel Free" for 1 and 2.
    // What is true is narrower — a stored 0 renders as Off on analog and Always
    // on digital, so a codeplug that leaves every channel at 0 cannot separate
    // the two. Which is exactly what the captured one does.
    IDX2.forEach((i, slot) => {
      if (i + 1 >= 4000) return;
      expect(parse2(slot).busyLock).toBe(0);
    });
    const rec = Uint8Array.from(B2.subarray(0, 0x80));
    rec[0x1a] = 0x35; // RPGA=3 (Optional Signal), RepLock=5
    const g = parseChannel(rec, 0).channel;
    expect(g.busyLock).toBe(5);
    expect(g.signalingType).toBe('Five Tone');
  });

  it('decodes the marshaller flag bytes that the captured codeplug leaves at one value', () => {
    // 0x22 / 0x34 / 0x36-0x3d hold a single value on all 102 channels, so this
    // asserts the reading rather than the semantics. It exists so that a future
    // codeplug which does vary them fails here loudly instead of silently
    // changing meaning.
    IDX2.forEach((i, slot) => {
      if (i + 1 >= 4000) return;
      const g = parse2(slot);
      expect(g.emergencySystemIndex).toBe(0);
      expect(g.dmrMode).toBe(0);
      expect(g.dataAckDisable).toBe(false);
      // 0x34 reads 0x02 on every channel: bit 1 (`simplex`) set, everything
      // else clear. The CPS shows Digital Duplex = Off, which is what makes
      // this field the inverse of the stored bit.
      expect(g.digitalDuplex).toBe(false);
      expect(g.excludeFromRoaming).toBe(false);
      // `receiveOnly` is deliberately UNDEFINED for this radio. It used to be
      // read from 0x34 bit 3, which was proved on hardware 2026-08-30 to be
      // DataACK forbid instead. Leaving it unset is the point: a field that
      // decides whether a channel may transmit must not be populated from a bit
      // that means something else.
      expect(g.receiveOnly).toBeUndefined();
      expect(g.dataAckForbid).toBe(false);
      expect(g.autoScan).toBe(false);
      expect(g.idleTx).toBe(false);
      expect(g.compander).toBe(false);
      expect(g.dmrCrcIgnore).toBe(false);
      expect(g.analogAprsPttMode).toBe(0);
      expect(g.digitalAprsPttMode).toBe(0);
      expect(g.digitalAprsReportChannel).toBe(1); // stored 0, displayed one-based
      expect(g.normalEmergencyCode).toBe(0);
      expect(g.smsConfirmation).toBe(false);
      expect(g.analogAprsMute).toBe(false);
      expect(g.sendTalkerAlias).toBe(false);
      expect(g.analogAprsTxPath).toBe(0);
      expect(g.arc4Code).toBe(0);
    });
  });

  it('keeps the contact reference an index, against the decompilation', () => {
    // The vendor writer stores `Call_ID` as a clean 32-bit little-endian value
    // and the RE notes read that as "the DMR contact ID itself, not an index".
    // On this radio it is an index: channel 3 uses talkgroup "TG Max", whose
    // DMR ID is 16,776,415, and its 0x14 word reads 2 - the zero-based position
    // of that talkgroup in the six-entry list.
    const rec = B2.subarray(2 * 0x80, 3 * 0x80);
    expect(rec[0x14] | (rec[0x15] << 8) | (rec[0x16] << 16) | (rec[0x17] << 24)).toBe(2);
    expect(parseChannel(rec, 2).channel.contactId).toBe(3);
  });
});
