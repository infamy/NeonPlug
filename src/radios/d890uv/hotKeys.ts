/**
 * Hot keys — the radio's programmable key actions.
 *
 * DECODED 2026-09-07 with no hardware session, from a before/after capture pair
 * read against a screenshot of the vendor CPS "Hot Key Set" grid that produced
 * it. The grid holds 6 rows labelled Hot Key 1-6 followed by 12 labelled Fun,
 * which is exactly the 18 entries found here; entry 18 onward is all zeros.
 *
 * The row that settles most of it is Hot Key 2, the only one the user changed:
 *
 *   Key        Mode  Menu  Call Type  Call Object  Digi Call Type  Content
 *   Hot Key 1  Menu  SMS   (greyed)   (greyed)     (greyed)        (greyed)
 *   Hot Key 2  Call  SMS   Digital    Off          DMR Hot         Good bye!
 *   Hot Key 3+ Call  SMS   Analog     Off          DMR Group       Off
 *
 *   entry 0  01 01 00 00 ff ff ff ff ff
 *   entry 1  00 01 01 03 ff ff ff ff 03   (was 00 01 00 00 ff ff ff ff ff)
 *   entry 2+ 00 01 00 00 ff ff ff ff ff
 *
 * CONTENT IS AN INDEX INTO THE PREDEFINED SMS TABLE, and that is confirmed
 * rather than assumed: entry 1 holds 0x03 at +0x08, and predefined SMS index 3
 * at 0x3180000 + 3 * 0x200 reads "Good bye!" — the exact string the grid shows
 * in that row's Content column.
 */

export const D890_HOT_KEYS = {
  BASE: 0x3701000,
  STRIDE: 0x30,
  /** 6 Hot Key rows + 12 Fun rows, matching the CPS grid and the byte table. */
  SLOTS: 18,
  /**
   * ⚠️ DISPUTED — this address is also `D890_ADDR.RX_GROUP_SET`.
   *
   * Read as 0x03 in a capture where entries 0 and 1 were the only rows
   * differing from the CPS grid default, which is where "configured mask" came
   * from. But 0x03 is equally consistent with "receive group lists 0 and 1 are
   * present", and on 2026-09-09 a radio with exactly two receive group lists
   * read ZERO here — while its hot keys were unchanged from the same defaults.
   *
   * Nothing depends on this constant: `parseHotKeys` reads all 18 entries and
   * `encodeHotKey` does not touch the mask, both because the entries are live
   * regardless of it. It is kept only so the collision is recorded rather than
   * rediscovered. See the note on `RX_GROUP_SET` in constants.ts.
   */
  MASK: 0x3701510,
  /** +0x04..07 and +0x08 use 0xFF fill for "Off". */
  NONE_BYTE: 0xff,
} as const;

/** +0x00. Both values observed: entry 0 is Menu, every other entry is Call. */
export const HOT_KEY_MODE = { CALL: 0, MENU: 1 } as const;
/** +0x02. Both values observed — Hot Key 2 moved 0 -> 1 when set to Digital. */
export const HOT_KEY_CALL_TYPE = { ANALOG: 0, DIGITAL: 1 } as const;
/**
 * +0x03. Only two values seen: 0 while the grid read "DMR Group", 3 once it
 * read "DMR Hot". The values between are NOT known — the CPS dropdown was never
 * enumerated, so do not assume 1 and 2 are the other entries in grid order.
 */
export const HOT_KEY_DIGI_CALL = { DMR_GROUP: 0, DMR_HOT: 3 } as const;

export interface D890HotKey {
  slot: number;
  mode: number;
  /** +0x01. Reads 1 in every observed entry, so its vocabulary is unknown. */
  menu: number;
  callType: number;
  digiCallType: number;
  /** u32 at +0x04; null when 0xFFFFFFFF, which the grid shows as "Off". */
  callObject: number | null;
  /** Index into the predefined SMS table, or null for "Off". */
  contentSmsIndex: number | null;
}

