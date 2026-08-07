import React, { useState } from 'react';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useChannelsStore } from '../../store/channelsStore';
import { CollapsibleSection } from './CollapsibleSection';

interface ChannelParserPanelProps {
  /** Shared with the CPS CSV Comparison panel — owned by DiagnosticsTab. */
  selectedChannelNumber: number;
  setSelectedChannelNumber: (channelNumber: number) => void;
  /** Derived in DiagnosticsTab from blockMetadata/blockData. */
  block41Data: Uint8Array | null;
  block41Address: number | null;
}

export const ChannelParserPanel: React.FC<ChannelParserPanelProps> = ({
  selectedChannelNumber,
  setSelectedChannelNumber,
  block41Data,
  block41Address,
}) => {
  const { settings: radioSettings } = useRadioSettingsStore();
  const { channels, rawChannelData } = useChannelsStore();
  const { caps } = useRadioCapabilities();
  const [showChannelParser, setShowChannelParser] = useState(false);
  const [selectedChannelNumber2, setSelectedChannelNumber2] = useState<number | null>(null);

  // Only rendered from the main DiagnosticsTab branch, where settings are guaranteed present.
  if (!radioSettings) return null;
  if (rawChannelData.size === 0) return null;

  return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-yellow-400">Channel Parser</h3>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
              {rawChannelData.size} channels
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowChannelParser(!showChannelParser);
            }}
            className="text-sm text-yellow-400 hover:text-yellow-300"
          >
            {showChannelParser ? '▼ Hide' : '▶ Show'}
          </button>
        </div>
        <p className="text-cool-gray text-sm mb-4">
          Inspect raw channel data to debug power level and other field parsing issues.
        </p>

        <div className={`space-y-6 ${showChannelParser ? '' : 'hidden'}`}>
          <CollapsibleSection title="Channel Comparison" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-cool-gray mb-2">Channel 1</label>
                <select
                  value={selectedChannelNumber}
                  onChange={(e) => setSelectedChannelNumber(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm focus:outline-none focus:border-yellow-400"
                >
                  {(() => {
                    const channelNumbers = Array.from(rawChannelData.keys());
                    const vfoNumbers: number[] = [];
                    // Add VFO A and VFO B if block 0x41 data is available
                    if (block41Data) {
                      if (!channelNumbers.includes(4001)) vfoNumbers.push(4001);
                      if (!channelNumbers.includes(4002)) vfoNumbers.push(4002);
                    }
                    // Separate VFOs from regular channels and sort
                    const regularChannels = channelNumbers.filter(n => n !== 4001 && n !== 4002).sort((a, b) => a - b);
                    // VFOs first, then regular channels
                    const sortedChannels = [...vfoNumbers, ...regularChannels];
                    return sortedChannels.map((chNum) => {
                      const channel = channels.find(c => c.number === chNum);
                      const vfoName = chNum === 4001 ? radioSettings.vfoA?.name : chNum === 4002 ? radioSettings.vfoB?.name : null;
                      const displayName = channel?.name || vfoName || '';
                      const label = chNum === 4001 ? 'VFO A' : chNum === 4002 ? 'VFO B' : `Channel ${chNum}`;
                      return (
                        <option key={chNum} value={chNum}>
                          {label} {displayName && chNum !== 4001 && chNum !== 4002 ? `(${displayName})` : ''}
                        </option>
                      );
                    });
                  })()}
                </select>
              </div>
              <div>
                <label className="block text-sm text-cool-gray mb-2">Channel 2 (for comparison)</label>
                <select
                  value={selectedChannelNumber2 || ''}
                  onChange={(e) => setSelectedChannelNumber2(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm focus:outline-none focus:border-yellow-400"
                >
                  <option value="">None</option>
                  {(() => {
                    const channelNumbers = Array.from(rawChannelData.keys());
                    const vfoNumbers: number[] = [];
                    // Add VFO A and VFO B if block 0x41 data is available
                    if (block41Data) {
                      if (!channelNumbers.includes(4001)) vfoNumbers.push(4001);
                      if (!channelNumbers.includes(4002)) vfoNumbers.push(4002);
                    }
                    // Separate VFOs from regular channels and sort
                    const regularChannels = channelNumbers.filter(n => n !== 4001 && n !== 4002).sort((a, b) => a - b);
                    // VFOs first, then regular channels
                    const sortedChannels = [...vfoNumbers, ...regularChannels]
                      .filter(chNum => chNum !== selectedChannelNumber);
                    return sortedChannels.map((chNum) => {
                      const channel = channels.find(c => c.number === chNum);
                      const vfoName = chNum === 4001 ? radioSettings.vfoA?.name : chNum === 4002 ? radioSettings.vfoB?.name : null;
                      const displayName = channel?.name || vfoName || '';
                      const label = chNum === 4001 ? 'VFO A' : chNum === 4002 ? 'VFO B' : `Channel ${chNum}`;
                      return (
                        <option key={chNum} value={chNum}>
                          {label} {displayName && chNum !== 4001 && chNum !== 4002 ? `(${displayName})` : ''}
                        </option>
                      );
                    });
                  })()}
                </select>
              </div>
            </div>

            {(() => {
              // Extract VFO A and VFO B from block 0x41 if available
              const getVFOData = (channelNumber: number): { data: Uint8Array; blockAddr: number; offset: number } | null => {
                if (!block41Data) return null;

                if (channelNumber === 4001) {
                  // VFO A - offset 0x0F9F
                  const vfoAOffset = 0x0F9F;
                  if (block41Data.length >= vfoAOffset + 48) {
                    const vfoAData = block41Data.slice(vfoAOffset, vfoAOffset + 48);
                    return {
                      data: vfoAData,
                      blockAddr: block41Address || 0,
                      offset: vfoAOffset,
                    };
                  }
                } else if (channelNumber === 4002) {
                  // VFO B - offset 0x0FCF
                  const vfoBOffset = 0x0FCF;
                  if (block41Data.length >= vfoBOffset + 48) {
                    const vfoBData = block41Data.slice(vfoBOffset, vfoBOffset + 48);
                    return {
                      data: vfoBData,
                      blockAddr: block41Address || 0,
                      offset: vfoBOffset,
                    };
                  }
                }
                return null;
              };

              // Helper function to parse all known channel fields
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
                const scanListId = scanBw & 0x3F;

                const talkaroundAprs = channelBytes[0x1A];
                const forbidTalkaround = (talkaroundAprs & 0x80) !== 0;
                const aprsReceive = (talkaroundAprs & 0x04) !== 0;

                const emergency = channelBytes[0x1B];
                const emergencyIndicator = (emergency & 0x80) !== 0;
                const emergencyAck = (emergency & 0x40) !== 0;
                const emergencySystemId = emergency & 0x1F;

                // Power is stored at 0x18, bits 2-1 (NOT 0x29!)
                const modeFlagsForPower = channelBytes[0x18];
                const powerValue = (modeFlagsForPower >> 1) & 0x03;
                const power = powerValue === 0 ? 'Low' : powerValue === 1 ? 'Medium' : powerValue === 2 ? 'High' : 'Low';

                // APRS Report Mode is at 0x1C, bits 3-2
                const powerAprs = channelBytes[0x1C];
                const aprsReportValue = (powerAprs >> 2) & 0x03;
                const aprsReportMode = aprsReportValue === 0 ? 'Off' : aprsReportValue === 1 ? 'Digital' : aprsReportValue === 2 ? 'Analog' : 'Off';

                const isDigital = mode === 'Digital' || mode === 'Fixed Digital';
                const analogFeatures = channelBytes[0x1D];
                const squelchLevel = channelBytes[0x1E];
                const pttIdSettings = channelBytes[0x1F];

                const colorCode = isDigital ? (analogFeatures & 0x0F) : 0; // CC in 0x1D bits 3-0 (digital only)

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

                const unknown2A = channelBytes[0x2A];
                const dmrRadioIdIndex = channelBytes[0x2B]; // DMR Radio ID Index for TX (0-255, 0=None)
                const reserved2C = channelBytes[0x2C];
                const reserved2D = channelBytes[0x2D];

                // Digital-only fields (only valid when mode is Digital or Fixed Digital)
                let rxGroupListId: number | undefined;
                let slotOperation: number | undefined;
                let encryption: boolean | undefined;
                let encryptionId: number | undefined;
                let tdmaDirectMode: boolean | undefined;
                let shortDataConfirm: boolean | undefined;
                let privateConfirm: boolean | undefined;

                if (isDigital) {
                  // Digital mode: Parse digital-specific fields from bytes 0x1D, 0x1F
                  const digitalFeatures = channelBytes[0x1D];
                  encryption = (digitalFeatures & 0x80) !== 0; // Bit 7
                  shortDataConfirm = (digitalFeatures & 0x40) !== 0; // Bit 6
                  tdmaDirectMode = (digitalFeatures & 0x20) !== 0; // Bit 5
                  slotOperation = (digitalFeatures & 0x10) !== 0 ? 1 : 0; // Bit 4: Timeslot (0=TS1, 1=TS2)

                  // Byte 0x1F: RX Group List ID (bits 5-0) and Private Confirm (bit 6)
                  const digitalSettings = channelBytes[0x1F];
                  privateConfirm = (digitalSettings & 0x40) !== 0; // Bit 6
                  rxGroupListId = digitalSettings & 0x3F; // Bits 5-0 (mask 0x3F): RX Group List ID

                  // Encryption ID (0x2A) - Digital only
                  // 0 = None (no encryption)
                  // 1-8 = Encryption Key ID (references encryption keys 1-8)
                  let encId = channelBytes[0x2A];
                  if (encId > 8) encId = 0; // Validate: 0-8
                  encryptionId = encId;
                }

                return {
                  name,
                  rxFreq,
                  txFreq,
                  mode,
                  forbidTx,
                  loneWorker,
                  bandwidth,
                  scanAdd,
                  scanListId,
                  forbidTalkaround,
                  aprsReceive,
                  emergencyIndicator,
                  emergencyAck,
                  emergencySystemId,
                  power,
                  powerValue,
                  powerAprsByte: powerAprs,
                  aprsReportMode,
                  analogFeatures,
                  squelchLevel,
                  pttIdSettings,
                  colorCode,
                  rxCtcssDcs,
                  txCtcssDcs,
                  companderDup,
                  voxRelated,
                  pttIdDisplay2,
                  rxSquelchMode,
                  stepFrequency,
                  signalingType,
                  pttIdType,
                  unknown2A,
                  dmrRadioIdIndex,
                  contactId: 0, // Contact ID comes from blocks 0x42/0x43, not from channel bytes
                  reserved2C,
                  reserved2D,
                  // Digital-only fields
                  isDigital,
                  rxGroupListId,
                  slotOperation,
                  encryption,
                  encryptionId,
                  tdmaDirectMode,
                  shortDataConfirm,
                  privateConfirm,
                  // Raw bytes for all 48 bytes (0x00-0x2F)
                  bytes: Object.fromEntries(
                    Array.from({ length: 48 }, (_, i) => [i, channelBytes[i] ?? 0])
                  ) as Record<number, number>,
                  // Full raw data for hex dump
                  rawBytes: channelBytes
                };
              };

              // Get raw data - check rawChannelData first, then VFO data from block 0x41
              let rawData1 = rawChannelData.get(selectedChannelNumber);
              if (!rawData1 && (selectedChannelNumber === 4001 || selectedChannelNumber === 4002)) {
                const vfoData = getVFOData(selectedChannelNumber);
                if (vfoData) {
                  rawData1 = vfoData;
                }
              }

              let rawData2 = selectedChannelNumber2 ? rawChannelData.get(selectedChannelNumber2) : undefined;
              if (!rawData2 && selectedChannelNumber2 && (selectedChannelNumber2 === 4001 || selectedChannelNumber2 === 4002)) {
                const vfoData = getVFOData(selectedChannelNumber2);
                if (vfoData) {
                  rawData2 = vfoData;
                }
              }

              const channel1 = channels.find(c => c.number === selectedChannelNumber) || radioSettings.vfoA || radioSettings.vfoB;
              const channel2 = selectedChannelNumber2 ? (channels.find(c => c.number === selectedChannelNumber2) || (selectedChannelNumber2 === 4001 ? radioSettings.vfoA : selectedChannelNumber2 === 4002 ? radioSettings.vfoB : null)) : null;

              if (!rawData1) return <div className="text-cool-gray">No raw data for channel {selectedChannelNumber}</div>;

              const fields1 = parseChannelFields(rawData1.data);
              const fields2 = rawData2 ? parseChannelFields(rawData2.data) : null;

              // Check if either selected channel is a VFO
              const isVFO1 = selectedChannelNumber === 4001 || selectedChannelNumber === 4002;
              const isVFO2 = selectedChannelNumber2 === 4001 || selectedChannelNumber2 === 4002;
              const hideName = isVFO1 || isVFO2;

              const fieldDefinitions = [
                // Only show name field if neither channel is a VFO
                ...(hideName ? [] : [{ offset: 0x00, label: 'Name (0x00-0x0F)', getValue: (f: typeof fields1) => f.name }]),
                { offset: 0x10, label: 'RX Frequency (0x10-0x13)', getValue: (f: typeof fields1) => f.rxFreq.toFixed(4) + ' MHz' },
                { offset: 0x14, label: 'TX Frequency (0x14-0x17)', getValue: (f: typeof fields1) => f.txFreq.toFixed(4) + ' MHz' },
                { offset: 0x18, label: 'Mode Flags (0x18)', getValue: (f: typeof fields1) => {
                  const modeFlags = f.bytes[0x18];
                  return `0x${modeFlags.toString(16).toUpperCase().padStart(2, '0')} (mode=${f.mode}, forbidTx=${f.forbidTx}, power=${f.power}, loneWorker=${f.loneWorker})`;
                }},
                { offset: 0x18, label: 'Mode (0x18 bits 7-4)', getValue: (f: typeof fields1) => f.mode },
                { offset: 0x18, label: 'Forbid TX (0x18 bit 3)', getValue: (f: typeof fields1) => f.forbidTx ? 'Yes' : 'No' },
                { offset: 0x18, label: 'Power (0x18 bits 2-1)', getValue: (f: typeof fields1) => `${f.power} (value: ${f.powerValue})` },
                { offset: 0x18, label: 'Lone Worker (0x18 bit 0)', getValue: (f: typeof fields1) => f.loneWorker ? 'Yes' : 'No' },
                { offset: 0x19, label: 'Scan & Bandwidth (0x19)', getValue: (f: typeof fields1) => {
                  const scanBw = f.bytes[0x19];
                  return `0x${scanBw.toString(16).toUpperCase().padStart(2, '0')} (bandwidth=${f.bandwidth}, scanAdd=${f.scanAdd}, scanListId=${f.scanListId})`;
                }},
                { offset: 0x19, label: 'Bandwidth (0x19 bit 7)', getValue: (f: typeof fields1) => f.bandwidth },
                { offset: 0x19, label: 'Scan Add (0x19 bit 6)', getValue: (f: typeof fields1) => f.scanAdd ? 'Yes' : 'No' },
                { offset: 0x19, label: 'Scan List ID (0x19 bits 5-0)', getValue: (f: typeof fields1) => f.scanListId.toString() },
                { offset: 0x1A, label: 'Talkaround & APRS (0x1A)', getValue: (f: typeof fields1) => {
                  const talkaroundAprs = f.bytes[0x1A];
                  return `0x${talkaroundAprs.toString(16).toUpperCase().padStart(2, '0')} (forbidTalkaround=${f.forbidTalkaround}, aprsReceive=${f.aprsReceive})`;
                }},
                { offset: 0x1A, label: 'Forbid Talkaround (0x1A bit 7)', getValue: (f: typeof fields1) => f.forbidTalkaround ? 'Yes' : 'No' },
                { offset: 0x1A, label: 'APRS Receive (0x1A bit 2)', getValue: (f: typeof fields1) => f.aprsReceive ? 'Yes' : 'No' },
                { offset: 0x1B, label: 'Emergency (0x1B)', getValue: (f: typeof fields1) => {
                  const emergency = f.bytes[0x1B];
                  return `0x${emergency.toString(16).toUpperCase().padStart(2, '0')} (indicator=${f.emergencyIndicator}, ack=${f.emergencyAck}, systemId=${f.emergencySystemId})`;
                }},
                { offset: 0x1B, label: 'Emergency Indicator (0x1B bit 7)', getValue: (f: typeof fields1) => f.emergencyIndicator ? 'Yes' : 'No' },
                { offset: 0x1B, label: 'Emergency Ack (0x1B bit 6)', getValue: (f: typeof fields1) => f.emergencyAck ? 'Yes' : 'No' },
                { offset: 0x1B, label: 'Emergency System ID (0x1B bits 4-0)', getValue: (f: typeof fields1) => f.emergencySystemId.toString() },
                { offset: 0x1C, label: 'APRS & Squelch (0x1C) - Full Byte', getValue: (f: typeof fields1) => {
                  const aprsSquelch = f.bytes[0x1C];
                  const bits3_2 = (aprsSquelch >> 2) & 0x03;
                  const bits7_4 = (aprsSquelch >> 4) & 0x0F;
                  const bits1_0 = aprsSquelch & 0x03;
                  return `0x${aprsSquelch.toString(16).toUpperCase().padStart(2, '0')} (bits7-4=squelch=${bits7_4}, bits3-2=${bits3_2}, bits1-0=${bits1_0})`;
                }},
                { offset: 0x1C, label: 'APRS Report Mode (0x1C bits 3-2) [CURRENT]', getValue: (f: typeof fields1) => {
                  const aprsSquelch = f.bytes[0x1C];
                  const bits3_2 = (aprsSquelch >> 2) & 0x03;
                  return `${f.aprsReportMode} (bits3-2=${bits3_2}, full byte=0x${aprsSquelch.toString(16).toUpperCase().padStart(2, '0')})`;
                }},
                { offset: 0x1C, label: 'Timeslot? (0x1C bits 3-2) [SUSPECTED TS LOCATION]', getValue: (f: typeof fields1) => {
                  if (!f.isDigital) return 'N/A (Analog mode)';
                  const aprsSquelch = f.bytes[0x1C];
                  const bits3_2 = (aprsSquelch >> 2) & 0x03;
                  // Interpret as timeslot: 0=TS2, 1=TS1 (based on user observation)
                  let tsInterpretation = '';
                  if (bits3_2 === 0) {
                    tsInterpretation = 'TS2? (Raw=0)';
                  } else if (bits3_2 === 1) {
                    tsInterpretation = 'TS1? (Raw=1)';
                  } else if (bits3_2 === 2) {
                    tsInterpretation = `Raw=2 (unusual for TS)`;
                  } else {
                    tsInterpretation = `Raw=3 (unusual for TS)`;
                  }
                  return `${tsInterpretation} [bits 3-2: ${bits3_2}, full 0x1C: 0x${aprsSquelch.toString(16).toUpperCase().padStart(2, '0')}] | Current slotOperation (0x1D bits 3-0): ${f.slotOperation ?? 'N/A'}`;
                }},
                { offset: 0x1D, label: 'Analog Features (0x1D) - Analog Only', getValue: (f: typeof fields1) => {
                  if (f.isDigital) return 'N/A (Digital mode - see Digital Features below)';
                  return `0x${f.analogFeatures.toString(16).toUpperCase().padStart(2, '0')}`;
                }},
                { offset: 0x1E, label: 'Squelch Level (0x1E) - Analog Only', getValue: (f: typeof fields1) => {
                  if (f.isDigital) return 'N/A (Digital mode - see Encryption ID below)';
                  return f.squelchLevel.toString();
                }},
                { offset: 0x1F, label: 'PTT ID Settings (0x1F) - Analog Only', getValue: (f: typeof fields1) => {
                  if (f.isDigital) return 'N/A (Digital mode - see Digital Settings below)';
                  return `0x${f.pttIdSettings.toString(16).toUpperCase().padStart(2, '0')}`;
                }},
                { offset: 0x1D, label: 'Color Code (0x1D bits 3-0, digital only)', getValue: (f: typeof fields1) => f.isDigital ? f.colorCode.toString() : 'N/A' },
                { offset: 0x21, label: 'RX CTCSS/DCS (0x21-0x22)', getValue: (f: typeof fields1) => f.rxCtcssDcs.type === 'None' ? 'None' : f.rxCtcssDcs.type === 'CTCSS' ? `CTCSS ${f.rxCtcssDcs.value} Hz` : `DCS ${f.rxCtcssDcs.value}${f.rxCtcssDcs.polarity || ''}` },
                { offset: 0x23, label: 'TX CTCSS/DCS (0x23-0x24)', getValue: (f: typeof fields1) => f.txCtcssDcs.type === 'None' ? 'None' : f.txCtcssDcs.type === 'CTCSS' ? `CTCSS ${f.txCtcssDcs.value} Hz` : `DCS ${f.txCtcssDcs.value}${f.txCtcssDcs.polarity || ''}` },
                { offset: 0x25, label: 'Additional Flags (0x25)', getValue: (f: typeof fields1) => {
                  const additionalFlags = f.bytes[0x25];
                  return `0x${additionalFlags.toString(16).toUpperCase().padStart(2, '0')} (companderDup=${f.companderDup}, voxRelated=${f.voxRelated})`;
                }},
                { offset: 0x25, label: 'Compander Dup (0x25 bit 5)', getValue: (f: typeof fields1) => f.companderDup ? 'Yes' : 'No' },
                { offset: 0x25, label: 'VOX Related (0x25 bit 4)', getValue: (f: typeof fields1) => f.voxRelated ? 'Yes' : 'No' },
                { offset: 0x26, label: 'RX Squelch & PTT ID (0x26)', getValue: (f: typeof fields1) => {
                  const rxSquelchPtt = f.bytes[0x26];
                  return `0x${rxSquelchPtt.toString(16).toUpperCase().padStart(2, '0')} (pttIdDisplay2=${f.pttIdDisplay2}, rxSquelchMode=${f.rxSquelchMode})`;
                }},
                { offset: 0x26, label: 'PTT ID Display 2 (0x26 bit 7)', getValue: (f: typeof fields1) => f.pttIdDisplay2 ? 'Yes' : 'No' },
                { offset: 0x26, label: 'RX Squelch Mode (0x26 bits 6-4)', getValue: (f: typeof fields1) => f.rxSquelchMode },
                { offset: 0x27, label: 'Signaling (0x27)', getValue: (f: typeof fields1) => {
                  const signaling = f.bytes[0x27];
                  return `0x${signaling.toString(16).toUpperCase().padStart(2, '0')} (stepFrequency=${f.stepFrequency}, signalingType=${f.signalingType})`;
                }},
                { offset: 0x27, label: 'Step Frequency (0x27 bits 7-4)', getValue: (f: typeof fields1) => f.stepFrequency.toString() },
                { offset: 0x27, label: 'Signaling Type (0x27 bits 3-0)', getValue: (f: typeof fields1) => f.signalingType },
                { offset: 0x28, label: 'Reserved (0x28)', getValue: (f: typeof fields1) => {
                  const reserved = f.bytes[0x28];
                  return `0x${reserved.toString(16).toUpperCase().padStart(2, '0')}`;
                }},
                { offset: 0x29, label: 'PTT ID Type (0x29 bits 7-4)', getValue: (f: typeof fields1) => f.pttIdType },
                { offset: 0x1D, label: 'Digital Features (0x1D) - Digital Only', getValue: (f: typeof fields1) => {
                  if (!f.isDigital) return 'N/A (Analog mode)';
                  const digitalFeatures = f.bytes[0x1D];
                  return `0x${digitalFeatures.toString(16).toUpperCase().padStart(2, '0')} (encryption=${f.encryption}, shortDataConfirm=${f.shortDataConfirm}, tdmaDirectMode=${f.tdmaDirectMode}, slotOperation=${f.slotOperation})`;
                }},
                { offset: 0x1D, label: 'Encryption (0x1D bit 7) - Digital Only', getValue: (f: typeof fields1) => f.isDigital ? (f.encryption ? 'Yes' : 'No') : 'N/A' },
                { offset: 0x1D, label: 'Short Data Confirm (0x1D bit 6) - Digital Only', getValue: (f: typeof fields1) => f.isDigital ? (f.shortDataConfirm ? 'Yes' : 'No') : 'N/A' },
                { offset: 0x1D, label: 'TDMA Direct Mode (0x1D bit 5) - Digital Only', getValue: (f: typeof fields1) => f.isDigital ? (f.tdmaDirectMode ? 'Yes' : 'No') : 'N/A' },
                { offset: 0x1D, label: 'Digital Features (0x1D) - Digital Only', getValue: (f: typeof fields1) => {
                  if (!f.isDigital) return 'N/A (Analog mode)';
                  const digitalFeatures = f.bytes[0x1D];
                  return `0x${digitalFeatures.toString(16).toUpperCase().padStart(2, '0')} (encryption=${f.encryption}, shortDataConfirm=${f.shortDataConfirm}, tdmaDirectMode=${f.tdmaDirectMode})`;
                }},
                { offset: 0x1D, label: 'Timeslot / Slot Operation (0x1D bit 4) - Digital Only', getValue: (f: typeof fields1) => {
                  if (!f.isDigital) return 'N/A (Analog mode)';
                  const slotValue = f.slotOperation ?? 0;
                  const rawByte = f.bytes[0x1D];
                  const bit4 = (rawByte & 0x10) !== 0; // bit 4
                  // Display timeslot interpretation (0=TS1, 1=TS2)
                  let interpretation = '';
                  if (slotValue === 0) {
                    interpretation = 'TS1 (Raw=0, bit4=0)';
                  } else if (slotValue === 1) {
                    interpretation = 'TS2 (Raw=1, bit4=1)';
                  } else {
                    interpretation = `Raw=${slotValue} (unusual - expected 0 or 1)`;
                  }
                  return `${interpretation} [bit 4: ${bit4 ? '1' : '0'}, full 0x1D: 0x${rawByte.toString(16).toUpperCase().padStart(2, '0')}]`;
                }},
                { offset: 0x1F, label: 'Digital Settings (0x1F) - Digital Only', getValue: (f: typeof fields1) => {
                  if (!f.isDigital) return 'N/A (Analog mode)';
                  const digitalSettings = f.bytes[0x1F];
                  return `0x${digitalSettings.toString(16).toUpperCase().padStart(2, '0')} (privateConfirm=${f.privateConfirm}, rxGroupListId=${f.rxGroupListId ?? 0})`;
                }},
                { offset: 0x1F, label: 'Private Confirm (0x1F bit 6) - Digital Only', getValue: (f: typeof fields1) => f.isDigital ? (f.privateConfirm ? 'Yes' : 'No') : 'N/A' },
                { offset: 0x1F, label: 'RX Group List ID (0x1F bits 5-0) - Digital Only', getValue: (f: typeof fields1) => {
                  if (!f.isDigital) return 'N/A (Analog mode)';
                  const rxGroupValue = f.rxGroupListId ?? 0;
                  const rawByte = f.bytes[0x1F];
                  const rawBits = rawByte & 0x3F; // bits 5-0
                  return `RX Group ID: ${rxGroupValue} (0=None) [bits 5-0: 0x${rawBits.toString(16).toUpperCase().padStart(2, '0')}, full 0x1F: 0x${rawByte.toString(16).toUpperCase().padStart(2, '0')}]`;
                }},
                { offset: 0x2A, label: 'Encryption ID (0x2A) - Digital Only', getValue: (f: typeof fields1) => {
                  if (!f.isDigital) return `0x${f.unknown2A.toString(16).toUpperCase().padStart(2, '0')} (${f.unknown2A}) - Analog: Unknown`;
                  return f.encryptionId !== undefined ? `${f.encryptionId} (0=None, 1-8=Key ID)` : 'N/A';
                }},
                { offset: 0x2B, label: 'DMR Radio ID Index (TX) (0x2B)', getValue: (f: typeof fields1) => {
                  const rawByte = f.bytes[0x2B];
                  return rawByte === 0
                    ? `0x${rawByte.toString(16).toUpperCase().padStart(2, '0')} (${rawByte}) - None`
                    : `0x${rawByte.toString(16).toUpperCase().padStart(2, '0')} (${rawByte}) - Index into DMR Radio IDs list`;
                }},
                { offset: 0x2C, label: 'Reserved 2C (0x2C)', getValue: (f: typeof fields1) => `0x${f.reserved2C.toString(16).toUpperCase().padStart(2, '0')} (${f.reserved2C})` },
                { offset: 0x2D, label: 'Reserved 2D (0x2D)', getValue: (f: typeof fields1) => `0x${f.reserved2D.toString(16).toUpperCase().padStart(2, '0')} (${f.reserved2D})` },
              ].sort((a, b) => a.offset - b.offset);

              return (
                <div className="space-y-4">
                  <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                    <h4 className="text-lg font-semibold text-yellow-400 mb-3">Channel Field Comparison</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-yellow-600/30">
                            <th className="text-left py-2 px-3 text-yellow-400 font-semibold sticky left-0 bg-dark-charcoal z-10">Field</th>
                            <th className="text-left py-2 px-3 text-yellow-400 font-semibold min-w-[200px]">
                              Channel {selectedChannelNumber} {channel1?.name && !isVFO1 ? `(${channel1.name})` : ''}
                            </th>
                            {fields2 && (
                              <th className="text-left py-2 px-3 text-yellow-400 font-semibold min-w-[200px]">
                                Channel {selectedChannelNumber2} {channel2?.name && !isVFO2 ? `(${channel2.name})` : ''}
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {fieldDefinitions.map((def, idx) => {
                            const val1 = def.getValue(fields1);
                            const val2 = fields2 ? def.getValue(fields2) : null;
                            const isDifferent = fields2 && val1 !== val2;
                            return (
                              <tr
                                key={idx}
                                className={`border-b border-yellow-600/10 hover:bg-yellow-900/10 ${isDifferent ? 'bg-yellow-900/20' : ''}`}
                              >
                                <td className="py-2 px-3 text-cool-gray font-semibold sticky left-0 bg-dark-charcoal z-10">{def.label}</td>
                                <td className="py-2 px-3 text-white font-mono">{val1}</td>
                                {fields2 && (
                                  <td className={`py-2 px-3 font-mono ${isDifferent ? 'text-yellow-300' : 'text-white'}`}>
                                    {val2}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                    <h4 className="text-lg font-semibold text-yellow-400 mb-3">Raw Byte Comparison</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-yellow-600/30">
                            <th className="text-left py-2 px-2 text-yellow-400">Byte</th>
                            <th className="text-left py-2 px-2 text-yellow-400">Ch {selectedChannelNumber}</th>
                            {fields2 && <th className="text-left py-2 px-2 text-yellow-400">Ch {selectedChannelNumber2}</th>}
                            <th className="text-left py-2 px-2 text-yellow-400">Field</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(fields1.bytes).map(([offset, value]) => {
                            const offsetNum = parseInt(offset);
                            const val2 = fields2?.bytes[offsetNum as keyof typeof fields2.bytes];
                            const isDifferent = fields2 && value !== val2;
                            // Field names based on channel structure
                            const fieldName =
                              // Name: bytes 0x00-0x0F (16 bytes)
                              (offsetNum >= 0x00 && offsetNum <= 0x0F) ? 'Name' :
                              // RX Frequency: bytes 0x10-0x13 (4 bytes, little-endian)
                              (offsetNum >= 0x10 && offsetNum <= 0x13) ? 'RX Frequency' :
                              // TX Frequency: bytes 0x14-0x17 (4 bytes, little-endian)
                              (offsetNum >= 0x14 && offsetNum <= 0x17) ? 'TX Frequency' :
                              // Settings bytes
                              offsetNum === 0x18 ? 'Mode & Flags' :
                              offsetNum === 0x19 ? 'Scan & Bandwidth' :
                              offsetNum === 0x1A ? 'Talkaround & APRS' :
                              offsetNum === 0x1B ? 'Emergency' :
                              offsetNum === 0x1C ? 'Power & APRS' :
                              offsetNum === 0x1D ? 'Digital Features / Analog Features' :
                              offsetNum === 0x1E ? 'Squelch Level' :
                              offsetNum === 0x1F ? 'RX Group / PTT ID Settings' :
                              offsetNum === 0x20 ? 'Reserved (0x20)' :
                              offsetNum === 0x21 || offsetNum === 0x22 ? 'RX CTCSS/DCS' :
                              offsetNum === 0x23 || offsetNum === 0x24 ? 'TX CTCSS/DCS' :
                              offsetNum === 0x25 ? 'Additional Flags' :
                              offsetNum === 0x26 ? 'RX Squelch & PTT' :
                              offsetNum === 0x27 ? 'Signaling' :
                              offsetNum === 0x28 ? 'Scan List' :
                              offsetNum === 0x29 ? 'PTT ID Type' :
                              offsetNum === 0x2A ? 'Encryption ID' :
                              offsetNum === 0x2B ? 'DMR Radio ID Index (TX)' :
                              (offsetNum >= 0x2C && offsetNum <= 0x2F) ? 'Reserved' : 'Unknown';
                            return (
                              <tr
                                key={offset}
                                className={`border-b border-yellow-600/10 hover:bg-yellow-900/10 ${isDifferent ? 'bg-yellow-900/20' : ''}`}
                              >
                                <td className="py-1 px-2 text-cool-gray font-mono">{offset}</td>
                                <td className="py-1 px-2 font-mono text-white">
                                  0x{value.toString(16).toUpperCase().padStart(2, '0')} ({value})
                                </td>
                                {fields2 && (
                                  <td className={`py-1 px-2 font-mono ${isDifferent ? 'text-yellow-300' : 'text-white'}`}>
                                    0x{val2!.toString(16).toUpperCase().padStart(2, '0')} ({val2})
                                  </td>
                                )}
                                <td className="py-1 px-2 text-cool-gray text-xs">{fieldName}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Full Hex Dump of All 48 Bytes */}
                  <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                    <h4 className="text-lg font-semibold text-yellow-400 mb-3">Full Hex Dump (48 bytes)</h4>
                    <div className="overflow-x-auto">
                      <div className="font-mono text-xs">
                        {/* Header row with byte offsets */}
                        <div className="flex border-b border-yellow-600/30 pb-1 mb-1">
                          <div className="w-16 text-yellow-400 font-bold">Offset</div>
                          <div className="flex-1 text-yellow-400 font-bold">
                            {Array.from({ length: 16 }, (_, i) => (
                              <span key={i} className="inline-block w-8 text-center">
                                {i.toString(16).toUpperCase().padStart(2, '0')}
                              </span>
                            ))}
                          </div>
                          <div className="w-[16ch] text-yellow-400 font-bold text-center">ASCII</div>
                        </div>
                        {/* Data rows */}
                        {(() => {
                          const rows = [];
                          for (let row = 0; row < 3; row++) {
                            const startOffset = row * 16;
                            const rowBytes = fields1.rawBytes.slice(startOffset, startOffset + 16);
                            const hexBytes = Array.from(rowBytes).map((b, i) => {
                              const byte2 = fields2?.rawBytes[startOffset + i];
                              const isDifferent = fields2 && b !== byte2;
                              return (
                                <span
                                  key={i}
                                  className={`inline-block w-8 text-center ${isDifferent ? 'text-yellow-300 bg-yellow-900/30' : 'text-white'}`}
                                  title={`Offset 0x${(startOffset + i).toString(16).toUpperCase()}`}
                                >
                                  {b.toString(16).toUpperCase().padStart(2, '0')}
                                </span>
                              );
                            });
                            const ascii = Array.from(rowBytes)
                              .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
                              .join('');

                            rows.push(
                              <div key={row} className="flex hover:bg-yellow-900/10 py-1">
                                <div className="w-16 text-yellow-400">0x{startOffset.toString(16).toUpperCase().padStart(2, '0')}</div>
                                <div className="w-[52ch]">{hexBytes}</div>
                                <div className="min-w-[16ch] w-[16ch] text-green-400 text-center ml-4 whitespace-nowrap">{ascii}</div>
                              </div>
                            );
                          }
                          return rows;
                        })()}
                        {fields2 && (
                          <>
                            <div className="border-t border-yellow-600/30 mt-2 pt-2 mb-1">
                              <span className="text-yellow-400 font-bold">Channel {selectedChannelNumber2} (comparison)</span>
                            </div>
                            {(() => {
                              const rows = [];
                              for (let row = 0; row < 3; row++) {
                                const startOffset = row * 16;
                                const rowBytes = fields2.rawBytes.slice(startOffset, startOffset + 16);
                                const hexBytes = Array.from(rowBytes).map((b, i) => {
                                  const byte1 = fields1.rawBytes[startOffset + i];
                                  const isDifferent = b !== byte1;
                                  return (
                                    <span
                                      key={i}
                                      className={`inline-block w-8 text-center ${isDifferent ? 'text-yellow-300 bg-yellow-900/30' : 'text-white'}`}
                                      title={`Offset 0x${(startOffset + i).toString(16).toUpperCase()}`}
                                    >
                                      {b.toString(16).toUpperCase().padStart(2, '0')}
                                    </span>
                                  );
                                });
                                const ascii = Array.from(rowBytes)
                                  .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
                                  .join('');

                                rows.push(
                                  <div key={row} className="flex hover:bg-yellow-900/10 py-1">
                                    <div className="w-16 text-yellow-400">0x{startOffset.toString(16).toUpperCase().padStart(2, '0')}</div>
                                    <div className="w-[52ch]">{hexBytes}</div>
                                    <div className="min-w-[16ch] w-[16ch] text-green-400 text-center ml-4 whitespace-nowrap">{ascii}</div>
                                  </div>
                                );
                              }
                              return rows;
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-cool-gray">
                      <strong>Byte layout:</strong> 0x00-0x0F = Name (16 bytes) | 0x10-0x13 = RX Freq | 0x14-0x17 = TX Freq | 0x18-0x2F = Settings
                    </div>
                  </div>
                </div>
              );
            })()}
          </CollapsibleSection>
        </div>
      </div>
  );
};
