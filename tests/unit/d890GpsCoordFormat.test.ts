import { describe, it, expect } from 'vitest';
import { toDms, fromDms } from '../../src/components/settings/D890GpsRoamingArea';

/**
 * Coordinates in either notation.
 *
 * `ddd mm.mm` is what the radio actually stores — degrees, whole minutes and
 * hundredths of a minute — so it is not a convenience view but the native form.
 * Decimal degrees are the convenience. The vendor CPS offers the same pair as
 * two tabs on its ZONE_BARS editor.
 */
describe('coordinate notation', () => {
  it('renders the captured geofence as the CPS shows it', () => {
    // CPS ZONE_BARS editor: Latitude 49 / 44.11 / N, Longitude 119 / 33.22 / W.
    expect(toDms(49 + 44.11 / 60, 'lat')).toBe('49 44.11 N');
    expect(toDms(-(119 + 33.22 / 60), 'lon')).toBe('119 33.22 W');
  });

  it('round-trips through decimal without drifting', () => {
    for (const v of [49.73517, -119.55367, 0, 51.5, -0.1275]) {
      const back = fromDms(toDms(v, 'lat'));
      // The format holds hundredths of a minute — about 18 m — so equality is
      // to that resolution, not to the input's.
      expect(Math.abs(back! - v)).toBeLessThan(0.01 / 60 + 1e-9);
    }
  });

  it('signs the hemisphere both ways', () => {
    expect(toDms(-33.5, 'lat')).toBe('33 30.00 S');
    expect(toDms(151.2, 'lon')).toBe('151 12.00 E');
    expect(fromDms('33 30.00 S')).toBeCloseTo(-33.5, 6);
    expect(fromDms('151 12.00 E')).toBeCloseTo(151.2, 6);
  });

  it('rejects 60 or more minutes', () => {
    // 60 minutes is a degree, so it is a typo rather than a coordinate.
    expect(fromDms('49 60.00 N')).toBeNull();
    expect(fromDms('49 75.5 N')).toBeNull();
  });

  it('is not fooled by a plain decimal', () => {
    // fromDms must decline these so the caller falls through to parseFloat —
    // otherwise "49.73517" would be read as 49 degrees 73517 minutes.
    expect(fromDms('49.73517')).toBeNull();
    expect(fromDms('-119.55367')).toBeNull();
  });

  it('rounds to hundredths before splitting', () => {
    // 44.999 minutes must not render as "44 100.00".
    const v = 49 + 44.999 / 60;
    expect(toDms(v, 'lat')).toBe('49 45.00 N');
  });
});
