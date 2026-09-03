/**
 * Record encoders for the DA-7X2's data tables.
 *
 * **Every one patches the record the radio gave us.** None builds a buffer from
 * scratch, and none may be called without the original. The reason is the same
 * everywhere: a write frame is 16 bytes and most fields are 1-4, so a write
 * ALWAYS carries bytes this driver does not model. Building from zero would
 * send zeros over them.
 *
 * Each encoder is held to one acceptance test, in `d890TableRoundTrip.test.ts`:
 *
 *     parse(bytes) -> model -> encode(bytes, model) === bytes
 *
 * checked against records taken verbatim from the vendor CPS's own programming
 * session, i.e. bytes a real radio accepted. That property is what makes a
 * rewrite of an unmodified record harmless. It matters more here than in most
 * codebases because the radio ACKs a write WITHOUT echoing it — nothing on the
 * wire can catch a bad encoder, so it has to be caught here.
 *
 * The mirror-image test matters just as much: change one field, and assert only
 * that field's bytes move. An encoder that is faithful but not surgical
 * corrupts its neighbours.
 */

import type { Contact } from '../../models/Contact';
import type { Zone } from '../../models/Zone';
import type { DMRRadioID } from '../../models/DMRRadioID';
import type { RXGroup } from '../../models/RXGroup';
import type { QuickContact } from '../../models/QuickContact';
import {
  D890_ADDR,
  D890_LIMITS,
  D890_SENTINEL,
  D890_TALKGROUP_MASK_INVERTED,
} from './constants';
import { encodeBcdAsHexU32, encodeFrequencyMHz, encodeWideCharString } from './channelWrite';
import { D890_BROADCAST, type D890BroadcastBand, type D890BroadcastChannel } from './broadcastChannels';
import {
  D890_TONES,
  TWO_TONE_NAME_AT,
  TWO_TONE_NAME_BYTES,
  type D890FiveTone,
  type D890TwoTone,
} from './tones';
import { D890_AM_ZONES, type D890AmZone } from './amZones';
import type { D890EmergencySettings, D890EmergencyContact } from './emergency';
import type { D890RoamingChannel, ScanListDecoded, D890RawKeySlot } from './structures';
import type { D890GpsRoamingEntry } from './gpsRoaming';
import { D890_GPS_ROAMING, GPS_ROAMING_OFFSETS } from './gpsRoaming';

/** Copy the original so an encoder can never mutate the caller's buffer. */
function patch(original: Uint8Array, expected: number): Uint8Array {
  if (original.length < expected) {
    throw new Error(
      `D890 record must be at least ${expected} bytes to patch, got ${original.length}. ` +
        `Encoders patch what the radio gave us; they cannot build a record.`
    );
  }
  return Uint8Array.from(original);
}

/** BCD digits, MSB first — the inverse of `decodeBcd`. */
export function encodeBcd(value: number, length: number): Uint8Array {
  const digits = String(Math.round(value)).padStart(length * 2, '0');
  if (digits.length > length * 2) {
    throw new Error(`Cannot BCD-encode ${value} into ${length} bytes`);
  }
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = (Number(digits[i * 2]) << 4) | Number(digits[i * 2 + 1]);
  }
  return out;
}

/**
 * A talkgroup, from the `QuickContact` the Digital tab edits.
 *
 * Call type lives in the low two bits of byte 0 and is renumbered: the radio
 * stores 0/1/2 for Private/Group/All where the shared model uses 3/4/5. The
 * REST of byte 0 is preserved — the parser masks it off, so this driver does
 * not know what those bits mean and must not clear them.
 */
export function applyTalkgroupToRecord(original: Uint8Array, tg: QuickContact): Uint8Array {
  const rec = patch(original, D890_ADDR.TALKGROUP_STRIDE);
  const callType = ((tg.callType ?? 0x04) - 0x03) & 0x03;
  rec[0x00] = ((rec[0x00] ?? 0) & ~0x03) | callType;
  rec.set(encodeBcdAsHexU32(tg.contactNumber ?? 0), 0x02);
  rec.set(encodeWideCharString(tg.name ?? '', 0x20), 0x06);
  return rec;
}

/** The same record from the shared `Contact` model, which carries no call type. */
export function applyContactToRecord(original: Uint8Array, contact: Contact): Uint8Array {
  const rec = patch(original, D890_ADDR.TALKGROUP_STRIDE);
  rec.set(encodeBcdAsHexU32(contact.dmrId ?? 0), 0x02);
  rec.set(encodeWideCharString(contact.name ?? '', 0x20), 0x06);
  return rec;
}

