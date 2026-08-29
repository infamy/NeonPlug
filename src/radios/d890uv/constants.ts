/**
 * AT-D890UV family constants — covers the BTECH DA-7X2 and DA-7XR rebrands.
 *
 * Partly hardware-verified against a real DA-7X2 on 2026-08-25. Confirmed:
 * the 921600 baud rate, the PROGRAM/QX handshake, identify, the read framing and
 * checksum, read sizes up to 0xf0, END, UTF-16LE names, the BCD-as-hex frequency
 * codec, the inverted talkgroup bitmap, and the channel/zone/scan-list/talkgroup
 * record layouts. Everything else — the write path, the CTCSS table, DCS, and the
 * settings regions — is still transcribed from the codeplug-studio reference docs
 * and remains a hypothesis. See D890UV-HARDWARE-CHECKLIST.md for what each is.
 *
 * This radio is architecturally unlike every other radio NeonPlug supports.
 * The others are *clone* protocols: read one contiguous memory image, edit it,
 * upload it whole. The D890 has **no contiguous image at all** — the codeplug is
 * scattered across sparse regions from 0x1000000 to 0x3a00000+, addressed
 * directly. Consequences worth internalising before touching this driver:
 *
 *   - There is no `setMemoryImage`. `useRadioConnection` guards that call behind
 *     an optional-method check, so this protocol simply doesn't implement it and
 *     skips the clone-image restore path entirely.
 *   - ⚠️ Writes are NOT safer here, despite the sparse addressing — an earlier
 *     version of this comment claimed they were, and that was dangerously wrong.
 *     The flash erase unit is 256 KB: writing a single 16-byte block can erase
 *     the ENTIRE unit it lives in. So write-path invariant #1 applies with more
 *     force than on the DM-32, not less — every co-resident byte in the unit
 *     must be read back and re-staged before touching any part of it.
 *   - Writes are also *slower*: the wire format allows only 16 bytes per frame.
 *     The OEM CPS needs ~9,976 frames for a full codeplug write.
 */

/**
 * NeonPlug model IDs for this family. Lives here rather than in descriptor.ts so
 * protocol.ts can use it without importing the descriptor (which imports the
 * protocol — a cycle).
 *
 * These are NOT what the radio reports over the wire. The radio says `ID890UV`
 * (see D890_ID_PREFIXES); these are the picker/capability keys. Confusing the
 * two makes `getCapabilitiesForModel()` miss and silently disables every
 * capability flag — verified on hardware 2026-08-25.
 */
export const D890_MODEL_IDS = ['DA-7X2', 'AT-D890UV', 'DA-7XR'] as const;

/** Serial line rate. Two orders of magnitude above the FT-65's 9600. */
export const D890_BAUD_RATE = 921600;

/** Frame opcodes and the single-byte ACK the radio answers with. */
export const D890_CMD = {
  /** Host → radio: read request. */
  READ: 0x52, // 'R'
  /** Both directions: write request, and the radio's read *response* opcode. */
  WRITE: 0x57, // 'W'
  /** Trailer on every framed message, and the bare ACK for a write. */
  ACK: 0x06,
  /** Host → radio: request model/version identification (after PROGRAM). */
  IDENTIFY: 0x02,
} as const;

/** ASCII handshake strings. */
export const D890_HANDSHAKE = {
  ENTER: 'PROGRAM',
  /** Radio's reply to ENTER, followed by a bare ACK byte. */
  ENTER_REPLY: 'QX',
  /**
   * Sent ONLY after a fully successful session. A failed upload must omit this
   * so the radio does not commit a partial write.
   */
  EXIT: 'END',
} as const;

/**
 * Model/version strings from the identify response.
 *
 * Confirmed on hardware 2026-08-25. Two facts worth keeping in mind:
 *
 *   1. The wire ID does NOT match the marketing name. A BTECH DA-7X2 reports
 *      `IDMR-7X2`, not `DA-7X2`.
 *   2. **A firmware update changed it.** The same physical radio reported
 *      `ID890UV` before an update and `IDMR-7X2` after — while the memory map
 *      stayed byte-identical. So this list is a moving target: an unrecognised
 *      ID is far more likely to be a new firmware string than a wrong radio.
 *
 * Matching is by prefix (per ADDING_A_RADIO.md, IDs often carry variant
 * suffixes), and the error names the observed string so a new one is a one-line
 * fix rather than an investigation.
 *
 * **Decision: the DMR-7X2 and the AT-D890UV are treated as one radio.** The
 * DMR-7X2 is a D890UV with minor behavioural differences and no known codeplug
 * differences — a full read of both produced identical record layouts. One
 * descriptor, one protocol, one structures.ts. If a genuine divergence ever
 * turns up, branch on the identity inside this driver rather than forking it:
 * `identity.model.startsWith('IDMR')` is available wherever the connection is.
 */
