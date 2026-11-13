/**
 * Channel data from data.ferritefw.dev: Canada's licensed sites (the TAFL), the
 * US's (the FCC), the world's airport frequencies and amateur repeaters, rebuilt
 * daily and split into map tiles so a search near a place downloads only the
 * tiles around it. It sends `Access-Control-Allow-Origin: *`, so the site and
 * every preview read it directly.
 *
 * Like the datasets it replaces, it needs the internet: the offline build has
 * never carried them.
 */
import { calculateDistance } from '../repeaterFinder';
import type { ProgressCallback } from '../jsonLoader';
import { boxAround, cellOverlaps, locatorBounds, locatorsAround, type LocatorLevel } from './maidenhead';
import { decodeFerriteTile, type FerriteRow, type FerriteTile } from './tile';

export const FERRITE_DATA_URL = 'https://data.ferritefw.dev';

export type FerriteSource = 'tafl' | 'fcc' | 'airports' | 'repeaters';

export interface FerriteSourceIndex {
  source: string;
  title: string;
  source_date: string;
  licence: string;
  licence_url: string;
  attribution: string;
  format: string;
  /** 2: tiles are fields (CN); 4: squares (CN89), with busy ones as subsquares. */
  level: 2 | 4;
  rows: number;
  /** Tile name → row count. Only tiles with rows exist. */
  tiles: Record<string, number>;
  /** Squares published only as their 6-character subsquares. */
  split: string[];
}

export type FerriteRowNear = FerriteRow & { distance: number; source: FerriteSource };

const TILE_FORMAT = 'columnar-1';
const PARALLEL_FETCHES = 6;

const indexCache = new Map<FerriteSource, Promise<FerriteSourceIndex>>();
const tileCache = new Map<string, Promise<FerriteRow[]>>();

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${FERRITE_DATA_URL}/${path}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(`Couldn't reach data.ferritefw.dev for ${path}. This search needs an internet connection.`);
  }
  if (!response.ok) throw new Error(`data.ferritefw.dev answered ${response.status} for ${path}.`);
  return (await response.json()) as T;
}

export function loadFerriteIndex(source: FerriteSource): Promise<FerriteSourceIndex> {
  let index = indexCache.get(source);
  if (!index) {
    index = fetchJson<FerriteSourceIndex>(`${source}/index.json`).then((i) => {
      if (i.format !== TILE_FORMAT) {
        throw new Error(`data.ferritefw.dev's ${source} data is in format "${i.format}", which this version can't read.`);
      }
      return i;
    });
    // A failure is not kept: the next search tries again.
    index.catch(() => indexCache.delete(source));
    indexCache.set(source, index);
  }
  return index;
}

function loadTile(source: FerriteSource, name: string): Promise<FerriteRow[]> {
  const key = `${source}/${name}`;
  let tile = tileCache.get(key);
  if (!tile) {
    tile = fetchJson<FerriteTile>(`${key}.json`).then(decodeFerriteTile);
    tile.catch(() => tileCache.delete(key));
    tileCache.set(key, tile);
  }
  return tile;
}

/** The tiles of a source that a circle can reach, by the index's own names. */
export function tilesAround(index: FerriteSourceIndex, lat: number, lon: number, radiusMiles: number): string[] {
  const box = boxAround(lat, lon, radiusMiles);
  const names: string[] = [];
  const split = new Set(index.split);
  for (const cell of locatorsAround(lat, lon, radiusMiles, index.level as LocatorLevel)) {
    if (split.has(cell)) {
      for (const sub of Object.keys(index.tiles)) {
        if (sub.length === 6 && sub.startsWith(cell) && cellOverlaps(locatorBounds(sub), box)) names.push(sub);
      }
    } else if (index.tiles[cell]) {
      names.push(cell);
    }
  }
  return names;
}

/** Every row of a source within `radiusMiles` of a point, nearest first. */
export async function findFerriteRowsNear(
  source: FerriteSource,
  lat: number,
  lon: number,
  radiusMiles: number,
  onProgress?: ProgressCallback
): Promise<FerriteRowNear[]> {
  const index = await loadFerriteIndex(source);
  const names = tilesAround(index, lat, lon, radiusMiles);
  const found: FerriteRowNear[] = [];
  let done = 0;
  const report = () => onProgress?.({ loaded: done, total: names.length, percent: names.length ? (done / names.length) * 100 : 100 });
  report();

  const queue = [...names];
  const worker = async () => {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      for (const row of await loadTile(source, name)) {
        const distance = calculateDistance(lat, lon, row.lat, row.lon);
        if (distance <= radiusMiles) found.push({ ...row, distance, source });
      }
      done++;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_FETCHES, names.length) }, worker));

  return found.sort((a, b) => a.distance - b.distance);
}
