import React from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useZonesStore } from '../../store/zonesStore';
import { SectionTitle } from '../ui/SectionTitle';
import { gpsRoamingPositionToDecimal } from '../../radios/d890uv/gpsRoaming';

/**
 * GPS Roaming — geofences that switch the radio's zone by location.
 *
 * Not the same feature as Roaming: that hunts for a repeater by signal, this
 * picks a zone by where you are. Each entry is a circle (centre + radius) and
 * the zone to select inside it.
 *
 * Read-only, and the field ORDER within each record is inferred rather than
 * traced — the eleven CSV columns line up with ten consecutive byte stores, but
 * no individual store was tied to a column. The area says so rather than
 * presenting the coordinates as settled.
 */
export const D890GpsRoamingArea: React.FC = () => {
  const { d890GpsRoaming } = useRadioStore();
  const { zones } = useZonesStore();

  if (!d890GpsRoaming) {
    return (
      <div>
        <SectionTitle size="lg" underline>GPS Roaming</SectionTitle>
        <p className="text-sm text-muted">Read the radio to see its GPS roaming zones.</p>
      </div>
    );
  }

  const entries = d890GpsRoaming;

  return (
    <div>
      <SectionTitle size="lg" underline>GPS Roaming</SectionTitle>
      <p className="text-cool-gray text-sm mb-2">
        Switches the radio to a zone when you enter a circle on the map. Needs GPS turned on.
      </p>
      <p className="text-xs text-amber-400 mb-6">
        Coordinate field order is inferred from the vendor CSV, not confirmed on hardware —
        treat the positions below as unverified.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">This radio has no GPS roaming zones set.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                <th className="px-2 py-2 text-left text-neon-cyan font-bold">#</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold">Enabled</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold">Zone</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold">Latitude</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold">Longitude</th>
                <th className="px-2 py-2 text-left text-neon-cyan font-bold">Radius</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                // The zone field is stored as the vendor stores it and is not
                // offset here — showing the name next to the raw number rather
                // than replacing it, so an off-by-one is visible instead of
                // silently naming the wrong zone.
                const zone = zones[e.zone];
                return (
                  <tr key={e.index} className="border-b border-panel">
                    <td className="px-2 py-1 text-muted">{e.index + 1}</td>
                    <td className="px-2 py-1">
                      {e.enabled ? <span className="text-neon-cyan">On</span> : <span className="text-muted">Off</span>}
                    </td>
                    <td className="px-2 py-1 text-white">
                      {e.zone}
                      {zone && <span className="text-muted"> · {zone.name}</span>}
                    </td>
                    <td className="px-2 py-1 text-white font-mono">
                      {gpsRoamingPositionToDecimal(e.latitude).toFixed(5)}°
                    </td>
                    <td className="px-2 py-1 text-white font-mono">
                      {gpsRoamingPositionToDecimal(e.longitude).toFixed(5)}°
                    </td>
                    <td className="px-2 py-1 text-white font-mono">{e.radiusMeters} m</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
