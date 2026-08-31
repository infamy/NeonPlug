/**
 * AT-D890UV family constants — covers the BTECH DA-7X2 and DA-7XR rebrands.
 *
 * Partly hardware-verified against a real DA-7X2 on 2026-08-25. Confirmed:
 * the 921600 baud rate, the PROGRAM/QX handshake, identify, the read framing and
 * checksum, read sizes up to 0xf0, END, UTF-16LE names, the BCD-as-hex frequency
 * codec, the inverted talkgroup mask, and the channel/zone/scan-list/talkgroup
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
 *     A full codeplug write would need on the order of 10,000 frames — a figure
 *     derived from the read set's total size, NOT measured. No write has ever
 *     been performed or captured by this project.
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
/**
 * Round a span up to the radio's 16-byte read granularity.
 *
 * Structure sizes and READ spans are not the same number, and conflating them
 * cost a working read: a zone name is 34 bytes, `readMemory` rejects any span
 * that is not a multiple of 16, and the whole codeplug read folded at the first
 * zone. Reading a few bytes past a record is harmless — the decoder takes what
 * it needs — so every read length below is derived through this rather than
 * hand-written, which is why the mistake cannot come back.
 */
const alignRead = (bytes: number): number => Math.ceil(bytes / 0x10) * 0x10;

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
 * Assumed flash erase unit, 256 KB.
 *
 * ⚠️ PROVENANCE CORRECTED. This is NOT derived from the vendor CPS. A full
 * decompilation of `DA_7X2.exe` shows the only `0x40000` in that binary is the
 * **talkgroup bank stride** — `talkgroupAddr = 0x3a00000 + bank * 0x40000 +
 * index * 0xC8`, at three identical sites. Nothing in the CPS declares, checks
 * or works around an erase granularity, and the size match is coincidence.
 *
 * The value rests on radio-family knowledge and on the address sweep in
 * D890UV-HARDWARE-CHECKLIST.md, not on the vendor software. A null result in the
 * CPS is not evidence the hazard is absent from the hardware, so the guard
 * stays — do not relax it on the strength of the decompilation.
 */
export const D890_ERASE_UNIT = 0x40000;

/**
 * Per-unit offsets belonging to the radio's own flash management. These must
 * NEVER be written.
 *
 * ✅ CONFIRMED ON HARDWARE 2026-08-30 by reading them: 0x103FBF4 holds
 * `22 33 44 55` and 0x103FFFC holds `55 55 AA AA`, both surrounded by 0xFF.
 * 0x55/0xAA is the classic flash-management signature pattern.
 *
 * This also corroborates the 256 KB erase unit itself: the two markers sit at
 * exactly the documented offsets within the first unit of the channel region.
 *
 * (An earlier version of this comment cited "a full-codeplug capture of 9,976
 * write frames". That capture never existed and the claim was removed. The
 * offsets then rested on recollection alone — and static analysis of the vendor
 * CPS found the constants zero times — so the guard was a candidate for
 * deletion until the radio was read.)
 *
 * Unlike D890_FORBIDDEN_WRITE_ADDRESS (a single address), these repeat in EVERY
 * erase unit, so the check is `address % D890_ERASE_UNIT` against each entry.
 */
// ⚠️ Neither 0x3fbf0 nor 0x3fff0 appears as an immediate anywhere in the vendor
// CPS's code section. Whatever protects them, it is not a literal comparison in
// that binary — so the decompilation neither confirms nor contradicts this rule.
// Keep it.
export const D890_FORBIDDEN_UNIT_OFFSETS = [0x3fbf0, 0x3fff0] as const;

/**
 * Sparse memory regions. `mask` regions track which slots are occupied; the
 * corresponding `data` region holds the records themselves. A record whose
 * mask bit is not set must be treated as absent regardless of its contents —
 * this is the same class of bug as the "channel enable mask" gotcha in
 * ADDING_A_RADIO.md, except here it applies to *every* entity type.
 */
