import { D890_ADDR } from './constants';

/**
 * DA-7X2 GPS satellite table — vendor form `Frm_Satellite`, "GPS Satellite Data
 * Update". 25 slots of 512 bytes at 0x4a80000, of which only the first 120
 * bytes of each slot are ever written.
 *
 * ⚠️ WRITE PATH IS UNVALIDATED. No satellite table has ever been written to a
 * radio. Two hazards are specific to this table and are NOT generic write risk:
 *
 *   1. Writing is ALL-OR-NOTHING. The vendor serializer zero-fills every unused
 *      slot through slot 24, so uploading three satellites erases the other 22.
 *      This is not a partial update, and `buildSatelliteTable` reproduces that
 *      behaviour deliberately rather than hiding it.
 *   2. Frequency units are inferred, not verified. See `SATELLITE_FREQ_NOTE`.
 */

export const D890_SATELLITE = {
  SLOTS: D890_ADDR.SATELLITE_SLOTS,
  SLOT_BYTES: D890_ADDR.SATELLITE_SLOT_STRIDE,
  /** 25 * 512 = 12800, which is 800 standard 16-byte write frames. */
  TABLE_BYTES: D890_ADDR.SATELLITE_SLOTS * D890_ADDR.SATELLITE_SLOT_STRIDE,
  /** Only bytes 0..119 of each slot carry data; 120..511 stay zero. */
  SLOT_USED_BYTES: 120,
  NAME_LEN: 8,
  TLE1_LEN: 25,
  TLE2_LEN: 60,
} as const;

/**
 * CONFIRMED 2026-08-30 — the unit is 10 Hz.
 *
 * It was inferred until a radio came back holding twelve real satellites. Every
 * one decodes at 10 Hz to its published frequency pair: AO-27 436.795/145.850,
 * ISS 437.800/145.990, SO-50 436.795/145.850, IO-86 435.880/145.880, PO-101
 * 145.900/437.500, and AO-91 145.960/435.250 with RX on 2 m and TX on 70 cm,
 * which is correct for a U/v bird and would look like an error at any other
 * scale. 1 Hz would put them at 4.3 MHz and 100 Hz at 4.3 GHz.
 *
 * Content confirmed the unit where no amount of staring at the bytes could.
 */
export const SATELLITE_FREQ_UNIT_HZ = 10;

/** The CPS-wide 51-entry CTCSS table. Satellite tones are INDICES into this. */
export const D890_SATELLITE_CTCSS = [
  '62.5', '67.0', '69.3', '71.9', '74.4', '77.0', '79.7', '82.5', '85.4', '88.5',
  '91.5', '94.8', '97.4', '100.0', '103.5', '107.2', '110.9', '114.8', '118.8', '123.0',
  '127.3', '131.8', '136.5', '141.3', '146.2', '151.4', '156.7', '159.8', '162.2', '165.5',
  '167.9', '171.3', '173.8', '177.3', '179.9', '183.5', '186.2', '189.9', '192.8', '196.6',
  '199.5', '203.5', '206.5', '210.7', '218.1', '225.7', '229.1', '233.6', '241.8', '250.3',
  '254.1',
] as const;

/** Blank numeric fields become this, not zero. */
export const SATELLITE_BLANK_U32 = 0xffffffff;

export interface D890Satellite {
  name: string;
  /** Full 69-char TLE line, or the pre-extracted fragment. See `tleFragment1`. */
  tleLine1: string;
  tleLine2: string;
  rxFreq1?: number;
  txFreq1?: number;
  txCdt?: number;
  rxCdt?: number;
  /** CTCSS as text, e.g. '88.5' — resolved to a list index on encode. */
  enCtc?: string;
  deCtc?: string;
  /** DCS as text, e.g. 'D023N' / 'D023I'. */
  enDcs?: string;
  deDcs?: string;
  aprsTxFreq?: number;
  armTxCdt?: number;
  armCtc?: string;
  armDcs?: string;
}

