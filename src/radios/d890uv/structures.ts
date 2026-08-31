/**
 * AT-D890UV / DA-7X2 record decoders — pure functions, no I/O.
 *
 * Record layouts for channels, zones, scan lists, talkgroups and names are
 * hardware-verified (2026-08-25) and pinned by tests/unit/d890uvFixtures.test.ts
 * against real captured bytes. Tone decoding is not — see constants.ts.
 *
 * Everything here is deliberately a standalone function taking bytes and
 * returning data, so it can be unit-tested without a radio (the same split the
 * DM-32's structures.ts uses). The protocol layer does the addressing and
 * sequencing; this file only knows byte layouts.
 *
 * Read path only for now — no encoders. Writing to this radio is not
 * implemented and must not be until the layouts below are hardware-confirmed.
 */

import type { Zone } from '../../models/Zone';
import type { Contact } from '../../models/Contact';
import type { QuickContact } from '../../models/QuickContact';
import type { DMRRadioID } from '../../models/DMRRadioID';
import type { RXGroup } from '../../models/RXGroup';
import type { Channel, ChannelMode, PowerLevel, Bandwidth } from '../../models/Channel';
import { generateZoneId } from '../../utils/zoneHelpers';
import { createDefaultChannel } from '../../utils/channelHelpers';
import {
  D890_ADDR,
  D890_LIMITS,
  D890_SENTINEL,
  D890_CALL_TYPES,
  D890_CTCSS_NONE_INDEX,
  D890_CTCSS_TONES,
  D890_TONE_FLAG,
  D890_DCS_INVERTED_BIT,
  D890_DCS_CODE_MASK,
  D890_SCAN_REVERT_CHANNEL,
  D890_SCAN_MODE,
} from './constants';

/**
 * Byte 0x1a, BITS 5-4 — the vendor's "Optional Signal" column. The stored values
 * are 0x00/0x10/0x20/0x30, so this is a shifted field rather than the low bits;
 * read straight off a codeplug carrying all four values.
 */
const D890_OPTIONAL_SIGNAL = ['None', 'DTMF', 'Two Tone', 'Five Tone'] as const;

/** Byte 0x35, low two bits — the vendor's "APRS Report Type" column. */
const D890_APRS_REPORT = ['Off', 'Analog', 'Digital'] as const;

/**
 * Squelch mode, byte 0x19 high nibble.
 *
 * Indices 0 and 1 are confirmed against hardware. 2 and 3 are the vendor's own
 * option names for the same list and are included so a radio set to one of them
 * does not fall back to "Carrier".
 */
const D890_SQUELCH_MODE = ['Carrier/CTC', 'CTCSS/DCS', 'Optional', 'CTC&Opt'] as const;

/**
 * Fields the radio stores zero-based and the vendor CPS displays one-based.
 * Values above the vendor's limit mean "none" and surface as 0.
 */
function oneBased(raw: number | undefined, limit = 0x0f): number {
  const v = raw ?? 0;
  return v > limit ? 0 : v + 1;
}

/** Byte 0x39 is a signed offset extension. */
function signedByte(v: number): number {
  return v > 0x7f ? v - 0x100 : v;
}

// ---------------------------------------------------------------------------
// Addressing
// ---------------------------------------------------------------------------

/**
 * A channel body is 0x80 bytes, but it is NOT stored contiguously: it lives as
 * two 0x40 halves, the second immediately after the first, inside a block that
 * holds 128 channels. Blocks are 0x80000 apart, which is far larger than
 * 128 * 0x80 — so the naive `base + index * 0x80` is wrong past channel 127.
 */
export function channelAddresses(index: number): { primary: number; secondary: number } {
  const blockIndex = Math.floor(index / D890_ADDR.CHANNELS_PER_BLOCK);
  const indexInBlock = index % D890_ADDR.CHANNELS_PER_BLOCK;
  const primary =
    D890_ADDR.CHANNEL_DATA +
    blockIndex * D890_ADDR.CHANNEL_BLOCK_STRIDE +
    indexInBlock * D890_ADDR.CHANNEL_STRIDE;
  return { primary, secondary: primary + D890_ADDR.CHANNEL_HALF };
}

/** Address of one zone's name field. */
export function zoneNameAddress(index: number): number {
  return D890_ADDR.ZONE_NAMES + index * D890_ADDR.ZONE_NAME_STRIDE;
}

/** Address of one zone's channel-membership array. */
export function zoneChannelsAddress(index: number): number {
  return D890_ADDR.ZONE_CHANNELS + index * D890_ADDR.ZONE_CHANNELS_STRIDE;
}

/** Address of one DMR radio-ID record. */
export function radioIdAddress(index: number): number {
  return D890_ADDR.RADIO_ID_DATA + index * D890_ADDR.RADIO_ID_STRIDE;
}

/**
 * Decodes one DMR radio-ID record.
 *
 * Layout confirmed against hardware: BCD-as-hex ID in bytes 0x00-0x03, then a
 * UTF-16LE name from 0x04. Same BCD convention as channel frequencies and
 * talkgroup IDs, so it reuses decodeBcdAsHexU32 rather than re-deriving it.
 */
export function parseRadioId(bytes: Uint8Array, index: number): DMRRadioID {
  const dmrIdValue = decodeBcdAsHexU32(bytes.subarray(0x00, 0x04));
  return {
    index,
    dmrId: String(dmrIdValue),
    dmrIdValue,
    dmrIdBytes: bytes.slice(0x00, 0x04),
    name: decodeWideCharString(bytes.subarray(0x04, 0x24), D890_LIMITS.NAME_MAX_CHARS),
  };
}

/**
 * Scan-list timers (look-back A/B, dropout delay, dwell) are stored in tenths of
 * a second. Multiply the raw u16 by this to get seconds.
 */
export const D890_SCAN_TIME_STEP_S = 0.1;

/**
 * Address of one scan-list record.
 *
 * Blocked exactly like channels: 32 lists per 0x80000 block. This was flat
 * until 2026-08-30, which is right for lists 0-31 and silently reads the wrong
 * memory for every list above that (list 32 is at 0x2180000, not 0x2104000).
 * The split comes from the vendor scan-list marshaller, not from hardware —
 * only two lists have ever been read back.
 */
