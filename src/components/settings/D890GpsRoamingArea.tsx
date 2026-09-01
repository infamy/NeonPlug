import React, { useState, useCallback } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useZonesStore } from '../../store/zonesStore';
import { SectionTitle } from '../ui/SectionTitle';
import {
  D890_GPS_ROAMING,
  gpsRoamingPositionToDecimal,
  decimalToGpsRoamingPosition,
} from '../../radios/d890uv/gpsRoaming';
import type { D890GpsRoamingEntry } from '../../radios/d890uv/gpsRoaming';
import { geocodePlaces, type GeocodeResult } from '../../services/locationService';
import { getCurrentLocation } from '../../services/repeaterFinder';

/**
 * GPS Roaming — geofences that switch the radio's zone by location.
 *
 * Not the same feature as Roaming: that hunts for a repeater by signal, this
 * picks a zone by where you are. Each entry is a circle (centre + radius) and
 * the zone to select inside it.
 *
 * Coordinates are edited in decimal degrees and stored as the radio's
 * degrees / whole minutes / hundredths / hemisphere. The format holds hundredths
 * of a minute — about 18 m — so a typed value is rounded to what the radio can
 * actually keep, and the input shows the rounded value back rather than
 * pretending to more precision than was stored.
 *
 * The field ORDER within each record is inferred from the vendor CSV's columns
 * lining up with ten consecutive byte stores; no individual store was traced to
 * a column. That is flagged in the UI rather than presented as settled.
 */
const INPUT =
  'w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-neon-cyan';

/** Hundredths of a minute, in degrees — the smallest step this format holds. */
const PRECISION = 1 / 60 / 100;

/** Enable switch for one geofence. A toggle, not a checkbox: the column reads
 *  as on/off state rather than as a selection to act on. */