export const D890_ADDR = {
  /** Device info block; also the probe target for read-size negotiation. */
  LOCAL_INFO: 0x4f80000,
  LOCAL_INFO_SIZE: 0x100,

  /**
   * General settings. Located on hardware 2026-08-29 by writing six purpose-built
   * `.rdt` codeplugs through the vendor CPS and diffing read-only dumps — see
   * DA7X2-RDT-TO-RADIO.md. 0x160 is the observed extent: the highest confirmed
   * field sits at +0x15c, and the region reads as a contiguous block from +0x00.
   */
  SETTINGS: 0x3500000,
  SETTINGS_SIZE: 0x160,

  /** Channels: occupancy mask, then bodies split across 0x80000 blocks. */
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
  /**
   * 34 bytes = 17 UTF-16LE units, 0xFFFF-terminated — the vendor marshaller
   * writes the terminator after a full 16-character name, so a 32-byte read
   * stops one unit short of it. 0x22..0x3F of the stride is untouched.
   */
  ZONE_NAME_LEN: 0x22,
  /** Read span for a zone name — 0x22 rounded up to the 16-byte granularity. */
  ZONE_NAME_READ: alignRead(0x22),
  ZONE_CHANNELS: 0x2000000,
  ZONE_CHANNELS_STRIDE: 0x200,
  /**
   * Per-zone A/B channel selection.
   *
   * These live inside the settings region's address range but belong to the
   * ZONE record — the vendor zone marshaller writes them, the settings
   * marshaller does not touch them. Each is a u16 holding the zero-based
   * POSITION within that zone's own member list, not a channel number, so
   * resolving one needs the zone's membership array.
   */
  ZONE_A_CHANNEL: 0x3500400,
  ZONE_B_CHANNEL: 0x3500600,
  /**
   * Per-zone roaming mask, 32 bytes (256 bits) per zone: bit k set means the
   * zone's k-th member is a roam channel. The vendor writer clears all 0x20
   * bytes before setting any bit. Not read by this driver yet.
   */
  ZONE_ROAM: 0x4c00000,
  ZONE_ROAM_STRIDE: 0x20,

  /**
   * Radio (DMR) IDs.
   *
   * 0x3482c40 is the 32-byte gap between the zone-hidden mask (0x3482c20) and
   * the scan-list mask (0x3482c60). None of the six record marshallers in the
   * vendor CPS touches it, so the decompilation cannot name its owner; this
   * driver reads it as the radio-ID occupancy mask on the strength of a live
   * read alone. Treat the ownership as observed, not proven.
   */
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
  /**
   * Scan lists are BLOCKED like channels, not flat: the vendor marshaller pair
   * (`sub_005da370` write / `sub_005daeb0` read) computes
   * `0x2100000 + (i / 32) * 0x80000 + (i % 32) * 0x200`.
   *
   * Flat addressing is correct for lists 0-31 and wrong for every list above
   * that — list 32 sits at 0x2180000, not 0x2104000. Only lists 0-1 have ever
   * been read from hardware, so the split itself is from the decompilation.
   */
  SCAN_LISTS_PER_BLOCK: 32,
  SCAN_LIST_BLOCK_STRIDE: 0x80000,
  /** Only 0x00..0xf9 of each stride is meaningful; the rest is zero fill. */
  SCAN_LIST_USED: 0xfa,

  /** Talkgroups (digital contacts). NOTE the inverted mask — see below. */
  TALKGROUP_SET: 0x3980000,
  /**
   * 0x4e2 = 1250 bytes = exactly 10,000 bits, matching the documented 10,000
   * talkgroup limit precisely. Extracted from the vendor CPS binary, which
   * pushes this length alongside the address at its read call site. The
   * reference doc's 0x4f0 (10,112 bits) was rounded up.
   */
  TALKGROUP_SET_SIZE: 0x4e2,
  /** Read span for the talkgroup mask — 1250 bytes rounded up to 1264. */
  TALKGROUP_SET_READ: alignRead(0x4e2),
  TALKGROUP_DATA: 0x3a00000,
  TALKGROUP_STRIDE: 0xc8,
  /** Read span for one talkgroup record — 200 bytes rounded up to 208. */
  TALKGROUP_READ: alignRead(0xc8),
  /**
   * Talkgroups are stored in BANKS, not as one flat array — the vendor CPS
   * computes `0x3a00000 + bank * 0x40000 + index * 0xc8` at three identical
   * sites. Flat addressing is correct only inside the first bank.
   */
  TALKGROUP_BANK_STRIDE: 0x40000,

  /**
   * Roaming — located by reading the radio 2026-08-30, not from the RE bundle.
   *
   * These are three of the addresses the settings marshaller reaches through
   * stores whose address is parametric (`base + i*0x40` over a runtime-sized
   * array), which is why no static trace could name them. Dumping them read-only
   * and matching the bytes against the vendor's own CSV export settled all three
   * in one pass each.
   */
  ROAMING_CHANNEL_SET: 0x2084000,
  ROAMING_CHANNEL_SET_SIZE: 0x20,
  ROAMING_CHANNEL_DATA: 0x2080000,
  ROAMING_CHANNEL_STRIDE: 0x40,
  ROAMING_ZONE_DATA: 0x2085000,
  ROAMING_ZONE_STRIDE: 0x80,
  /** A roaming zone's member list occupies the first half of its record. */
  ROAMING_ZONE_MEMBERS_LEN: 0x40,
  /** Its UTF-16LE name follows at +0x40. */
  ROAMING_ZONE_NAME_OFFSET: 0x40,
  ROAMING_ZONE_NAME_LEN: 0x22,

  /**
   * APRS settings. Mapped by the vendor settings marshaller (27 named fields)
   * and confirmed on hardware by content — the dump carries the destination and
   * source callsigns, the digipeater path and the symbol pair verbatim.
   */
  APRS_SETTINGS: 0x3501000,
  APRS_SETTINGS_SIZE: 0x100,

  /**
   * Encryption keys — separate tables, one per key type. The radio does NOT
   * keep a single mixed list the way the DM-32 does.
   *
   * ALL THREE IMPLEMENTED TABLES ARE HARDWARE-CONFIRMED (2026-08-30). Two keys
   * per type were set in the vendor CPS, written to the radio, and read back;
   * every key returned byte for byte at the address, stride and offset the
   * vendor marshaller predicted. The addresses came from the disassembly, not
   * from searching memory — this table is nowhere near the four regions it was
   * hunted for in.
   *
   * ✅ Endianness is now settled by DATA, not just by the disassembly. Encryption
   * ID 22136 (0x5678) read back as `56 78` and key 4660 (0x1234) as `12 34`, so
   * the radio is BIG-endian. Every factory value is byte-palindromic (0x0101,
   * 0x0202 …), so this could only ever be proved by writing a non-palindromic
   * one. The .rdt file stores these little-endian — do not "simplify" the two
   * to match.
   */
  ENCRYPTION_ID_TABLE: 0x3585000,
  ENCRYPTION_ID_STRIDE: 2,
  ENCRYPTION_KEY_TABLE: 0x3585100,
  ENCRYPTION_KEY_STRIDE: 0x28,
  /**
   * Only +0x10/+0x11 of each 0x28 slot holds the key; the rest reads zero.
   * Confirmed by slot 2's key landing at 0x38 = 0x28 + 0x10, which pins the
   * stride and this offset simultaneously.
   */
  ENCRYPTION_KEY_OFFSET: 0x10,
  ENCRYPTION_SLOTS: 32,

  /** Key id at +0x00, then 32 key bytes. */
  AES_KEY_TABLE: 0x3580000,
  AES_KEY_STRIDE: 0x40,
  AES_KEY_OFFSET: 0x01,
  AES_KEY_BYTES: 32,
  /** Key length in hex characters: 0x40 = 64 chars = a 256-bit key. */
  AES_KEY_NUM_OFFSET: 0x22,

  /** Key id at +0x00, then 5 key bytes. */
  ARC4_KEY_TABLE: 0x3584000,
  ARC4_KEY_STRIDE: 0x10,
  ARC4_KEY_OFFSET: 0x01,
  ARC4_KEY_BYTES: 5,

  /**
   * ⚠️ NXDN encryption (0x4b00200) is deliberately NOT here. NXDN is not in this
   * radio's firmware, so there is nothing to set and nothing to confirm. It also
   * appears in the vendor dispatcher's write phase with no counterpart in the
   * read phase, which is unexplained. Out until it leaves beta.
   */

  /**
   * Boot image and the two standby pictures. One format, three addresses.
   *
   * ✅ BOOT_IMAGE CONFIRMED ON HARDWARE 2026-08-30. A logo was written through
   * the vendor CPS and read back: 160x128, RGB565, big-endian, column-major, all
   * four verified against the capture. Decoding the radio's own bytes and packing
   * them straight back is byte-identical.
   *
   * How the earlier all-0xFF read was resolved, because it recurs: both regions
   * first read as erased flash, which is exactly as consistent with "never
   * written" as with "wrong address" — the same trap AES and ARC4 sat in. Note
   * 0xFF, not the 0x00 that unset tables return; that difference is what said the
   * region was real. Writing a picture settled it.
   *
   * ✅ BK1 AND BK2 ALSO CONFIRMED 2026-08-30, by writing a DIFFERENT background
   * colour to each — blue to BK1, red to BK2. Three results from one capture:
   *   - the addresses are not transposed (BK1 returned blue, BK2 red);
   *   - endianness re-proved on two regions with no prior evidence, across 63%
   *     of each frame rather than from one hunted-down pixel (0x051D reads
   *     rgb(0,160,232) blue big-endian, rgb(24,160,40) green little-endian);
   *   - channel order proved INDEPENDENTLY of the backgrounds. Blue and red map
   *     onto each other under an R/B swap, so the backgrounds alone cannot tell
   *     a swap from transposed addresses. The NP logo left in the centre settles
   *     it: 0xF9AE = rgb(248,52,112) pink in all three captures, at an identical
   *     305 pixels; an R/B swap would read rgb(112,52,248).
   *
   * ⚠️ All three are 256 KB-aligned and hold only 40 KB, so the rest of each
   * erase unit is unknown territory. NeonPlug has still never written to a radio.
   */
  BOOT_IMAGE: 0x3f80000,
  STANDBY_BK1: 0x4000000,
  STANDBY_BK2: 0x4080000,

  /** GPS satellite table: 25 slots of 512 bytes = 12800 bytes. */
  SATELLITE_TABLE: 0x4a80000,
  SATELLITE_SLOT_STRIDE: 0x200,
  SATELLITE_SLOTS: 25,

  /**
   * Pre-defined SMS — the vendor's "Pre-defined SMS", the DM-32's quick messages.
   *
   * CONFIRMED ON HARDWARE 2026-08-30. A radio returned the five AnyTone factory
   * defaults at exactly this base and stride: "Hello!", "Welcome!", "Thank you!",
   * "Good bye!", "Happy every day!".
   *
   * Text is UTF-16LE, NOT the `varchar(200)` the vendor's SQL DDL shows — that
   * DDL describes the CPS's own database table, not the radio. Every string on
   * this radio is UTF-16LE; the DDL is a red herring for anyone byte-mapping
   * from it.
   *
   * ⚠️ An unused slot is 0xFF-filled, not zeroed. Reading to a NUL terminator
   * alone yields 256 characters of U+FFFF. This is the third region on this
   * radio where erased flash masquerades as data — the images and the satellite
   * table both did the same thing.
   */
  PREDEFINED_SMS_DATA: 0x3180000,
  PREDEFINED_SMS_STRIDE: 0x200,
  /** Slots per bank; bank n is at +n * 0x80000. */
  PREDEFINED_SMS_PER_BANK: 20,
  PREDEFINED_SMS_BANK_STRIDE: 0x80000,
  /** The vendor's own limit is 200 characters, well under the 256 the slot fits. */
  PREDEFINED_SMS_MAX_CHARS: 200,
  PREDEFINED_SMS_MAX: 100,
  /** Presence mask. */
  PREDEFINED_SMS_SET: 0x2980000,
  PREDEFINED_SMS_SET_SIZE: 0x640,

  /**
   * AM airband and FM broadcast channels — separate tables from the main channel
   * list. See `broadcastChannels.ts` for the record shape and the two different
   * frequency scales.
   *
   * ⚠️ RECORD STRIDE IS NOT CONFIRMED. A dumped radio holds exactly one of each
   * (the factory "AM-001" / "FM-001"), so no second record exists to measure
   * against — the same reason the AM ZONE table cannot be mapped from this
   * codeplug at all. Do not read a run of records until the stride is settled.
   */
  /**
   * VFO A and B: the two channel slots immediately past the 4000 storable ones.
   * Reached through ordinary channel addressing — not a separate region.
   *
   * These are 0-BASED indices. The channel list numbers from 1, so they surface
   * as channel 4001 and 4002, which is what `isVFOChannel` matches on. The APRS
   * region's "no channel" sentinel is 4002 for the same reason — it names VFO B's
   * slot rather than a real channel.
   */
  VFO_A_INDEX: 4000,
  VFO_B_INDEX: 4001,

  AM_AIR_DATA: 0x3880000,
  FM_BROADCAST_DATA: 0x3400000,
  /** Name field is UTF-16LE at +0x04; character count unconfirmed. */
  BROADCAST_NAME_CHARS: 16,

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
 * The talkgroup mask is INVERTED relative to every other mask on this radio:
 * a set bit means the slot is **empty**. Getting this backwards yields either an
 * entirely empty contact list or 10,000 phantom contacts, so it is a named
 * constant rather than a bare `true` at the call site.
 */
export const D890_TALKGROUP_MASK_INVERTED = true;

/**
 * Capacity limits.
 *
 * Two of these contradict the reference docs, resolved by arithmetic rather than
 * by picking a side:
 *
 *   ZONES — limits.md says 250; the region summary said 32. The zone mask is
 *   0x20 bytes = 256 bits, so 250 is a CPS-enforced cap inside a 256-slot
 *   structure and 32 was simply wrong.
 *
 *   TALKGROUPS — limits.md says 10,000; the region summary said ~4000 and the
 *   record doc guessed 4,096. The mask is 0x4f0 = 1264 bytes = 10,112 bits,
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
  /** Mask capacity, i.e. the hard structural ceiling above the CPS cap. */
  ZONES_MASK_CAPACITY: 256,
  /**
   * 160 channels per zone — what the vendor CPS lets a user build, and so what
   * NeonPlug offers.
   *
   * This is deliberately NOT the structural capacity. The zone marshaller
   * (`sub_005b4360` write / `sub_005b50b0` read) copies a fixed 500-byte run —
   * 250 u16 entries — and the CPS zone record reserves +0x06..+0x1F9 for all
   * 250. The radio and the file format hold 250; the CPS UI stops at 160. Since
   * a codeplug NeonPlug builds has to load in the vendor software too, the
   * lower number is the one to enforce.
   */
  ZONE_MEMBERS_MAX: 160,
  /**
   * Structural capacity of the membership array, used when PARSING so a zone
   * the vendor CPS could not have built (hand-edited, or a future firmware) is
   * read whole instead of silently truncated. Enforcement uses the 160 above.
   */
  ZONE_MEMBERS_STRUCTURAL: 250,

  SCAN_LISTS_MAX: 100,
  /**
   * 50, not the documented 100. Hardware 2026-08-25: the member array runs
   * 0x30..0x93 — exactly 50 u16 entries — and 0x94 onward reads as zeros rather
   * than the 0xffff padding that fills the rest of the array.
   */
  SCAN_LIST_MEMBERS_MAX: 50,

  TALK_GROUPS_MAX: 10000,
  /** Exactly equal to the max — the mask is sized to the limit, not padded. */
  TALK_GROUPS_MASK_CAPACITY: 10000,

  RX_GROUPS_MAX: 250,
  RX_GROUP_MEMBERS_MAX: 64,

  DMR_RADIO_IDS_MAX: 64,

  /**
   * Roaming channels and zones.
   *
   * Both caps are the structural size of the region rather than a figure from
   * documentation: the mask is 0x20 bytes (256 bits) and a roaming zone's
   * member list is 0x40 bytes of one-byte indices. The vendor CPS may enforce
   * something lower — only four roaming channels and one zone have been seen.
   */
  ROAMING_CHANNELS_MAX: 256,
  ROAMING_ZONES_MAX: 64,
  ROAMING_ZONE_MEMBERS_MAX: 64,

  /** Names are wide-char (2 bytes/char) everywhere on this radio. */
  NAME_MAX_CHARS: 16,
} as const;

