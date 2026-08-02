import React, { useState } from 'react';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useChannelsStore } from '../../store/channelsStore';

interface CpsComparisonPanelProps {
  /** Shared with the Channel Parser panel — owned by DiagnosticsTab. */
  selectedChannelNumber: number;
  setSelectedChannelNumber: (channelNumber: number) => void;
  showAlert: (message: string, title?: string) => void;
}

export const CpsComparisonPanel: React.FC<CpsComparisonPanelProps> = ({
  selectedChannelNumber,
  setSelectedChannelNumber,
  showAlert,
}) => {
  const { channels, rawChannelData } = useChannelsStore();
  const { caps } = useRadioCapabilities();
  const [showCpsComparison, setShowCpsComparison] = useState(false);
  const [cpsCsvData, setCpsCsvData] = useState<Map<number, Record<string, string>> | null>(null);

  if (!(rawChannelData && rawChannelData.size > 0)) return null;

  return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-yellow-400">CPS CSV Comparison</h3>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
              Verify mappings
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowCpsComparison(!showCpsComparison);
            }}
            className="text-sm text-yellow-400 hover:text-yellow-300"
          >
            {showCpsComparison ? '▼ Hide' : '▶ Show'}
          </button>
        </div>
        <p className="text-cool-gray text-sm mb-4">
          Upload a CSV export from the official Quansheng CPS software to compare against locally parsed channel data and identify byte mapping issues. This is NOT for Chirp CSV files.
        </p>

        <div className={`space-y-6 ${showCpsComparison ? '' : 'hidden'}`}>
          <div className="bg-deep-gray border border-yellow-600/30 rounded p-4">
            <label className="block text-sm text-cool-gray mb-2">Upload Official CPS Export CSV (from Quansheng CPS software)</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                  const content = event.target?.result as string;
                  if (!content) return;

                  // Parse CPS CSV format
                  const lines = content.split('\n').filter(line => line.trim());
                  if (lines.length < 2) {
                    showAlert('CSV must have at least a header row and one data row');
                    return;
                  }

                  const headers = lines[0].split(',').map(h => h.trim());
                  const cpsData = new Map<number, Record<string, string>>();

                  for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim());
                    if (values.length === 0 || values[0] === '') continue;

                    const channelNum = parseInt(values[0]);
                    if (isNaN(channelNum)) continue;

                    const channelData: Record<string, string> = {};
                    headers.forEach((header, idx) => {
                      channelData[header] = values[idx] || '';
                    });
                    cpsData.set(channelNum, channelData);
                  }

                  setCpsCsvData(cpsData);
                };
                reader.readAsText(file);
              }}
              className="w-full px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm focus:outline-none focus:border-yellow-400"
            />
            {cpsCsvData && (
              <p className="text-green-400 text-sm mt-2">
                ✓ Loaded {cpsCsvData.size} channels from CPS export
              </p>
            )}
          </div>

          {cpsCsvData && (
            <div className="bg-deep-gray border border-yellow-600/30 rounded p-4">
              <label className="block text-sm text-cool-gray mb-2">Select Channel to Compare</label>
              <select
                value={selectedChannelNumber}
                onChange={(e) => setSelectedChannelNumber(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm focus:outline-none focus:border-yellow-400 mb-4"
              >
                {Array.from(cpsCsvData.keys())
                  .sort((a, b) => a - b)
                  .map((chNum) => (
                    <option key={chNum} value={chNum}>
                      Channel {chNum} {cpsCsvData.get(chNum)?.['Channel Name'] ? `(${cpsCsvData.get(chNum)?.['Channel Name']})` : ''}
                    </option>
                  ))}
              </select>

              {(() => {
                const cpsChannel = cpsCsvData.get(selectedChannelNumber);
                const rawData = rawChannelData.get(selectedChannelNumber);
                const parsedChannel = channels.find(c => c.number === selectedChannelNumber);

                if (!cpsChannel) {
                  return <div className="text-cool-gray">Channel {selectedChannelNumber} not found in CPS export</div>;
                }
                if (!rawData || !parsedChannel) {
                  return <div className="text-cool-gray">Channel {selectedChannelNumber} not found in local data</div>;
                }

                // Parse our channel fields (reuse the helper from Channel Parser)
                const parseChannelFields = (channelBytes: Uint8Array) => {
                  const nameBytes = channelBytes.slice(0, 16);
                  const nullIndex = nameBytes.indexOf(0);
                  const name = new TextDecoder('ascii', { fatal: false })
                    .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : 16))
                    .replace(/\x00/g, '')
                    .trim();

                  let rxFreq = 0;
                  let txFreq = 0;
                  try {
                    rxFreq = caps?.diagnostics?.decodeBCDFrequency(channelBytes.slice(0x10, 0x14)) ?? 0;
                    txFreq = caps?.diagnostics?.decodeBCDFrequency(channelBytes.slice(0x14, 0x18)) ?? 0;
                  } catch (e) {
                    // Ignore
                  }

                  const modeFlags = channelBytes[0x18];
                  const channelMode = (modeFlags >> 4) & 0x0F;
                  const modeMap = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
                  const mode = modeMap[channelMode] || 'Analog';
                  const forbidTx = (modeFlags & 0x08) !== 0;
                  const loneWorker = (modeFlags & 0x01) !== 0;

                  const scanBw = channelBytes[0x19];
                  const bandwidth = (scanBw & 0x80) !== 0 ? '25kHz' : '12.5kHz';
                  const scanAdd = (scanBw & 0x40) !== 0;
                  const scanListId = (scanBw >> 2) & 0x0F;

                  const talkaroundAprs = channelBytes[0x1A];
                  const forbidTalkaround = (talkaroundAprs & 0x80) !== 0;
                  const aprsReceive = (talkaroundAprs & 0x04) !== 0;

                  const emergency = channelBytes[0x1B];
                  const emergencyIndicator = (emergency & 0x80) !== 0;
                  const emergencyAck = (emergency & 0x40) !== 0;
                  const emergencySystemId = emergency & 0x1F;

                  const modeFlagsForPower = channelBytes[0x18];
                  const powerValue = (modeFlagsForPower >> 1) & 0x03;
                  const power = powerValue === 0 ? 'Low' : powerValue === 1 ? 'Medium' : powerValue === 2 ? 'High' : 'Low';

                  const aprsSquelch = channelBytes[0x1C];
                  // Squelch Level: Bits 7-4
                  const squelchLevel = (aprsSquelch >> 4) & 0x0F;
                  // APRS Report Mode: Bits 3-2
                  const aprsReportValue = (aprsSquelch >> 2) & 0x03;
                  const aprsReportMode = aprsReportValue === 0 ? 'Off' : aprsReportValue === 1 ? 'Digital' : aprsReportValue === 2 ? 'Analog' : 'Off';

                  const isDigitalMode = mode === 'Digital' || mode === 'Fixed Digital';
                  const colorCode = isDigitalMode ? (channelBytes[0x1D] & 0x0F) : 0; // CC in 0x1D bits 3-0 (digital only)

                  let rxCtcssDcs: { type: 'None' | 'CTCSS' | 'DCS'; value?: number; polarity?: 'N' | 'P' } = { type: 'None' };
                  try {
                    rxCtcssDcs = caps?.diagnostics?.decodeCTCSSDCS(channelBytes.slice(0x21, 0x23)) ?? rxCtcssDcs;
                  } catch (e) {
                    // Ignore
                  }

                  let txCtcssDcs: { type: 'None' | 'CTCSS' | 'DCS'; value?: number; polarity?: 'N' | 'P' } = { type: 'None' };
                  try {
                    txCtcssDcs = caps?.diagnostics?.decodeCTCSSDCS(channelBytes.slice(0x23, 0x25)) ?? txCtcssDcs;
                  } catch (e) {
                    // Ignore
                  }

                  const additionalFlags = channelBytes[0x25];
                  const companderDup = (additionalFlags & 0x20) !== 0;
                  const voxRelated = (additionalFlags & 0x10) !== 0;

                  const rxSquelchPtt = channelBytes[0x26];
                  const pttIdDisplay2 = (rxSquelchPtt & 0x80) !== 0;
                  const rxSquelchValue = (rxSquelchPtt >> 4) & 0x07;
                  const rxSquelchModeMap = ['Carrier/CTC', 'Optional', 'CTC&Opt', 'CTC|Opt'];
                  const rxSquelchMode = rxSquelchModeMap[rxSquelchValue] || 'Carrier/CTC';

                  const signaling = channelBytes[0x27];
                  const stepFrequency = (signaling >> 4) & 0x0F;
                  const signalingValue = signaling & 0x0F;
                  const signalingTypeMap = ['None', 'DTMF', 'Two Tone', 'Five Tone', 'MDC1200'];
                  const signalingType = signalingTypeMap[signalingValue] || 'None';

                  const pttIdTypeByte = channelBytes[0x29];
                  const pttIdTypeValue = (pttIdTypeByte >> 4) & 0x0F;
                  const pttIdTypeMap = ['Off', 'BOT', 'EOT', 'Both'];
                  const pttIdType = pttIdTypeMap[pttIdTypeValue] || 'Off';

                  const dmrRadioIdIndex = channelBytes[0x2B]; // DMR Radio ID Index for TX (0-255, 0=None)

                  return {
                    name, rxFreq, txFreq, mode, forbidTx, loneWorker,
                    bandwidth, scanAdd, scanListId, forbidTalkaround, aprsReceive,
                    emergencyIndicator, emergencyAck, emergencySystemId,
                    power, aprsReportMode, squelchLevel, colorCode,
                    rxCtcssDcs, txCtcssDcs, companderDup, voxRelated,
                    pttIdDisplay2, rxSquelchMode, stepFrequency, signalingType,
                    pttIdType, dmrRadioIdIndex,
                    contactId: 0 // Contact ID comes from blocks 0x42/0x43, not from channel bytes
                  };
                };

                const ourFields = parseChannelFields(rawData.data);

                // Map CPS fields to our fields and compare
                const fieldMappings = [
                  { cpsField: 'Channel Name', ourField: 'name', offset: '0x00-0x0F', getOurValue: () => ourFields.name, getCpsValue: () => cpsChannel['Channel Name'] },
                  { cpsField: 'RX Frequency[MHz]', ourField: 'rxFreq', offset: '0x10-0x13', getOurValue: () => ourFields.rxFreq.toFixed(5), getCpsValue: () => parseFloat(cpsChannel['RX Frequency[MHz]'] || '0').toFixed(5) },
                  { cpsField: 'TX Frequency[MHz]', ourField: 'txFreq', offset: '0x14-0x17', getOurValue: () => ourFields.txFreq.toFixed(5), getCpsValue: () => parseFloat(cpsChannel['TX Frequency[MHz]'] || '0').toFixed(5) },
                  { cpsField: 'Channel Type', ourField: 'mode', offset: '0x18 bits 7-4', getOurValue: () => ourFields.mode, getCpsValue: () => cpsChannel['Channel Type'] },
                  { cpsField: 'Power', ourField: 'power', offset: '0x18 bits 2-1', getOurValue: () => ourFields.power, getCpsValue: () => {
                    const cpsPower = cpsChannel['Power'];
                    // Map "Middle" to "Medium"
                    return cpsPower === 'Middle' ? 'Medium' : cpsPower;
                  }},
                  { cpsField: 'Band Width', ourField: 'bandwidth', offset: '0x19 bit 7', getOurValue: () => ourFields.bandwidth, getCpsValue: () => {
                    const cpsBw = cpsChannel['Band Width'];
                    // Normalize case
                    return cpsBw === '12.5KHz' ? '12.5kHz' : cpsBw === '25KHz' ? '25kHz' : cpsBw;
                  }},
                  { cpsField: 'Forbid TX', ourField: 'forbidTx', offset: '0x18 bit 3', getOurValue: () => ourFields.forbidTx ? '1' : '0', getCpsValue: () => cpsChannel['Forbid TX'] },
                  { cpsField: 'Lone Work', ourField: 'loneWorker', offset: '0x18 bit 0', getOurValue: () => ourFields.loneWorker ? '1' : '0', getCpsValue: () => cpsChannel['Lone Work'] },
                  { cpsField: 'Auto Scan', ourField: 'scanAdd', offset: '0x19 bit 6', getOurValue: () => ourFields.scanAdd ? '1' : '0', getCpsValue: () => cpsChannel['Auto Scan'] },
                  { cpsField: 'Scan List', ourField: 'scanListId', offset: '0x19 bits 5-2', getOurValue: () => ourFields.scanListId.toString(), getCpsValue: () => cpsChannel['Scan List'] === 'None' ? '0' : cpsChannel['Scan List'] },
                  { cpsField: 'Forbid Talkaround', ourField: 'forbidTalkaround', offset: '0x1A bit 7', getOurValue: () => ourFields.forbidTalkaround ? '1' : '0', getCpsValue: () => cpsChannel['Forbid Talkaround'] },
                  { cpsField: 'APRS Receive', ourField: 'aprsReceive', offset: '0x1A bit 2', getOurValue: () => ourFields.aprsReceive ? '1' : '0', getCpsValue: () => cpsChannel['APRS Receive'] },
                  { cpsField: 'Emergency Indicator', ourField: 'emergencyIndicator', offset: '0x1B bit 7', getOurValue: () => ourFields.emergencyIndicator ? '1' : '0', getCpsValue: () => cpsChannel['Emergency Indicator'] },
                  { cpsField: 'Emergency ACK', ourField: 'emergencyAck', offset: '0x1B bit 6', getOurValue: () => ourFields.emergencyAck ? '1' : '0', getCpsValue: () => cpsChannel['Emergency ACK'] },
                  { cpsField: 'Emergency System', ourField: 'emergencySystemId', offset: '0x1B bits 0-5', getOurValue: () => ourFields.emergencySystemId.toString(), getCpsValue: () => cpsChannel['Emergency System'] === 'None' ? '0' : cpsChannel['Emergency System'] },
                  { cpsField: 'APRS Report Type', ourField: 'aprsReportMode', offset: '0x1C bits 3-2', getOurValue: () => ourFields.aprsReportMode, getCpsValue: () => cpsChannel['APRS Report Type'] },
                  { cpsField: 'Squelch Level', ourField: 'squelchLevel', offset: '0x1C bits 7-4', getOurValue: () => {
                    // Read from 0x1C bits 7-4 (squelch level is stored here, not 0x1E)
                    const aprsSquelch = rawData.data[0x1C];
                    const rawSquelch = (aprsSquelch >> 4) & 0x0F;
                    return rawSquelch.toString();
                  }, getCpsValue: () => cpsChannel['Squelch Level'] },
                  { cpsField: 'Color Code', ourField: 'colorCode', offset: '0x1D bits 3-0 (digital only)', getOurValue: () => ourFields.colorCode.toString(), getCpsValue: () => cpsChannel['Color Code'] },
                  { cpsField: 'CTC/DCS Decode', ourField: 'rxCtcssDcs', offset: '0x21-0x22', getOurValue: () => {
                    if (ourFields.rxCtcssDcs.type === 'None') return 'None';
                    if (ourFields.rxCtcssDcs.type === 'CTCSS') return ourFields.rxCtcssDcs.value?.toFixed(1) || 'None';
                    return `${ourFields.rxCtcssDcs.value || 0}${ourFields.rxCtcssDcs.polarity || 'N'}`;
                  }, getCpsValue: () => {
                    const cpsValue = cpsChannel['CTC/DCS Decode'];
                    // Treat "00.0" as equivalent to "None"
                    return cpsValue === '00.0' ? 'None' : cpsValue;
                  }},
                  { cpsField: 'CTC/DCS Encode', ourField: 'txCtcssDcs', offset: '0x23-0x24', getOurValue: () => {
                    if (ourFields.txCtcssDcs.type === 'None') return 'None';
                    if (ourFields.txCtcssDcs.type === 'CTCSS') return ourFields.txCtcssDcs.value?.toFixed(1) || 'None';
                    return `${ourFields.txCtcssDcs.value || 0}${ourFields.txCtcssDcs.polarity || 'N'}`;
                  }, getCpsValue: () => {
                    const cpsValue = cpsChannel['CTC/DCS Encode'];
                    // Treat "00.0" as equivalent to "None"
                    return cpsValue === '00.0' ? 'None' : cpsValue;
                  }},
                  { cpsField: 'RX Squelch Mode', ourField: 'rxSquelchMode', offset: '0x26 bits 6-4', getOurValue: () => ourFields.rxSquelchMode, getCpsValue: () => cpsChannel['RX Squelch Mode'] },
                  { cpsField: 'Signaling Type', ourField: 'signalingType', offset: '0x27 bits 0-3', getOurValue: () => ourFields.signalingType, getCpsValue: () => cpsChannel['Signaling Type'] },
                  { cpsField: 'PTT ID', ourField: 'pttIdType', offset: '0x29 bits 7-4', getOurValue: () => ourFields.pttIdType, getCpsValue: () => cpsChannel['PTT ID'] },
                  { cpsField: 'PTT ID Display', ourField: 'pttIdDisplay2', offset: '0x26 bit 7', getOurValue: () => ourFields.pttIdDisplay2 ? '1' : '0', getCpsValue: () => cpsChannel['PTT ID Display'] },
                  { cpsField: 'VOX Function', ourField: 'voxFunction', offset: '0x1D bit 7', getOurValue: () => ourFields.voxRelated ? '1' : '0', getCpsValue: () => cpsChannel['VOX Function'] },
                  { cpsField: 'Scramble', ourField: 'scramble', offset: '0x1D bit 6', getOurValue: () => {
                    const scrambleByte = rawData.data[0x1D];
                    return (scrambleByte & 0x40) !== 0 ? '1' : '0';
                  }, getCpsValue: () => cpsChannel['Scramble'] === 'None' ? '0' : '1' },
                  { cpsField: 'TX Contact', ourField: 'contactId', offset: 'blocks 0x42/0x43', getOurValue: () => ourFields.contactId.toString(), getCpsValue: () => {
                    const txContact = cpsChannel['TX Contact'];
                    return txContact === 'None' ? '0' : txContact.replace('Contacts ', '');
                  }},
                ];

                const differences = fieldMappings.filter(mapping => {
                  const ourVal = mapping.getOurValue();
                  const cpsVal = mapping.getCpsValue();
                  return ourVal !== cpsVal;
                });

                return (
                  <div className="space-y-4">
                    <div className="bg-yellow-900/20 border border-yellow-600/50 rounded p-4">
                      <h4 className="text-yellow-400 font-semibold mb-2">Channel {selectedChannelNumber} Comparison</h4>
                      <div className="text-sm text-cool-gray mb-2">
                        <span className="text-green-400">✓ {fieldMappings.length - differences.length} fields match</span>
                        {differences.length > 0 && (
                          <span className="text-red-400 ml-4">✗ {differences.length} differences found</span>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-yellow-600/30">
                            <th className="text-left py-2 px-3 text-yellow-400">Field</th>
                            <th className="text-left py-2 px-3 text-yellow-400">Byte Offset</th>
                            <th className="text-left py-2 px-3 text-green-400">CPS Value</th>
                            <th className="text-left py-2 px-3 text-blue-400">Our Value</th>
                            <th className="text-left py-2 px-3 text-red-400">Match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fieldMappings.map((mapping, idx) => {
                            const ourVal = mapping.getOurValue();
                            const cpsVal = mapping.getCpsValue();
                            const matches = ourVal === cpsVal;
                            return (
                              <tr
                                key={idx}
                                className={`border-b border-yellow-600/10 ${!matches ? 'bg-red-900/20' : ''}`}
                              >
                                <td className="py-2 px-3 text-cool-gray">{mapping.cpsField}</td>
                                <td className="py-2 px-3 text-yellow-300 font-mono text-xs">{mapping.offset}</td>
                                <td className="py-2 px-3 text-green-300">{cpsVal}</td>
                                <td className="py-2 px-3 text-blue-300">{ourVal}</td>
                                <td className="py-2 px-3">
                                  {matches ? (
                                    <span className="text-green-400">✓</span>
                                  ) : (
                                    <span className="text-red-400">✗</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
  );
};
