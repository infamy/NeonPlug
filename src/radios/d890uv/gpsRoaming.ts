/**
 * GPS Roaming — the geofence table at 0x3502000.
 *
 * Switches the radio to a given zone when it enters a circle of `radiusMeters`
 * around a position. The CPS exposes it as "GPS Roaming" on the GPS/Ranging tab;
 * its enable is the settings byte at 0x114 (`ZoneBarsEn`), and the vendor's SQL
 * name for the table is `STR_ZONE_BARS`.
 *
 * Geometry VERIFIED from `Proc_12_70_5E4CC0` (write) / `Proc_12_71_5E53C0`
 * (read): 32 entries bounded by `cmp ebx, 0x20` at fourteen sites, stride 0x20,
 * and the CPS's own `GPSRoaming.CSV` has exactly 32 rows.
 *
 * NO PRESENCE MASK, confirmed 2026-09-01 from the vendor CPS's serial capture:
 * it sweeps this region contiguously with nothing read beforehand, unlike the
 * AM channel, AM zone, 5-Tone and 2-Tone tables, which each get a mask read
 * first. So this one stays a whole-table read and occupancy comes from the
 * records. That costs nothing worth optimising — the table is 1,024 bytes.
 *
 * (The CPS reads 1,280 bytes here, 256 past the 32 entries. Those bytes are all
 * zero in the capture, and the 32-entry geometry has two independent sources,
 * so the overread is unexplained but not evidence of more slots.)
 *
 * ⚠️ Do NOT identify this pair by its error label. Both procedures carry
 * `SetCommDataByEMG_CodeError`, which is boilerplate shared by five completely
 * different tables — AES keys, ARC4 keys, the basic encryption codes, this, and
 * AutoRepFreqs. Discriminate by region. That label is why this table was
 * originally mis-attributed to encryption.
 *
 * ⚠️ Only 14 of each record's 32 bytes are written by the vendor. `+0x0A`,
 * `+0x0B` and `+0x10`-`+0x1F` are never touched, so a write MUST read the region
 * first and preserve them rather than sending zeros — a 16-byte frame carries
 * them whether or not they mean anything.
 */

export const D890_GPS_ROAMING = {
  DATA: 0x3502000,
  ENTRIES: 32,
  STRIDE: 0x20,
  /** 32 * 0x20 = 1024 bytes = 64 write frames. */
  TABLE_BYTES: 32 * 0x20,
  /** Bytes the vendor writer actually touches. */
  USED_BYTES: 14,
} as const;

export interface D890GpsRoamingEntry {
  index: number;
  enabled: boolean;
  /** Zone this entry selects. Stored as the vendor stores it — not offset. */
  zone: number;
  latitude: { degrees: number; minutes: number; minuteFraction: number; south: boolean };
  longitude: { degrees: number; minutes: number; minuteFraction: number; west: boolean };
  radiusMeters: number;
}

/**
 * Field order within `+0x00`-`+0x09` is INFERRED, not traced.
 *
 * It comes from `GPSRoaming.CSV`'s eleven columns lining up with ten consecutive
 * byte stores plus one 4-byte Long. Ten-for-ten is strong, but no store was
 * traced to a specific column.
 *
 * Note the layout is NOT grouped per axis the way APRS at 0x3501000 is — there,
 * a full position sits contiguously. Here degrees and hemisphere for BOTH axes
 * come first, then the minutes for both. Same four values per axis, interleaved
 * differently, so an APRS-shaped parser would silently read longitude degrees as
 * a latitude minute.
 */
/**
 * Exported so the encoder in `tableWrite.ts` cannot drift from the parser.
 * Two hand-kept copies of a byte layout is how a write silently corrupts one.
 */
export const GPS_ROAMING_OFFSETS = {
  ONOFF: 0x00,
  ZONE: 0x01,
  LAT_DEG: 0x02,
  LAT_SOUTH: 0x03,
  LON_DEG: 0x04,
  LON_WEST: 0x05,
  LAT_MIN: 0x06,
  LAT_MIN_FRAC: 0x07,
  LON_MIN: 0x08,
  LON_MIN_FRAC: 0x09,
  /** 4-byte Long. VERIFIED by four __vbaUI1I4 conversions against four stores. */
  RADIUS: 0x0c,
} as const;

const OFF = GPS_ROAMING_OFFSETS;

