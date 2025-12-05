import React from 'react';
import { useVFOSettingsStore } from '../../store/vfoSettingsStore';

export const VFOSettingsTab: React.FC = () => {
  const { settings, updateSettings } = useVFOSettingsStore();

  if (!settings) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-neon-cyan">VFO Settings</h2>
        </div>
        <div className="bg-deep-gray rounded-lg border border-neon-cyan p-8 text-center">
          <p className="text-cool-gray mb-4">No VFO settings loaded</p>
          <p className="text-cool-gray text-sm">Read from radio to view VFO settings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-neon-cyan">VFO Settings</h2>
      </div>

      {/* Radio Names Section */}
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6 mb-4">
        <h3 className="text-lg font-semibold text-neon-cyan mb-4">Radio Names</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-cool-gray text-sm mb-2">Radio Name A</label>
            <input
              type="text"
              value={settings.radioNameA}
              onChange={(e) => updateSettings({ radioNameA: e.target.value.substring(0, 13) })}
              className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
              maxLength={13}
            />
          </div>
          <div>
            <label className="block text-cool-gray text-sm mb-2">Radio Name B</label>
            <input
              type="text"
              value={settings.radioNameB}
              onChange={(e) => updateSettings({ radioNameB: e.target.value.substring(0, 13) })}
              className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
              maxLength={13}
            />
          </div>
        </div>
      </div>

      {/* Header Flags Section */}
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6 mb-4">
        <h3 className="text-lg font-semibold text-neon-cyan mb-4">Header Flags</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-cool-gray text-sm mb-2">Unknown Flag (0x00)</label>
            <input
              type="number"
              min="0"
              max="255"
              value={settings.unknownFlag}
              onChange={(e) => updateSettings({ unknownFlag: parseInt(e.target.value) || 0 })}
              className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
            />
          </div>
          <div>
            <label className="block text-cool-gray text-sm mb-2">Bit Flags 1 (0x1D)</label>
            <input
              type="number"
              min="0"
              max="255"
              value={settings.bitFlags1}
              onChange={(e) => updateSettings({ bitFlags1: parseInt(e.target.value) || 0 })}
              className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
            />
          </div>
          <div>
            <label className="block text-cool-gray text-sm mb-2">Value (0x1E)</label>
            <input
              type="number"
              min="0"
              max="5"
              value={settings.value}
              onChange={(e) => updateSettings({ value: Math.min(5, Math.max(0, parseInt(e.target.value) || 0)) })}
              className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
            />
          </div>
          <div>
            <label className="block text-cool-gray text-sm mb-2">Bit Flags 2 (0x20)</label>
            <input
              type="number"
              min="0"
              max="255"
              value={settings.bitFlags2}
              onChange={(e) => updateSettings({ bitFlags2: parseInt(e.target.value) || 0 })}
              className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
            />
          </div>
        </div>
      </div>

      {/* VFO Settings Section */}
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6 mb-4">
        <h3 className="text-lg font-semibold text-neon-cyan mb-4">VFO Settings</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-cool-gray text-sm mb-2">Unknown VFO Setting (0x301)</label>
              <input
                type="number"
                min="0"
                max="255"
                value={settings.unknownVfoSetting}
                onChange={(e) => updateSettings({ unknownVfoSetting: parseInt(e.target.value) || 0 })}
                className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.vfoEnabled}
                  onChange={(e) => updateSettings({ vfoEnabled: e.target.checked })}
                  className="w-4 h-4 text-neon-cyan bg-transparent border-neon-cyan rounded focus:ring-neon-cyan"
                />
                <span className="text-cool-gray text-sm">VFO Enabled (0x302, bit 0)</span>
              </label>
            </div>
          </div>

          {/* Geographic Coordinates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-cool-gray text-sm mb-2">Latitude</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.latitude}
                  onChange={(e) => updateSettings({ latitude: e.target.value.substring(0, 13) })}
                  className="flex-1 bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  maxLength={13}
                />
                <select
                  value={settings.latitudeDirection}
                  onChange={(e) => updateSettings({ latitudeDirection: e.target.value as 'N' | 'S' })}
                  className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  <option value="N">N</option>
                  <option value="S">S</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-cool-gray text-sm mb-2">Longitude</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.longitude}
                  onChange={(e) => updateSettings({ longitude: e.target.value.substring(0, 13) })}
                  className="flex-1 bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  maxLength={13}
                />
                <select
                  value={settings.longitudeDirection}
                  onChange={(e) => updateSettings({ longitudeDirection: e.target.value as 'E' | 'W' })}
                  className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  <option value="E">E</option>
                  <option value="W">W</option>
                </select>
              </div>
            </div>
          </div>

          {/* Channel Settings */}
          <div>
            <h4 className="text-md font-semibold text-neon-cyan mb-3">Current Channels</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-cool-gray text-sm mb-2">Current Channel A</label>
                <input
                  type="number"
                  min="0"
                  value={settings.currentChannelA}
                  onChange={(e) => updateSettings({ currentChannelA: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
                <span className="text-xs text-cool-gray">0 = none</span>
              </div>
              <div>
                <label className="block text-cool-gray text-sm mb-2">Current Channel B</label>
                <input
                  type="number"
                  min="0"
                  value={settings.currentChannelB}
                  onChange={(e) => updateSettings({ currentChannelB: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
                <span className="text-xs text-cool-gray">0 = none</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-md font-semibold text-neon-cyan mb-3">Channel Settings 3-8</h4>
            <div className="grid grid-cols-3 gap-4">
              {[3, 4, 5, 6, 7, 8].map((num) => {
                const field = `channelSetting${num}` as keyof typeof settings;
                return (
                  <div key={num}>
                    <label className="block text-cool-gray text-sm mb-2">Channel Setting {num}</label>
                    <input
                      type="number"
                      min="0"
                      value={settings[field] as number}
                      onChange={(e) => updateSettings({ [field]: Math.max(0, parseInt(e.target.value) || 0) } as Partial<typeof settings>)}
                      className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zone Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-cool-gray text-sm mb-2">Current Zone</label>
              <input
                type="number"
                min="0"
                value={settings.currentZone}
                onChange={(e) => updateSettings({ currentZone: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
              />
              <span className="text-xs text-cool-gray">0 = none</span>
            </div>
            <div className="flex items-end">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.zoneEnabled}
                  onChange={(e) => updateSettings({ zoneEnabled: e.target.checked })}
                  className="w-4 h-4 text-neon-cyan bg-transparent border-neon-cyan rounded focus:ring-neon-cyan"
                />
                <span className="text-cool-gray text-sm">Zone Enabled (0x331, bit 0)</span>
              </label>
            </div>
          </div>

          {/* Unknown Value */}
          <div>
            <label className="block text-cool-gray text-sm mb-2">Unknown Value (0x332, hex)</label>
            <input
              type="text"
              value={settings.unknownValue}
              onChange={(e) => {
                // Allow hex format: "aa bb cc" or "aabbcc"
                const cleaned = e.target.value.replace(/[^0-9a-fA-F ]/g, '');
                updateSettings({ unknownValue: cleaned });
              }}
              className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan font-mono"
              placeholder="aa bb cc"
            />
            <span className="text-xs text-cool-gray">3 bytes as hex string</span>
          </div>
        </div>
      </div>
    </div>
  );
};

