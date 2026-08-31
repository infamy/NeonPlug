import { D890_ADDR } from './constants';

/**
 * DA-7X2 APRS settings, region 0x3501000.
 *
 * CONFIRMED AGAINST HARDWARE 2026-08-30. The region was dumped off a radio and
 * every field below was matched, value for value, against the vendor CPS's own
 * `APRS.CSV` export of the same codeplug — sixteen exact matches including three
 * callsign strings and the symbol pair. Field NAMES come from the vendor settings
 * marshaller, which independently placed 27 of them at these offsets.
 *
 * Two things are worth knowing about the layout, because both look like bugs
 * until you see why:
 *
 *   - Callsigns are SIX bytes and are NOT NUL-terminated when full. `BG6LKK`
 *     fills its field exactly and the SSID byte follows immediately, so reading
 *     to a NUL swallows the SSID as a seventh character.
 *   - Latitude and longitude are degrees / whole minutes / hundredths of a
 *     minute in three separate bytes, not a scaled fixed-point value.
 *
 * The vendor's "Enter Your Sending Text" is NOT in this region — everything past
 * +0x50 read as zero. It lives elsewhere, probably the 0x3501200 block the memory
 * map names but nothing has read.
 */

/** Slot value meaning "no channel" in the digital upload list. */
export const D890_APRS_NO_CHANNEL = 4002;

export const D890_APRS_UPLOAD_SLOTS = 8;

export interface D890AprsSettings {
  /**
   * Transmit delay in milliseconds.
   *
   * ⚠️ Stored ×20 — 60 reads back as 1200 ms. ONE observation, so the step is
   * under-determined: any scale consistent with 60 → 1200 would fit. Kept as a
   * derived value rather than a raw index because a millisecond figure is what
   * the user compares against the OEM software, but treat the step as inferred.
   */
  txDelayMs: number;
  ctcssIndex: number;
  /** Raw DCS field; 19 on the captured radio, matching the CPS's "DCS" column. */
  dcs: number;
  /** Manual TX interval, in seconds. */
  manualTxIntervalS: number;
  fixTime: number;
  beep: number;
  fixedLocationBeacon: boolean;
  /** Degrees, whole minutes, hundredths of a minute — three separate bytes. */
  latitude: { degrees: number; minutes: number; minuteFraction: number; south: boolean };
  longitude: { degrees: number; minutes: number; minuteFraction: number; west: boolean };
  /** The vendor's "TOCALL", six characters. */
  destinationCall: string;
  destinationSsid: number;
  /** The vendor's "Your Call Sign", six characters. */
  sourceCall: string;
  sourceSsid: number;
  digipeaterPath: string;
  /** Single characters, e.g. '/' and '&'. */
  symbolTable: string;
  mapIcon: string;
  txPower: number;
  /** ⚠️ Stored ×10 — 150 reads back as 1500 ms. Also a single observation. */
  prewaveMs: number;
  aprsUpKind: number;
  digitalAprsUpdate: number;
  /** Eight digital upload channel slots; D890_APRS_NO_CHANNEL means unset. */
  digitalUploadChannels: (number | null)[];
}

/** Fixed-width ASCII that may run to the end of its field without a terminator. */
function fixedAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const c = bytes[offset + i] ?? 0;
    if (c === 0) break;
    if (c < 32 || c > 126) break;
    out += String.fromCharCode(c);
  }
  return out;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/**
 * Decode the APRS region. Returns null on a short buffer rather than a zeroed
 * object — a partial read must not look like a radio with APRS switched off.
 */
export function parseD890AprsSettings(bytes: Uint8Array): D890AprsSettings | null {
  if (bytes.length < 0x50) return null;
  const at = (o: number) => bytes[o] ?? 0;

  const channels: (number | null)[] = [];
  for (let i = 0; i < D890_APRS_UPLOAD_SLOTS; i += 1) {
    const v = u16le(bytes, 0x40 + i * 2);
    channels.push(v === D890_APRS_NO_CHANNEL ? null : v);
  }

  return {
    txDelayMs: at(0x05) * 20,
    ctcssIndex: at(0x07),
    dcs: at(0x08),
    manualTxIntervalS: at(0x0a),
    fixTime: at(0x0b),
    beep: at(0x0c),
    fixedLocationBeacon: at(0x0d) !== 0,
    latitude: {
      degrees: at(0x0e),
      minutes: at(0x0f),
      minuteFraction: at(0x10),
      south: at(0x11) !== 0,
    },
    longitude: {
      degrees: at(0x12),
      minutes: at(0x13),
      minuteFraction: at(0x14),
      west: at(0x15) !== 0,
    },
    destinationCall: fixedAscii(bytes, 0x16, 6),
    destinationSsid: at(0x1c),
    sourceCall: fixedAscii(bytes, 0x1d, 6),
    sourceSsid: at(0x23),
    digipeaterPath: fixedAscii(bytes, 0x24, 8),
    symbolTable: String.fromCharCode(at(0x39) || 32).trim(),
    mapIcon: String.fromCharCode(at(0x3a) || 32).trim(),
    txPower: at(0x3b),
    prewaveMs: at(0x3c) * 10,
    aprsUpKind: at(0x3d),
    digitalAprsUpdate: at(0x3e),
    digitalUploadChannels: channels,
  };
}