export function scanListAddress(index: number): number {
  const blockIndex = Math.floor(index / D890_ADDR.SCAN_LISTS_PER_BLOCK);
  const indexInBlock = index % D890_ADDR.SCAN_LISTS_PER_BLOCK;
  return (
    D890_ADDR.SCAN_LIST_DATA +
    blockIndex * D890_ADDR.SCAN_LIST_BLOCK_STRIDE +
    indexInBlock * D890_ADDR.SCAN_LIST_STRIDE
  );
}

/** Address of one talkgroup record. */
/**
 * Talkgroups per bank.
 *
 * ⚠️ INFERRED, and untested — the only codeplug ever loaded onto a radio here
 * held six talkgroups, so nothing past bank 0 has been observed.
 *
 * 1250 is chosen because 8 banks x 1250 is exactly the documented 10,000
 * capacity, and 1250 * 0xc8 = 0x3d090 fits inside the 0x40000 bank. The bank
 * would physically hold 1310 records, so if the radio packs them tightly this
 * is wrong for indices 1250-1309. Both candidates agree below 1250.
 */
export const D890_TALKGROUPS_PER_BANK = 1250;

/**
 * Address of one talkgroup record.
 *
 * Banked, not flat: the vendor CPS computes
 * `0x3a00000 + bank * 0x40000 + index * 0xc8` at three identical call sites.
 * This read flat until 2026-08-29, which is correct inside bank 0 and silently
 * wrong beyond it.
 */
export function talkgroupAddress(index: number): number {
  const bank = Math.floor(index / D890_TALKGROUPS_PER_BANK);
  const inBank = index % D890_TALKGROUPS_PER_BANK;
  return (
    D890_ADDR.TALKGROUP_DATA +
    bank * D890_ADDR.TALKGROUP_BANK_STRIDE +
    inBank * D890_ADDR.TALKGROUP_STRIDE
  );
}

/** Address of one receive-group record. */
export function rxGroupAddress(index: number): number {
  return D890_ADDR.RX_GROUP_DATA + index * D890_ADDR.RX_GROUP_STRIDE;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Occupancy bitmaps: slot n lives in byte n/8, bit n%8.
 *
 * `inverted` exists solely for the talkgroup bitmap, where a set bit means the
 * slot is EMPTY. Passing the wrong sense yields either no contacts at all or
 * ten thousand phantom ones, so callers pass the named constant rather than a
 * bare boolean.
 */
export function decodeOccupancyBitmap(
  bytes: Uint8Array,
  slotCount: number,
  inverted = false
): boolean[] {
  const out: boolean[] = new Array(slotCount);
  for (let slot = 0; slot < slotCount; slot++) {
    const byte = bytes[slot >> 3] ?? 0;
    const bitSet = (byte & (1 << (slot & 7))) !== 0;
    out[slot] = inverted ? !bitSet : bitSet;
  }
  return out;
}

/** Indices of occupied slots, for iterating only the records that exist. */
export function occupiedIndices(occupancy: boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < occupancy.length; i++) if (occupancy[i]) out.push(i);
  return out;
}

/**
 * Names on this radio are wide-char (2 bytes per character), unlike the
 * single-byte ASCII the DM-32 and Yaesu radios use. Stops at the first NUL, so
 * a name that fills the field without a terminator still decodes.
 *
 * Endianness is the documented uncertainty here: the reference says
 * "UTF-16/UTF-16LE" without committing. LE is assumed; a hardware read of a
 * known name settles it instantly (a wrong guess renders as CJK garbage, so it
 * fails loudly rather than silently).
 */