/**
 * Scan-list Revert Channel, byte 0x94 — the complete 8-entry list.
 *
 * Enumerated 2026-08-30 by writing a codeplug with ten scan lists whose revert
 * index walked 0-9 and reading the vendor CPS's own export back. Indices 8 and 9
 * came back as `Selected`: **the CPS silently clamps an out-of-range index
 * rather than rejecting it**, which is why the list is 8 long and not 10.
 *
 * This also settles the earlier puzzle. Two lists captured from hardware stored
 * 4 and 6 and displayed "Last Called" and "Priority Channel Select1 + TalkBack",
 * which fitted no sensible ordering — because the ordering was assumed to be
 * pairs. It is not; the four plain modes come first and the TalkBack variants of
 * the two priority modes are appended at the end.
 */
export const D890_SCAN_REVERT_CHANNEL = [
  'Selected',
  'Selected + TalkBack',
  'Priority Channel Select1',
  'Priority Channel Select2',
  'Last Called',
  'Last Used',
  'Priority Channel Select1 + TalkBack',
  'Priority Channel Select2 + TalkBack',
] as const;

/**
 * Scan-list Scan Mode, byte 0x00 — a boolean, not the multi-entry list the name
 * suggests. Indices 2 and 3 both read back as `Off`, same clamping behaviour.
 */