export const D890_ID_PREFIXES = ['ID890UV', 'IDMR-7X2'] as const;

/**
 * Expected value of the identify response's version field.
 *
 * NOTE this is the *protocol* version, not the firmware version — it stayed
 * 'V100' across a firmware update that changed the model string from ID890UV to
 * IDMR-7X2. The radio does not expose its firmware version anywhere reachable
 * over this protocol: LocalInfo has none, and scanning the firmware regions
 * turned up only "CHECKING DATA FOR D890UV".
 *
 * This driver was developed against **firmware 1.05** (the BTECH branch), read
 * from the radio's own menu. Treat the model string as the branch indicator —
 * ID890UV is the Anytone branch, IDMR-7X2 the BTECH one.
 */
export const D890_VERSION_PREFIX = 'V100';

/** Byte ranges of the identify response, after NUL stripping. */
export const D890_ID_RESPONSE = {
  MODEL_START: 0,
  MODEL_END: 8, // bytes 0..7
  VERSION_START: 9,
  VERSION_END: 13, // bytes 9..12
} as const;

/**
 * Read length is negotiated at handshake: probe the largest size that returns
 * data consistent with a 0x10 baseline, then cache it. Writes are NOT negotiable
 * — oversized writes desynchronise the radio.
 */
export const D890_BLOCK = {
  /** Largest read the protocol allows (240 bytes). */
  MAX_READ_LEN: 0xf0,
  /** Smallest read, and the fallback when negotiation finds any mismatch. */
  MIN_READ_LEN: 0x10,
  /** Candidate read sizes to probe, largest first. All are multiples of 16. */
  READ_LEN_CANDIDATES: [0xf0, 0x80, 0x40, 0x20, 0x10] as const,
  /** Fixed, non-negotiable write payload size. Do not increase. */
  WRITE_LEN: 0x10,
  /** Read and write spans must both be multiples of this. */
  ALIGNMENT: 0x10,
} as const;

/**
 * Address the OEM CPS deliberately skips.
 */
export const D890_FORBIDDEN_WRITE_ADDRESS = 0x2fa0010;

/**
 * Flash erase unit. Confirmed by an address sweep of the real radio: every
 * 0x40000 boundary from 0x01000000 upward holds live data, matching the
 * documented 256 KB erase geometry.
 *
 * This is the single most important fact about writing to this radio: writing
 * ONE 16-byte block erases the whole 256 KB unit containing it. Any write path
 * must read the entire unit first and re-stage every co-resident byte.
 */
export const D890_ERASE_UNIT = 0x40000;

/**
 * Per-unit offsets belonging to the radio's own flash management. These must
 * NEVER be written — the OEM CPS omits them, and a full-codeplug capture of
 * 9,976 write frames touched neither.
 *
 * Unlike D890_FORBIDDEN_WRITE_ADDRESS (a single address), these repeat in EVERY
 * erase unit, so the check is `address % D890_ERASE_UNIT` against each entry.
 */
export const D890_FORBIDDEN_UNIT_OFFSETS = [0x3fbf0, 0x3fff0] as const;

/**
 * Sparse memory regions. `bitmap` regions track which slots are occupied; the
 * corresponding `data` region holds the records themselves. A record whose
 * bitmap bit is not set must be treated as absent regardless of its contents —
 * this is the same class of bug as the "channel enable bitmap" gotcha in
 * ADDING_A_RADIO.md, except here it applies to *every* entity type.
 */
