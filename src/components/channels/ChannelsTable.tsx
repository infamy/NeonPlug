import React from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import type { Channel } from '../../models/Channel';

export const ChannelsTable: React.FC = () => {
  const { channels, updateChannel } = useChannelsStore();

  const handleCellChange = (
    channelNumber: number,
    field: keyof Channel,
    value: string | number | boolean | Channel['rxCtcssDcs']
  ) => {
    updateChannel(channelNumber, { [field]: value });
  };

  const formatFrequency = (freq: number): string => {
    return freq.toFixed(4);
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
    <div className="bg-deep-gray rounded-lg border border-neon-cyan overflow-auto max-h-[calc(100vh-200px)]">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20">
          <tr className="bg-dark-charcoal border-b border-neon-cyan">
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-0 bg-dark-charcoal z-30 min-w-[40px]">#</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-[40px] bg-dark-charcoal z-30 min-w-[120px]">Name</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[90px]">RX Freq</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[90px]">TX Freq</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[110px]">Mode</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">BW</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">PWR</th>
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
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Scramble</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Compander</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Talkback</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">SQL</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">PTT ID Display</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">PTT ID</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">Color Code</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">RX CTCSS/DCS</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">TX CTCSS/DCS</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Compander Dup</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">VOX Related</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">RX Squelch Mode</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Step Frequency</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]">Signaling Type</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]">PTT ID Type</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Contact ID</th>
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
                <td className="px-2 py-2 text-white sticky left-0 bg-deep-gray z-10 text-sm font-medium">{channel.number}</td>
                <td className="px-2 py-2 sticky left-[40px] bg-deep-gray z-10">
                  <input
                    type="text"
                    value={channel.name}
                    onChange={(e) => handleCellChange(channel.number, 'name', e.target.value)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                    maxLength={16}
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
                <td className="px-2 py-2">
                  <select
                    value={channel.mode}
                    onChange={(e) => handleCellChange(channel.number, 'mode', e.target.value)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value="Analog">Analog</option>
                    <option value="Digital">Digital</option>
                    <option value="Fixed Analog">Fixed Analog</option>
                    <option value="Fixed Digital">Fixed Digital</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.bandwidth}
                    onChange={(e) => handleCellChange(channel.number, 'bandwidth', e.target.value)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value="25kHz">25kHz</option>
                    <option value="12.5kHz">12.5kHz</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.power}
                    onChange={(e) => handleCellChange(channel.number, 'power', e.target.value)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
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
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.scramble}
                    onChange={(e) => handleCellChange(channel.number, 'scramble', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.compander}
                    onChange={(e) => handleCellChange(channel.number, 'compander', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.talkback}
                    onChange={(e) => handleCellChange(channel.number, 'talkback', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
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
                    {channel.rxCtcssDcs.type !== 'None' && (
                      <input
                        type="number"
                        step={channel.rxCtcssDcs.type === 'CTCSS' ? '0.1' : '1'}
                        value={channel.rxCtcssDcs.value || ''}
                        onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                          ...channel.rxCtcssDcs,
                          value: parseFloat(e.target.value) || 0,
                        })}
                        className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                        placeholder={channel.rxCtcssDcs.type === 'CTCSS' ? 'Hz' : 'Code'}
                      />
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
                    {channel.txCtcssDcs.type !== 'None' && (
                      <input
                        type="number"
                        step={channel.txCtcssDcs.type === 'CTCSS' ? '0.1' : '1'}
                        value={channel.txCtcssDcs.value || ''}
                        onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                          ...channel.txCtcssDcs,
                          value: parseFloat(e.target.value) || 0,
                        })}
                        className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                        placeholder={channel.txCtcssDcs.type === 'CTCSS' ? 'Hz' : 'Code'}
                      />
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.companderDup}
                    onChange={(e) => handleCellChange(channel.number, 'companderDup', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
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
                    <option value="Two Tone">Two Tone</option>
                    <option value="Five Tone">Five Tone</option>
                    <option value="MDC1200">MDC1200</option>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
