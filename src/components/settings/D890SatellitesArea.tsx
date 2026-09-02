import React, { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { SectionTitle } from '../ui/SectionTitle';
import { D890_SATELLITE, satelliteFreqToMHz } from '../../radios/d890uv/satellite';

/**
 * The satellite repeater table.
 *
 * NOT APRS. These are amateur radio satellites worked as repeaters — uplink and
 * downlink pairs with Doppler correction — and the table is unrelated to the
 * APRS settings at 0x3501000 despite both living under GPS in the vendor CPS.
 *
 * Read-only. Frequencies are shown in MHz: the 10 Hz unit was inferred until a
 * radio came back holding twelve real satellites at their published pairs, and
 * is now confirmed. See `SATELLITE_FREQ_UNIT_HZ`.
 */
export const D890SatellitesArea: React.FC = () => {
  const { tables } = useRadioStore();
  const { readSatellites, isConnecting } = useRadioConnection();
  const [readError, setReadError] = useState<string | null>(null);

  const onRead = async () => {
    setReadError(null);
    try {
      await readSatellites();
    } catch (e) {
      setReadError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <SectionTitle size="lg" underline>Satellites</SectionTitle>
      <p className="text-cool-gray text-sm mb-4">
        Amateur satellites worked as repeaters — uplink and downlink pairs. Holds up to
        {' '}{D890_SATELLITE.SLOTS} entries.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onRead()}
          disabled={isConnecting}
          className="px-4 py-2 bg-dark-charcoal border border-neon-cyan border-opacity-50 text-neon-cyan text-sm font-medium rounded hover:bg-neon-cyan hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Read the satellite table from the radio"
        >
          {isConnecting ? 'Reading…' : 'Read from radio'}
        </button>
        {readError && <span className="text-xs text-amber-400">{readError}</span>}
      </div>

      {!tables.satellites ? (
        <p className="text-sm text-muted">
          Read the satellite table to see it. It is not read with the codeplug — the
          table is 12.8 KB, which is over a second of every read for something most
          users never open. The vendor CPS keeps it behind its Tools menu for the
          same reason.
        </p>
      ) : tables.satellites.length === 0 ? (
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
                {tables.satellites.map((sat) => (
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