/**
 * One AM airband or FM broadcast record.
 *
 * `frequency: null` means "no frequency stored" and is written as the same
 * all-zero BCD the radio uses, NOT as 0xFF — an erased record is the radio's
 * business, and a slot we are writing is by definition one we are storing.
 */
export function applyBroadcastToRecord(
  original: Uint8Array,
  channel: D890BroadcastChannel,
  band: D890BroadcastBand
): Uint8Array {
  const spec = D890_BROADCAST[band];
  const rec = patch(original, spec.stride);
  const raw = channel.frequency === null ? 0 : Math.round(channel.frequency * spec.freqDivisor);
  rec.set(encodeBcd(raw, spec.freqBytes), 0);
  rec.set(encodeWideCharString(channel.name ?? '', 0x20), 0x04);
  return rec;
}

/**
 * One 5-Tone entry: a digit COUNT at +0x02, then the digits packed two per byte
 * from +0x04. `+0x03` held 0x46 in every record ever seen and is NOT written —
 * one repeated value proves nothing, so it is preserved rather than asserted.
 */
export function applyFiveToneToRecord(original: Uint8Array, tone: D890FiveTone): Uint8Array {
  const rec = patch(original, D890_TONES.fiveTone.stride);
  const digits = tone.digits ?? '';
  const capacity = (rec.length - 0x04) * 2;
  if (digits.length > capacity) {
    throw new Error(`5-Tone entry has ${digits.length} digits; the record holds ${capacity}`);
  }
  rec[0x02] = digits.length;
  // Only the bytes the digits occupy are touched; a shorter code leaves the
  // tail as the radio had it, which is what the count field makes unambiguous.
  for (let i = 0; i < digits.length; i += 1) {
    const nibble = parseInt(digits[i], 16);
    if (Number.isNaN(nibble)) throw new Error(`5-Tone digit "${digits[i]}" is not hex`);
    const at = 0x04 + (i >> 1);
    rec[at] = i % 2 === 0
      ? ((rec[at] ?? 0) & 0x0f) | (nibble << 4)
      : ((rec[at] ?? 0) & 0xf0) | nibble;
  }
  return rec;
}

/**
 * One 2-Tone entry. Tones are u16 LE in tenths of a hertz.
 *
 * ⚠️ The ÷10 scaling is INFERRED, not confirmed — see the TODO. Encoding uses
 * the same factor the decoder does, so a round trip holds either way; what is
 * unproven is whether the number shown is hertz.
 */
export function applyTwoToneToRecord(original: Uint8Array, tone: D890TwoTone): Uint8Array {
  const rec = patch(original, D890_TONES.twoTone.stride);
  const first = Math.round((tone.firstTone ?? 0) * 10);
  const second = Math.round((tone.secondTone ?? 0) * 10);
  rec[0x00] = first & 0xff;
  rec[0x01] = (first >> 8) & 0xff;
  rec[0x02] = second & 0xff;
  rec[0x03] = (second >> 8) & 0xff;
  rec.set(encodeWideCharString(tone.name ?? '', TWO_TONE_NAME_BYTES), TWO_TONE_NAME_AT);
  return rec;
}

/**
 * One GPS Roaming geofence.
 *
 * Only 14 of each record's 32 bytes are written by the vendor; `+0x0A`, `+0x0B`
 * and `+0x10`-`+0x1F` are never touched. Those are preserved here, which is the
 * whole reason this takes the original.
 */
export function applyGpsRoamingToRecord(
  original: Uint8Array,
  entry: D890GpsRoamingEntry
): Uint8Array {
  const rec = patch(original, D890_GPS_ROAMING.STRIDE);
  const OFF = GPS_ROAMING_OFFSETS;
  rec[OFF.ONOFF] = entry.enabled ? 1 : 0;
  rec[OFF.ZONE] = entry.zone & 0xff;
  // Degrees and hemisphere for BOTH axes come first, then the minutes for both
  // — NOT grouped per axis the way APRS at 0x3501000 is. An APRS-shaped encoder
  // would write longitude degrees into the latitude hemisphere byte.
  rec[OFF.LAT_DEG] = entry.latitude.degrees & 0xff;
  rec[OFF.LAT_SOUTH] = entry.latitude.south ? 1 : 0;
  rec[OFF.LON_DEG] = entry.longitude.degrees & 0xff;
  rec[OFF.LON_WEST] = entry.longitude.west ? 1 : 0;
  rec[OFF.LAT_MIN] = entry.latitude.minutes & 0xff;
  rec[OFF.LAT_MIN_FRAC] = entry.latitude.minuteFraction & 0xff;
  rec[OFF.LON_MIN] = entry.longitude.minutes & 0xff;
  rec[OFF.LON_MIN_FRAC] = entry.longitude.minuteFraction & 0xff;
  const radius = Math.max(0, Math.round(entry.radiusMeters ?? 0)) >>> 0;
  rec[OFF.RADIUS] = radius & 0xff;
  rec[OFF.RADIUS + 1] = (radius >>> 8) & 0xff;
  rec[OFF.RADIUS + 2] = (radius >>> 16) & 0xff;
  rec[OFF.RADIUS + 3] = (radius >>> 24) & 0xff;
  return rec;
}

