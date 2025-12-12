import React, { useEffect, useMemo } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useEncryptionKeysStore } from '../../store/encryptionKeysStore';
import { useDigitalEmergencyStore } from '../../store/digitalEmergencyStore';
import { parseEncryptionKeys, parseDigitalEmergencies } from '../../protocol/dm32uv/structures';

export const DigitalTab: React.FC = () => {
  const { blockMetadata, blockData } = useRadioStore();
  const { keys, setKeys, updateKey } = useEncryptionKeysStore();
  const { systems: digitalEmergencies, setSystems: setDigitalEmergencies, setConfig: setDigitalEmergencyConfig, updateSystem } = useDigitalEmergencyStore();

  // Find block with metadata 0x10 (Encryption Keys)
  const block10Address = useMemo(() => {
    for (const [address, metadata] of blockMetadata.entries()) {
      if (metadata.metadata === 0x10) {
        return address;
      }
    }
    return null;
  }, [blockMetadata]);

  const block10Data = block10Address !== null ? blockData.get(block10Address) : null;

  // Digital Emergency is also in block 0x10 (same block as encryption keys, different offset)

  // Parse encryption keys when block data is available
  useEffect(() => {
    if (block10Data) {
      try {
        const parsedKeys = parseEncryptionKeys(block10Data);
        setKeys(parsedKeys);
      } catch (error) {
        console.error('Error parsing encryption keys:', error);
      }
    }
  }, [block10Data, setKeys]);

  // Parse digital emergency systems when block data is available (same block as encryption keys)
  useEffect(() => {
    if (block10Data) {
      try {
        const { systems, config } = parseDigitalEmergencies(block10Data);
        setDigitalEmergencies(systems);
        setDigitalEmergencyConfig(config);
      } catch (error) {
        console.error('Error parsing digital emergency systems:', error);
      }
    }
  }, [block10Data, setDigitalEmergencies, setDigitalEmergencyConfig]);

  const handleKeyChange = (entryNumber: number, field: keyof typeof keys[0], value: any) => {
    updateKey(entryNumber, { [field]: value });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neon-cyan mb-2">Digital Settings</h2>
        <p className="text-cool-gray text-sm">
          Manage encryption keys and digital emergency systems.
        </p>
      </div>

      {/* Digital Emergency Systems Section */}
      <div className="mb-8">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-neon-cyan mb-2">Digital Emergency Systems</h3>
          <p className="text-cool-gray text-sm">
            Manage digital emergency systems from metadata block 0x10 (offset 0x000).
          </p>
          {block10Address !== null && (
            <p className="text-cool-gray text-xs mt-1">
              Block Address: 0x{block10Address.toString(16).toUpperCase()}
            </p>
          )}
        </div>

        {!block10Data ? (
          <div className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-20 p-6">
            <p className="text-cool-gray text-sm">
              Block 0x10 not found. Read from radio to view digital emergency systems.
            </p>
          </div>
        ) : digitalEmergencies.length === 0 ? (
          <div className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-20 p-6">
            <p className="text-cool-gray text-sm">No digital emergency systems found.</p>
          </div>
        ) : (
          <div className="bg-deep-gray rounded-lg border border-neon-cyan max-h-[calc(100vh-400px)] flex flex-col">
            <div className="flex-1 overflow-auto">
              <div className="inline-block min-w-full">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Name</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[200px]">Fields (Hex)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {digitalEmergencies.map((system) => (
                      <tr
                        key={system.index}
                        className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                      >
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={system.name}
                            onChange={(e) => updateSystem(system.index, { name: e.target.value.slice(0, 10) })}
                            maxLength={10}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                            placeholder="Enter name"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={Array.from(system.fields).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase()}
                            onChange={(e) => {
                              const hexString = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 20);
                              const newFields = new Uint8Array(10);
                              for (let i = 0; i < hexString.length && i < 20; i += 2) {
                                const hexByte = hexString.slice(i, i + 2);
                                if (hexByte.length === 2) {
                                  newFields[i / 2] = parseInt(hexByte, 16);
                                }
                              }
                              updateSystem(system.index, { fields: newFields });
                            }}
                            maxLength={29}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white font-mono"
                            placeholder="00 00 00 00..."
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Encryption Keys Section */}
      <div className="mb-8">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-neon-cyan mb-2">Encryption Keys</h3>
          <p className="text-cool-gray text-sm">
            Manage encryption keys from metadata block 0x10. Up to 8 keys can be configured.
          </p>
          {block10Address !== null && (
            <p className="text-cool-gray text-xs mt-1">
              Block Address: 0x{block10Address.toString(16).toUpperCase()}
            </p>
          )}
        </div>

        {!block10Data ? (
          <div className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-20 p-6">
            <p className="text-cool-gray text-sm">
              Block 0x10 not found. Read from radio to view encryption keys.
            </p>
          </div>
        ) : (
          <div className="bg-deep-gray rounded-lg border border-neon-cyan max-h-[calc(100vh-400px)] flex flex-col">
            <div className="flex-1 overflow-auto">
              <div className="inline-block min-w-full">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">ID</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Name</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Encryption Type</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">Encryption ID</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[300px]">Key (Hex)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr
                        key={key.entryNumber}
                        className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                      >
                        <td className="px-2 py-2">
                          <select
                            value={key.id || key.entryNumber}
                            onChange={(e) => handleKeyChange(key.entryNumber, 'id', parseInt(e.target.value) || key.entryNumber)}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((val) => (
                              <option key={val} value={val}>
                                {val}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={key.name}
                            onChange={(e) => handleKeyChange(key.entryNumber, 'name', e.target.value.slice(0, 10))}
                            maxLength={10}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                            placeholder="Enter name"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={key.encryptionType ?? 0}
                            onChange={(e) => handleKeyChange(key.entryNumber, 'encryptionType', parseInt(e.target.value) || 0)}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                          >
                            <option value={0}>None</option>
                            <option value={1}>Custom</option>
                            <option value={2}>ARC4</option>
                            <option value={3}>AES128</option>
                            <option value={4}>AES256</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="1"
                            max="255"
                            value={key.encryptionId || 1}
                            onChange={(e) => handleKeyChange(key.entryNumber, 'encryptionId', parseInt(e.target.value) || 1)}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={key.key}
                            onChange={(e) => {
                              const hexValue = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 62).toUpperCase();
                              handleKeyChange(key.entryNumber, 'key', hexValue);
                            }}
                            maxLength={62}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white font-mono"
                            placeholder="Enter hex key"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

