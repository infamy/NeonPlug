import React from 'react';
import { useRadioStore } from '../../store/radioStore';
import { SectionTitle } from '../ui/SectionTitle';
import { D890_SATELLITE, satelliteFreqToMHz } from '../../radios/d890uv/satellite';

/**
 * The GPS satellite table.
 *
 * Read-only. Frequencies are shown in MHz: the 10 Hz unit was inferred until a
 * radio came back holding twelve real satellites at their published pairs, and
 * is now confirmed. See `SATELLITE_FREQ_UNIT_HZ`.
 */
export const D890SatellitesArea: React.FC = () => {
  const { d890Satellites } = useRadioStore();

  return (
    <div>
      <SectionTitle size="lg" underline>GPS Satellites</SectionTitle>
      <p className="text-cool-gray text-sm mb-4">
        The satellite table used for APRS via satellite. Holds up to
        {' '}{D890_SATELLITE.SLOTS} entries.
      </p>

      {!d890Satellites ? (
        <p className="text-sm text-muted">Read the radio to see its satellite table.</p>
      ) : d890Satellites.length === 0 ? (
        <p className="text-sm text-muted">This radio has no satellites set.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-dark-charcoal border-b border-neon-cyan">
                  <th className="px-2 py-2 text-left text-neon-cyan font-bold">#</th>
                  <th className="px-2 py-2 text-left text-neon-cyan font-bold">Name</th>
                  <th className="px-2 py-2 text-left text-neon-cyan font-bold">Receive (MHz)</th>
                  <th className="px-2 py-2 text-left text-neon-cyan font-bold">Transmit (MHz)</th>
                  <th className="px-2 py-2 text-left text-neon-cyan font-bold">Orbit data</th>
                </tr>
              </thead>
              <tbody>
                {d890Satellites.map((sat) => (
                  <tr key={sat.slot} className="border-b border-panel">
                    <td className="px-2 py-1.5 text-muted">{sat.slot}</td>
                    <td className="px-2 py-1.5 text-white">{sat.name || '—'}</td>
                    <td className="px-2 py-1.5 font-mono text-cool-gray">
                      {satelliteFreqToMHz(sat.rxFreq1)?.toFixed(5) ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-cool-gray">
                      {satelliteFreqToMHz(sat.txFreq1)?.toFixed(5) ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-cool-gray text-[10px]">
                      {sat.tleFragment1 ? 'present' : 'missing'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </>
      )}
    </div>
  );
};