/**
 * One AM zone: name, then a 0xFFFF-terminated list of AM channel indices.
 *
 * The member list is terminated, not counted, so a zone that loses members has
 * to write the terminator — otherwise the old tail is still there and the radio
 * reads members that were removed. The rest of the record is left as the radio
 * had it, including `CurWorkCH`, which this driver stores raw and does not
 * interpret.
 */
export function applyAmZoneToRecord(original: Uint8Array, zone: D890AmZone): Uint8Array {
  const rec = patch(original, D890_AM_ZONES.STRIDE);
  rec.set(encodeWideCharString(zone.name ?? '', D890_AM_ZONES.NAME_BYTES), 0);
  rec[D890_AM_ZONES.CURRENT_AT] = zone.currentChannel & 0xff;
  rec[D890_AM_ZONES.CURRENT_AT + 1] = (zone.currentChannel >> 8) & 0xff;

  const capacity = (rec.length - D890_AM_ZONES.MEMBERS_AT) >> 1;
  if (zone.members.length >= capacity) {
    throw new Error(
      `AM zone "${zone.name}" has ${zone.members.length} members; the record holds ` +
        `${capacity - 1} plus a terminator`
    );
  }
  let at = D890_AM_ZONES.MEMBERS_AT;
  for (const member of zone.members) {
    rec[at] = member & 0xff;
    rec[at + 1] = (member >> 8) & 0xff;
    at += 2;
  }
  // Terminate. Without this a shortened list keeps reading into its own tail.
  rec[at] = 0xff;
  rec[at + 1] = 0xff;
  return rec;
}

export const D890_NAME_MAX_CHARS = D890_LIMITS.NAME_MAX_CHARS;

/**
 * Write geometry for the tables that are records-plus-a-mask.
 *
 * Every address here is the one the READ path already uses, imported rather
 * than repeated — a write that disagrees with the read about where a table
 * lives is the worst possible bug on this radio, because a read-back would look
 * consistent while the radio held something else.
 *
 * All four masks were found in the vendor CPS's read capture and CONFIRMED ON
 * HARDWARE 2026-09-01. Polarity is SET = PRESENT for all of them except the
 * talkgroup mask, which is inverted.
 */
