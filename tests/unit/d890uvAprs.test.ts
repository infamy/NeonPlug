import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseD890AprsSettings,
  aprsPositionToDecimal,
  D890_APRS_NO_CHANNEL,
} from '../../src/radios/d890uv/aprs';

/**
 * Real bytes from 0x3501000, read off a DA-7X2 on 2026-08-30.
 *
 * Every expectation is the vendor CPS's own `APRS.CSV` export of the same
 * codeplug, so this compares NeonPlug's decode against the manufacturer's decode
 * of identical bytes. Sixteen fields matched exactly on the first pass.
 */
const BYTES = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/d890uv/aprs-settings.bin')),
);

describe('DA-7X2 APRS settings', () => {
  const aprs = parseD890AprsSettings(BYTES)!;

  it('decodes the position exactly as the vendor exports it', () => {
    // APRS.CSV: LatiDegree 34, LatiMinInt 12, LatiMinMark 73, North;
    //           LongtiDegree 108, LongtiMinInt 50, LongtiMinMark 0, East.
    // Degrees / whole minutes / hundredths of a minute in three separate bytes —
    // not a scaled fixed-point value, which is what it looks like at a glance.
    expect(aprs.latitude).toEqual({ degrees: 34, minutes: 12, minuteFraction: 73, south: false });
    expect(aprs.longitude).toEqual({ degrees: 108, minutes: 50, minuteFraction: 0, west: false });
    expect(aprsPositionToDecimal(aprs.latitude)).toBeCloseTo(34 + (12 + 0.73) / 60, 6);
    expect(aprsPositionToDecimal(aprs.longitude)).toBeCloseTo(108 + 50 / 60, 6);
  });

  it('reads six-character callsigns that carry no terminator', () => {
    // The trap: "BG6LKK" fills its field exactly and the SSID byte follows
    // immediately, so reading to a NUL swallows the SSID as a seventh character.
    // Both callsigns are fixed-width six with their SSID in the next byte.
    expect(aprs.sourceCall).toBe('BG6LKK');
    expect(aprs.sourceSsid).toBe(8);
    expect(aprs.destinationCall).toBe('APAT51');
    expect(aprs.destinationSsid).toBe(0);
    expect(BYTES[0x23]).toBe(8); // the byte a NUL-scan would have eaten
  });

  it('reads the digipeater path and the symbol pair', () => {
    expect(aprs.digipeaterPath).toBe('WIDE1-1');
    expect(aprs.symbolTable).toBe('/');
    expect(aprs.mapIcon).toBe('&');
  });

  it('matches the remaining scalar columns of the export', () => {
    expect(aprs.manualTxIntervalS).toBe(40);
    expect(aprs.dcs).toBe(19);
    expect(aprs.fixedLocationBeacon).toBe(true);
  });

  it('scales the two millisecond fields, and both rest on one point each', () => {
    // 60 -> 1200 ms and 150 -> 1500 ms per the CPS. Each is a SINGLE observation,
    // so the step is under-determined — the values are right for this codeplug
    // and the multiplier is an inference. A second codeplug settles both.
    expect(BYTES[0x05]).toBe(60);
    expect(aprs.txDelayMs).toBe(1200);
    expect(BYTES[0x3c]).toBe(150);
    expect(aprs.prewaveMs).toBe(1500);
  });

  it('treats 4002 in an upload slot as "no channel"', () => {
    // All eight slots hold 4002, which is the VFO B slot number rather than a
    // real channel. The CPS shows them as unset.
    expect(aprs.digitalUploadChannels).toHaveLength(8);
    expect(aprs.digitalUploadChannels.every((c) => c === null)).toBe(true);
    const set = Uint8Array.from(BYTES);
    set[0x40] = 0x2a;
    set[0x41] = 0x00;
    expect(parseD890AprsSettings(set)!.digitalUploadChannels[0]).toBe(42);
    expect(D890_APRS_NO_CHANNEL).toBe(4002);
  });

  it('returns null on a short buffer instead of a zeroed object', () => {
    // A partial read must not look like a radio with APRS switched off.
    expect(parseD890AprsSettings(BYTES.subarray(0, 0x20))).toBeNull();
  });
});