export const D890_SCAN_MODE = ['Off', 'On'] as const;

/**
 * Channel "Analog APRS PTT Mode", byte 0x36.
 *
 * From the vendor CPS's own export of a codeplug built to vary it. The equivalent
 * digital field at 0x37 is a plain Off/On — index 2 clamps back to On.
 */
export const D890_ANALOG_APRS_PTT_MODE = [
  'Off',
  'Start Of Transmission',
  'End Of Transmission',
] as const;

/**
 * Channel "Busy Lock/TX Permit", byte 0x1a bits 3-0 (the vendor's `RepLock`).
 *
 * ⚠️ Index 0 is NOT a fixed label. The CPS renders a stored 0 as "Off" on an
 * analog channel and "Always" on a digital one, which is exactly why this column
 * looked perfectly confounded with channel type on every codeplug captured
 * before one was built to vary the byte itself. It is a real stored field.
 *
 * Indices above 2 have never been observed.
 */
/**
 * DMR Mode — `0x21` bits 3-2. CONFIRMED on hardware 2026-08-30 by selecting each
 * option on the radio and re-reading the VFO record.
 *
 * ⚠️ THIS FIELD DOES NOT STAND ALONE. The radio's four-option DMR Mode menu is
 * composed from TWO stored fields, and value 0 is shared:
 *
 *     menu option      0x21 bits 3-2     0x34 bit 1 (digitalDuplex, inverted)
 *     DMO / Simplex          0                1
 *     Repeater               0                0
 *     Dual TS                1                -
 *     TS Split               2                -
 *
 * So a UI that shows this field alone cannot distinguish DMO from Repeater, and
 * a write that sets this field without also setting `0x34` bit 1 will land on
 * whichever of the two the radio was already in.
 *
 * Value 3 was never reachable from the menu and stays unnamed.
 */