export const D890_MASKED_TABLES = {
  talkgroups: {
    label: 'talkgroup',
    dataAddress: D890_ADDR.TALKGROUP_DATA,
    maskAddress: D890_ADDR.TALKGROUP_SET,
    stride: D890_ADDR.TALKGROUP_STRIDE,
    slots: D890_LIMITS.TALK_GROUPS_MAX,
    maskInverted: D890_TALKGROUP_MASK_INVERTED,
  },
  amChannels: {
    label: 'AM airband channel',
    dataAddress: D890_BROADCAST.am.data,
    maskAddress: D890_BROADCAST.am.mask,
    stride: D890_BROADCAST.am.stride,
    slots: D890_BROADCAST.am.channels,
  },
  fmChannels: {
    label: 'FM broadcast channel',
    dataAddress: D890_BROADCAST.fm.data,
    maskAddress: D890_BROADCAST.fm.mask,
    stride: D890_BROADCAST.fm.stride,
    slots: D890_BROADCAST.fm.channels,
  },
  fiveTone: {
    label: '5-Tone entry',
    dataAddress: D890_TONES.fiveTone.address,
    maskAddress: D890_TONES.fiveTone.mask,
    stride: D890_TONES.fiveTone.stride,
    slots: D890_TONES.fiveTone.slots,
  },
  twoTone: {
    label: '2-Tone entry',
    dataAddress: D890_TONES.twoTone.address,
    maskAddress: D890_TONES.twoTone.mask,
    stride: D890_TONES.twoTone.stride,
    slots: D890_TONES.twoTone.slots,
  },
  zones: {
    label: 'zone',
    dataAddress: D890_ADDR.ZONE_CHANNELS,
    maskAddress: D890_ADDR.ZONE_SET,
    stride: D890_ADDR.ZONE_CHANNELS_STRIDE,
    slots: D890_LIMITS.ZONES_MAX,
  },
  /**
   * Zone NAMES are a second table for the same zone, in their own region, with
   * NO mask of its own — the zone present mask covers both. So a zone write is
   * two record writes and one mask; planning them separately would let a rename
   * land without its members, or the reverse.
   */
  zoneNames: {
    label: 'zone name',
    dataAddress: D890_ADDR.ZONE_NAMES,
    maskAddress: D890_ADDR.ZONE_SET,
    stride: D890_ADDR.ZONE_NAME_STRIDE,
    slots: D890_LIMITS.ZONES_MAX,
  },
  scanLists: {
    label: 'scan list',
    dataAddress: D890_ADDR.SCAN_LIST_DATA,
    maskAddress: D890_ADDR.SCAN_LIST_SET,
    stride: D890_ADDR.SCAN_LIST_STRIDE,
    slots: D890_LIMITS.SCAN_LISTS_MAX,
  },
  radioIds: {
    label: 'radio ID',
    dataAddress: D890_ADDR.RADIO_ID_DATA,
    maskAddress: D890_ADDR.RADIO_ID_SET,
    stride: D890_ADDR.RADIO_ID_STRIDE,
    slots: D890_LIMITS.DMR_RADIO_IDS_MAX,
  },
  rxGroups: {
    label: 'RX group',
    dataAddress: D890_ADDR.RX_GROUP_DATA,
    maskAddress: D890_ADDR.RX_GROUP_SET,
    stride: D890_ADDR.RX_GROUP_STRIDE,
    slots: D890_LIMITS.RX_GROUPS_MAX,
  },
  roamingChannels: {
    label: 'roaming channel',
    dataAddress: D890_ADDR.ROAMING_CHANNEL_DATA,
    maskAddress: D890_ADDR.ROAMING_CHANNEL_SET,
    stride: D890_ADDR.ROAMING_CHANNEL_STRIDE,
    slots: D890_LIMITS.ROAMING_CHANNELS_MAX,
  },
  amZones: {
    label: 'AM zone',
    dataAddress: D890_AM_ZONES.ADDRESS,
    maskAddress: D890_AM_ZONES.MASK,
    stride: D890_AM_ZONES.STRIDE,
    slots: D890_AM_ZONES.SLOTS,
  },
} as const;

/**
 * GPS roaming is deliberately NOT here: it has no presence mask.
 *
 * Confirmed from the CPS capture — it sweeps 0x3502000 contiguously with
 * nothing read beforehand, unlike all four masked tables. Occupancy comes from
 * the records, so a write is records only and there is no mask to recompute.
 */
export const D890_GPS_ROAMING_WRITE = {
  label: 'GPS roaming geofence',
  dataAddress: D890_GPS_ROAMING.DATA,
  stride: D890_GPS_ROAMING.STRIDE,
  slots: D890_GPS_ROAMING.ENTRIES,
} as const;

/**
 * A 0xFFFF-terminated list of u16 members, written into `dest` from `offset`.
 *
 * The list is TERMINATED, not counted — so shortening one must write the
 * terminator or the radio keeps reading the old tail. That is not theoretical:
 * the read side learned the same lesson from the other direction, where
 * treating 0xFFFF as a skippable hole turned trailing zeros into 58 phantom
 * "channel 1" members in a scan list that held 8.
 *
 * Everything after the terminator is left exactly as the radio had it. The
 * vendor pads with 0xFF and then zeros, and reproducing that padding is not
 * this driver's business.
 */
function writeU16Members(
  dest: Uint8Array,
  offset: number,
  members: readonly number[],
  capacity: number
): void {
  if (members.length >= capacity) {
    throw new Error(
      `${members.length} members do not fit: the record holds ${capacity - 1} plus a terminator`
    );
  }
  let at = offset;
  for (const m of members) {
    dest[at] = m & 0xff;
    dest[at + 1] = (m >> 8) & 0xff;
    at += 2;
  }
  dest[at] = 0xff;
  dest[at + 1] = 0xff;
}

/**
 * Zone membership — channel indices, 0xFFFF-terminated.
 *
 * The model stores 1-based channel NUMBERS; the wire stores 0-based indices.
 * `parseZone` adds one on the way in, so this takes it back off.
 *
 * Zone names live in a SEPARATE region (0x3600000) and are written by
 * `applyZoneNameToRecord`. Two records, one zone — a write must do both or the
 * radio shows a renamed zone with the old members, or vice versa.
 */