const EnableToggle: React.FC<{ on: boolean; onChange: (on: boolean) => void }> = ({
  on,
  onChange,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    title={on ? 'Enabled — click to disable' : 'Disabled — click to enable'}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus:outline-none ${
      on
        ? 'bg-neon-cyan bg-opacity-30 border-neon-cyan'
        : 'bg-deep-gray border-neon-cyan border-opacity-20'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
        on ? 'translate-x-[1.15rem] bg-neon-cyan' : 'translate-x-[0.15rem] bg-cool-gray'
      }`}
    />
  </button>
);

/**
 * Place search that fills a row's coordinates.
 *
 * Two sources, and the difference matters offline: "Use my location" is the
 * browser's own Geolocation API and can work with no internet, while the place
 * search is a Nominatim call that cannot. The failure is reported rather than
 * swallowed, because a geofence silently left at 0°,0° is in the Atlantic.
 *
 * Candidates are listed instead of auto-taking the first hit — there are a lot
 * of Springfields, and picking one for the user drops the fence in the wrong
 * place.
 */
const LocationPicker: React.FC<{
  onPick: (latitude: number, longitude: number) => void;
  onClose: () => void;
}> = ({ onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const found = await geocodePlaces(query);
      setResults(found);
      if (found.length === 0) setError('No matching place found.');
    } catch {
      setError('Search needs an internet connection. Enter coordinates directly, or use your location.');
    } finally {
      setBusy(false);
    }
  }, [query]);

  const useCurrent = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const loc = await getCurrentLocation();
      onPick(loc.latitude, loc.longitude);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get your location.');
    } finally {
      setBusy(false);
    }
  }, [onPick, onClose]);

  return (
    <div className="bg-deep-gray border border-neon-cyan border-opacity-40 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Town, landmark, postcode…"
          className={INPUT}
        />
        <button
          onClick={search}
          disabled={busy || !query.trim()}
          className="shrink-0 px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-30 hover:border-opacity-60 rounded disabled:opacity-30"
        >
          {busy ? '…' : 'Search'}
        </button>
        <button
          onClick={useCurrent}
          disabled={busy}
          className="shrink-0 px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-30 hover:border-opacity-60 rounded disabled:opacity-30 whitespace-nowrap"
          title="Use this device's location"
        >
          Use my location
        </button>
        <button
          onClick={onClose}
          className="shrink-0 px-2 py-1 text-xs text-cool-gray hover:text-white"
          title="Close"
        >
          ×
        </button>
      </div>

      {error && <p className="text-xs text-amber-400">{error}</p>}

      {results && results.length > 0 && (
        <ul className="max-h-40 overflow-y-auto divide-y divide-panel">
          {results.map((r, i) => (
            <li key={`${r.latitude}-${r.longitude}-${i}`}>
              <button
                onClick={() => {
                  onPick(r.latitude, r.longitude);
                  onClose();
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-cool-gray hover:text-neon-cyan hover:bg-neon-cyan hover:bg-opacity-5"
              >
                <span className="text-white">{r.formattedAddress ?? 'Result'}</span>
                <span className="block font-mono text-muted">
                  {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const CoordInput: React.FC<{
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ value, min, max, onChange }) => {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      // Held as a draft while typing so an intermediate "-" or "51." is not
      // parsed, clamped and written back under the cursor.
      value={draft ?? value.toFixed(5)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={`${INPUT} font-mono`}
    />
  );
};

export const D890GpsRoamingArea: React.FC = () => {
  const { d890GpsRoaming, setD890GpsRoaming } = useRadioStore();
  const { zones } = useZonesStore();
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  if (!d890GpsRoaming) {
    return (
      <div>
        <SectionTitle size="lg" underline>GPS Roaming</SectionTitle>
        <p className="text-sm text-muted">Read the radio to see its GPS roaming zones.</p>
      </div>
    );
  }

  const entries = d890GpsRoaming;

  const replace = (index: number, patch: Partial<D890GpsRoamingEntry>) => {
    setD890GpsRoaming(entries.map((e) => (e.index === index ? { ...e, ...patch } : e)));
  };

  const setLatitude = (entry: D890GpsRoamingEntry, decimal: number) => {
    const p = decimalToGpsRoamingPosition(decimal);
    replace(entry.index, {
      latitude: {
        degrees: p.degrees,
        minutes: p.minutes,
        minuteFraction: p.minuteFraction,
        south: p.negative,
      },
    });
  };

  const setLongitude = (entry: D890GpsRoamingEntry, decimal: number) => {
    const p = decimalToGpsRoamingPosition(decimal);
    replace(entry.index, {
      longitude: {
        degrees: p.degrees,
        minutes: p.minutes,
        minuteFraction: p.minuteFraction,
        west: p.negative,
      },
    });
  };

  /**
   * Set both axes in ONE patch.
   *
   * Calling setLatitude then setLongitude would not work: each maps over the
   * `entries` captured by this render, so the second call rebuilds from the
   * pre-latitude array and silently throws the latitude away. A geofence that
   * moved in longitude only is a plausible-looking wrong answer.
   */
  const setPosition = (entry: D890GpsRoamingEntry, latitude: number, longitude: number) => {
    const lat = decimalToGpsRoamingPosition(latitude);
    const lon = decimalToGpsRoamingPosition(longitude);
    replace(entry.index, {
      latitude: {
        degrees: lat.degrees,
        minutes: lat.minutes,
        minuteFraction: lat.minuteFraction,
        south: lat.negative,
      },
      longitude: {
        degrees: lon.degrees,
        minutes: lon.minutes,
        minuteFraction: lon.minuteFraction,
        west: lon.negative,
      },
    });
  };

  const addEntry = () => {
    // Slots are fixed hardware positions, so a new entry takes the lowest free
    // index rather than being appended — index IS the address.
    const used = new Set(entries.map((e) => e.index));
    let index = 0;
    while (used.has(index)) index += 1;
    if (index >= D890_GPS_ROAMING.ENTRIES) return;
    const blank: D890GpsRoamingEntry = {
      index,
      enabled: false,
      zone: 0,
      latitude: { degrees: 0, minutes: 0, minuteFraction: 0, south: false },
      longitude: { degrees: 0, minutes: 0, minuteFraction: 0, west: false },
      radiusMeters: 1000,
    };
    setD890GpsRoaming([...entries, blank].sort((a, b) => a.index - b.index));
  };

  const removeEntry = (index: number) => {
    setD890GpsRoaming(entries.filter((e) => e.index !== index));
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionTitle size="lg" underline>GPS Roaming</SectionTitle>
          <p className="text-cool-gray text-sm mb-2">
            Switches the radio to a zone when you enter a circle on the map. Needs GPS turned on.
          </p>
        </div>
        <button
          onClick={addEntry}
          disabled={entries.length >= D890_GPS_ROAMING.ENTRIES}
          className="shrink-0 px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors disabled:opacity-30 disabled:hover:text-cool-gray disabled:hover:border-opacity-20"
          title={
            entries.length >= D890_GPS_ROAMING.ENTRIES
              ? `All ${D890_GPS_ROAMING.ENTRIES} slots are in use`
              : 'Add a geofence'
          }
        >
          + Add
        </button>
      </div>
      <p className="text-xs text-amber-400 mb-4">
        Coordinate field order is inferred from the vendor CSV, not confirmed on hardware —
        treat these positions as unverified.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">
          No geofences set. Add one to switch zones automatically by location.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                <th className="px-2 py-2 text-left text-neon-cyan font-bold w-10">#</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold w-20">Enable</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold w-56">Zone</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold w-32">Latitude °</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold w-32">Longitude °</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold w-28">Radius (m)</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const latitude = gpsRoamingPositionToDecimal(entry.latitude);
                const longitude = gpsRoamingPositionToDecimal(entry.longitude);
                return (
                  <React.Fragment key={entry.index}>
                  <tr className="border-b border-panel">
                    <td className="px-2 py-1 text-muted">{entry.index + 1}</td>
                    <td className="px-2 py-1">
                      <EnableToggle
                        on={entry.enabled}
                        onChange={(on) => replace(entry.index, { enabled: on })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={entry.zone}
                        onChange={(e) =>
                          replace(entry.index, { zone: parseInt(e.target.value, 10) })
                        }
                        className={`${INPUT} max-w-[14rem]`}
                      >
                        {/* The stored value is the vendor's own and is not
                            offset here. A value with no matching zone is kept
                            and shown as its raw number rather than snapped to
                            zone 1, which would silently retarget the fence. */}
                        {entry.zone >= zones.length && (
                          <option value={entry.zone}>{entry.zone} (no such zone)</option>
                        )}
                        {zones.map((zone, i) => (
                          <option key={zone.id} value={i}>
                            {i} · {zone.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <CoordInput
                        value={latitude}
                        min={-90}
                        max={90}
                        onChange={(v) => setLatitude(entry, v)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CoordInput
                        value={longitude}
                        min={-180}
                        max={180}
                        onChange={(v) => setLongitude(entry, v)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        value={entry.radiusMeters}
                        onChange={(e) =>
                          replace(entry.index, {
                            radiusMeters: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className={INPUT}
                      />
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <button
                        onClick={() =>
                          setPickerFor(pickerFor === entry.index ? null : entry.index)
                        }
                        className="mr-1 px-1.5 py-0.5 text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-30 hover:border-opacity-60 rounded"
                        title="Find these coordinates from a place name or your location"
                      >
                        ⌖
                      </button>
                      <button
                        onClick={() => removeEntry(entry.index)}
                        className="px-1.5 py-0.5 text-red-400 hover:text-red-300 border border-red-600 border-opacity-30 hover:border-opacity-60 rounded"
                        title="Delete this geofence"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {pickerFor === entry.index && (
                    <tr className="border-b border-panel">
                      {/* Spans the row: the search results need real width, and
                          a popover over a scrolling table would clip. */}
                      <td colSpan={7} className="px-2 pb-2">
                        <LocationPicker
                          onPick={(lat, lon) => setPosition(entry, lat, lon)}
                          onClose={() => setPickerFor(null)}
                        />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted mt-2">
            {entries.length} of {D890_GPS_ROAMING.ENTRIES} slots used. Positions are stored to
            about {Math.round(PRECISION * 111_000)} m — typed values are rounded to what the
            radio can hold.
          </p>
        </div>
      )}
    </div>
  );
};