export function gpsRoamingAddress(index: number): number {
  return D890_GPS_ROAMING.DATA + index * D890_GPS_ROAMING.STRIDE;
}

function u32le(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24)) >>> 0;
}

/** Decode one 32-byte record. Returns null when the slot is unused. */
export function parseGpsRoamingEntry(bytes: Uint8Array, index: number): D890GpsRoamingEntry | null {
  const at = (o: number) => bytes[o] ?? 0;
  // An unused slot on this radio is erased flash, not zeros — the fourth region
  // where that has caught us. A record of 0xFF is absent, not a geofence at
  // 255 degrees with a 4-billion-metre radius.
  // Absent if EVERY used byte is 0x00 or 0xFF — not merely if the whole record
  // is uniformly one or the other.
  //
  // Real slots on this radio mix the two: observed 2026-08-31 on hardware with
  // ONOFF = 0x00 and ZONE = 0xFF in the same record, which passed a
  // uniformity test and rendered 32 phantom geofences reading
  // "255 (no such zone)" at 0.00000, 0.00000.
  //
  // Safe because a configured entry always has at least one byte that is
  // neither: enabled is 1, a zone index is below 250, and a position or radius
  // that is all-zero/all-FF is not a location anyone set.
  const used = bytes.subarray(0, D890_GPS_ROAMING.USED_BYTES);
  if (used.every((b) => b === 0x00 || b === 0xff)) return null;

  return {
    index,
    enabled: at(OFF.ONOFF) !== 0,
    zone: at(OFF.ZONE),
    latitude: {
      degrees: at(OFF.LAT_DEG),
      minutes: at(OFF.LAT_MIN),
      minuteFraction: at(OFF.LAT_MIN_FRAC),
      south: at(OFF.LAT_SOUTH) !== 0,
    },
    longitude: {
      degrees: at(OFF.LON_DEG),
      minutes: at(OFF.LON_MIN),
      minuteFraction: at(OFF.LON_MIN_FRAC),
      west: at(OFF.LON_WEST) !== 0,
    },
    radiusMeters: u32le(bytes, OFF.RADIUS),
  };
}

/** Decode the whole 1024-byte table, dropping unused slots. */
export function parseGpsRoamingTable(bytes: Uint8Array): D890GpsRoamingEntry[] {
  const out: D890GpsRoamingEntry[] = [];
  for (let i = 0; i < D890_GPS_ROAMING.ENTRIES; i += 1) {
    const start = i * D890_GPS_ROAMING.STRIDE;
    if (start + D890_GPS_ROAMING.STRIDE > bytes.length) break;
    const entry = parseGpsRoamingEntry(bytes.subarray(start, start + D890_GPS_ROAMING.STRIDE), i);
    if (entry) out.push(entry);
  }
  return out;
}

/** Decimal degrees, negative for south / west. */
export function gpsRoamingPositionToDecimal(
  p: D890GpsRoamingEntry['latitude'] | D890GpsRoamingEntry['longitude']
): number {
  const negative = 'south' in p ? p.south : (p as { west: boolean }).west;
  return (negative ? -1 : 1) * (p.degrees + (p.minutes + p.minuteFraction / 100) / 60);
}

/**
 * Decimal degrees back into the radio's degrees / whole minutes / hundredths /
 * hemisphere quadruple — the inverse of `gpsRoamingPositionToDecimal`.
 *
 * The rounding carry is the whole difficulty. 51.99999° is 51° 59.9994', which
 * rounds to 60.00 minutes; storing minutes=60 would be a position the radio
 * cannot represent, so it carries into degrees. The same applies one level down
 * when the hundredths round to 100.
 *
 * Sign is carried by the hemisphere flag, never by the magnitude — every stored
 * component is an unsigned byte.
 */
export function decimalToGpsRoamingPosition(decimal: number): {
  degrees: number;
  minutes: number;
  minuteFraction: number;
  negative: boolean;
} {
  const negative = decimal < 0;
  const absolute = Math.abs(decimal);

  let degrees = Math.floor(absolute);
  const totalMinutes = (absolute - degrees) * 60;
  let minutes = Math.floor(totalMinutes);
  let minuteFraction = Math.round((totalMinutes - minutes) * 100);

  if (minuteFraction >= 100) {
    minuteFraction -= 100;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes -= 60;
    degrees += 1;
  }

  return { degrees, minutes, minuteFraction, negative };
}