export function applyZoneMembersToRecord(original: Uint8Array, zone: Zone): Uint8Array {
  const rec = patch(original, D890_ADDR.ZONE_CHANNELS_STRIDE);
  const capacity = rec.length >> 1;
  writeU16Members(rec, 0, (zone.channels ?? []).map((n) => n - 1), capacity);
  return rec;
}

/**
 * The zone's name record, in its own region. See `applyZoneMembersToRecord`.
 *
 * **32 bytes, not the 0x22 `ZONE_NAME_LEN` or the 0x30 the read fetches.** The
 * read asks for a 16-byte-aligned span because reads must be aligned; the
 * vendor WRITE is two frames, 32 bytes, which is exactly the 16 characters
 * `NAME_MAX_CHARS` allows. Writing 34 would spill a terminator into a byte the
 * vendor never touches, and writing 48 would clear 16 bytes nobody has looked
 * at. Confirmed against the capture: 8 zone names, 32 bytes each.
 */
export const ZONE_NAME_WRITE_BYTES = D890_LIMITS.NAME_MAX_CHARS * 2;

export function applyZoneNameToRecord(original: Uint8Array, zone: Zone): Uint8Array {
  const rec = patch(original, ZONE_NAME_WRITE_BYTES);
  rec.set(encodeWideCharString(zone.name ?? '', ZONE_NAME_WRITE_BYTES), 0);
  return rec;
}

/**
 * A DMR radio ID: the ID as BCD-as-hex, then the name.
 *
 * `dmrIdValue` is the number; `dmrId` is its string form and `dmrIdBytes` the
 * raw four bytes the read kept. The number is the source of truth here — the
 * bytes are carried for diagnostics and are not written back blindly, or a
 * stale capture would override an edit.
 */
export function applyRadioIdToRecord(original: Uint8Array, id: DMRRadioID): Uint8Array {
  const rec = patch(original, D890_ADDR.RADIO_ID_STRIDE);
  // `Number('abc')` is NaN, not nullish, so a `??` chain here would never
  // reach its fallback and encodeBcdAsHexU32 would throw on the NaN.
  const idValue = id.dmrIdValue ?? Number(id.dmrId);
  rec.set(encodeBcdAsHexU32(Number.isFinite(idValue) ? idValue : 0), 0x00);
  rec.set(encodeWideCharString(id.name ?? '', 0x20), 0x04);
  return rec;
}

/**
 * A receive group: u32 talkgroup references, then a name at +0x100.
 *
 * ⚠️ Unlike every other member list here, `decodeU32Members` SKIPS its sentinel
 * rather than stopping at it — so a group read from a sparse record comes back
 * compacted. Writing therefore RE-PACKS: members go at the front and every
 * remaining slot is set to the sentinel. That is a real change to a sparse
 * record's layout, and it is deliberate — leaving holes would mean the written
 * list no longer matches what the user was shown.
 */
export function applyRxGroupToRecord(original: Uint8Array, group: RXGroup): Uint8Array {
  const rec = patch(original, D890_ADDR.RX_GROUP_NAME_OFFSET + D890_ADDR.RX_GROUP_NAME_LEN);
  const members = group.talkGroupIndices ?? [];
  if (members.length > D890_LIMITS.RX_GROUP_MEMBERS_MAX) {
    throw new Error(
      `RX group "${group.name}" has ${members.length} members; the radio holds ` +
        `${D890_LIMITS.RX_GROUP_MEMBERS_MAX}`
    );
  }
  for (let i = 0; i < D890_LIMITS.RX_GROUP_MEMBERS_MAX; i += 1) {
    const value = i < members.length ? members[i] >>> 0 : D890_SENTINEL.NO_MEMBER_U32;
    const at = i * 4;
    rec[at] = value & 0xff;
    rec[at + 1] = (value >>> 8) & 0xff;
    rec[at + 2] = (value >>> 16) & 0xff;
    rec[at + 3] = (value >>> 24) & 0xff;
  }
  rec.set(
    encodeWideCharString(group.name ?? '', D890_ADDR.RX_GROUP_NAME_LEN),
    D890_ADDR.RX_GROUP_NAME_OFFSET
  );
  return rec;
}

/**
 * A roaming zone: roaming-channel indices as SINGLE BYTES, then a name at +0x40.
 *
 * ⚠️ One byte per member, terminated by 0xFF — NOT the u16 lists every other
 * table here uses. The captured record is `00 01 02 03 ff ff ...`, i.e. members
 * 0-3; a u16 encoder writes `00 00 01 00` for the same list and the radio reads
 * member 0 followed by a terminator. That is a silent one-member zone, and it
 * is exactly what this encoder did until the round-trip caught it.
 */
