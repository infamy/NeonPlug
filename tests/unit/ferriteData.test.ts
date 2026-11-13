import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { decodeFerriteTile, parseFerriteTone, type FerriteTile } from '../../src/services/ferrite/tile';
import { locator, locatorBounds, locatorsAround } from '../../src/services/ferrite/maidenhead';
import { tilesAround, findFerriteRowsNear, type FerriteSourceIndex } from '../../src/services/ferrite/client';

// Real tiles from data.ferritefw.dev, 2026-11-12. See tests/fixtures/ferrite/README.md.
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/ferrite', name), 'utf8')) as FerriteTile;

describe('reading a columnar-1 tile', () => {
  it('sums positions and frequencies back up (TAFL, Yukon)', () => {
    const rows = decodeFerriteTile(fixture('tafl-BP91.json'));
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ name: 'northwestel', lat: 61.96722, lon: -140.41361, mhz: 412.9375, bandwidth: '25kHz' });
    expect(rows[1].mhz).toBeCloseTo(417.9375, 6);
    expect(rows[2]).toMatchObject({ lat: 61.98306, lon: -140.48583 });
    expect(rows[2].mhz).toBeCloseTo(412.7875, 6);
    expect(rows.every((r) => !r.mobile && r.category === 0)).toBe(true);
  });

  it('reads a repeater offset and its tones', () => {
    const rows = decodeFerriteTile(fixture('repeaters-FJ.json'));
    expect(rows.map((r) => r.name)).toEqual(['HK3LRB2', 'HK6REC', 'HK4RAU', 'HP1GRE']);
    expect(rows[0].mhz).toBeCloseTo(147.09, 6);
    expect(rows[0].offsetMhz).toBeCloseTo(0.6, 6);
    expect(rows[0].encodeTone).toEqual({ type: 'CTCSS', hz: 131.8 });
    expect(rows[0].decodeTone).toEqual({ type: 'CTCSS', hz: 131.8 });
    expect(rows[1].offsetMhz).toBeCloseTo(-0.6, 6);
    expect(rows[1].decodeTone).toBeUndefined();
    expect(rows[3].offsetMhz).toBe(0);
    // HearHam's FM does not say how wide, so no bandwidth is claimed.
    expect(rows[0].bandwidth).toBeUndefined();
  });

  it("reads an airport's uses", () => {
    const rows = decodeFerriteTile(fixture('airports-GD.json'));
    expect(rows.map((r) => [r.name, r.use])).toEqual([
      ['EGYP', 'APP'],
      ['EGYP', 'GND'],
      ['EGYP', 'ARR'],
      ['EGYP', 'TWR'],
      ['SFAL', 'TWR'],
    ]);
    expect(rows[0].mhz).toBeCloseTo(118.5, 6);
    expect(rows[0].lat).toBeCloseTo(-51.82264, 6);
  });

  it('reads CTCSS and DCS tones in the forms the README gives', () => {
    expect(parseFerriteTone('100.0')).toEqual({ type: 'CTCSS', hz: 100 });
    expect(parseFerriteTone('D023')).toEqual({ type: 'DCS', code: 23, inverted: false });
    expect(parseFerriteTone('D754I')).toEqual({ type: 'DCS', code: 754, inverted: true });
    expect(parseFerriteTone(undefined)).toBeUndefined();
    expect(parseFerriteTone('D089')).toBeUndefined();
  });
});

describe('Maidenhead tiles', () => {
  it('names the field, square and subsquare a point is in', () => {
    // Vancouver.
    expect(locator(49.2827, -123.1207, 2)).toBe('CN');
    expect(locator(49.2827, -123.1207, 4)).toBe('CN89');
    expect(locator(49.2827, -123.1207, 6)).toBe('CN89kg');
    expect(locator(61.96722, -140.41361, 4)).toBe('BP91');
  });

  it('gives a locator back its cell', () => {
    expect(locatorBounds('CN89')).toEqual({ south: 49, north: 50, west: -124, east: -122 });
    const sub = locatorBounds('CN89kg');
    expect(sub.south).toBeLessThanOrEqual(49.2827);
    expect(sub.north).toBeGreaterThan(49.2827);
  });

  it('covers a circle that crosses square edges', () => {
    // 50 miles round Vancouver reaches CN88 to the south, CN79 to the west and
    // CO80 to the north, and stops just short of CN99's edge at 122° W.
    const cells = locatorsAround(49.2827, -123.1207, 50, 4);
    expect(cells.sort()).toEqual(['CN78', 'CN79', 'CN88', 'CN89', 'CO70', 'CO80']);
    expect(locatorsAround(49.2827, -123.1207, 60, 4)).toContain('CN99');
  });

  it('wraps at the antimeridian', () => {
    const cells = locatorsAround(-17.7, 179.9, 50, 2);
    expect(cells).toEqual(expect.arrayContaining(['RH', 'AH']));
  });
});

describe('picking tiles from an index', () => {
  const index: FerriteSourceIndex = {
    source: 'tafl', title: '', source_date: '', licence: '', licence_url: '', attribution: '',
    format: 'columnar-1', level: 4, rows: 0,
    tiles: { CN89: 10, CN88: 4, FN35fm: 3, FN35fl: 2, FN35aa: 1 },
    split: ['FN35'],
  };

  it('only asks for tiles that exist', () => {
    expect(tilesAround(index, 49.2827, -123.1207, 50).sort()).toEqual(['CN88', 'CN89']);
  });

  it('asks a split square for the subsquares near the point, not all of them', () => {
    // Montreal is in FN35, which is published as subsquares.
    const names = tilesAround(index, 45.5017, -73.5673, 5);
    expect(names).toContain('FN35fm');
    expect(names).not.toContain('FN35aa');
  });
});

describe('searching near a point', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps rows inside the radius, nearest first, and says which source', async () => {
    const index = { source: 'tafl', format: 'columnar-1', level: 4, tiles: { BP91: 6 }, split: [] };
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith('index.json') ? index : fixture('tafl-BP91.json')),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const rows = await findFerriteRowsNear('tafl', 61.9831, -140.4858, 1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.distance <= 1 && r.source === 'tafl')).toBe(true);
    expect(rows[0].distance).toBeLessThanOrEqual(rows[rows.length - 1].distance);
    expect(fetchMock).toHaveBeenCalledWith('https://data.ferritefw.dev/tafl/BP91.json');
  });
});