export const D890_ADDR = {
  /** Device info block; also the probe target for read-size negotiation. */
  LOCAL_INFO: 0x4f80000,
  LOCAL_INFO_SIZE: 0x100,

  /** Channels: occupancy bitmap, then bodies split across 0x80000 blocks. */
  CHANNEL_SET: 0x3482a00,
  CHANNEL_SET_SIZE: 0x200,
  CHANNEL_DATA: 0x1000000,
  /** Channel bodies are grouped 128 per block, each block 0x80000 apart. */
  CHANNEL_BLOCK_STRIDE: 0x80000,
  CHANNELS_PER_BLOCK: 128,
  /** One channel is 0x80 bytes — but stored as two 0x40 halves (see structures). */
  CHANNEL_STRIDE: 0x80,
  CHANNEL_HALF: 0x40,

  /** Zones. */
  ZONE_SET: 0x3482c00,
  ZONE_SET_SIZE: 0x20,
  ZONE_HIDE: 0x3482c20,
  ZONE_HIDE_SIZE: 0x20,
  ZONE_NAMES: 0x3600000,
  ZONE_NAME_STRIDE: 0x40,
  ZONE_NAME_LEN: 0x20,
  ZONE_CHANNELS: 0x2000000,
  ZONE_CHANNELS_STRIDE: 0x200,
  /** Per-zone A/B channel selection, as zone-local member positions. */
  ZONE_A_CHANNEL: 0x3500400,
  ZONE_B_CHANNEL: 0x3500600,

  /** Radio (DMR) IDs. */
  RADIO_ID_SET: 0x3482c40,
  RADIO_ID_SET_SIZE: 0x20,
  RADIO_ID_DATA: 0x3680000,
  RADIO_ID_STRIDE: 0x40,
  MASTER_ID_DATA: 0x3684000,
  MASTER_ID_SIZE: 0x40,

  /** Scan lists. */
  SCAN_LIST_SET: 0x3482c60,
  SCAN_LIST_SET_SIZE: 0x20,
  SCAN_LIST_DATA: 0x2100000,
  SCAN_LIST_STRIDE: 0x200,
  /** Only 0x00..0xf9 of each stride is meaningful; the rest is zero fill. */
  SCAN_LIST_USED: 0xfa,

  /** Talkgroups (digital contacts). NOTE the inverted bitmap — see below. */
  TALKGROUP_SET: 0x3980000,
  TALKGROUP_SET_SIZE: 0x4f0,
  TALKGROUP_DATA: 0x3a00000,
  TALKGROUP_STRIDE: 0xc8,

  /** Receive group lists. */
  RX_GROUP_SET: 0x3701510,
  RX_GROUP_SET_SIZE: 0x20,
  RX_GROUP_DATA: 0x3780000,
  RX_GROUP_STRIDE: 0x200,
  /** Members occupy 0x00..0xff; the name follows at 0x100. */
  RX_GROUP_NAME_OFFSET: 0x100,
  RX_GROUP_NAME_LEN: 0x20,
} as const;

/**
 * The talkgroup bitmap is INVERTED relative to every other bitmap on this radio:
 * a set bit means the slot is **empty**. Getting this backwards yields either an
 * entirely empty contact list or 10,000 phantom contacts, so it is a named
 * constant rather than a bare `true` at the call site.
 */
export const D890_TALKGROUP_BITMAP_INVERTED = true;

/**
 * Capacity limits.
 *
 * Two of these contradict the reference docs, resolved by arithmetic rather than
 * by picking a side:
 *
 *   ZONES — limits.md says 250; the region summary said 32. The zone bitmap is
 *   0x20 bytes = 256 bits, so 250 is a CPS-enforced cap inside a 256-slot
 *   structure and 32 was simply wrong.
 *
 *   TALKGROUPS — limits.md says 10,000; the region summary said ~4000 and the
 *   record doc guessed 4,096. The bitmap is 0x4f0 = 1264 bytes = 10,112 bits,
 *   which holds 10,000 and cannot hold only 4,096. limits.md is right.
 *
 * Both still want hardware confirmation, but the arithmetic is not ambiguous.
 */
export const D890_LIMITS = {
  CHANNELS_MAX: 4000,
  /** Slots 4000/4001 are VFO A/B; bits above 4000 are preserved on write. */
  VFO_A_INDEX: 4000,
  VFO_B_INDEX: 4001,

  ZONES_MAX: 250,
  /** Bitmap capacity, i.e. the hard structural ceiling above the CPS cap. */
  ZONES_BITMAP_CAPACITY: 256,
  /**
   * Radio spec: up to 160 channels per zone. The 0x200-byte stride would hold
   * 256 u16 entries, but the radio caps it at 160 — structural capacity is not
   * the same as the limit the radio enforces.
   */
  ZONE_MEMBERS_MAX: 160,

  SCAN_LISTS_MAX: 100,
  /**
   * 50, not the documented 100. Hardware 2026-08-25: the member array runs
   * 0x30..0x93 — exactly 50 u16 entries — and 0x94 onward reads as zeros rather
   * than the 0xffff padding that fills the rest of the array.
   */
  SCAN_LIST_MEMBERS_MAX: 50,

  TALK_GROUPS_MAX: 10000,
  TALK_GROUPS_BITMAP_CAPACITY: 10112,

  RX_GROUPS_MAX: 250,
  RX_GROUP_MEMBERS_MAX: 64,

  DMR_RADIO_IDS_MAX: 64,

  /** Names are wide-char (2 bytes/char) everywhere on this radio. */
  NAME_MAX_CHARS: 16,
} as const;