export function applyRoamingZoneToRecord(
  original: Uint8Array,
  zone: { name: string; members: readonly number[] }
): Uint8Array {
  const rec = patch(original, D890_ADDR.ROAMING_ZONE_STRIDE);
  const capacity = D890_ADDR.ROAMING_ZONE_MEMBERS_LEN;
  const members = zone.members ?? [];
  if (members.length > capacity) {
    throw new Error(
      `Roaming zone "${zone.name}" has ${members.length} members; the record holds ${capacity}`
    );
  }
  for (let i = 0; i < capacity; i += 1) {
    rec[i] = i < members.length ? members[i] & 0xff : D890_SENTINEL.NO_REF_U8;
  }
  rec.set(
    encodeWideCharString(zone.name ?? '', D890_ADDR.ROAMING_ZONE_NAME_LEN),
    D890_ADDR.ROAMING_ZONE_NAME_OFFSET
  );
  return rec;
}

/**
 * A roaming channel: RX/TX frequencies, colour code, time slot, name.
 *
 * `colorCode` and `slot` are null when the radio holds a value outside their
 * range — the parser reports that rather than clamping. Writing preserves the
 * original byte in that case: a value this driver could not interpret is not
 * one it should overwrite with a guess.
 */
export function applyRoamingChannelToRecord(
  original: Uint8Array,
  channel: D890RoamingChannel
): Uint8Array {
  const rec = patch(original, D890_ADDR.ROAMING_CHANNEL_STRIDE);
  rec.set(encodeFrequencyMHz(channel.rxFrequency), 0x00);
  rec.set(encodeFrequencyMHz(channel.txFrequency), 0x04);
  if (channel.colorCode !== null) rec[0x08] = channel.colorCode & 0xff;
  if (channel.slot !== null) rec[0x09] = channel.slot & 0xff;
  rec.set(encodeWideCharString(channel.name ?? '', 0x20), 0x0a);
  return rec;
}

/**
 * One scan list.
 *
 * Layout notes that are easy to get wrong, all of them learned on hardware:
 *
 *  - Members are 1-based channel NUMBERS in the model, 0-based indices on the
 *    wire, and the array starts at **+0x30** — not at 0 like a zone's.
 *  - The four trailing settings are at **+0x94..+0x97**, immediately after the
 *    50-entry member array. They are NOT at 0xf8, which is inside the zero fill
 *    and read 0 or 0xff on every list ever captured.
 *  - Priority channels are stored RAW and are written back raw. They are
 *    Priority Channel 1 and 2, they must be list MEMBERS, and the radio
 *    discards a non-member priority — but that is a validation question for the
 *    planner, not something an encoder should silently fix.
 *  - Timers are units of 0.1 s and pass through unscaled, matching the parser.
 */
export function applyScanListToRecord(original: Uint8Array, list: ScanListDecoded): Uint8Array {
  const rec = patch(original, 0x98);
  rec[0x00] = (list.scanMode ?? 0) & 0xff;
  rec[0x01] = (list.prioritySelect ?? 0) & 0xff;

  const u16 = (at: number, value: number) => {
    rec[at] = value & 0xff;
    rec[at + 1] = (value >> 8) & 0xff;
  };
  u16(0x02, list.priorityChannel1Raw ?? 0);
  u16(0x04, list.priorityChannel2Raw ?? 0);
  u16(0x06, list.lookBackTimeA ?? 0);
  u16(0x08, list.lookBackTimeB ?? 0);
  u16(0x0a, list.dropoutDelay ?? 0);
  u16(0x0c, list.dwellTime ?? 0);

  rec.set(encodeWideCharString(list.name ?? '', 0x20), 0x0e);

  // Members start at 0x30 and the array is 50 entries; the terminator has to
  // fit inside it, so a full list is 49 members plus the sentinel.
  writeU16Members(
    rec,
    0x30,
    (list.channels ?? []).map((n) => n - 1),
    D890_LIMITS.SCAN_LIST_MEMBERS_MAX
  );

  rec[0x94] = (list.revertChannel ?? 0) & 0xff;
  rec[0x95] = (list.digitalGroupHold ?? 0) & 0xff;
  rec[0x96] = (list.digitalPriorityHold ?? 0) & 0xff;
  rec[0x97] = (list.analogHold ?? 0) & 0xff;
  return rec;
}

// ---------------------------------------------------------------------------
// Flat per-zone arrays and masks
// ---------------------------------------------------------------------------

