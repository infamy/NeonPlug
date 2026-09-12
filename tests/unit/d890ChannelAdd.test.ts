/**
 * Adding a channel: building a record the radio has never held.
 *
 * Every encoder here patches bytes the radio gave us, which works for an edit
 * and has nothing to say about an ADD — the read is mask-first, so an
 * unoccupied slot is never fetched. Until 2026-09-11 that refused every newly
 * added channel, which made NeonPlug an editor of existing codeplugs rather
 * than a programmer of radios.
 *
 * The evidence is two records the vendor CPS created and wrote: channel 200
 * (analog 146.000 with TX 146.600, CTCSS 100.0 decode / 167.9 encode) and
 * channel 201 (digital 440.100, colour code RX 7 / TX 15, contact TG0015). The
 * blank is what they AGREE on, and the proof that one blank serves both modes
 * is that every byte where they DIFFER is one the encoder writes from the
 * user's own data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankChannelRecord } from '../../src/radios/d890uv/blankRecords';
import { newChannelRecord } from '../../src/radios/d890uv/channelWrite';
import { parseChannel } from '../../src/radios/d890uv/structures';

const DIR = join(__dirname, '../fixtures/d890uv');
const ANALOG = new Uint8Array(readFileSync(join(DIR, 'channel-fresh-analog-200.bin')));
const DIGITAL = new Uint8Array(readFileSync(join(DIR, 'channel-fresh-digital-201.bin')));
const NAME = { from: 0x44, to: 0x60 };

const hex = (n: number) => `0x${n.toString(16).padStart(2, '0')}`;
const offsets = (r: Uint8Array) => [...r].map((_, i) => i);
const diff = (a: Uint8Array, b: Uint8Array) =>
  offsets(a)
    .filter((i) => a[i] !== b[i])
    .map((i) => `${hex(i)} built=${hex(a[i]!)} vendor=${hex(b[i]!)}`);

/** Rebuild a record from nothing but the blank and the decoded channel. */
const rebuild = (vendor: Uint8Array, index: number) =>
  newChannelRecord(parseChannel(vendor, index).channel, blankChannelRecord());

describe('the two vendor records', () => {
  it('carry the names the operator typed', () => {
    const name = (r: Uint8Array) =>
      Buffer.from(r.subarray(NAME.from, NAME.to)).toString('utf16le').replace(/\0.*$/, '');
    expect(ANALOG).toHaveLength(128);
    expect(name(ANALOG)).toBe('ZULU ANA');
    expect(name(DIGITAL)).toBe('ZULU DIS');
  });

  it('differ ONLY in bytes the encoder writes, which is why one blank serves both', () => {
    const differ = offsets(ANALOG)
      .filter((i) => ANALOG[i] !== DIGITAL[i])
      .filter((i) => i < NAME.from || i >= NAME.to);
    // Frequencies, flags/tones, contact, colour code, DMR flags, TX colour code
    // — every one on the encoder's confirmed allow-list. Were a byte OUTSIDE
    // that list to appear here, one blank could not serve both modes and an
    // analog add would inherit digital defaults.
    expect(differ.map(hex)).toEqual(
      ['0x00', '0x01', '0x05', '0x08', '0x09', '0x0a', '0x0b', '0x14', '0x20', '0x21', '0x43']
    );
  });
});

describe('the blank is what the two records agree on', () => {
  it('matches both vendor records wherever they agree, outside the name', () => {
    const blank = blankChannelRecord();
    const agreed = offsets(ANALOG)
      .filter((i) => ANALOG[i] === DIGITAL[i])
      .filter((i) => i < NAME.from || i >= NAME.to);
    expect(agreed.filter((i) => blank[i] !== ANALOG[i]).map(hex)).toEqual([]);
  });
});

describe('rebuilding a vendor record from nothing but the blank', () => {
  it('reproduces the DIGITAL record byte for byte', () => {
    expect(diff(rebuild(DIGITAL, 200), DIGITAL)).toEqual([]);
  });

  it('reproduces the ANALOG record except the two DCS bytes', () => {
    // 0x0c/0x0e are the DCS code fields. This channel uses CTCSS, so byte 0x09
    // says "CTCSS" and the radio never reads them — the vendor leaves its own
    // 0x11 default there while our encoder writes 0x00 for "no DCS". Both are
    // inert under a CTCSS channel, and the vendor's own channel 102 carries
    // 0x00 here, so neither value is the "right" one to force.
    //
    // Pinned rather than waved through: if this list ever grows, a from-scratch
    // record has started deviating from the vendor somewhere new.
    expect(diff(rebuild(ANALOG, 199), ANALOG)).toEqual([
      '0x0c built=0x00 vendor=0x11',
      '0x0e built=0x00 vendor=0x11',
    ]);
  });

  it('restores the duplex mode, which a blank cannot carry', () => {
    // The real bug this guards: applyChannelToRecord reads duplex OUT of the
    // record and refuses to change it. A blank reads as duplex 0, so an added
    // repeater channel was stored simplex and would have transmitted on its
    // INPUT frequency.
    const built = rebuild(ANALOG, 199);
    expect((built[0x08]! >> 6) & 3).toBe(1);            // TX above RX
    expect([...built.subarray(0x04, 0x08)]).toEqual([0x00, 0x06, 0x00, 0x00]); // +0.600
    const digital = rebuild(DIGITAL, 200);
    expect((digital[0x08]! >> 6) & 3).toBe(2);          // TX below RX
    expect([...digital.subarray(0x04, 0x08)]).toEqual([0x00, 0x01, 0x00, 0x00]); // -0.100
  });

  it('stores RX at 0x04 for a simplex channel, as the vendor does', () => {
    const parsed = parseChannel(ANALOG, 199).channel;
    const simplex = { ...parsed, txFrequency: parsed.rxFrequency };
    const built = newChannelRecord(simplex, blankChannelRecord());
    expect((built[0x08]! >> 6) & 3).toBe(0);
    expect([...built.subarray(0x04, 0x08)]).toEqual([0x14, 0x60, 0x00, 0x00]); // 146.000
  });
});