/** Sentinel values used across the record formats. */
export const D890_SENTINEL = {
  /** Empty u16 member slot in zone and scan-list membership arrays. */
  NO_MEMBER_U16: 0xffff,
  /** Empty u32 member slot in RX-group membership arrays. */
  NO_MEMBER_U32: 0xffffffff,
  /** "None" for the single-byte scan-list / RX-group references in a channel. */
  NO_REF_U8: 0xff,
} as const;

/**
 * Wire enum: channel TX power (byte 0x08, bits 2-3). Exactly four levels —
 * confirmed against the CPS export and the radio menu 2026-08-25. `Mid` maps to
 * NeonPlug's 'Medium'; the other three names match the shared PowerLevel union.
 * Kept for diagnostics/labels; parseChannel maps the bits directly.
 */
export const D890_POWER_LEVELS = ['Low', 'Mid', 'High', 'Turbo'] as const;

/** Wire enum: bandwidth (byte 0x08, bits 4-5). */
export const D890_BANDWIDTH = ['12.5kHz', '25kHz'] as const;

/** Wire enum: duplex (byte 0x08, bits 6-7). 3 is reserved/unused. */
export const D890_DUPLEX = ['Simplex', 'Positive', 'Negative', 'Reserved'] as const;

/** Wire enum: talkgroup call type (record byte 0x00). */
export const D890_CALL_TYPES = ['Private', 'Group', 'All'] as const;

/** Index 51 in the CTCSS table means "no tone". */
export const D890_CTCSS_NONE_INDEX = 51;

/**
 * The radio's 51-entry CTCSS table, indexed by channel bytes 0x0a (encode) and
 * 0x0b (decode). Index 51 means no tone.
 *
 * DERIVED FROM HARDWARE 2026-08-25. Five channels were programmed with known
 * tones and read back; every index landed exactly where this ordering predicts:
 *
 *   67.0 -> 1    88.5 -> 9    100.0 -> 13    131.8 -> 21    254.1 -> 50
 *
 * NeonPlug's shared CTCSS_FREQUENCIES has only 40 entries in a different order
 * and must NOT be substituted here — this list includes 62.5 at index 0 plus the
 * extra mid-range tones (159.8, 165.5, 171.3, 177.3, 183.5, 189.9, 196.6, 199.5)
 * that shift everything above 156.7.
 */
export const D890_CTCSS_TONES: readonly number[] = [
  62.5, 67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5,
  91.5, 94.8, 97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0,
  127.3, 131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5,
  167.9, 171.3, 173.8, 177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6,
  199.5, 203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3,
  254.1,
];

/**
 * Channel byte 0x09 tone-kind flags. DERIVED FROM HARDWARE 2026-08-25 — the
 * reference only said "CTCSS/DCS encode/decode selects" without bit positions.
 *
 * Observed: CTCSS both ways = 0x05, CTCSS TX only = 0x04, DCS both ways = 0x0a.
 * So the RX and TX halves each get their own CTCSS and DCS bit, which means the
 * tone *kind* is stated explicitly and never has to be inferred from whether the
 * DCS field happens to be non-zero.
 */
export const D890_TONE_FLAG = {
  CTCSS_RX: 0x01,
  DCS_RX: 0x02,
  CTCSS_TX: 0x04,
  DCS_TX: 0x08,
} as const;

/**
 * DCS is stored as the octal code read as a decimal number, with bit 9 set for
 * inverted polarity. DERIVED FROM HARDWARE 2026-08-25:
 *
 *   D023N -> 19   (0o23 = 19)
 *   D754N -> 492  (0o754 = 492)
 *   D023I -> 531  (19 | 0x200)
 */
export const D890_DCS_INVERTED_BIT = 0x200;
export const D890_DCS_CODE_MASK = 0x1ff;