export const D890_DMR_MODE = ['Simplex / Repeater', 'Dual TS', 'TS Split', '3 (unconfirmed)'] as const;

export const D890_BUSY_LOCK = ['Off / Always', 'Different CDT', 'Channel Free'] as const;

/**
 * Group / Private Call Hold Time — the vocabulary, in order.
 *
 * Both controls share one list. Recovered 2026-08-30 from five screenshots of
 * the dropdown open, scrolled head to tail: 1s through 30s in one-second steps,
 * then 30min, then Infinite. Thirty-two entries by direct count.
 *
 * ⚠️ The INDEX ORIGIN is not settled, and the two available signals disagree.
 * Direct count says index 0 is "1s". An earlier sweep pressed {END} on this
 * control and read back 32, which would make the list 33 long with "Infinite" at
 * 32. The screenshots support 32 entries — and the same pass established that
 * the CPS silently CLAMPS an out-of-range index rather than rejecting it, which
 * would produce exactly that spurious 33.
 *
 * Presented rather than withheld, because a named list a user can check against
 * their radio beats a bare index. The settling test is one line: set the control
 * to "5s" in the vendor CPS, save, and read `.rdt` 0x087 — 4 confirms this list,
 * 5 means something precedes "1s".
 */
export const D890_CALL_HOLD_TIME: readonly string[] = [
  ...Array.from({ length: 30 }, (_, i) => `${i + 1}s`),
  '30min',
  'Infinite',
];

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

/**
 * How this radio's three key tables map onto the shared `EncryptionKey.encryptionType`.
 *
 * The codes are the DM-32's, because the model and the UI are already built
 * around them and a user does not care which radio invented the numbering.
 * The DA-7X2's own "Encryption Code" — a plain 16-bit value — has no DM-32
 * equivalent, so it takes the Custom slot.
 */
export const D890_ENCRYPTION_TYPE = {
  BASIC: 1,
  ARC4: 2,
  AES128: 3,
  AES256: 4,
} as const;
