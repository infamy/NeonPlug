import React, { useState } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import type { Channel } from '../../models/Channel';
import { ChannelEditModal } from './ChannelEditModal';
import { CTCSS_FREQUENCIES, DCS_CODES, formatCTCSSFrequency, formatDCSCode } from '../../utils/ctcssConstants';

interface ChannelsTableProps {
  channels?: Channel[];
}

export const ChannelsTable: React.FC<ChannelsTableProps> = ({ channels: channelsProp }) => {
  const { channels: channelsFromStore, updateChannel, deleteChannel } = useChannelsStore();
  const { settings: radioSettings, updateSettings } = useRadioSettingsStore();
  const channels = channelsProp ?? channelsFromStore;
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  const handleCellChange = (
    channelNumber: number,
    field: keyof Channel,
    value: string | number | boolean | Channel['rxCtcssDcs']
  ) => {
    // Handle VFO channels (4001 and 4002)
    if (channelNumber === 4001 && radioSettings?.vfoA) {
      // VFO A
      updateSettings({ vfoA: { ...radioSettings.vfoA, [field]: value } });
      return;
    }
    if (channelNumber === 4002 && radioSettings?.vfoB) {
      // VFO B
      updateSettings({ vfoB: { ...radioSettings.vfoB, [field]: value } });
      return;
    }
    // Regular channels
    updateChannel(channelNumber, { [field]: value });
  };

  const isVFOChannel = (channelNumber: number): boolean => {
    return channelNumber === 4001 || channelNumber === 4002;
  };

  const getVFOIdentifier = (channelNumber: number): string => {
    if (channelNumber === 4001) return 'A';
    if (channelNumber === 4002) return 'B';
    return channelNumber.toString();
  };

  const formatFrequency = (freq: number): string => {
    return freq.toFixed(4); // Shows 3 digits before decimal, 4 after (e.g., 145.3500)
  };

  const isDigitalMode = (mode: Channel['mode']): boolean => {
    return mode === 'Digital' || mode === 'Fixed Digital';
  };

  if (channels.length === 0) {
    return (
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-8 text-center">
        <p className="text-cool-gray mb-4">No channels loaded</p>
        <p className="text-cool-gray text-sm">Connect to a radio or import channels to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-deep-gray rounded-lg border border-neon-cyan max-h-[calc(100vh-200px)] flex flex-col">
      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full">
          <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20">
          <tr className="bg-dark-charcoal border-b border-neon-cyan">
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-0 bg-dark-charcoal z-30 min-w-[40px]">#</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-[40px] bg-dark-charcoal z-30 min-w-[120px]">Name</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[110px]">RX Freq</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[110px]">TX Freq</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[50px]">Mode</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[40px]">BW</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[40px]">PWR</th>
            {/* Essential columns - always visible */}
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">Color Code</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[85px]">RX Tone</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[85px]">TX Tone</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Forbid TX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[75px]">
              <div className="leading-tight">Busy<br />Lock</div>
            </th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Lone Worker</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Scan Add</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">Scan List</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">FTA</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Reverse Freq</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Emerg</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Emerg Ack</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Emerg ID</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">APRS RX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">APRS TX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">VOX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Scramble">SCR</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Compander">CMP</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Talkback">TB</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Compander Dup">CMP DUP</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">SQL</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">PTT ID Display</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">PTT ID</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">VOX Related</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">RX Squelch Mode</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Step Freq</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[65px]">Sig Type</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[65px]">PTT ID Type</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Contact ID</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[60px] sticky right-0 bg-dark-charcoal z-30">Actions</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => {
            const showColorCode = isDigitalMode(channel.mode);
            return (
              <tr
                key={channel.number}
                className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
              >
                <td className="px-2 py-2 text-white sticky left-0 bg-deep-gray z-10 text-sm font-medium">
                  {isVFOChannel(channel.number) ? getVFOIdentifier(channel.number) : channel.number}
                </td>
                <td className="px-2 py-2 sticky left-[40px] bg-deep-gray z-10">
                  <input
                    type="text"
                    value={isVFOChannel(channel.number) ? '' : channel.name}
                    onChange={(e) => handleCellChange(channel.number, 'name', e.target.value)}
                    disabled={isVFOChannel(channel.number)}
                    className={`bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs ${
                      isVFOChannel(channel.number) 
                        ? 'text-cool-gray cursor-not-allowed' 
                        : 'text-white'
                    }`}
                    maxLength={16}
                    placeholder={isVFOChannel(channel.number) ? `VFO ${getVFOIdentifier(channel.number)}` : ''}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    step="0.0001"
                    value={formatFrequency(channel.rxFrequency)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      handleCellChange(channel.number, 'rxFrequency', val);
                    }}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    step="0.0001"
                    value={formatFrequency(channel.txFrequency)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      handleCellChange(channel.number, 'txFrequency', val);
                    }}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => {
                      const modeOrder = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
                      const currentIndex = modeOrder.indexOf(channel.mode);
                      const nextIndex = (currentIndex + 1) % modeOrder.length;
                      handleCellChange(channel.number, 'mode', modeOrder[nextIndex]);
                    }}
                    className="w-10 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
                    title={channel.mode}
                  >
                    {channel.mode === 'Analog' || channel.mode === 'Fixed Analog' ? 'Ana' : 'Dig'}
                  </button>
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => handleCellChange(channel.number, 'bandwidth', channel.bandwidth === '25kHz' ? '12.5kHz' : '25kHz')}
                    className="w-8 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
                    title={channel.bandwidth === '25kHz' ? 'Wide (25kHz)' : 'Narrow (12.5kHz)'}
                  >
                    {channel.bandwidth === '25kHz' ? 'W' : 'N'}
                  </button>
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => {
                      const powerOrder = ['Low', 'Medium', 'High'];
                      const currentIndex = powerOrder.indexOf(channel.power);
                      const nextIndex = (currentIndex + 1) % powerOrder.length;
                      handleCellChange(channel.number, 'power', powerOrder[nextIndex]);
                    }}
                    className="w-8 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
                    title={channel.power}
                  >
                    {channel.power === 'Low' ? 'L' : channel.power === 'Medium' ? 'M' : 'H'}
                  </button>
                </td>
                <td className="px-2 py-2">
                  {showColorCode ? (
                    <input
                      type="number"
                      min="0"
                      max="15"
                      value={channel.colorCode}
                      onChange={(e) => handleCellChange(channel.number, 'colorCode', parseInt(e.target.value) || 0)}
                      className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                    />
                  ) : (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-col gap-1">
                    <select
                      value={channel.rxCtcssDcs.type}
                      onChange={(e) => {
                        const type = e.target.value as 'CTCSS' | 'DCS' | 'None';
                        handleCellChange(channel.number, 'rxCtcssDcs', {
                          ...channel.rxCtcssDcs,
                          type,
                          value: type === 'None' ? undefined : channel.rxCtcssDcs.value,
                        });
                      }}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                    >
                      <option value="None">None</option>
                      <option value="CTCSS">CTCSS</option>
                      <option value="DCS">DCS</option>
                    </select>
                    {channel.rxCtcssDcs.type === 'CTCSS' && (
                      <select
                        value={channel.rxCtcssDcs.value || ''}
                        onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                          ...channel.rxCtcssDcs,
                          value: e.target.value ? parseFloat(e.target.value) : undefined,
                        })}
                        className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                      >
                        <option value="">Select...</option>
                        {channel.rxCtcssDcs.value && !CTCSS_FREQUENCIES.includes(channel.rxCtcssDcs.value) && (
                          <option value={channel.rxCtcssDcs.value}>
                            {formatCTCSSFrequency(channel.rxCtcssDcs.value)} (Custom)
                          </option>
                        )}
                        {CTCSS_FREQUENCIES.map((freq) => (
                          <option key={freq} value={freq}>
                            {formatCTCSSFrequency(freq)}
                          </option>
                        ))}
                      </select>
                    )}
                    {channel.rxCtcssDcs.type === 'DCS' && (
                      <div className="flex gap-1">
                        <select
                          value={channel.rxCtcssDcs.value || ''}
                          onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                            ...channel.rxCtcssDcs,
                            value: e.target.value ? parseInt(e.target.value) : undefined,
                          })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                        >
                          <option value="">Select...</option>
                          {channel.rxCtcssDcs.value && !DCS_CODES.includes(channel.rxCtcssDcs.value) && (
                            <option value={channel.rxCtcssDcs.value}>
                              {formatDCSCode(channel.rxCtcssDcs.value, channel.rxCtcssDcs.polarity)} (Custom)
                            </option>
                          )}
                          {DCS_CODES.map((code) => (
                            <option key={code} value={code}>
                              {formatDCSCode(code)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={channel.rxCtcssDcs.polarity || 'N'}
                          onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                            ...channel.rxCtcssDcs,
                            polarity: e.target.value as 'N' | 'P',
                          })}
                          className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                          disabled={!channel.rxCtcssDcs.value}
                        >
                          <option value="N">N</option>
                          <option value="P">P</option>
                        </select>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-col gap-1">
                    <select
                      value={channel.txCtcssDcs.type}
                      onChange={(e) => {
                        const type = e.target.value as 'CTCSS' | 'DCS' | 'None';
                        handleCellChange(channel.number, 'txCtcssDcs', {
                          ...channel.txCtcssDcs,
                          type,
                          value: type === 'None' ? undefined : channel.txCtcssDcs.value,
                        });
                      }}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                    >
                      <option value="None">None</option>
                      <option value="CTCSS">CTCSS</option>
                      <option value="DCS">DCS</option>
                    </select>
                    {channel.txCtcssDcs.type === 'CTCSS' && (
                      <select
                        value={channel.txCtcssDcs.value || ''}
                        onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                          ...channel.txCtcssDcs,
                          value: e.target.value ? parseFloat(e.target.value) : undefined,
                        })}
                        className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                      >
                        <option value="">Select...</option>
                        {channel.txCtcssDcs.value && !CTCSS_FREQUENCIES.includes(channel.txCtcssDcs.value) && (
                          <option value={channel.txCtcssDcs.value}>
                            {formatCTCSSFrequency(channel.txCtcssDcs.value)} (Custom)
                          </option>
                        )}
                        {CTCSS_FREQUENCIES.map((freq) => (
                          <option key={freq} value={freq}>
                            {formatCTCSSFrequency(freq)}
                          </option>
                        ))}
                      </select>
                    )}
                    {channel.txCtcssDcs.type === 'DCS' && (
                      <div className="flex gap-1">
                        <select
                          value={channel.txCtcssDcs.value || ''}
                          onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                            ...channel.txCtcssDcs,
                            value: e.target.value ? parseInt(e.target.value) : undefined,
                          })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                        >
                          <option value="">Select...</option>
                          {channel.txCtcssDcs.value && !DCS_CODES.includes(channel.txCtcssDcs.value) && (
                            <option value={channel.txCtcssDcs.value}>
                              {formatDCSCode(channel.txCtcssDcs.value, channel.txCtcssDcs.polarity)} (Custom)
                            </option>
                          )}
                          {DCS_CODES.map((code) => (
                            <option key={code} value={code}>
                              {formatDCSCode(code)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={channel.txCtcssDcs.polarity || 'N'}
                          onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                            ...channel.txCtcssDcs,
                            polarity: e.target.value as 'N' | 'P',
                          })}
                          className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                          disabled={!channel.txCtcssDcs.value}
                        >
                          <option value="N">N</option>
                          <option value="P">P</option>
                        </select>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.forbidTx}
                    onChange={(e) => handleCellChange(channel.number, 'forbidTx', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.busyLock}
                    onChange={(e) => handleCellChange(channel.number, 'busyLock', e.target.value)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value="Off">Off</option>
                    <option value="Carrier">CXR</option>
                    <option value="Repeater">RPT</option>
                  </select>
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.loneWorker}
                    onChange={(e) => handleCellChange(channel.number, 'loneWorker', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.scanAdd}
                    onChange={(e) => handleCellChange(channel.number, 'scanAdd', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={channel.scanListId}
                    onChange={(e) => handleCellChange(channel.number, 'scanListId', parseInt(e.target.value) || 0)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.forbidTalkaround}
                    onChange={(e) => handleCellChange(channel.number, 'forbidTalkaround', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    max="2"
                    value={channel.reverseFreq}
                    onChange={(e) => handleCellChange(channel.number, 'reverseFreq', parseInt(e.target.value) || 0)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.emergencyIndicator}
                    onChange={(e) => handleCellChange(channel.number, 'emergencyIndicator', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.emergencyAck}
                    onChange={(e) => handleCellChange(channel.number, 'emergencyAck', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    max="31"
                    value={channel.emergencySystemId}
                    onChange={(e) => handleCellChange(channel.number, 'emergencySystemId', parseInt(e.target.value) || 0)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.aprsReceive}
                    onChange={(e) => handleCellChange(channel.number, 'aprsReceive', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.aprsReportMode === 'Digital'}
                    onChange={(e) => handleCellChange(channel.number, 'aprsReportMode', e.target.checked ? 'Digital' : 'Off')}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.voxFunction}
                    onChange={(e) => handleCellChange(channel.number, 'voxFunction', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center" title="Scramble">
                  <input
                    type="checkbox"
                    checked={channel.scramble}
                    onChange={(e) => handleCellChange(channel.number, 'scramble', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Scramble"
                  />
                </td>
                <td className="px-2 py-2 text-center" title="Compander">
                  <input
                    type="checkbox"
                    checked={channel.compander}
                    onChange={(e) => handleCellChange(channel.number, 'compander', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Compander"
                  />
                </td>
                <td className="px-2 py-2 text-center" title="Talkback">
                  <input
                    type="checkbox"
                    checked={channel.talkback}
                    onChange={(e) => handleCellChange(channel.number, 'talkback', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Talkback"
                  />
                </td>
                <td className="px-2 py-2 text-center" title="Compander Dup">
                  <input
                    type="checkbox"
                    checked={channel.companderDup}
                    onChange={(e) => handleCellChange(channel.number, 'companderDup', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Compander Dup"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={channel.squelchLevel}
                    onChange={(e) => handleCellChange(channel.number, 'squelchLevel', parseInt(e.target.value) || 0)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.pttIdDisplay}
                    onChange={(e) => handleCellChange(channel.number, 'pttIdDisplay', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    max="63"
                    value={channel.pttId}
                    onChange={(e) => handleCellChange(channel.number, 'pttId', parseInt(e.target.value) || 0)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.voxRelated}
                    onChange={(e) => handleCellChange(channel.number, 'voxRelated', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.rxSquelchMode}
                    onChange={(e) => handleCellChange(channel.number, 'rxSquelchMode', e.target.value)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value="Carrier/CTC">Carrier/CTC</option>
                    <option value="Optional">Optional</option>
                    <option value="CTC&Opt">CTC&Opt</option>
                    <option value="CTC|Opt">CTC|Opt</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.stepFrequency}
                    onChange={(e) => handleCellChange(channel.number, 'stepFrequency', parseInt(e.target.value) || 0)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value={0}>2.5K</option>
                    <option value={1}>5K</option>
                    <option value={2}>6.25K</option>
                    <option value={3}>10K</option>
                    <option value={4}>12.5K</option>
                    <option value={5}>25K</option>
                    <option value={6}>50K</option>
                    <option value={7}>100K</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.signalingType}
                    onChange={(e) => handleCellChange(channel.number, 'signalingType', e.target.value)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value="None">None</option>
                    <option value="DTMF">DTMF</option>
                    <option value="Two Tone">2Tone</option>
                    <option value="Five Tone">5Tone</option>
                    <option value="MDC1200">MDC</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.pttIdType}
                    onChange={(e) => handleCellChange(channel.number, 'pttIdType', e.target.value)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value="Off">Off</option>
                    <option value="BOT">BOT</option>
                    <option value="EOT">EOT</option>
                    <option value="Both">Both</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    max="249"
                    value={channel.contactId}
                    onChange={(e) => handleCellChange(channel.number, 'contactId', parseInt(e.target.value) || 0)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                  />
                </td>
                <td className="px-2 py-2 text-center sticky right-0 bg-deep-gray z-10">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setEditingChannel(channel)}
                      className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
                      title={`Edit ${isVFOChannel(channel.number) ? `VFO ${getVFOIdentifier(channel.number)}` : `channel ${channel.number}`}`}
                    >
                      ✎
                    </button>
                    {!isVFOChannel(channel.number) && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete channel ${channel.number}: "${channel.name}"?`)) {
                          deleteChannel(channel.number);
                        }
                      }}
                      className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-red-400 border border-red-600 border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
                      title={`Delete channel ${channel.number}`}
                    >
                      ×
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
        </div>
      </div>
      {editingChannel && (
        <ChannelEditModal
          isOpen={!!editingChannel}
          onClose={() => setEditingChannel(null)}
          channel={editingChannel}
          onSave={(updatedChannel) => {
            updateChannel(updatedChannel.number, updatedChannel);
            setEditingChannel(null);
          }}
        />
      )}
    </div>
  );
};