/** Decimal degrees, for display. Negative for south / west. */
export function aprsPositionToDecimal(
  p: D890AprsSettings['latitude'] | D890AprsSettings['longitude']
): number {
  const sign = 'south' in p ? (p.south ? -1 : 1) : (p as { west: boolean }).west ? -1 : 1;
  return sign * (p.degrees + (p.minutes + p.minuteFraction / 100) / 60);
}

export const D890_APRS_REGION = {
  address: D890_ADDR.APRS_SETTINGS,
  size: D890_ADDR.APRS_SETTINGS_SIZE,
} as const;


/**
 * The APRS fields as flat `radioSpecific` keys, so the Settings tab renders them
 * through the same declarative profile as everything else rather than needing a
 * bespoke component.
 *
 * Flattening is deliberate. The decoded shape nests position under
 * `latitude`/`longitude`, which is the right model but the wrong thing to hand a
 * profile whose fields address one key each. Rather than teach the profile about
 * nesting for one radio, the nesting stays in `D890AprsSettings` for code that
 * wants it and the flat view exists for the UI.
 */
export function aprsToRadioSpecific(a: D890AprsSettings): Record<string, string | number | boolean> {
  return {
    aprsSourceCall: a.sourceCall,
    aprsSourceSsid: a.sourceSsid,
    aprsDestinationCall: a.destinationCall,
    aprsDestinationSsid: a.destinationSsid,
    aprsDigipeaterPath: a.digipeaterPath,
    aprsSymbolTable: a.symbolTable,
    aprsMapIcon: a.mapIcon,
    aprsManualTxIntervalS: a.manualTxIntervalS,
    aprsTxDelayMs: a.txDelayMs,
    aprsPrewaveMs: a.prewaveMs,
    aprsDcs: a.dcs,
    aprsCtcssIndex: a.ctcssIndex,
    aprsTxPower: a.txPower,
    aprsFixedLocationBeacon: a.fixedLocationBeacon,
    aprsLatDegrees: a.latitude.degrees,
    aprsLatMinutes: a.latitude.minutes,
    aprsLatMinuteFraction: a.latitude.minuteFraction,
    aprsLatSouth: a.latitude.south,
    aprsLonDegrees: a.longitude.degrees,
    aprsLonMinutes: a.longitude.minutes,
    aprsLonMinuteFraction: a.longitude.minuteFraction,
    aprsLonWest: a.longitude.west,
  };
}

/**
 * Profile descriptors for the APRS section.
 *
 * Only fields confirmed against the vendor's own export appear here. The two
 * millisecond values are shown in milliseconds with their step marked `*`,
 * matching the convention the settings map uses for anything not confirmed on
 * hardware — both rest on a single observation.
 */
export const D890_APRS_PROFILE_FIELDS = [
  { key: 'aprsSourceCall', label: 'Your Call Sign', type: 'text', maxLength: 6 },
  { key: 'aprsSourceSsid', label: 'Your SSID', type: 'number', min: 0, max: 15 },
  { key: 'aprsDestinationCall', label: 'TOCALL', type: 'text', maxLength: 6 },
  { key: 'aprsDestinationSsid', label: 'TOCALL SSID', type: 'number', min: 0, max: 15 },
  { key: 'aprsDigipeaterPath', label: 'Digipeater Path', type: 'text', maxLength: 8 },
  { key: 'aprsSymbolTable', label: 'APRS Symbol Table', type: 'text', maxLength: 1 },
  { key: 'aprsMapIcon', label: 'APRS Map Icon', type: 'text', maxLength: 1 },
  { key: 'aprsManualTxIntervalS', label: 'Manual TX Interval [s]', type: 'number', min: 0, max: 255 },
  { key: 'aprsTxDelayMs', label: 'Transmit Delay [ms] *', type: 'number', min: 0, max: 5100, step: 20 },
  { key: 'aprsPrewaveMs', label: 'Prewave Time [ms] *', type: 'number', min: 0, max: 2550, step: 10 },
  { key: 'aprsDcs', label: 'DCS', type: 'number', min: 0, max: 255 },
  { key: 'aprsCtcssIndex', label: 'CTCSS index', type: 'number', min: 0, max: 255 },
  { key: 'aprsTxPower', label: 'APRS TX Power', type: 'number', min: 0, max: 3 },
  { key: 'aprsFixedLocationBeacon', label: 'Fixed Location Beacon', type: 'checkbox' },
  { key: 'aprsLatDegrees', label: 'Latitude — degrees', type: 'number', min: 0, max: 90 },
  { key: 'aprsLatMinutes', label: 'Latitude — minutes', type: 'number', min: 0, max: 59 },
  { key: 'aprsLatMinuteFraction', label: 'Latitude — hundredths of a minute', type: 'number', min: 0, max: 99 },
  { key: 'aprsLatSouth', label: 'Latitude — southern hemisphere', type: 'checkbox' },
  { key: 'aprsLonDegrees', label: 'Longitude — degrees', type: 'number', min: 0, max: 180 },
  { key: 'aprsLonMinutes', label: 'Longitude — minutes', type: 'number', min: 0, max: 59 },
  { key: 'aprsLonMinuteFraction', label: 'Longitude — hundredths of a minute', type: 'number', min: 0, max: 99 },
  { key: 'aprsLonWest', label: 'Longitude — western hemisphere', type: 'checkbox' },
] as const;
