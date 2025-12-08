import React, { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useCalibrationStore } from '../../store/calibrationStore';
import { getContactCapacityWithFallback } from '../../utils/firmware';
import { CALIBRATION_PARAM_NAMES } from '../../models/Calibration';

const COLOR_OPTIONS = [
  { value: 0, label: 'White', hex: '#FFFFFF' },
  { value: 1, label: 'Black', hex: '#000000' },
  { value: 2, label: 'Orange', hex: '#FFA500' },
  { value: 3, label: 'Red', hex: '#FF0000' },
  { value: 4, label: 'Yellow', hex: '#FFFF00' },
  { value: 5, label: 'Green', hex: '#00FF00' },
  { value: 6, label: 'Cyan', hex: '#00FFFF' },
  { value: 7, label: 'Blue', hex: '#0000FF' },
];

const getColorHex = (colorValue: number): string => {
  const color = COLOR_OPTIONS.find(c => c.value === colorValue);
  return color?.hex || '#FFFFFF';
};

export const SettingsTab: React.FC = () => {
  const { radioInfo } = useRadioStore();
  const { channels } = useChannelsStore();
  const { zones } = useZonesStore();
  const { contacts } = useContactsStore();
  const { settings: radioSettings, updateSettings: updateRadioSettings } = useRadioSettingsStore();
  const { calibration, calibrationLoaded } = useCalibrationStore();
  const [showCalibration, setShowCalibration] = useState(false);

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
            {radioSettings && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Power On Display</h4>
                  <div className="space-y-4">
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Line 1</label>
                        <input
                          type="text"
                          value={radioSettings.powerOnDisplayLine1}
                          onChange={(e) => updateRadioSettings({ powerOnDisplayLine1: e.target.value.substring(0, 14) })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                          maxLength={14}
                          placeholder="Enter boot text line 1"
                        />
                      </div>
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Line 2</label>
                        <input
                          type="text"
                          value={radioSettings.powerOnDisplayLine2}
                          onChange={(e) => updateRadioSettings({ powerOnDisplayLine2: e.target.value.substring(0, 14) })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                          maxLength={14}
                          placeholder="Enter boot text line 2"
                        />
                      </div>
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Power On Interface</label>
                        <select
                          value={radioSettings.powerOnInterface}
                          onChange={(e) => updateRadioSettings({ powerOnInterface: parseInt(e.target.value) })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {[0, 1, 2, 3, 4, 5].map(val => (
                            <option key={val} value={val}>{val}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="allowReset"
                          checked={radioSettings.allowReset}
                          onChange={(e) => updateRadioSettings({ allowReset: e.target.checked })}
                          className="w-4 h-4 text-neon-cyan bg-dark-charcoal border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor="allowReset" className="text-cool-gray text-sm">Allow Reset</label>
                      </div>
                    </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Display Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Zone A Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.zoneAColor}
                          onChange={(e) => updateRadioSettings({ zoneAColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-9 h-9 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.zoneAColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Zone B Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.zoneBColor}
                          onChange={(e) => updateRadioSettings({ zoneBColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-10 h-10 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.zoneBColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">A Channel Name Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.aChannelNameColor}
                          onChange={(e) => updateRadioSettings({ aChannelNameColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-10 h-10 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.aChannelNameColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">B Channel Name Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.bChannelNameColor}
                          onChange={(e) => updateRadioSettings({ bChannelNameColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-10 h-10 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.bChannelNameColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Call Display Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.callDisplayColor}
                          onChange={(e) => updateRadioSettings({ callDisplayColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-10 h-10 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.callDisplayColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Backlight Brightness</label>
                      <input
                        type="number"
                        min="1"
                        max="6"
                        value={radioSettings.backlightBrightness}
                        onChange={(e) => updateRadioSettings({ backlightBrightness: parseInt(e.target.value) || 1 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Auto Backlight Duration (s)</label>
                      <input
                        type="number"
                        min="5"
                        max="30"
                        step="5"
                        value={radioSettings.autoBacklightDuration}
                        onChange={(e) => updateRadioSettings({ autoBacklightDuration: parseInt(e.target.value) || 5 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Menu Exit Time (s)</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={radioSettings.menuExitTime}
                        onChange={(e) => updateRadioSettings({ menuExitTime: parseInt(e.target.value) || 1 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Time & GPS</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">UTC Zone</label>
                      <input
                        type="number"
                        min="0"
                        max="25"
                        value={radioSettings.utcZone}
                        onChange={(e) => updateRadioSettings({ utcZone: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Measure Period Interval (s)</label>
                      <input
                        type="number"
                        min="5"
                        value={radioSettings.measurePeriodInterval}
                        onChange={(e) => updateRadioSettings({ measurePeriodInterval: parseInt(e.target.value) || 5 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div className="pt-2 mt-2 border-t border-neon-cyan border-opacity-20">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="gpsAprsSwitch"
                          checked={(radioSettings.gpsAprsFlags & 0x01) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.gpsAprsFlags | 0x01
                              : radioSettings.gpsAprsFlags & ~0x01;
                            updateRadioSettings({ gpsAprsFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor="gpsAprsSwitch" className="text-cool-gray text-sm">GPS/APRS Switch</label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Digital Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Call Hold Time (s)</label>
                      <input
                        type="number"
                        min="0"
                        max="61"
                        value={radioSettings.callHoldTime}
                        onChange={(e) => updateRadioSettings({ callHoldTime: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Remote Monitor Time (s)</label>
                      <input
                        type="number"
                        min="0"
                        value={radioSettings.remoteMonitorTime}
                        onChange={(e) => updateRadioSettings({ remoteMonitorTime: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Active Wait Time (ms)</label>
                      <input
                        type="number"
                        min="1"
                        value={radioSettings.activeWaitTime}
                        onChange={(e) => updateRadioSettings({ activeWaitTime: parseInt(e.target.value) || 1 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Active Retries Time</label>
                      <input
                        type="number"
                        min="1"
                        value={radioSettings.activeRetriesTime}
                        onChange={(e) => updateRadioSettings({ activeRetriesTime: parseInt(e.target.value) || 1 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Pre-Carrier Time (ms)</label>
                      <input
                        type="number"
                        min="0"
                        value={radioSettings.preCarrierTime}
                        onChange={(e) => updateRadioSettings({ preCarrierTime: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">TX Dwell Time (s)</label>
                      <input
                        type="number"
                        min="0"
                        value={radioSettings.txDwellTime}
                        onChange={(e) => updateRadioSettings({ txDwellTime: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Alert Tones</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'Key Tone' },
                      { bit: 1, label: 'SMS Alert' },
                      { bit: 2, label: 'Group Call Tone' },
                      { bit: 3, label: 'Private Call Tone' },
                      { bit: 4, label: 'Call End Tone' },
                      { bit: 5, label: 'Talk Permit Tone' },
                      { bit: 6, label: 'StartUp Sound' },
                      { bit: 7, label: 'Voice Prompt' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`alertTone${bit}`}
                          checked={(radioSettings.alertToneFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.alertToneFlags | (1 << bit)
                              : radioSettings.alertToneFlags & ~(1 << bit);
                            updateRadioSettings({ alertToneFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`alertTone${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-neon-cyan border-opacity-20">
                      <p className="text-cool-gray text-xs mb-2">Additional:</p>
                      {[
                        { bit: 0, label: 'Battery Low' },
                        { bit: 1, label: 'Analog TX End Tone' },
                        { bit: 2, label: 'Analog TX Alert Tone' },
                      ].map(({ bit, label }) => (
                        <div key={bit} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`alertToneCont${bit}`}
                            checked={(radioSettings.alertToneFlagsCont & (1 << bit)) !== 0}
                            onChange={(e) => {
                              const newValue = e.target.checked
                                ? radioSettings.alertToneFlagsCont | (1 << bit)
                                : radioSettings.alertToneFlagsCont & ~(1 << bit);
                              updateRadioSettings({ alertToneFlagsCont: newValue });
                            }}
                            className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                          />
                          <label htmlFor={`alertToneCont${bit}`} className="text-cool-gray text-sm">{label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Display Flags</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'Volume Change Prompt' },
                      { bit: 1, label: 'Time Display' },
                      { bit: 2, label: 'Date Display Format' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`displayFlag${bit}`}
                          checked={(radioSettings.displayFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.displayFlags | (1 << bit)
                              : radioSettings.displayFlags & ~(1 << bit);
                            updateRadioSettings({ displayFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`displayFlag${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Work Mode</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'Only Channel Mode' },
                      { bit: 1, label: 'Distance Unit' },
                      { bit: 2, label: 'GPS Mode' },
                      { bit: 3, label: 'Speed Unit' },
                      { bit: 4, label: 'GPS Display Format' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`workMode${bit}`}
                          checked={(radioSettings.workModeFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.workModeFlags | (1 << bit)
                              : radioSettings.workModeFlags & ~(1 << bit);
                            updateRadioSettings({ workModeFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`workMode${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Digital Flags</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'Radio Disable Decode' },
                      { bit: 1, label: 'Remote Monitor Decode' },
                      { bit: 2, label: 'Call Alert Decode' },
                      { bit: 3, label: 'Radio Enable Decode' },
                      { bit: 4, label: 'Radio Check Decode' },
                      { bit: 5, label: 'Data Service' },
                      { bit: 6, label: 'Missed Call Alert' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`digitalFlag${bit}`}
                          checked={(radioSettings.digitalSettingsFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.digitalSettingsFlags | (1 << bit)
                              : radioSettings.digitalSettingsFlags & ~(1 << bit);
                            updateRadioSettings({ digitalSettingsFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`digitalFlag${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-neon-cyan border-opacity-20">
                      <p className="text-cool-gray text-xs mb-2">Additional:</p>
                      {[
                        { bit: 0, label: 'Name Data Format' },
                        { bit: 1, label: 'Send TX Name' },
                        { bit: 2, label: 'Name Display Priority' },
                      ].map(({ bit, label }) => (
                        <div key={bit} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`digitalCont${bit}`}
                            checked={(radioSettings.digitalSettingsCont & (1 << bit)) !== 0}
                            onChange={(e) => {
                              const newValue = e.target.checked
                                ? radioSettings.digitalSettingsCont | (1 << bit)
                                : radioSettings.digitalSettingsCont & ~(1 << bit);
                              updateRadioSettings({ digitalSettingsCont: newValue });
                            }}
                            className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                          />
                          <label htmlFor={`digitalCont${bit}`} className="text-cool-gray text-sm">{label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">VFO/Embedded</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'A Range Mode' },
                      { bit: 1, label: 'B Range Mode' },
                      { bit: 2, label: 'A Display Mode' },
                      { bit: 3, label: 'B Display Mode' },
                      { bit: 4, label: 'Main Channel Setting' },
                      { bit: 5, label: 'Hold Mode' },
                      { bit: 6, label: 'Dual Watch Mode' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`vfoFlag${bit}`}
                          checked={(radioSettings.vfoEmbeddedFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.vfoEmbeddedFlags | (1 << bit)
                              : radioSettings.vfoEmbeddedFlags & ~(1 << bit);
                            updateRadioSettings({ vfoEmbeddedFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`vfoFlag${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Boot Image</h4>
                  <div className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded p-4">
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calibration Data Section - Read Only */}
      {calibrationLoaded && (
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-yellow-400">Frequency Calibration Data</h3>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                READ-ONLY
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowCalibration(!showCalibration)}
              className="px-3 py-1 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50 transition-colors"
            >
              {showCalibration ? 'Hide' : 'Show'}
            </button>
          </div>
          {showCalibration && (
            <>
          
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
            </>
          )}
        </div>
      )}
    </div>
  );
};

