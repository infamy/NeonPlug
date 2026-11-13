/**
 * Reads one data.ferritefw.dev tile (format `columnar-1`). The format is in the
 * data repository's README (github.com/FerriteFW/data): columns, one entry per
 * row, with position and frequency stored as differences from the row before.
 */

export interface FerriteTile {
  /** Names, each once; `c` indexes it. */
  n: string[];
  c: number[];
  /** Latitude and longitude in 1/100,000 degree, as running differences. */
  a: number[];
  o: number[];
  /** Transmit frequency in half kHz, as running differences. */
  f: number[];
  /** 0: FM under 14 kHz, 1: FM 16-20 kHz, 3: unknown. Missing when all unknown. */
  m?: number[];
  /** 1: a mobile's frequency (often a repeater input). Missing when all 0. */
  s?: number[];
  /** Licensee category. Missing when all 0. */
  k?: number[];
  /** Repeaters: input minus output in half kHz, each row's own value. */
  d?: number[];
  /** Repeaters: tones once, then encode/decode indexes into them (-1 none). */
  pn?: string[];
  pe?: number[];
  pd?: number[];
  /** Airports: uses once (TWR, GND, ...), then an index per row (-1 none). */
  tn?: string[];
  t?: number[];
}

export type FerriteTone = { type: 'CTCSS'; hz: number } | { type: 'DCS'; code: number; inverted: boolean };

export interface FerriteRow {
  name: string;
  lat: number;
  lon: number;
  /** The frequency the station transmits on, in MHz. */
  mhz: number;
  /** Narrow or wide FM, when the source says. */
  bandwidth?: '12.5kHz' | '25kHz';
  /** A mobile's frequency, not a base's or repeater's. */
  mobile: boolean;
  category: number;
  /** Repeaters: what the radio transmits on, minus `mhz`. */
  offsetMhz?: number;
  /** Repeaters: the tone to send to open it, and the tone it sends. */
  encodeTone?: FerriteTone;
  decodeTone?: FerriteTone;
  /** Airports: TWR, GND, ATIS, CTAF, ... */
  use?: string;
}

/** `100.0` → CTCSS 100 Hz; `D023` → DCS 23; `D023I` → DCS 23 inverted. */
export function parseFerriteTone(tone: string | undefined): FerriteTone | undefined {
  if (!tone) return undefined;
  const dcs = /^D([0-7]{3})(I?)$/.exec(tone);
  if (dcs) return { type: 'DCS', code: parseInt(dcs[1], 10), inverted: dcs[2] === 'I' };
  const hz = Number(tone);
  return Number.isFinite(hz) && hz > 0 ? { type: 'CTCSS', hz } : undefined;
}

function indexed<T>(list: T[] | undefined, at: number | undefined): T | undefined {
  return list && at !== undefined && at >= 0 ? list[at] : undefined;
}

/** Every row of a tile, positions and frequencies summed back up. */
export function decodeFerriteTile(tile: FerriteTile): FerriteRow[] {
  const rows: FerriteRow[] = [];
  let a = 0;
  let o = 0;
  let f = 0;
  for (let i = 0; i < tile.c.length; i++) {
    a += tile.a[i];
    o += tile.o[i];
    f += tile.f[i];
    const mode = tile.m?.[i];
    const row: FerriteRow = {
      name: tile.n[tile.c[i]] ?? '',
      lat: a / 1e5,
      lon: o / 1e5,
      mhz: f / 2000,
      mobile: tile.s?.[i] === 1,
      category: tile.k?.[i] ?? 0,
    };
    if (mode === 0) row.bandwidth = '12.5kHz';
    else if (mode === 1) row.bandwidth = '25kHz';
    if (tile.d) row.offsetMhz = tile.d[i] / 2000;
    const encode = parseFerriteTone(indexed(tile.pn, tile.pe?.[i]));
    const decode = parseFerriteTone(indexed(tile.pn, tile.pd?.[i]));
    if (encode) row.encodeTone = encode;
    if (decode) row.decodeTone = decode;
    const use = indexed(tile.tn, tile.t?.[i]);
    if (use) row.use = use;
    rows.push(row);
  }
  return rows;
}
