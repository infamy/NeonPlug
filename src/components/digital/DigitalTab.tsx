import React, { useEffect, useMemo } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useEncryptionKeysStore } from '../../store/encryptionKeysStore';
import { useDigitalEmergencyStore } from '../../store/digitalEmergencyStore';
import { parseEncryptionKeys, encodeEncryptionKey, parseDigitalEmergencies } from '../../protocol/dm32uv/structures';

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

  // Find block with metadata 0x03 (Digital Emergency)
  const block03Address = useMemo(() => {
    for (const [address, metadata] of blockMetadata.entries()) {
      if (metadata.metadata === 0x03) {
        return address;
      }
    }
    return null;
  }, [blockMetadata]);

  const block03Data = block03Address !== null ? blockData.get(block03Address) : null;

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

  // Parse digital emergency systems when block data is available
  useEffect(() => {
    if (block03Data) {
      try {
        const { systems, config } = parseDigitalEmergencies(block03Data);
        setDigitalEmergencies(systems);
        setDigitalEmergencyConfig(config);
      } catch (error) {
        console.error('Error parsing digital emergency systems:', error);
      }
    }
  }, [block03Data, setDigitalEmergencies, setDigitalEmergencyConfig]);

  const handleKeyChange = (entryNumber: number, field: keyof typeof keys[0], value: any) => {
    updateKey(entryNumber, { [field]: value });
  };

  const handleSave = () => {
    if (!block10Data || !block10Address) return;
    
    // Create a copy of the block data
    const updatedData = new Uint8Array(block10Data);
    
    // Encode each key
    keys.forEach((key) => {
      try {
        encodeEncryptionKey(key, updatedData);
      } catch (error) {
        console.error(`Error encoding key ${key.entryNumber}:`, error);
      }
    });
    
    // TODO: Write updatedData back to radio via protocol
    console.log('Encryption keys updated (write to radio not yet implemented)');
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
            Manage digital emergency systems from metadata block 0x03.
          </p>
          {block03Address !== null && (
            <p className="text-cool-gray text-xs mt-1">
              Block Address: 0x{block03Address.toString(16).toUpperCase()}
            </p>
          )}
        </div>

        {!block03Data ? (
          <div className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-20 p-6">
            <p className="text-cool-gray text-sm">
              Block 0x03 not found. Read from radio to view digital emergency systems.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {digitalEmergencies.length === 0 ? (
              <div className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-20 p-6">
                <p className="text-cool-gray text-sm">No digital emergency systems found.</p>
              </div>
            ) : (
              digitalEmergencies.map((system) => (
                <div
                  key={system.index}
                  className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-20 p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-neon-cyan">
                      System {system.index + 1}: {system.name || `[Unnamed ${system.index}]`}
                    </h4>
                    <label className="flex items-center gap-2 text-cool-gray text-sm">
                      <input
                        type="checkbox"
                        checked={system.enabled}
                        onChange={(e) => updateSystem(system.index, { enabled: e.target.checked })}
                        className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                      />
                      Enabled
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Name</label>
                      <input
                        type="text"
                        value={system.name}
                        onChange={(e) => updateSystem(system.index, { name: e.target.value })}
                        maxLength={15}
                        className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>

                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Value 1</label>
                      <input
                        type="number"
                        min="0"
                        max="65535"
                        value={system.value1}
                        onChange={(e) => updateSystem(system.index, { value1: parseInt(e.target.value) || 0 })}
                        className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>

                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Value 2</label>
                      <input
                        type="number"
                        min="0"
                        max="65535"
                        value={system.value2}
                        onChange={(e) => updateSystem(system.index, { value2: parseInt(e.target.value) || 0 })}
                        className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>

                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Unknown</label>
                      <input
                        type="number"
                        min="0"
                        max="65535"
                        value={system.unknown}
                        onChange={(e) => updateSystem(system.index, { unknown: parseInt(e.target.value) || 0 })}
                        className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
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
          <div className="space-y-4">
        {keys.map((key) => (
          <div
            key={key.entryNumber}
            className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-20 p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neon-cyan">
                Key {key.entryNumber}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-cool-gray text-sm mb-2">Type</label>
                <select
                  value={key.type || key.entryNumber}
                  onChange={(e) => handleKeyChange(key.entryNumber, 'type', parseInt(e.target.value) || key.entryNumber)}
                  className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((val) => (
                    <option key={val} value={val}>
                      {val} (0x{val.toString(16).padStart(2, '0').toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-cool-gray text-sm mb-2">Name</label>
                <input
                  type="text"
                  value={key.name}
                  onChange={(e) => handleKeyChange(key.entryNumber, 'name', e.target.value.slice(0, 10))}
                  maxLength={10}
                  className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  placeholder="Enter name (max 10 chars)"
                />
              </div>

              <div>
                <label className="block text-cool-gray text-sm mb-2">Encryption Type</label>
                <input
                  type="number"
                  min="1"
                  max="255"
                  value={key.encryptionType || 1}
                  onChange={(e) => handleKeyChange(key.entryNumber, 'encryptionType', parseInt(e.target.value) || 1)}
                  className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
              </div>

              <div>
                <label className="block text-cool-gray text-sm mb-2">Encryption ID</label>
                <input
                  type="number"
                  min="1"
                  max="255"
                  value={key.encryptionId || 1}
                  onChange={(e) => handleKeyChange(key.entryNumber, 'encryptionId', parseInt(e.target.value) || 1)}
                  className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-cool-gray text-sm mb-2">Key (Hex, 62 characters = 31 bytes)</label>
                <input
                  type="text"
                  value={key.key}
                  onChange={(e) => {
                    // Only allow hex characters, max 62 chars
                    const hexValue = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 62).toUpperCase();
                    handleKeyChange(key.entryNumber, 'key', hexValue);
                  }}
                  maxLength={62}
                  className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  placeholder="Enter hex key (62 hex chars)"
                />
                <p className="text-xs text-cool-gray mt-1">
                  {key.key.length} / 62 characters ({Math.floor(key.key.length / 2)} / 31 bytes)
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-neon-cyan text-black font-semibold rounded hover:bg-neon-cyan/80 transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};