export function decodeWideCharString(bytes: Uint8Array, maxChars?: number): string {
  const limit = Math.min(maxChars ?? bytes.length >> 1, bytes.length >> 1);
  let out = '';
  for (let i = 0; i < limit; i++) {
    const code = (bytes[i * 2] ?? 0) | ((bytes[i * 2 + 1] ?? 0) << 8);
    // The radio terminates names with 0xFFFF and pads with 0xFF, not with NUL —
    // the vendor's own decoder stops on 0xFFFF. Stopping only on 0x0000 leaks
    // the terminator and the padding into the string as U+FFFF characters, which
    // no test with a short name would ever show.
    if (code === 0 || code === 0xffff) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

/**
 * "BCD-as-hex": each byte's *hex* representation is read as two decimal digits.
 * Byte 0x23 means the digits "23", not the value 35.
 *
 *   bytes 00 02 35 59 -> "00023559" -> 23559
 *
 * Big-endian: the first byte carries the most significant digits. Used for both
 * DMR IDs and (scaled by 10 Hz) frequencies.
 *
 * Returns NaN for non-BCD nibbles rather than silently producing a wrong
 * number — an 0xAF nibble means the record is not what we think it is.
 */
export function decodeBcdAsHexU32(bytes: Uint8Array): number {
  let digits = '';
  for (let i = 0; i < 4; i++) {
    const b = bytes[i] ?? 0;
    const hi = b >> 4;
    const lo = b & 0x0f;
    if (hi > 9 || lo > 9) return NaN;
    digits += String(hi) + String(lo);
  }
  return parseInt(digits, 10);
}

/** Frequency in Hz. The stored value counts 10 Hz units. */
export function decodeFrequencyHz(bytes: Uint8Array): number {
  const raw = decodeBcdAsHexU32(bytes);
  return Number.isNaN(raw) ? NaN : raw * 10;
}

/** Frequency in MHz, which is what the Channel model stores. */
export function decodeFrequencyMHz(bytes: Uint8Array): number {
  const hz = decodeFrequencyHz(bytes);
  return Number.isNaN(hz) ? NaN : hz / 1_000_000;
}

/** Little-endian u16 at an offset. */
export function readU16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/** Big-endian u16 — used only for the channel's contact reference (0x13-0x14). */
export function readU16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

/** Little-endian u32, for receive-group member entries. */
export function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

/**
 * Membership arrays are fixed-size with a sentinel for empty slots. The sentinel
 * marks a *hole*, not a terminator — the reference says to skip 0xffff entries
 * rather than stop at the first one, so a list with a gap keeps its later
 * members.
 */
export function decodeU16Members(
  bytes: Uint8Array,
  maxMembers: number,
  offset = 0
): number[] {
  const out: number[] = [];
  // Never read past the buffer. readU16LE returns 0 for missing bytes, and 0 is
  // a perfectly valid channel index — so a short read used to manufacture
  // hundreds of phantom "channel 1" members rather than stopping. Caught by a
  // real 64-byte zone capture against a 256-entry maximum.
  const available = Math.max(0, Math.floor((bytes.length - offset) / 2));
  const limit = Math.min(maxMembers, available);
  for (let i = 0; i < limit; i++) {
    const value = readU16LE(bytes, offset + i * 2);
    // TERMINATOR, not a hole. The reference says to skip 0xffff and keep going;
    // hardware says otherwise. A real scan list holding 8 channels reads
    //   0x30: 00 00 01 00 .. 07 00   8 members
    //   0x40-0x93: ff ff ..          padding
    //   0x94 onward: 00 00 ..        ZEROS
    // and 0x0000 is a legitimate channel index (channel 1), so "skip holes"
    // turned every trailing zero into another channel 1 — 58 members instead of
    // 8, which is what showed up in the scan-list editor. Stopping at the first
    // sentinel is right whichever way the array length is read.
    if (value === D890_SENTINEL.NO_MEMBER_U16) break;
    // A channel index at or above the radio's own maximum cannot be a member.
    if (value >= D890_LIMITS.CHANNELS_MAX) break;
    out.push(value);
  }
  return out;
}

/** Same, for the 32-bit talkgroup references in a receive group. */
export function decodeU32Members(bytes: Uint8Array, maxMembers: number, offset = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < maxMembers; i++) {
    const value = readU32LE(bytes, offset + i * 4);
    if (value === D890_SENTINEL.NO_MEMBER_U32) continue;
    out.push(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * One zone. Channel members are stored as global 0-based channel indices; the
 * Zone model holds channel *numbers*, which are 1-based throughout NeonPlug.
 */
export function parseZone(
  nameBytes: Uint8Array,
  memberBytes: Uint8Array,
  index: number
): Zone {
  const name = decodeWideCharString(nameBytes, D890_LIMITS.NAME_MAX_CHARS);
  // Structural, not the enforced cap: reading is where truncation is silent and
  // unrecoverable, so a zone larger than the CPS could have built is still read
  // whole. The 160-channel limit is applied where zones are edited.
  const members = decodeU16Members(memberBytes, D890_LIMITS.ZONE_MEMBERS_STRUCTURAL);
  return {
    id: generateZoneId(),
    name: name || `Zone ${index + 1}`,
    channels: members.map((wireIndex) => wireIndex + 1),
  };
}

/** Decoded talkgroup, mapped onto the shared Contact model. */
export function parseTalkgroup(bytes: Uint8Array, index: number): Contact {
  const callTypeRaw = bytes[0x00] ?? 0;
  const dmrId = decodeBcdAsHexU32(bytes.subarray(0x02, 0x06));
  const name = decodeWideCharString(bytes.subarray(0x06, 0x26), D890_LIMITS.NAME_MAX_CHARS);
  return {
    id: index + 1,
    name: name || `TG ${index + 1}`,
    dmrId: Number.isNaN(dmrId) ? 0 : dmrId,
    // The shared Contact model has no call-type field; it is carried in `remark`
    // rather than dropped, so a read round-trips visibly in the UI until the
    // model grows a proper field. See D890UV-HARDWARE-CHECKLIST.md.
    remark: D890_CALL_TYPES[callTypeRaw] ?? `Unknown(${callTypeRaw})`,
  };
}

/**
 * The same talkgroup record, as the `QuickContact` the Digital tab and the
 * channel grid's TX-contact dropdown are built around.
 *
 * Two models for one record is not ideal, but `Contact` (which `parseTalkgroup`
 * returns) has no call-type field and carries it in `remark` as a label, and the
 * grid needs the numeric type to render Grp/Prv/All. Rather than widen the
 * shared model for one radio, this maps to the shape those components already
 * consume.
 *
 * Call type is renumbered: the D890 stores 0/1/2 for Private/Group/All while the
 * shared model uses the DM-32's 3/4/5. Same order, different origin.
 */
export function parseTalkgroupQuick(bytes: Uint8Array, index: number): QuickContact {
  const contact = parseTalkgroup(bytes, index);
  return {
    index: index + 1,
    offset: 0,
    name: contact.name,
    contactNumber: contact.dmrId,
    callType: ((bytes[0x00] ?? 0) & 0x03) + 0x03,
    hasHeader: false,
    flag: 0,
    rawData: bytes.slice(0, D890_ADDR.TALKGROUP_STRIDE),
  };
}

/**
 * One receive group. Members are talkgroup *bank slot indices*, not DMR IDs —
 * resolving them to IDs needs the talkgroup table, so that is left to the
 * protocol layer which has both in hand.
 */
export function parseRxGroup(bytes: Uint8Array, index: number): RXGroup {
  const members = decodeU32Members(bytes, D890_LIMITS.RX_GROUP_MEMBERS_MAX);
  const name = decodeWideCharString(
    bytes.subarray(
      D890_ADDR.RX_GROUP_NAME_OFFSET,
      D890_ADDR.RX_GROUP_NAME_OFFSET + D890_ADDR.RX_GROUP_NAME_LEN
    ),
    D890_LIMITS.NAME_MAX_CHARS
  );
  return {
    index,
    name: name || `RX Group ${index + 1}`,
    talkGroupIndices: members,
    // DM-32 wire-format fields with no D890 equivalent. They exist on the shared
    // RXGroup model because it was shaped around the DM-32's metadata blocks.
    bitmask: 0,
    statusFlag: 0,
    entryFlag: 0x01,
    validationFlag: 0,
  };
}

/**
 * Scan-list fields the D890 and the shared ScanList model agree on.
 *
 * The model is DM-32-shaped (`ctcScanMode`, `scanTxMode`, `designatedTxChannel`
 * are DM-32 wire concepts), so this fills only what genuinely maps and leaves
 * the rest at defaults. Timers are deciseconds on the wire; `hangTime` on the
 * model is also tenths, so it passes through unscaled.
 */
export function parseScanList(bytes: Uint8Array, index: number): ScanListDecoded {
  const name = decodeWideCharString(bytes.subarray(0x0e, 0x2e), D890_LIMITS.NAME_MAX_CHARS);
  const members = decodeU16Members(
    bytes,
    D890_LIMITS.SCAN_LIST_MEMBERS_MAX,
    0x30
  );
  return {
    name: name || `Scan ${index + 1}`,
    channels: members.map((wireIndex) => wireIndex + 1),
    prioritySelect: bytes[0x01] ?? 0,
    priorityChannel1Raw: readU16LE(bytes, 0x02),
    priorityChannel2Raw: readU16LE(bytes, 0x04),
    // Timers are stored in units of 0.1 s. Confirmed against a codeplug whose
    // two scan lists carry eight distinct timer values: the radio held
    // 5/26/31/32 and 20/31/37/38 where the vendor CPS showed 0.5/2.6/3.1/3.2 and
    // 2.0/3.1/3.7/3.8 seconds. These stay RAW here; use D890_SCAN_TIME_STEP_S to
    // present them.
    lookBackTimeA: readU16LE(bytes, 0x06),
    lookBackTimeB: readU16LE(bytes, 0x08),
    dropoutDelay: readU16LE(bytes, 0x0a),
    dwellTime: readU16LE(bytes, 0x0c),
    // 0x94, not 0xf8. The four trailing settings sit immediately after the
    // 50-entry member array (0x30..0x93); 0xf8 is inside the zero fill and
    // returned 0 (or 0xff) on every list ever read. Offsets from the vendor
    // marshaller pair and confirmed against two captured lists whose CPS export
    // shows distinct revert-channel values (0x04 and 0x06).
    revertChannel: bytes[0x94] ?? 0,
    scanMode: bytes[0x00] ?? 0,
    revertChannelLabel: D890_SCAN_REVERT_CHANNEL[bytes[0x94] ?? 0],
    scanModeLabel: D890_SCAN_MODE[bytes[0x00] ?? 0],
    digitalGroupHold: bytes[0x95] ?? 0,
    digitalPriorityHold: bytes[0x96] ?? 0,
    analogHold: bytes[0x97] ?? 0,
  };
}

/**
 * D890 scan-list shape. Deliberately NOT the shared `ScanList` model: half that
 * model is DM-32 wire format, and half of this has no home in it. The protocol
 * layer narrows this to `ScanList` for the UI; keeping the full decode here
 * means nothing is silently lost at the byte level.
 */
export interface ScanListDecoded {
  name: string;
  /** 1-based channel numbers. */
  channels: number[];
  /** 0=Off, 1=Select 1, 2=Select 2, 3=Both. */
  prioritySelect: number;
  /** Raw wire value: 0xffff=Off, 0x0000=Current, n>=1 => channel index n-1. */
  priorityChannel1Raw: number;
  priorityChannel2Raw: number;
  /** All four timers are in deciseconds. */
  lookBackTimeA: number;
  lookBackTimeB: number;
  dropoutDelay: number;
  dwellTime: number;
  /** Byte 0x94, the vendor's `Scn_RevertCh`. Raw index into D890_SCAN_REVERT_CHANNEL. */
  revertChannel: number;
  /** Byte 0x00, the vendor's `Scn_Mode`. Raw index into D890_SCAN_MODE. */
  scanMode: number;
  /**
   * The vendor's label for `revertChannel`, or undefined for an index outside
   * the eight-entry list. Undefined rather than a fallback on purpose: the CPS
   * silently clamps an out-of-range index to 0, so a value it cannot name means
   * the record did not come from the CPS and guessing would hide that.
   */
  revertChannelLabel?: string;
  /** The vendor's label for `scanMode`, or undefined outside the list. */
  scanModeLabel?: string;
  /** Byte 0x95, `ScanDigiGroupHold`. */
  digitalGroupHold: number;
  /** Byte 0x96, `ScanDigiPriHold`. */
  digitalPriorityHold: number;
  /** Byte 0x97, `ScanAnaHold`. */
  analogHold: number;
}

/**
 * Resolve a raw priority-channel field to a 1-based channel number.
 * Returns undefined for Off, and null for "Current channel".
 */
export function decodePriorityChannel(raw: number): number | null | undefined {
  if (raw === D890_SENTINEL.NO_MEMBER_U16) return undefined; // Off
  if (raw === 0) return null; // Current
  return raw; // wire n>=1 means index n-1, i.e. channel number n
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * Decode a DCS field: the octal code stored as a decimal number, with bit 9 set
 * for inverted polarity. Hardware-derived (see D890_DCS_INVERTED_BIT).
 *
 *   19 -> 023 normal, 531 -> 023 inverted, 492 -> 754 normal
 *
 * NeonPlug marks inverted polarity 'P' (matching the DM-32 codec), normal 'N'.
 */
export function decodeDcsField(raw: number): { code: number; polarity: 'N' | 'P' } | null {
  if (raw === 0) return null;
  const inverted = (raw & D890_DCS_INVERTED_BIT) !== 0;
  // The stored decimal reads as octal digits: 19 -> "23" -> code 23.
  const code = parseInt((raw & D890_DCS_CODE_MASK).toString(8), 10);
  return { code, polarity: inverted ? 'P' : 'N' };
}

/**
 * A decoded channel plus everything the decode could not yet resolve.
 *
 * The raw tone indices ride along because the D890's 51-entry CTCSS table is
 * undocumented (checklist §6). Returning them means a hardware session can build
 * the table by diffing against the OEM CPS, and means the decode loses nothing
 * even while `channel.rxCtcssDcs` reads as None.
 */
export interface D890ChannelDecode {
  channel: Channel;
  /** Raw byte 0x0a. 51 (D890_CTCSS_NONE_INDEX) means no tone. */
  rxToneIndex: number;
  /** Raw byte 0x0b. */
  txToneIndex: number;
  /** Raw u16 at 0x0c / 0x0e. Non-zero means a DCS code is set. */
  rxDcsRaw: number;
  txDcsRaw: number;
  /** True when a tone is present that this build cannot name. */
  hasUnresolvedTone: boolean;
}

/**
 * Decode one 128-byte channel record (the two 0x40 halves concatenated).
 *
 * Built on `createDefaultChannel`, which is how the UV5R-Mini already produces
 * Channels — the shared model carries DM-32 wire fields that have no D890
 * meaning, and that factory is the sanctioned place for their neutral defaults.
 *
 * ⚠️ Two documented ambiguities, both flagged in checklist §7:
 *   - 0x04-0x07 is "offset / TX frequency" depending on the duplex bits. This
 *     treats it as TX frequency when simplex, and as an offset otherwise. That
 *     is a guess and it matters for every repeater channel.
 *   - The reference puts "DMR mode" at 0x21 bit 2 *and* "type" at 0x08 bits 0-1.
 *     They overlap in meaning; 0x08 is used here as the authority.
 */
export function parseChannel(
  bytes: Uint8Array,
  index: number,
  toneTable?: readonly number[]
): D890ChannelDecode {
  const flags = bytes[0x08] ?? 0;
  const duplex = (flags >> 6) & 0x03;
  const bandwidthBits = (flags >> 4) & 0x03;
  const powerBits = (flags >> 2) & 0x03;
  const typeBits = flags & 0x03;

  const rxFrequency = decodeFrequencyMHz(bytes.subarray(0x00, 0x04));
  const offsetOrTx = decodeFrequencyMHz(bytes.subarray(0x04, 0x08));

  // Simplex stores the TX frequency outright; the offset modes store a delta.
  let txFrequency: number;
  if (duplex === 1) txFrequency = rxFrequency + offsetOrTx;
  else if (duplex === 2) txFrequency = rxFrequency - offsetOrTx;
  else txFrequency = Number.isNaN(offsetOrTx) || offsetOrTx === 0 ? rxFrequency : offsetOrTx;

  // ENCODE is what the radio transmits; DECODE is what it requires to open
  // squelch on receive. So 0x0a/0x0c are the TX tone and 0x0b/0x0e the RX tone —
  // the opposite of the obvious reading, and these were swapped until a hardware
  // probe caught it. Symmetric channels (the common case) hide the mistake
  // completely, which is exactly why the probe set included a TX-only channel:
  // programmed "decode Off, encode 88.5", it read back 0x0a=9 (88.5) and 0x0b=0.
  const txToneIndex = bytes[0x0a] ?? D890_CTCSS_NONE_INDEX;
  const rxToneIndex = bytes[0x0b] ?? D890_CTCSS_NONE_INDEX;
  const txDcsRaw = readU16LE(bytes, 0x0c);
  const rxDcsRaw = readU16LE(bytes, 0x0e);

  // Tone kind and direction both live in byte 0x09, one bit each for CTCSS/DCS
  // on RX and TX. Hardware-derived 2026-08-25: CTCSS both ways reads 0x05, CTCSS
  // TX-only 0x04, DCS both ways 0x0a. Because the kind is stated explicitly,
  // it never has to be guessed from whether the DCS field is non-zero — and the
  // gating matters: every channel on a real radio carries leftover values in
  // both tone fields while 0x09 is 0x00, meaning no tone at all.
  const toneFlags = bytes[0x09] ?? 0;

  const resolveTone = (ctcssBit: number, dcsBit: number, toneIndex: number, dcsRaw: number) => {
    if (toneFlags & dcsBit) {
      const dcs = decodeDcsField(dcsRaw);
      if (dcs) return { type: 'DCS' as const, value: dcs.code, polarity: dcs.polarity };
      return { type: 'None' as const };
    }
    if (toneFlags & ctcssBit) {
      const hz = (toneTable ?? D890_CTCSS_TONES)[toneIndex];
      if (hz !== undefined) return { type: 'CTCSS' as const, value: hz };
    }
    return { type: 'None' as const };
  };

  // Unresolved means "the radio has a tone we could not name". With the table
  // derived from hardware this should now be empty in practice; it stays as a
  // guard against an out-of-range index rather than being removed.
  const unresolved = (ctcssBit: number, toneIndex: number) => {
    if (!(toneFlags & ctcssBit)) return false;
    if (toneIndex === D890_CTCSS_NONE_INDEX) return false;
    return (toneTable ?? D890_CTCSS_TONES)[toneIndex] === undefined;
  };

  const hasUnresolvedTone =
    unresolved(D890_TONE_FLAG.CTCSS_RX, rxToneIndex) ||
    unresolved(D890_TONE_FLAG.CTCSS_TX, txToneIndex);

  // Wire contact/scan-list refs are 0-based with 0xff meaning none; NeonPlug is
  // 1-based with 0 meaning none.
  // Contact reference: u32 LE at 0x14, holding a ZERO-BASED index into the
  // talkgroup list — 0,1,2,3,4,5 for the six talkgroups of a codeplug built to
  // vary them. 0x13 is unused and reads 0.
  //
  // The vendor-CPS decompilation claims this field holds the DMR contact ID
  // itself rather than an index. On this radio and firmware it does not: a
  // talkgroup whose DMR ID is 16,776,415 stores 2. Hardware wins.
  //
  // It was previously read as a big-endian u16 at 0x13, which happens to return
  // the same number while 0x13 is zero and the index is under 256 — and would
  // silently return the low byte only beyond that.
  const contactWire = readU32LE(bytes, 0x14);
  const scanListWire = bytes[0x1b] ?? D890_SENTINEL.NO_REF_U8;
  // RX group is stored zero-based with 0xff for none, exactly like the scan-list
  // reference beside it. This was previously passed through raw, so the first
  // RX group in the list read back as 0 (= none) instead of 1.
  const rxGroupWire = bytes[0x1c] ?? D890_SENTINEL.NO_REF_U8;

  // Byte 0x08 bits 1-0, confirmed against the CPS export:
  //   0 = A-Analog, 1 = D-Digital, 2 = A+D TX A, 3 = D+A TX D
  // The shared model has no mixed mode, so classify by what the channel
  // TRANSMITS: types 1 and 3 transmit digital, 0 and 2 transmit analog.
  const mode: ChannelMode = typeBits === 1 || typeBits === 3 ? 'Digital' : 'Analog';
  // Four levels on this radio, confirmed against the CPS export and the radio's
  // own menu: 0=Low, 1=Mid, 2=High, 3=Turbo. Turbo is a real level above High,
  // so it is preserved rather than folded — radios with only three levels clamp
  // it on encode instead.
  const power: PowerLevel =
    powerBits === 0 ? 'Low' : powerBits === 1 ? 'Medium' : powerBits === 2 ? 'High' : 'Turbo';
  const bandwidth: Bandwidth = bandwidthBits === 1 ? '25kHz' : '12.5kHz';

  const channel = createDefaultChannel({
    number: index + 1,
    name: decodeWideCharString(bytes.subarray(0x44, 0x66), D890_LIMITS.NAME_MAX_CHARS),
    rxFrequency,
    txFrequency,
    mode,
    power,
    bandwidth,
    colorCode: bytes[0x20] ?? 0,
    rxCtcssDcs: resolveTone(D890_TONE_FLAG.CTCSS_RX, D890_TONE_FLAG.DCS_RX, rxToneIndex, rxDcsRaw),
    txCtcssDcs: resolveTone(D890_TONE_FLAG.CTCSS_TX, D890_TONE_FLAG.DCS_TX, txToneIndex, txDcsRaw),
    contactId: contactWire >= 0xffff ? 0 : contactWire + 1,
    scanListId: scanListWire === D890_SENTINEL.NO_REF_U8 ? 0 : scanListWire + 1,
    rxGroupListId: rxGroupWire === D890_SENTINEL.NO_REF_U8 ? 0 : rxGroupWire + 1,
    dmrRadioIdIndex: bytes[0x18],
    // DMR time slot, as `slotOperation` — the field the DM-32 already uses for
    // exactly this (0 = TS1, 1 = TS2). Deliberately NOT a new `timeSlot` field:
    // two names for one concept drift apart, and the "Convert codeplug for
    // another radio" path would carry one radio's field into the other's writer.
    //
    // Bit 0 of 0x21, hardware-confirmed 2026-08-25: the only TS2 channel read
    // 0x01 while every TS1 channel read 0x00. The reference's "bits 3-2" is wrong.
    slotOperation: (bytes[0x21] ?? 0) & 0x01,
    // Byte 0x09 carries four independent flags, all confirmed against the
    // vendor CSV export of a 118-channel codeplug built to vary them:
    //   bit 4 Reverse, bit 5 PTT Prohibit, bit 6 Call Confirmation,
    //   bit 7 Talk Around (inverted - set means talkaround is ALLOWED).
    // Byte 0x21 is a second flag field, resolved the same way:
    //   bit 0 time slot, bit 4 Slot Suit, bit 5 APRS RX,
    //   bit 6 AES encryption, bit 7 Work Alone (our loneWorker).
    loneWorker: ((bytes[0x21] ?? 0) & 0x80) !== 0,
    aprsReceive: ((bytes[0x21] ?? 0) & 0x20) !== 0,
    encryption: ((bytes[0x21] ?? 0) & 0x40) !== 0,
    // Byte 0x19 packs the squelch mode into bit 4 and the PTT ID mode into
    // bits 1-0 (0 Off, 1 Start, 2 End, 3 Both). Both partition all 118 channels
    // of the feature-flag codeplug exactly.
    // Byte 0x19 packs two 4-bit fields: squelch mode in the HIGH nibble, PTT ID
    // in the LOW nibble. Both widths come from the vendor writer
    // (`byte = SQLCON * 0x10 + Ptt_ID`); the codeplug only ever exercised two
    // squelch values and four PTT values, so masking to 2 bits happened to work
    // and would have truncated anything wider.
    rxSquelchMode: D890_SQUELCH_MODE[((bytes[0x19] ?? 0) >> 4) & 0x0f] ?? 'Carrier/CTC',
    // 0 Off, 1 Start, 2 End, 3 Start&End. The vendor calls index 3 "Start&End";
    // "Both" belongs to a different (microphone) list entirely.
    pttId: (bytes[0x19] ?? 0) & 0x0f,
    signalingType: D890_OPTIONAL_SIGNAL[((bytes[0x1a] ?? 0) >> 4) & 0x0f] ?? 'None',
    aprsReportMode: D890_APRS_REPORT[bytes[0x35] ?? 0] ?? 'Off',
    reverse: ((bytes[0x09] ?? 0) & 0x10) !== 0,
    callConfirmation: ((bytes[0x09] ?? 0) & 0x40) !== 0,
    slotSuit: ((bytes[0x21] ?? 0) & 0x10) !== 0,
    ranging: ((bytes[0x34] ?? 0) & 0x01) !== 0,
    // u16 of tenths of a Hz: 1318 -> 131.8, 1000 -> 100.0.
    customCtcssHz: readU16LE(bytes, 0x10) / 10,
    // These four are stored zero-based and displayed one-based by the vendor
    // CPS. 0x1d/0x1e/0x1f could never be reached by correlation — the CPS
    // silently discards them on CSV import, so they held one value on every
    // channel. The decompiled marshaller gives them directly.
    twoToneDecode: oneBased(bytes[0x12]),
    twoToneId: oneBased(bytes[0x1d]),
    fiveToneId: oneBased(bytes[0x1e]),
    dtmfId: oneBased(bytes[0x1f]),
    offsetFrequencyEx: signedByte(bytes[0x39] ?? 0),
    forbidTx: ((bytes[0x09] ?? 0) & 0x20) !== 0,
    forbidTalkaround: ((bytes[0x09] ?? 0) & 0x80) === 0,

    // ---- from the vendor channel marshaller pair -------------------------
    // Everything below comes from `sub_005af490` (write) / `sub_005b1750`
    // (read), which touch exactly the same 54 record offsets — the strongest
    // cross-check available without hardware. Each of these bytes read the same
    // value on all 102 captured channels, so the OFFSET is decompilation-derived
    // and the VALUE RANGE is unobserved. Named rather than left as unmapped
    // bytes because a name plus a known-constant reading is more useful than
    // silence, but none of them is hardware-verified.
    //
    // Two have since been settled by a purpose-built codeplug run through the
    // vendor CPS (2026-08-30), and one of those corrected an earlier conclusion.
    /**
     * Vendor "txcc" — TX colour code, a distinct field from the RX colour code
     * at 0x20.
     *
     * CONFIRMED: the two are separate bytes in the `.rdt` as well, and a
     * codeplug that set them apart exported RX from one and txcc from the other,
     * 118/118 each way with no crossover.
     */
    txColorCode: bytes[0x43] ?? 0,
    /**
     * Vendor "Busy Lock/TX Permit" (`RepLock`).
     *
     * This was previously recorded here as a column the CPS DERIVES from the
     * channel type rather than stores. That was wrong. It IS stored — a codeplug
     * that set the field directly exported "Different CDT" and "Channel Free"
     * for values 1 and 2. What misled the correlation is narrower and stranger:
     * a stored 0 renders as "Off" on an analog channel and "Always" on a digital
     * one, so with every channel at 0 the column tracked channel type exactly.
     * See D890_BUSY_LOCK.
     */
    busyLock: (bytes[0x1a] ?? 0) & 0x0f,
    /** Vendor "Emergency System" (`EMG_Key`). Byte 0x22. */
    emergencySystemIndex: bytes[0x22] ?? 0,
    /** Vendor "DMR MODE" (`TDMA`). Byte 0x21 bits 3-2. */
    dmrMode: ((bytes[0x21] ?? 0) >> 2) & 0x03,
    /** Vendor "DataACK Disable" (`Response`). Byte 0x21 bit 1. */
    dataAckDisable: ((bytes[0x21] ?? 0) & 0x02) !== 0,
    /** Vendor "Digital Duplex" (`simplex`). Byte 0x34 bit 1, inverted. */
    digitalDuplex: ((bytes[0x34] ?? 0) & 0x02) === 0,
    /** Vendor "Exclude channel from roaming" (`roam_forbid`). Byte 0x34 bit 2. */
    excludeFromRoaming: ((bytes[0x34] ?? 0) & 0x04) !== 0,
    /** Vendor `rec_only`. Byte 0x34 bit 3. */
    receiveOnly: ((bytes[0x34] ?? 0) & 0x08) !== 0,
    /** Vendor "Auto Scan" (`auto_scan`). Byte 0x34 bit 4. */
    autoScan: ((bytes[0x34] ?? 0) & 0x10) !== 0,
    /** Vendor "Idle TX" (`idle_tx`). Byte 0x34 bit 5. */
    idleTx: ((bytes[0x34] ?? 0) & 0x20) !== 0,
    /** Vendor `compand`. Byte 0x34 bit 6 — the shared model's `compander`. */
    compander: ((bytes[0x34] ?? 0) & 0x40) !== 0,
    /** Vendor `dmr_crc_ignore`. Byte 0x34 bit 7. */
    dmrCrcIgnore: ((bytes[0x34] ?? 0) & 0x80) !== 0,
    /**
     * Vendor "Analog APRS PTT Mode" (`AprsUpDate`). Byte 0x36.
     * 0 Off, 1 Start Of Transmission, 2 End Of Transmission — see
     * D890_ANALOG_APRS_PTT_MODE.
     */
    analogAprsPttMode: bytes[0x36] ?? 0,
    /**
     * Vendor "Digital APRS PTT Mode" (`DigiAprsUpDate`). Byte 0x37.
     * A plain Off/On: a value of 2 exported as "On", so the CPS clamps.
     */
    digitalAprsPttMode: bytes[0x37] ?? 0,
    /**
     * Vendor "Digital APRS Report Channel" (`DigiAprsUpNum`). Byte 0x38.
     * Stored zero-based and displayed one-based, like the tone IDs beside it.
     */
    digitalAprsReportChannel: (bytes[0x38] ?? 0) + 1,
    /** Vendor `NormalEmgCode`. Byte 0x3a. */
    normalEmergencyCode: bytes[0x3a] ?? 0,
    /** Vendor "SMS Confirmation" (`sms_rec`). Byte 0x3b bit 2. */
    smsConfirmation: ((bytes[0x3b] ?? 0) & 0x04) !== 0,
    /** Vendor "Ana APRS Mute" (`ana_aprs_mute`). Byte 0x3b bit 3. */
    analogAprsMute: ((bytes[0x3b] ?? 0) & 0x08) !== 0,
    /** Vendor "Send Talker Alias DMR/NX" (`tx_talkalaes`). Byte 0x3b bit 4. */
    sendTalkerAlias: ((bytes[0x3b] ?? 0) & 0x10) !== 0,
    /** Vendor `AnaAprsTxPath`. Byte 0x3c. */
    analogAprsTxPath: bytes[0x3c] ?? 0,
    /** Vendor "ARC4" (`Arc4EmgCode`). Byte 0x3d. */
    arc4Code: bytes[0x3d] ?? 0,
  });

  return { channel, rxToneIndex, txToneIndex, rxDcsRaw, txDcsRaw, hasUnresolvedTone };
}

/**
 * A roaming channel: the frequency pair the radio falls back to when roaming,
 * held in its own table rather than referencing the channel list.
 *
 * Read off the radio 2026-08-30 and confirmed against the vendor's own export —
 * 410.21250 / 418.21250 named "Roaming CH 1", matching RoamingChannel.CSV.
 *
 * Colour code and slot use OUT-OF-RANGE values to mean "No Use": the captured
 * record holds 0x10 for a 0-15 field and 0x02 for a 0-1 field, and the CPS
 * displays "No Use" for both. So they are surfaced as null rather than clamped —
 * 16 is not colour code 16, it is the absence of one.
 */
export interface D890RoamingChannel {
  index: number;
  name: string;
  rxFrequency: number;
  txFrequency: number;
  /** null when the record says "No Use". */
  colorCode: number | null;
  /** 0 = TS1, 1 = TS2, null when "No Use". */
  slot: number | null;
}

export function parseRoamingChannel(bytes: Uint8Array, index: number): D890RoamingChannel {
  const colorCode = bytes[0x08] ?? 0;
  const slot = bytes[0x09] ?? 0;
  return {
    index,
    rxFrequency: decodeFrequencyMHz(bytes.subarray(0x00, 0x04)),
    txFrequency: decodeFrequencyMHz(bytes.subarray(0x04, 0x08)),
    colorCode: colorCode <= 15 ? colorCode : null,
    slot: slot <= 1 ? slot : null,
    name: decodeWideCharString(bytes.subarray(0x0a, 0x2a), D890_LIMITS.NAME_MAX_CHARS),
  };
}

/** Address of one roaming-channel record. */
export function roamingChannelAddress(index: number): number {
  return D890_ADDR.ROAMING_CHANNEL_DATA + index * D890_ADDR.ROAMING_CHANNEL_STRIDE;
}

/**
 * A roaming zone: a named list of roaming-channel slots.
 *
 * Members are ONE byte each and index the roaming-channel table, not the main
 * channel list — a different width and a different target from every other
 * membership array on this radio, so it does not share `decodeU16Members`.
 */
export interface D890RoamingZone {
  index: number;
  name: string;
  /** Zero-based roaming-channel indices, in order. */
  members: number[];
}

export function parseRoamingZone(bytes: Uint8Array, index: number): D890RoamingZone {
  const members: number[] = [];
  for (let i = 0; i < D890_ADDR.ROAMING_ZONE_MEMBERS_LEN; i += 1) {
    const v = bytes[i] ?? D890_SENTINEL.NO_REF_U8;
    if (v === D890_SENTINEL.NO_REF_U8) break;
    members.push(v);
  }
  return {
    index,
    members,
    name: decodeWideCharString(
      bytes.subarray(
        D890_ADDR.ROAMING_ZONE_NAME_OFFSET,
        D890_ADDR.ROAMING_ZONE_NAME_OFFSET + D890_ADDR.ROAMING_ZONE_NAME_LEN
      ),
      D890_LIMITS.NAME_MAX_CHARS
    ),
  };
}

/** Address of one roaming-zone record. */
export function roamingZoneAddress(index: number): number {
  return D890_ADDR.ROAMING_ZONE_DATA + index * D890_ADDR.ROAMING_ZONE_STRIDE;
}

/**
 * The basic Encryption Code table — 32 slots of a 16-bit ID and a 16-bit key.
 *
 * CONFIRMED on hardware: 0x3585000 read `01 01 02 02 … 20 20`, the factory IDs
 * 1-32, matching the prediction made before the dump.
 *
 * Both values are BIG-endian on the radio and little-endian in the .rdt. Every
 * factory ID is byte-palindromic, so no captured codeplug can distinguish the
 * two — this comes from the vendor's marshaller, traced in both directions, and
 * must not be "simplified" to match the file.
 *
 * The key passes through `key XOR mask`, where the mask is 0 unless an
 * activation file has been loaded into the CPS. With no activation file the
 * transform is the identity, which is the only case anyone here can produce, so
 * the mask is not modelled — a radio programmed by an activated CPS would need
 * it and this decode would be wrong for that radio.
 */
export function parseEncryptionSlot(
  idBytes: Uint8Array,
  keyBytes: Uint8Array,
  index: number
): { slot: number; encryptionId: number; key: number } {
  const idOffset = index * D890_ADDR.ENCRYPTION_ID_STRIDE;
  const keyOffset = index * D890_ADDR.ENCRYPTION_KEY_STRIDE + D890_ADDR.ENCRYPTION_KEY_OFFSET;
  const be16 = (b: Uint8Array, o: number) => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
  return {
    slot: index + 1,
    encryptionId: be16(idBytes, idOffset),
    key: be16(keyBytes, keyOffset),
  };
}

/** True when a slot holds no channel: RX frequency zero marks it vacant. */
export function isVacantChannel(bytes: Uint8Array): boolean {
  return decodeFrequencyHz(bytes.subarray(0x00, 0x04)) === 0;
}

/** One contiguous read covering a run of consecutive channel records. */
export interface ChannelReadSpan {
  address: number;
  length: number;
  /** Global channel index of the first record in the span. */
  startIndex: number;
  /** How many consecutive 0x80 records the span covers. */
  recordCount: number;
}

/**
 * Group occupied channel indices into the fewest contiguous reads.
 *
 * Reading channels one at a time costs two frames each (the record is described
 * as two 0x40 halves), so 4000 channels is 8000 round trips. But the halves are
 * adjacent — `secondary === primary + 0x40` — so a channel record is really 0x80
 * contiguous bytes, and consecutive channels are contiguous with each other
 * *within a block*. One read can therefore cover a whole run.
 *
 * Runs never cross a block boundary: blocks are 0x80000 apart while holding only
 * 128 * 0x80 = 0x4000 of records, so the space between them is not channel data.
 *
 * Consecutive runs only — no merging across gaps. Merging would read vacant
 * records to save round trips, but since `readMemory` chunks by the negotiated
 * frame size anyway, fewer bytes is fewer frames; the gain would be marginal and
 * the waste real on a sparsely programmed radio.
 */
export function planChannelReads(indices: number[]): ChannelReadSpan[] {
  if (indices.length === 0) return [];
  const sorted = [...indices].sort((a, b) => a - b);

  const spans: ChannelReadSpan[] = [];
  let runStart = sorted[0];
  let runEnd = sorted[0];

  const flush = () => {
    const count = runEnd - runStart + 1;
    spans.push({
      address: channelAddresses(runStart).primary,
      length: count * D890_ADDR.CHANNEL_STRIDE,
      startIndex: runStart,
      recordCount: count,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const idx = sorted[i];
    const sameBlock =
      Math.floor(idx / D890_ADDR.CHANNELS_PER_BLOCK) ===
      Math.floor(runEnd / D890_ADDR.CHANNELS_PER_BLOCK);
    if (idx === runEnd + 1 && sameBlock) {
      runEnd = idx;
      continue;
    }
    flush();
    runStart = idx;
    runEnd = idx;
  }
  flush();
  return spans;
}