/**
 * Extract the 25-character fragment of TLE line 1 that the radio actually stores.
 *
 * ⚠️ THE TWO VENDOR SPECS DISAGREE HERE, and the disagreement silently corrupts
 * data if resolved the wrong way. The prose spec says the radio never sees whole
 * TLE lines — the HTTP updater stores `Mid$(line1, 19, 25)` into the record and
 * the serializer then copies it. The machine-readable slot map says only
 * "TLE_Line1, truncated to 25". Both are true of different stages: the fragment
 * is cut by the fetcher, the truncation happens in the serializer.
 *
 * That means a hand-written CSV containing FULL TLE lines would be truncated to
 * its first 25 characters — line number, catalogue number and part of the epoch —
 * which is not the data the radio expects and would look plausible in a hex dump.
 *
 * So: a full-length line (69 chars, the TLE standard) is cut at the documented
 * offset; anything shorter is assumed already-extracted and passed through.
 */
export function tleFragment1(line: string): string {
  return line.length >= 69 ? line.substring(18, 18 + D890_SATELLITE.TLE1_LEN) : line;
}

/** Line 2's fragment: `Mid$(line2, 9, 60)`, same reasoning as `tleFragment1`. */
export function tleFragment2(line: string): string {
  return line.length >= 69 ? line.substring(8, 8 + D890_SATELLITE.TLE2_LEN) : line;
}

/**
 * Resolve a CTCSS text to its list index.
 *
 * The vendor CPS has a real bug here: all six of its tone lookups run
 * `For i = 0 To ListCount - 2`, so the last entry — 254.1 — never matches and the
 * field is silently left at 0, i.e. 62.5. This raises instead of reproducing
 * that. Silently substituting the wrong tone is worse than refusing the write.
 */
export function ctcssIndex(text: string): number {
  const i = D890_SATELLITE_CTCSS.indexOf(text.trim() as (typeof D890_SATELLITE_CTCSS)[number]);
  if (i < 0) throw new Error(`Unknown satellite CTCSS tone "${text}"`);
  return i;
}

/**
 * Resolve a DCS text to its index: octal digits, +512 when inverted.
 * `D023N` -> octal 23 = 19; `D023I` -> 19 + 512.
 */
export function dcsIndex(text: string): number {
  const m = /^D?(\d{3})([NI])$/i.exec(text.trim());
  if (!m) throw new Error(`Unknown satellite DCS code "${text}"`);
  const value = parseInt(m[1], 8);
  if (Number.isNaN(value)) throw new Error(`Invalid octal DCS code "${text}"`);
  return m[2].toUpperCase() === 'I' ? value + 512 : value;
}

function writeAscii(out: Uint8Array, offset: number, text: string, length: number): void {
  for (let i = 0; i < length; i += 1) {
    const c = text.charCodeAt(i);
    out[offset + i] = Number.isNaN(c) || c > 0x7f ? 0 : c;
  }
}

function writeU32LE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
  out[offset + 2] = (value >>> 16) & 0xff;
  out[offset + 3] = (value >>> 24) & 0xff;
}

function writeU16LE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
}

/** Serialize one satellite into its 512-byte slot. */
export function encodeSatelliteSlot(sat: D890Satellite): Uint8Array {
  const out = new Uint8Array(D890_SATELLITE.SLOT_BYTES);
  writeAscii(out, 0, sat.name.trim(), D890_SATELLITE.NAME_LEN);
  writeAscii(out, 8, tleFragment1(sat.tleLine1), D890_SATELLITE.TLE1_LEN);
  writeAscii(out, 33, tleFragment2(sat.tleLine2), D890_SATELLITE.TLE2_LEN);
  // 93..95 are never written by the vendor serializer; leave them zero.
  writeU32LE(out, 96, sat.rxFreq1 ?? SATELLITE_BLANK_U32);
  writeU32LE(out, 100, sat.txFreq1 ?? SATELLITE_BLANK_U32);
  out[104] = sat.txCdt ?? 0;
  out[105] = sat.rxCdt ?? 0;
  out[106] = sat.enCtc ? ctcssIndex(sat.enCtc) : 0;
  out[107] = sat.deCtc ? ctcssIndex(sat.deCtc) : 0;
  writeU16LE(out, 108, sat.enDcs ? dcsIndex(sat.enDcs) : 0);
  writeU16LE(out, 110, sat.deDcs ? dcsIndex(sat.deDcs) : 0);
  writeU32LE(out, 112, sat.aprsTxFreq ?? SATELLITE_BLANK_U32);
  out[116] = sat.armTxCdt ?? 0;
  out[117] = sat.armCtc ? ctcssIndex(sat.armCtc) : 0;
  writeU16LE(out, 118, sat.armDcs ? dcsIndex(sat.armDcs) : 0);
  return out;
}