/**
 * The per-zone current A or B channel — a flat `u16` array indexed by hardware
 * zone SLOT, one entry per zone, at `ZONE_A_CHANNEL` / `ZONE_B_CHANNEL`.
 *
 * ⚠️ These are POSITIONS within that zone's own member list, not channel
 * numbers, and the array is indexed by SLOT rather than by position in the
 * zones array — empty slots are dropped when zones are read, so the two differ
 * as soon as a zone in the middle is empty. `alignZoneCurrentChannels` maps one
 * to the other on read; a writer must hand back slot-indexed values.
 */
export function applyZoneCurrentChannels(
  original: Uint8Array,
  bySlot: ReadonlyMap<number, number>
): Uint8Array {
  const span = Math.ceil((D890_LIMITS.ZONES_MAX * 2) / 0x10) * 0x10;
  const out = patch(original, span);
  // Only listed slots. This took a Uint16-per-slot ARRAY until 2026-09-02, and
  // an array cannot distinguish "slot 3 is absent" from "slot 3 is zero" — so
  // it wrote 0 over the current channel of every zone the caller did not
  // mention. A Map makes absence explicit, and the read is position-indexed
  // anyway (see zoneCurrentChannelsBySlot), so the array form was being fed in
  // with the wrong meaning entirely.
  for (const [slot, value] of bySlot) {
    if (slot < 0 || slot >= D890_LIMITS.ZONES_MAX) continue;
    out[slot * 2] = value & 0xff;
    out[slot * 2 + 1] = (value >> 8) & 0xff;
  }
  return out;
}

/**
 * The zone hidden mask — one bit per zone slot, SET = HIDDEN.
 *
 * PROVEN ON HARDWARE 2026-08-31: with one zone hidden from the radio's own
 * menu, 0x3482c20 read `01` against a present mask of `FF`, and the owner
 * confirmed it was zone 1. So bit 0 is zone 1, LSB first, same convention as
 * the present mask.
 *
 * Patched, not rebuilt — bits above `ZONES_MAX` are left as the radio had them,
 * for the same reason the presence masks are.
 */
