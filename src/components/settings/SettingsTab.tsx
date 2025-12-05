import React from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { getContactCapacityWithFallback } from '../../utils/firmware';

export const SettingsTab: React.FC = () => {
  const { radioInfo } = useRadioStore();
  const { channels } = useChannelsStore();
  const { zones } = useZonesStore();
  const { contacts } = useContactsStore();
  const { settings: radioSettings, updateSettings: updateRadioSettings } = useRadioSettingsStore();

  const formatAddress = (addr?: number) => {
    if (addr === undefined) return 'N/A';
    return `0x${addr.toString(16).padStart(6, '0').toUpperCase()}`;
  };

  // Calculate usage statistics
  const channelUsage = {
    used: channels.length,
    total: 4000,
    percent: Math.round((channels.length / 4000) * 100),
  };

  const zoneUsage = {
    used: zones.length,
    total: 250, // Max zones per spec
    percent: Math.round((zones.length / 250) * 100),
  };

  // Get contact capacity based on firmware: 150k for L01, 50k otherwise
  const contactCapacity = radioInfo 
    ? getContactCapacityWithFallback(
        radioInfo.vframes.get(0x0F),
        radioInfo.firmware
      )
    : 50000;
  const contactUsage = {
    used: contacts.length,
    total: contactCapacity,
    percent: Math.round((contacts.length / contactCapacity) * 100),
  };


  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neon-cyan">Settings</h2>
        <p className="text-cool-gray text-sm mt-1">Radio information, memory usage, and configuration</p>
      </div>

      {!radioInfo ? (
        <div className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-30 p-8 text-center">
          <p className="text-cool-gray">No radio information available. Read from radio to view details.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Device Information Section */}
          <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
              Device Information
            </h3>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <span className="text-cool-gray text-sm block mb-1">Model</span>
                <div className="text-white font-mono">{radioInfo.model}</div>
              </div>
              <div>
                <span className="text-cool-gray text-sm block mb-1">Firmware</span>
                <div className="text-white font-mono">{radioInfo.firmware}</div>
              </div>
              {radioInfo.buildDate && (
                <div>
                  <span className="text-cool-gray text-sm block mb-1">Build Date</span>
                  <div className="text-white font-mono">{radioInfo.buildDate}</div>
                </div>
              )}
              {radioInfo.dspVersion && (
                <div>
                  <span className="text-cool-gray text-sm block mb-1">DSP Version</span>
                  <div className="text-white font-mono text-sm">{radioInfo.dspVersion}</div>
                </div>
              )}
              {radioInfo.radioVersion && (
                <div>
                  <span className="text-cool-gray text-sm block mb-1">Radio Version</span>
                  <div className="text-white font-mono text-sm">{radioInfo.radioVersion}</div>
                </div>
              )}
              {radioInfo.codeplugVersion && (
                <div>
                  <span className="text-cool-gray text-sm block mb-1">Codeplug Version</span>
                  <div className="text-white font-mono text-sm">{radioInfo.codeplugVersion}</div>
                </div>
              )}
            </div>
          </div>

          {/* Memory & Storage Section */}
          <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
              Memory & Storage
            </h3>
            <div className="space-y-6 mt-4">
              <div>
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Memory Layout</h4>
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between items-center py-2 px-3 bg-dark-charcoal rounded">
                    <span className="text-cool-gray">Configuration Region:</span>
                    <span className="text-white">
                      {formatAddress(radioInfo.memoryLayout.configStart)} - {formatAddress(radioInfo.memoryLayout.configEnd)}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Usage Statistics</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-cool-gray">Channels</span>
                      <span className="text-white font-mono text-sm">
                        {channelUsage.used} / {channelUsage.total} ({channelUsage.percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-dark-charcoal rounded-full h-2.5">
                      <div
                        className="bg-neon-cyan h-2.5 rounded-full transition-all"
                        style={{ width: `${channelUsage.percent}%` }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-cool-gray">Zones</span>
                      <span className="text-white font-mono text-sm">
                        {zoneUsage.used} / {zoneUsage.total} ({zoneUsage.percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-dark-charcoal rounded-full h-2.5">
                      <div
                        className="bg-neon-cyan h-2.5 rounded-full transition-all"
                        style={{ width: `${zoneUsage.percent}%` }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-cool-gray">Contacts</span>
                      <span className="text-white font-mono text-sm">
                        {contactUsage.used} / {contactUsage.total.toLocaleString()} ({contactUsage.percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-dark-charcoal rounded-full h-2.5">
                      <div
                        className="bg-neon-cyan h-2.5 rounded-full transition-all"
                        style={{ width: `${contactUsage.percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Radio Configuration Section */}
          <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
              Radio Configuration
            </h3>
            <div className="space-y-6 mt-4">
              {radioSettings && (
                <>
                  <div>
                    <h4 className="text-md font-semibold text-neon-cyan mb-3">Boot Screen Text</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Line 1</label>
                        <input
                          type="text"
                          value={radioSettings.radioNameA}
                          onChange={(e) => updateRadioSettings({ radioNameA: e.target.value.substring(0, 14) })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                          maxLength={14}
                          placeholder="Enter boot text line 1"
                        />
                      </div>
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Line 2</label>
                        <input
                          type="text"
                          value={radioSettings.radioNameB}
                          onChange={(e) => updateRadioSettings({ radioNameB: e.target.value.substring(0, 14) })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                          maxLength={14}
                          placeholder="Enter boot text line 2"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md font-semibold text-neon-cyan mb-3">Boot Image</h4>
                    <div className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-cool-gray text-sm mb-1">Upload or download boot screen image</p>
                          <p className="text-yellow-500 text-xs">⚠️ Not yet supported</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled
                          className="px-4 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-cool-gray text-sm cursor-not-allowed opacity-50"
                        >
                          Upload Image
                        </button>
                        <button
                          type="button"
                          disabled
                          className="px-4 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-cool-gray text-sm cursor-not-allowed opacity-50"
                        >
                          Download Image
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

