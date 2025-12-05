import React from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useContactsStore } from '../../store/contactsStore';
import { useCalibrationStore } from '../../store/calibrationStore';
import { getContactCapacityWithFallback } from '../../utils/firmware';
import { CALIBRATION_PARAM_NAMES } from '../../models/Calibration';

export const SettingsTab: React.FC = () => {
  const { settings, radioInfo } = useRadioStore();
  const { channels } = useChannelsStore();
  const { zones } = useZonesStore();
  const { contacts } = useContactsStore();
  const { calibration, calibrationLoaded } = useCalibrationStore();

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
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-neon-cyan">Radio Settings</h2>
      </div>

      {/* About Radio Section */}
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
        <h3 className="text-lg font-semibold text-neon-cyan mb-4">About Radio</h3>
        
        {radioInfo ? (
          <div className="space-y-6">
            <div>
              <h4 className="text-md font-semibold text-neon-cyan mb-3">Radio Details</h4>
              <div className="grid grid-cols-2 gap-4">
                {settings?.name && (
                  <div>
                    <span className="text-cool-gray">Radio Name:</span>
                    <div className="text-white font-mono">{settings.name}</div>
                  </div>
                )}
                <div>
                  <span className="text-cool-gray">Model:</span>
                  <div className="text-white font-mono">{radioInfo.model}</div>
                </div>
                <div>
                  <span className="text-cool-gray">Firmware:</span>
                  <div className="text-white font-mono">{radioInfo.firmware}</div>
                </div>
                {radioInfo.buildDate && (
                  <div>
                    <span className="text-cool-gray">Build Date:</span>
                    <div className="text-white font-mono">{radioInfo.buildDate}</div>
                  </div>
                )}
                {radioInfo.dspVersion && (
                  <div>
                    <span className="text-cool-gray">DSP Version:</span>
                    <div className="text-white font-mono">{radioInfo.dspVersion}</div>
                  </div>
                )}
                {radioInfo.radioVersion && (
                  <div>
                    <span className="text-cool-gray">Radio Version:</span>
                    <div className="text-white font-mono">{radioInfo.radioVersion}</div>
                  </div>
                )}
                {radioInfo.codeplugVersion && (
                  <div>
                    <span className="text-cool-gray">Codeplug Version:</span>
                    <div className="text-white font-mono">{radioInfo.codeplugVersion}</div>
                  </div>
                )}
              </div>
            </div>

            {settings && (
              <div>
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Band Limits</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-cool-gray">VHF Range:</span>
                    <div className="text-white">
                      {settings.bandLimits.vhfMin.toFixed(4)} - {settings.bandLimits.vhfMax.toFixed(4)} MHz
                    </div>
                  </div>
                  <div>
                    <span className="text-cool-gray">UHF Range:</span>
                    <div className="text-white">
                      {settings.bandLimits.uhfMin.toFixed(4)} - {settings.bandLimits.uhfMax.toFixed(4)} MHz
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-md font-semibold text-neon-cyan mb-3">Memory Layout</h4>
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-cool-gray">Main Config:</span>
                  <span className="text-white">
                    {formatAddress(radioInfo.memoryLayout.configStart)} - {formatAddress(radioInfo.memoryLayout.configEnd)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-md font-semibold text-neon-cyan mb-3">Usage Statistics</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-cool-gray">Channels:</span>
                    <span className="text-white font-mono">
                      {channelUsage.used} / {channelUsage.total} ({channelUsage.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-dark-charcoal rounded-full h-2">
                    <div
                      className="bg-neon-cyan h-2 rounded-full transition-all"
                      style={{ width: `${channelUsage.percent}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-cool-gray">Zones:</span>
                    <span className="text-white font-mono">
                      {zoneUsage.used} / {zoneUsage.total} ({zoneUsage.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-dark-charcoal rounded-full h-2">
                    <div
                      className="bg-neon-cyan h-2 rounded-full transition-all"
                      style={{ width: `${zoneUsage.percent}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-cool-gray">Contacts:</span>
                    <span className="text-white font-mono">
                      {contactUsage.used} / {contactUsage.total.toLocaleString()} ({contactUsage.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-dark-charcoal rounded-full h-2">
                    <div
                      className="bg-neon-cyan h-2 rounded-full transition-all"
                      style={{ width: `${contactUsage.percent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-cool-gray">No radio information available. Read from radio to view details.</p>
        )}
      </div>

      {/* Calibration Data Section - Read Only */}
      {calibrationLoaded && (
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold text-yellow-400">Frequency Calibration Data</h3>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
              READ-ONLY
            </span>
          </div>
          
          <div className="mb-4 p-3 bg-yellow-900/10 border border-yellow-600/20 rounded">
            <p className="text-yellow-300 text-sm">
              <strong>⚠️ Display Only:</strong> This is factory calibration data for your radio. 
              These values are used for frequency adjustment and should not be modified. 
              Changing these values may cause your radio to operate outside of its specifications.
            </p>
          </div>

          {calibration ? (
            <div className="space-y-4">
              {/* Frequency Array 1 */}
              {calibration.data.frequencyArray1.size > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-yellow-400 mb-2">Frequency Array 1</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                    {Array.from(calibration.data.frequencyArray1.entries())
                      .sort(([a], [b]) => a - b)
                      .map(([param, value]) => {
                        const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                        return (
                          <div key={param} className="bg-dark-charcoal p-2 rounded">
                            <span className="text-cool-gray">{paramName}:</span>
                            <div className="text-white font-mono">{value}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Frequency Array 2 */}
              {calibration.data.frequencyArray2.size > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-yellow-400 mb-2">Frequency Array 2</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                    {Array.from(calibration.data.frequencyArray2.entries())
                      .sort(([a], [b]) => a - b)
                      .map(([param, value]) => {
                        const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                        return (
                          <div key={param} className="bg-dark-charcoal p-2 rounded">
                            <span className="text-cool-gray">{paramName}:</span>
                            <div className="text-white font-mono">{value}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Value Arrays */}
              {(calibration.data.valueArray1.size > 0 || 
                calibration.data.valueArray2.size > 0 || 
                calibration.data.valueArray3.size > 0) && (
                <div>
                  <h4 className="text-md font-semibold text-yellow-400 mb-2">Calibration Values</h4>
                  <div className="space-y-3">
                    {calibration.data.valueArray1.size > 0 && (
                      <div>
                        <span className="text-cool-gray text-sm font-semibold">Value Array 1:</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm mt-2">
                          {Array.from(calibration.data.valueArray1.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([param, value]) => {
                              const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                              return (
                                <div key={param} className="bg-dark-charcoal p-2 rounded">
                                  <span className="text-cool-gray text-xs">{paramName}:</span>
                                  <div className="text-white font-mono">{value}</div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                    {calibration.data.valueArray2.size > 0 && (
                      <div>
                        <span className="text-cool-gray text-sm font-semibold">Value Array 2:</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm mt-2">
                          {Array.from(calibration.data.valueArray2.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([param, value]) => {
                              const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                              return (
                                <div key={param} className="bg-dark-charcoal p-2 rounded">
                                  <span className="text-cool-gray text-xs">{paramName}:</span>
                                  <div className="text-white font-mono">{value}</div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                    {calibration.data.valueArray3.size > 0 && (
                      <div>
                        <span className="text-cool-gray text-sm font-semibold">Value Array 3:</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm mt-2">
                          {Array.from(calibration.data.valueArray3.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([param, value]) => {
                              const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                              return (
                                <div key={param} className="bg-dark-charcoal p-2 rounded">
                                  <span className="text-cool-gray text-xs">{paramName}:</span>
                                  <div className="text-white font-mono">{value}</div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="text-xs text-cool-gray mt-4">
                Block Address: 0x{calibration.blockAddress.toString(16).padStart(6, '0').toUpperCase()}
              </div>
            </div>
          ) : (
            <p className="text-cool-gray">No calibration data found on the radio.</p>
          )}
        </div>
      )}
    </div>
  );
};