export function applyZoneHiddenMask(
  original: Uint8Array,
  hiddenSlots: ReadonlySet<number>
): Uint8Array {
  const out = patch(original, D890_ADDR.ZONE_HIDE_SIZE);
  for (let slot = 0; slot < D890_LIMITS.ZONES_MAX; slot += 1) {
    const byte = slot >> 3;
    const bit = 1 << (slot & 7);
    if (hiddenSlots.has(slot)) out[byte] = (out[byte] ?? 0) | bit;
    else out[byte] = (out[byte] ?? 0) & ~bit & 0xff;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Emergency / alarm
// ---------------------------------------------------------------------------

/**
 * Emergency alarm settings.
 *
 * `D890_EMERGENCY_UNWRITTEN` lists the bytes the vendor's own writer never
 * touches — +0x16 outright, +0x17 read but not written, and +0x18..+0x20 driven
 * by CPS globals with no references anywhere in the binary. What the RADIO puts
 * there is unknown, so this preserves every one of them rather than sending the
 * zeros the vendor does.
 *
 * A null channel reference means "none" and is stored as 0, which is how the
 * parser reads it back.
 */
export function applyEmergencySettings(
  original: Uint8Array,
  settings: D890EmergencySettings
): Uint8Array {
  const out = patch(original, 0x16);
  const ref = (at: number, value: number | null) => {
    const v = value ?? 0;
    out[at] = v & 0xff;
    out[at + 1] = (v >> 8) & 0xff;
  };
  out[0x00] = settings.analogKind & 0xff;
  out[0x01] = settings.toneType & 0xff;
  out[0x02] = settings.toneId & 0xff;
  out[0x03] = settings.alarmTime & 0xff;
  out[0x04] = settings.txDuration & 0xff;
  out[0x05] = settings.rxDuration & 0xff;
  ref(0x06, settings.analogChannel);
  out[0x08] = settings.analogSend & 0xff;
  out[0x09] = settings.analogCycle & 0xff;

  out[0x0a] = settings.digitalKind & 0xff;
  out[0x0b] = settings.digitalAlarmTime & 0xff;
  out[0x0c] = settings.digitalTxDuration & 0xff;
  out[0x0d] = settings.digitalRxDuration & 0xff;
  ref(0x0e, settings.digitalChannel);
  out[0x10] = settings.digitalSend & 0xff;
  out[0x11] = settings.digitalCycle & 0xff;

  out[0x12] = settings.loneWorkerResponseTime & 0xff;
  out[0x13] = settings.loneWorkerWarningTime & 0xff;
  out[0x14] = settings.loneWorkerAck & 0xff;
  out[0x15] = settings.receiveAlarm ? 1 : 0;
  return out;
}

/**
 * The emergency contact: call type, ring, and an 8-digit BCD code.
 *
 * ⚠️ Only the LOW nibble of +0x01 is ours — the parser masks it and the high
 * nibble belongs to something unidentified, so it is preserved. A null code
 * means the record held a non-decimal nibble; that is left exactly as found
 * rather than replaced with zeros.
 */
export function applyEmergencyContact(
  original: Uint8Array,
  contact: D890EmergencyContact
): Uint8Array {
  const out = patch(original, 0x06);
  out[0x00] = contact.callType & 0xff;
  out[0x01] = ((out[0x01] ?? 0) & 0xf0) | (contact.ring & 0x0f);
  if (contact.code !== null) {
    out.set(encodeBcd(contact.code, 4), 0x02);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

/**
 * Thrown when a write would change a key's TYPE.
 *
 * A key slot's type is fixed for its lifetime: a key may be created as AES or
 * ARC4, and it may be deleted, but an existing slot never converts from one to
 * the other. The tables are separate regions with different strides and key
 * lengths, so "changing the type" is not an edit at all — it is deleting a key
 * from one table and creating a different one in another, and a channel still
 * pointing at the old slot would then reference a key that is not there.
 *
 * Enforced as its own error type rather than a comment, because this is the one
 * encryption rule that cannot be recovered from by re-reading the radio.
 */
export class D890KeyTypeChangeError extends Error {
  constructor(slot: number, from: string, to: string) {
    super(
      `Refusing to change encryption key slot ${slot} from ${from} to ${to}. ` +
        `A key's type is fixed: create a new key of the wanted type and delete ` +
        `this one instead.`
    );
    this.name = 'D890KeyTypeChangeError';
  }
}

export type D890KeyKind = 'aes' | 'arc4';

/**
 * One AES or ARC4 key slot.
 *
 * `kind` is passed in AND checked against the table being written, so a caller
 * cannot hand an ARC4 key to the AES table by mistake — the two have different
 * strides and key lengths, so it would write into the wrong slot entirely.
 *
 * An `empty` slot is written as zeros, which is what deleting a key means here:
 * the parser calls a slot empty when every key byte is zero.
 */
export function applyKeySlotToRecord(
  original: Uint8Array,
  slot: D890RawKeySlot,
  kind: D890KeyKind,
  tableKind: D890KeyKind
): Uint8Array {
  if (kind !== tableKind) {
    throw new D890KeyTypeChangeError(slot.slot, kind.toUpperCase(), tableKind.toUpperCase());
  }
  const keyOffset = kind === 'aes' ? D890_ADDR.AES_KEY_OFFSET : D890_ADDR.ARC4_KEY_OFFSET;
  const keyLen = kind === 'aes' ? D890_ADDR.AES_KEY_BYTES : D890_ADDR.ARC4_KEY_BYTES;
  const stride = kind === 'aes' ? D890_ADDR.AES_KEY_STRIDE : D890_ADDR.ARC4_KEY_STRIDE;

  const rec = patch(original, stride);
  rec[0] = slot.keyId & 0xff;

  // Deleting a key is zeroing its bytes — that is exactly what makes the
  // parser report the slot as empty.
  rec.fill(0, keyOffset, keyOffset + keyLen);
  if (!slot.empty) {
    const hex = (slot.keyHex ?? '').replace(/[^0-9a-fA-F]/g, '');
    if (hex.length !== keyLen * 2) {
      throw new Error(
        `${kind.toUpperCase()} key slot ${slot.slot} needs ${keyLen * 2} hex characters, ` +
          `got ${hex.length}`
      );
    }
    for (let i = 0; i < keyLen; i += 1) {
      rec[keyOffset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
  }
  return rec;
}

/**
 * The encryption ID and key-reference pair for one slot.
 *
 * These live in two separate regions and are stored BIG-endian, unlike almost
 * everything else on this radio — the parser reads `(b[o] << 8) | b[o+1]`.
 */
export function applyEncryptionIdToRecord(original: Uint8Array, encryptionId: number): Uint8Array {
  const rec = patch(original, D890_ADDR.ENCRYPTION_ID_STRIDE);
  rec[0] = (encryptionId >> 8) & 0xff;
  rec[1] = encryptionId & 0xff;
  return rec;
}

export function applyEncryptionKeyRefToRecord(original: Uint8Array, key: number): Uint8Array {
  const rec = patch(original, D890_ADDR.ENCRYPTION_KEY_STRIDE);
  const at = D890_ADDR.ENCRYPTION_KEY_OFFSET;
  rec[at] = (key >> 8) & 0xff;
  rec[at + 1] = key & 0xff;
  return rec;
}