/**
 * Build the whole 12800-byte table.
 *
 * A satellite with a blank TLE line 1 is DROPPED and does not consume a slot —
 * the vendor loader does the same, and it does so regardless of the record's
 * `isOk` flag, so a row can vanish while looking enabled.
 *
 * Every slot past the supplied ones is zeroed, because that is what the radio
 * will receive. The caller is destroying those satellites whether or not it
 * meant to; see the class comment.
 */
export function buildSatelliteTable(sats: D890Satellite[]): Uint8Array {
  const kept = sats.filter((s) => s.tleLine1.trim() !== '');
  if (kept.length > D890_SATELLITE.SLOTS) {
    throw new Error(
      `DA-7X2 holds ${D890_SATELLITE.SLOTS} satellites, got ${kept.length}`
    );
  }
  const table = new Uint8Array(D890_SATELLITE.TABLE_BYTES);
  kept.forEach((sat, i) => {
    table.set(encodeSatelliteSlot(sat), i * D890_SATELLITE.SLOT_BYTES);
  });
  return table;
}

/** How many rows a build would silently drop, so the UI can warn first. */
export function countDroppedSatellites(sats: D890Satellite[]): number {
  return sats.filter((s) => s.tleLine1.trim() === '').length;
}

/** One satellite as the radio stores it. */
export interface D890SatelliteRecord {
  slot: number;
  name: string;
  tleFragment1: string;
  tleFragment2: string;
  rxFreq1: number | null;
  txFreq1: number | null;
  aprsTxFreq: number | null;
}

function readAscii(b: Uint8Array, off: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    const c = b[off + i] ?? 0;
    if (c === 0) break;
    if (c < 32 || c > 126) break;
    out += String.fromCharCode(c);
  }
  return out;
}

function readU32LE(b: Uint8Array, off: number): number {
  return (
    ((b[off] ?? 0) | ((b[off + 1] ?? 0) << 8) | ((b[off + 2] ?? 0) << 16) | ((b[off + 3] ?? 0) << 24)) >>> 0
  );
}

/**
 * Decode the 12800-byte table.
 *
 * A slot whose first 120 bytes are all zero is empty, not a nameless satellite —
 * the vendor serializer actively zero-fills unused slots, so that pattern is
 * what "no satellite" looks like. `0xFFFFFFFF` in a frequency means unset.
 */
export function decodeSatelliteTable(bytes: Uint8Array): D890SatelliteRecord[] {
  const out: D890SatelliteRecord[] = [];
  for (let i = 0; i < D890_SATELLITE.SLOTS; i += 1) {
    const base = i * D890_SATELLITE.SLOT_BYTES;
    const slot = bytes.subarray(base, base + D890_SATELLITE.SLOT_BYTES);
    if (slot.length < D890_SATELLITE.SLOT_USED_BYTES) break;
    const freq = (o: number) => {
      const v = readU32LE(slot, o);
      // 0xFFFFFFFF is the vendor's "unset". A stored 0 is also not a frequency.
      return v === SATELLITE_BLANK_U32 || v === 0 ? null : v;
    };
    const name = readAscii(slot, 0, D890_SATELLITE.NAME_LEN);
    const rx = freq(96);
    const tx = freq(100);
    const aprs = freq(112);
    const tle1 = readAscii(slot, 8, D890_SATELLITE.TLE1_LEN);
    // An unused slot is NOT reliably all-zero on a real radio: the ones on the
    // captured DA-7X2 carry 0xFFFFFFFF in every frequency field, which a
    // "any non-zero byte means used" test counts as thirteen phantom
    // satellites. A slot with no name, no orbit data and no frequency is empty
    // whatever its padding happens to be.
    if (!name && !tle1 && rx === null && tx === null && aprs === null) continue;
    out.push({
      slot: i + 1,
      name,
      tleFragment1: tle1,
      tleFragment2: readAscii(slot, 33, D890_SATELLITE.TLE2_LEN),
      rxFreq1: rx,
      txFreq1: tx,
      aprsTxFreq: aprs,
    });
  }
  return out;
}

/** Stored value to MHz. The unit is 10 Hz, confirmed against real satellites. */
export function satelliteFreqToMHz(stored: number | null): number | null {
  return stored === null ? null : (stored * SATELLITE_FREQ_UNIT_HZ) / 1e6;
}
