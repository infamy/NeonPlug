import React, { useState } from 'react';
import { useAnalogEmergencyStore } from '../../store/analogEmergencyStore';
import { useChannelsStore } from '../../store/channelsStore';
import type { AnalogEmergency } from '../../models';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmModal } from '../ui/ConfirmModal';
import { LIMITS } from '../../radios/dm32uv/constants';

const ALARM_TYPES = ['None', 'Only Whistle', 'Normal', 'Secret', 'Secret With Voice'];
const ALARM_MODES = ['Emergency Alarm', 'Alarm Call'];
const SIGNALLING = ['BDC1200-1', 'BDC1200-2', 'BDC1200-3', 'BDC1200-4'];
const SQUELCH_MODES = ['Carrier', 'CTC'];
const ID_TYPES = ['None', 'BDC1200'];

function makeDefault(index: number): AnalogEmergency {
  return {
    index,
    name: `Analog Em ${index + 1}`,
    alarmType: 0,
    alarmMode: 0,
    signalling: 0,
    revertChannel: 1,
    squelchMode: 0,
    idType: 0,
    flags: 0,
    frequencyId: 0,
    enabled: true,
  };
}

export const AnalogEmergencyList: React.FC = () => {
  const { systems, updateSystem, addSystem, deleteSystem } = useAnalogEmergencyStore();
  const { channels } = useChannelsStore();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleAdd = () => {
    if (systems.length >= LIMITS.ANALOG_EMERGENCY_MAX) return;
    addSystem(makeDefault(systems.length));
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget !== null) {
      deleteSystem(deleteTarget);
      setDeleteTarget(null);
    }
  };

  return (
    <Card className="mt-6 !border-yellow-600/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SectionTitle className="!text-yellow-400">Analog Emergency Systems</SectionTitle>
          <span className="px-2 py-0.5 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30 font-semibold">
            EXPERIMENTAL
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-1 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50 transition-colors"
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4">
          <div className="mb-3 p-3 bg-yellow-900/10 border border-yellow-600/20 rounded">
            <p className="text-yellow-300 text-sm">
              <strong>⚠️ Experimental:</strong> Analog emergency structure has not been verified against hardware.
              No entries were observed in the test hexdump (region was all zeros). Write with caution.
              Stored at metadata block 0x10, offset 0x0AC. Max {LIMITS.ANALOG_EMERGENCY_MAX} entries.
            </p>
          </div>

          <div className="flex justify-end mb-3">
            <button
              onClick={handleAdd}
              disabled={systems.length >= LIMITS.ANALOG_EMERGENCY_MAX}
              className="px-3 py-1.5 text-xs bg-neon-cyan bg-opacity-10 border border-neon-cyan text-neon-cyan rounded hover:bg-opacity-20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add
            </button>
          </div>

          {systems.length === 0 ? (
            <EmptyState message="No analog emergency systems configured." />
          ) : (
            <div className="max-h-[calc(100vh-400px)] overflow-auto">
              <div className="inline-block min-w-full">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Name</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[130px]">Alarm Type</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[130px]">Alarm Mode</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[110px]">Signalling</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[90px]">Revert Ch</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">Squelch</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[90px]">ID Type</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">Enabled</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {systems.map((system, i) => (
                      <tr
                        key={i}
                        className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                      >
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={system.name}
                            onChange={(e) => updateSystem(i, { name: e.target.value.slice(0, 16) })}
                            maxLength={16}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.alarmType}
                            onChange={(e) => updateSystem(i, { alarmType: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {ALARM_TYPES.map((label, v) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.alarmMode}
                            onChange={(e) => updateSystem(i, { alarmMode: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {ALARM_MODES.map((label, v) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.signalling}
                            onChange={(e) => updateSystem(i, { signalling: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {SIGNALLING.map((label, v) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.revertChannel}
                            onChange={(e) => updateSystem(i, { revertChannel: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {channels.length > 0
                              ? channels.slice(0, 16).map((ch) => (
                                  <option key={ch.number} value={ch.number}>{ch.number}: {ch.name}</option>
                                ))
                              : Array.from({ length: 16 }, (_, k) => (
                                  <option key={k + 1} value={k + 1}>{k + 1}</option>
                                ))
                            }
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.squelchMode}
                            onChange={(e) => updateSystem(i, { squelchMode: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {SQUELCH_MODES.map((label, v) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.idType}
                            onChange={(e) => updateSystem(i, { idType: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {ID_TYPES.map((label, v) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={system.enabled}
                            onChange={(e) => updateSystem(i, { enabled: e.target.checked })}
                            className="accent-neon-cyan w-4 h-4"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => setDeleteTarget(i)}
                            className="text-red-400 hover:text-red-300 transition-colors px-1"
                            title="Delete"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete Analog Emergency System"
        message={`Delete "${deleteTarget !== null ? systems[deleteTarget]?.name : ''}"?`}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </Card>
  );
};
