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
} from './constants';

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

/** Address of one scan-list record. */
export function scanListAddress(index: number): number {
  return D890_ADDR.SCAN_LIST_DATA + index * D890_ADDR.SCAN_LIST_STRIDE;
}

/** Address of one talkgroup record. */
export function talkgroupAddress(index: number): number {
  return D890_ADDR.TALKGROUP_DATA + index * D890_ADDR.TALKGROUP_STRIDE;
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
    if (code === 0) break;
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
  const members = decodeU16Members(memberBytes, D890_LIMITS.ZONE_MEMBERS_MAX);
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
    lookBackTimeA: readU16LE(bytes, 0x06),
    lookBackTimeB: readU16LE(bytes, 0x08),
    dropoutDelay: readU16LE(bytes, 0x0a),
    dwellTime: readU16LE(bytes, 0x0c),
    revertChannel: bytes[0xf8] ?? 0,
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
  /** 0=Selected, 1=+TalkBack, 2=Priority 1, 3=Priority 2, 4=Last Called, 5=Last Used. */
  revertChannel: number;
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
  const contactWire = readU16BE(bytes, 0x13);
  const scanListWire = bytes[0x1b] ?? D890_SENTINEL.NO_REF_U8;
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
    name: decodeWideCharString(bytes.subarray(0x44, 0x64), D890_LIMITS.NAME_MAX_CHARS),
    rxFrequency,
    txFrequency,
    mode,
    power,
    bandwidth,
    colorCode: bytes[0x20] ?? 0,
    rxCtcssDcs: resolveTone(D890_TONE_FLAG.CTCSS_RX, D890_TONE_FLAG.DCS_RX, rxToneIndex, rxDcsRaw),
    txCtcssDcs: resolveTone(D890_TONE_FLAG.CTCSS_TX, D890_TONE_FLAG.DCS_TX, txToneIndex, txDcsRaw),
    contactId: contactWire === 0xffff ? 0 : contactWire + 1,
    scanListId: scanListWire === D890_SENTINEL.NO_REF_U8 ? 0 : scanListWire + 1,
    rxGroupListId: rxGroupWire === D890_SENTINEL.NO_REF_U8 ? 0 : rxGroupWire,
    dmrRadioIdIndex: bytes[0x18],
    // DMR time slot, as `slotOperation` — the field the DM-32 already uses for
    // exactly this (0 = TS1, 1 = TS2). Deliberately NOT a new `timeSlot` field:
    // two names for one concept drift apart, and the "Convert codeplug for
    // another radio" path would carry one radio's field into the other's writer.
    //
    // Bit 0 of 0x21, hardware-confirmed 2026-08-25: the only TS2 channel read
    // 0x01 while every TS1 channel read 0x00. The reference's "bits 3-2" is wrong.
    slotOperation: (bytes[0x21] ?? 0) & 0x01,
    // 0x09 bit 5 is documented as "PTT prohibit" without an explicit bit number;
    // treated as bit 5 here and listed for confirmation.
    forbidTx: ((bytes[0x09] ?? 0) & 0x20) !== 0,
    forbidTalkaround: ((bytes[0x09] ?? 0) & 0x80) === 0,
  });

  return { channel, rxToneIndex, txToneIndex, rxDcsRaw, txDcsRaw, hasUnresolvedTone };
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
