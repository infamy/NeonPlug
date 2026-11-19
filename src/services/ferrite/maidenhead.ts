/**
 * Maidenhead grid locators, which name data.ferritefw.dev's tiles: a 2-character
 * field (CN, 20° of longitude by 10° of latitude), a 4-character square (CN89,
 * 2° by 1°), a 6-character subsquare (CN89kg, 5' by 2.5').
 */

const LEVEL_SIZE = {
  2: { lon: 20, lat: 10 },
  4: { lon: 2, lat: 1 },
  6: { lon: 2 / 24, lat: 1 / 24 },
} as const;

export type LocatorLevel = keyof typeof LEVEL_SIZE;

/** The locator of the given length that contains a point. */
export function locator(lat: number, lon: number, level: LocatorLevel): string {
  // Clamp just inside the edges so the north pole and the antimeridian land in a cell.
  const x = Math.min(Math.max(lon + 180, 0), 360 - 1e-9);
  const y = Math.min(Math.max(lat + 90, 0), 180 - 1e-9);
  let out = String.fromCharCode(65 + Math.floor(x / 20)) + String.fromCharCode(65 + Math.floor(y / 10));
  if (level >= 4) {
    out += String(Math.floor((x % 20) / 2)) + String(Math.floor(y % 10));
  }
  if (level >= 6) {
    out += String.fromCharCode(97 + Math.floor(((x % 2) / 2) * 24)) + String.fromCharCode(97 + Math.floor((y % 1) * 24));
  }
  return out;
}

const MILES_PER_DEGREE_LAT = 69.0;

export interface LatLonBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

/** The cell a 2-, 4- or 6-character locator names. */
export function locatorBounds(loc: string): LatLonBox {
  let west = (loc.charCodeAt(0) - 65) * 20 - 180;
  let south = (loc.charCodeAt(1) - 65) * 10 - 90;
  let w = 20;
  let h = 10;
  if (loc.length >= 4) {
    west += Number(loc[2]) * 2;
    south += Number(loc[3]);
    w = 2;
    h = 1;
  }
  if (loc.length >= 6) {
    west += ((loc.charCodeAt(4) - 97) * 2) / 24;
    south += (loc.charCodeAt(5) - 97) / 24;
    w = 2 / 24;
    h = 1 / 24;
  }
  return { south, north: south + h, west, east: west + w };
}

/** The box around a circle, in degrees. East and west may run past ±180. */
export function boxAround(lat: number, lon: number, radiusMiles: number): LatLonBox {
  const dLat = radiusMiles / MILES_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const dLon = Math.min(radiusMiles / (MILES_PER_DEGREE_LAT * cosLat), 180);
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
}

/** Whether a cell overlaps a box, with the box's longitudes taken around the globe. */
export function cellOverlaps(cell: LatLonBox, box: LatLonBox): boolean {
  if (cell.north < box.south || cell.south > box.north) return false;
  return [-360, 0, 360].some((shift) => cell.east + shift >= box.west && cell.west + shift <= box.east);
}

/**
 * Every locator at `level` that a circle of `radiusMiles` around a point could
 * touch: the cells overlapping its bounding box. Longitude wraps at ±180.
 */
export function locatorsAround(lat: number, lon: number, radiusMiles: number, level: LocatorLevel): string[] {
  const { lon: cellLon, lat: cellLat } = LEVEL_SIZE[level];
  const dLat = radiusMiles / MILES_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const dLon = Math.min(radiusMiles / (MILES_PER_DEGREE_LAT * cosLat), 180);

  const south = Math.max(lat - dLat, -90);
  const north = Math.min(lat + dLat, 90);
  const out = new Set<string>();
  for (let y = Math.floor((south + 90) / cellLat); y * cellLat - 90 <= north; y++) {
    const cellMidLat = Math.min(y * cellLat - 90 + cellLat / 2, 90);
    for (let x = Math.floor((lon - dLon + 180) / cellLon); x * cellLon - 180 <= lon + dLon; x++) {
      const wrapped = ((((x * cellLon + cellLon / 2) % 360) + 360) % 360) - 180;
      out.add(locator(cellMidLat, wrapped, level));
    }
  }
  return [...out];
}