export function parseHotKey(bytes: Uint8Array, offset: number, slot: number): D890HotKey {
  const u32 =
    ((bytes[offset + 0x04] ?? 0) |
      ((bytes[offset + 0x05] ?? 0) << 8) |
      ((bytes[offset + 0x06] ?? 0) << 16) |
      ((bytes[offset + 0x07] ?? 0) << 24)) >>> 0;
  const content = bytes[offset + 0x08] ?? D890_HOT_KEYS.NONE_BYTE;
  return {
    slot,
    mode: bytes[offset + 0x00] ?? 0,
    menu: bytes[offset + 0x01] ?? 0,
    callType: bytes[offset + 0x02] ?? 0,
    digiCallType: bytes[offset + 0x03] ?? 0,
    callObject: u32 === 0xffffffff ? null : u32,
    contentSmsIndex: content === D890_HOT_KEYS.NONE_BYTE ? null : content,
  };
}

/**
 * Which entries the mask marks.
 *
 * ⚠️ The mask does NOT mean "in use" — all 18 entries exist and the radio acts
 * on every one. It read 0x03 when entries 0 and 1 were the only rows differing
 * from the grid default, so it tracks "configured", and a caller must still
 * parse every slot rather than only these.
 */
export function configuredHotKeys(region: Uint8Array): number[] {
  const at = D890_HOT_KEYS.MASK - 0x3700000;
  const out: number[] = [];
  for (let slot = 0; slot < D890_HOT_KEYS.SLOTS; slot += 1) {
    const byte = region[at + (slot >> 3)] ?? 0;
    if (byte === 0xff) continue;
    if (byte >> (slot & 7) & 1) out.push(slot);
  }
  return out;
}

/** Every hot key, from a buffer starting at the region base 0x3700000. */
export function parseHotKeys(region: Uint8Array): D890HotKey[] {
  const base = D890_HOT_KEYS.BASE - 0x3700000;
  return Array.from({ length: D890_HOT_KEYS.SLOTS }, (_, slot) =>
    parseHotKey(region, base + slot * D890_HOT_KEYS.STRIDE, slot)
  );
}

/**
 * Write one hot key, patching the region.
 *
 * Only the six modelled bytes move; +0x09 through +0x2f of the entry stay the
 * radio's own. The mask at 0x3701510 is NOT touched — it marks which rows differ
 * from the CPS default, not which exist, and nothing here knows what the default
 * is. All 18 entries are live regardless of it.
 */
export function encodeHotKey(
  region: Uint8Array,
  slot: number,
  key: Omit<D890HotKey, 'slot'>
): Uint8Array {
  if (slot < 0 || slot >= D890_HOT_KEYS.SLOTS) {
    throw new Error(`Hot key slot ${slot} is outside 0..${D890_HOT_KEYS.SLOTS - 1}`);
  }
  const out = Uint8Array.from(region);
  const at = D890_HOT_KEYS.BASE - 0x3700000 + slot * D890_HOT_KEYS.STRIDE;
  if (at + 0x09 > out.length) throw new Error('Hot key region is shorter than the slot');

  out[at + 0x00] = key.mode & 0xff;
  out[at + 0x01] = key.menu & 0xff;
  out[at + 0x02] = key.callType & 0xff;
  out[at + 0x03] = key.digiCallType & 0xff;

  // 0xFFFFFFFF is the grid's "Off" for Call Object.
  const obj = key.callObject === null ? 0xffffffff : key.callObject >>> 0;
  out[at + 0x04] = obj & 0xff;
  out[at + 0x05] = (obj >>> 8) & 0xff;
  out[at + 0x06] = (obj >>> 16) & 0xff;
  out[at + 0x07] = (obj >>> 24) & 0xff;

  out[at + 0x08] =
    key.contentSmsIndex === null ? D890_HOT_KEYS.NONE_BYTE : key.contentSmsIndex & 0xff;
  return out;
}
