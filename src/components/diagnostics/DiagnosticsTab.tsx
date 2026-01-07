import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useLogStore } from '../../store/logStore';
import { parseRadioSettings } from '../../protocol/dm32uv/structures';
import { decodeBCDFrequency, decodeCTCSSDCS } from '../../protocol/dm32uv/encoding';
import {
  POWER_ON_INTERFACE_OPTIONS,
  COLOR_OPTIONS,
  UTC_ZONE_OPTIONS,
  BUTTON_FUNCTION_OPTIONS,
} from './diagnosticsConstants';

export const DiagnosticsTab: React.FC = () => {
  const { rawRadioSettingsData, rawContactBlockData, rawContactBlockAddress, blockMetadata, blockData } = useRadioStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const { channels, rawChannelData } = useChannelsStore();
  const [showMetadataBlock, setShowMetadataBlock] = useState(false);
  const [showMetadataBlock10, setShowMetadataBlock10] = useState(false);
  const [showMetadataBlock41, setShowMetadataBlock41] = useState(false);
  const [showOffsetInspector, setShowOffsetInspector] = useState(false);
  const [showFieldVerification, setShowFieldVerification] = useState(false);
  const [showHexDump, setShowHexDump] = useState(false);
  const [showHexDump10, setShowHexDump10] = useState(false);
  const [showHexDump41, setShowHexDump41] = useState(false);
  const [showContactBlock, setShowContactBlock] = useState(false);
  const [showChannelParser, setShowChannelParser] = useState(false);
  const [inspectOffset, setInspectOffset] = useState<string>('');
  const [inspectOffset10, setInspectOffset10] = useState<string>('');
  const [inspectOffset41, setInspectOffset41] = useState<string>('');
  const [inspectContactOffset, setInspectContactOffset] = useState<string>('');
  const [selectedChannelNumber, setSelectedChannelNumber] = useState<number>(1);
  const [selectedChannelNumber2, setSelectedChannelNumber2] = useState<number | null>(null);
  const [showCpsComparison, setShowCpsComparison] = useState(false);
  const [cpsCsvData, setCpsCsvData] = useState<Map<number, Record<string, string>> | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE'>('ALL');
  const [logContextFilter, setLogContextFilter] = useState<string>('');
  const logViewerRef = useRef<HTMLDivElement>(null);
  
  const { logs, clearLogs, maxLogs, setMaxLogs } = useLogStore();

  // Find block with metadata 0x10
  const block10Address = useMemo(() => {
    for (const [address, metadata] of blockMetadata.entries()) {
      if (metadata.metadata === 0x10) {
        return address;
      }
    }
    return null;
  }, [blockMetadata]);

  const block10Data = block10Address !== null ? blockData.get(block10Address) : null;

  // Find block with metadata 0x41
  const block41Address = useMemo(() => {
    for (const [address, metadata] of blockMetadata.entries()) {
      if (metadata.metadata === 0x41) {
        return address;
      }
    }
    return null;
  }, [blockMetadata]);

  const block41Data = block41Address !== null ? blockData.get(block41Address) : null;

  // Auto-scroll log viewer to bottom when new logs arrive
  useEffect(() => {
    if (showLogViewer && logViewerRef.current) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight;
    }
  }, [logs, showLogViewer]);

  // Filter logs based on level and context
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (logFilter !== 'ALL' && log.level !== logFilter) {
        return false;
      }
      if (logContextFilter && log.context && !log.context.toLowerCase().includes(logContextFilter.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [logs, logFilter, logContextFilter]);

  // Download functions
  const downloadHexDump = (data: Uint8Array, filename: string) => {
    const bytesPerRow = 16;
    let hexDump = '';
    
    for (let i = 0; i < data.length; i += bytesPerRow) {
      const offset = i;
      const rowBytes = data.slice(i, i + bytesPerRow);
      
      // Format offset
      const offsetHex = offset.toString(16).toUpperCase().padStart(4, '0');
      
      // Format hex bytes
      const hexBytes = Array.from(rowBytes)
        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
      
      // Pad hex bytes if row is incomplete
      const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
      
      // Format ASCII representation
      const ascii = Array.from(rowBytes)
        .map(b => {
          const char = String.fromCharCode(b);
          return (b >= 32 && b <= 126) ? char : '.';
        })
        .join('');
      
      hexDump += `${offsetHex}  ${hexBytes}${hexPadding}  ${ascii}\n`;
    }
    
    const blob = new Blob([hexDump], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadBinary = (data: Uint8Array, filename: string) => {
    // Create a copy to ensure it's a regular ArrayBuffer, not SharedArrayBuffer
    const dataCopy = new Uint8Array(data);
    const blob = new Blob([dataCopy], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!radioSettings || !rawRadioSettingsData) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-yellow-400">Diagnostics & Debug</h2>
          <p className="text-cool-gray text-sm mt-1">Radio settings diagnostic tools</p>
        </div>
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-8 text-center">
          <p className="text-cool-gray">No radio settings data available. Read from radio to view diagnostics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-yellow-400">Diagnostics & Debug</h2>
        <p className="text-cool-gray text-sm mt-1">Inspect raw memory offsets and verify field parsing</p>
      </div>

      {/* Metadata Block 0x04 - Radio Settings */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-yellow-400">Metadata Block 0x04</h3>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
              Radio Settings
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (rawRadioSettingsData) {
                  downloadHexDump(rawRadioSettingsData, 'metadata-0x04-hexdump.txt');
                }
              }}
              className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
              title="Download hex dump"
            >
              📥 Hex
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (rawRadioSettingsData) {
                  downloadBinary(rawRadioSettingsData, 'metadata-0x04.bin');
                }
              }}
              className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
              title="Download binary"
            >
              📥 Bin
            </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMetadataBlock(!showMetadataBlock);
            }}
            className="text-sm text-yellow-400 hover:text-yellow-300"
          >
            {showMetadataBlock ? '▼ Hide' : '▶ Show'}
          </button>
          </div>
        </div>
        <p className="text-cool-gray text-sm mb-4">4KB block containing radio configuration settings</p>
      </div>

      <div className={`space-y-6 ${showMetadataBlock ? '' : 'hidden'}`}>
        {/* Offset Inspector */}
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-yellow-400">Offset Inspector</h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowOffsetInspector(!showOffsetInspector);
              }}
              className="text-xs text-yellow-400 hover:text-yellow-300"
            >
              {showOffsetInspector ? '▼' : '▶'}
            </button>
          </div>
          <div className={`bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4 ${showOffsetInspector ? '' : 'hidden'}`}>
              <div className="mb-4">
                <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inspectOffset}
                    onChange={(e) => setInspectOffset(e.target.value)}
                    placeholder="0x120"
                    className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const offset = parseInt(inspectOffset.replace(/^0x/i, ''), 16);
                      if (!isNaN(offset) && offset >= 0 && offset < rawRadioSettingsData.length) {
                        const element = document.getElementById(`offset-${offset}`);
                        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
                  >
                    Go
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-yellow-600/30">
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Offset</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Hex</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Decimal</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Field</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">UI Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {useMemo(() => {
                      const knownOffsets = [
                        { offset: 0x00, field: 'Power On Interface' },
                        { offset: 0x30, field: 'Backlight Brightness' },
                        { offset: 0x34, field: 'Callsign Color' },
                        { offset: 0x35, field: 'Standby Text Color' },
                        { offset: 0x38, field: 'Channel A Color' },
                        { offset: 0x39, field: 'Channel B Color' },
                        { offset: 0x3A, field: 'Zone A Color' },
                        { offset: 0x3B, field: 'Zone B Color' },
                        { offset: 0x41, field: 'UTC Zone' },
                        { offset: 0x85, field: 'Lock Key (bit 0), Knob Lock (bit 1), Side Key Lock (bit 2)' },
                        { offset: 0x86, field: 'Auto Keypad Lock Delay Time' },
                        { offset: 0x87, field: 'SK1 Short' },
                        { offset: 0x88, field: 'SK1 Long' },
                        { offset: 0x89, field: 'SK2 Short' },
                        { offset: 0x8A, field: 'SK2 Long' },
                        { offset: 0x8D, field: 'P1 Short' },
                        { offset: 0x8E, field: 'P1 Long' },
                        { offset: 0x8F, field: 'P2 Short' },
                        { offset: 0x90, field: 'P2 Long' },
                        { offset: 0x93, field: 'Long Press Time' },
                        { offset: 0x120, field: 'Analog Call 1 - Call Type' },
                        { offset: 0x121, field: 'Analog Call 1 - Call ID' },
                        { offset: 0x122, field: 'Analog Call 2 - Call Type' },
                        { offset: 0x123, field: 'Analog Call 2 - Call ID' },
                        { offset: 0x124, field: 'Analog Call 3 - Call Type' },
                        { offset: 0x125, field: 'Analog Call 3 - Call ID' },
                        { offset: 0x126, field: 'Analog Call 4 - Call Type' },
                        { offset: 0x127, field: 'Analog Call 4 - Call ID' },
                        { offset: 0x200, field: 'One Touch Call 1 - Call Type' },
                        { offset: 0x201, field: 'One Touch Call 1 - Call Object (low)' },
                        { offset: 0x202, field: 'One Touch Call 1 - Call Object (high)' },
                        { offset: 0x203, field: 'One Touch Call 1 - Digital Call Type' },
                        { offset: 0x204, field: 'One Touch Call 1 - SMS' },
                        { offset: 0x230, field: 'Fun+0 - Number Key' },
                        { offset: 0x231, field: 'Fun+0 - Operate Mode' },
                        { offset: 0x232, field: 'Fun+0 - Menu Select' },
                        { offset: 0x233, field: 'Fun+0 - Call Way' },
                        { offset: 0x234, field: 'Fun+0 - Call Object' },
                        { offset: 0x235, field: 'Fun+0 - Digital Call Type' },
                        { offset: 0x236, field: 'Fun+0 - SMS' },
                      ];
                      
                      return knownOffsets.map(({ offset, field }) => {
                        if (offset >= rawRadioSettingsData.length) return null;
                        const hexValue = rawRadioSettingsData[offset];
                        const decimalValue = hexValue;
                        let uiValue = '';
                        
                        if (offset === 0x00) uiValue = POWER_ON_INTERFACE_OPTIONS.find(o => o.value === decimalValue)?.label || `${decimalValue}`;
                        else if (offset === 0x30) uiValue = `${decimalValue + 1}`; // Backlight: stored 0-5, displayed 1-6
                        else if (offset === 0x34) uiValue = COLOR_OPTIONS.find(o => o.value === (decimalValue & 0x0F))?.label || `${decimalValue & 0x0F}`;
                        else if (offset === 0x35) uiValue = COLOR_OPTIONS.find(o => o.value === (decimalValue & 0x0F))?.label || `${decimalValue & 0x0F}`;
                        else if (offset === 0x38) uiValue = COLOR_OPTIONS.find(o => o.value === (decimalValue & 0x0F))?.label || `${decimalValue & 0x0F}`;
                        else if (offset === 0x39) uiValue = COLOR_OPTIONS.find(o => o.value === (decimalValue & 0x0F))?.label || `${decimalValue & 0x0F}`;
                        else if (offset === 0x3A) uiValue = COLOR_OPTIONS.find(o => o.value === (decimalValue & 0x0F))?.label || `${decimalValue & 0x0F}`;
                        else if (offset === 0x3B) uiValue = COLOR_OPTIONS.find(o => o.value === (decimalValue & 0x0F))?.label || `${decimalValue & 0x0F}`;
                        else if (offset === 0x41) uiValue = UTC_ZONE_OPTIONS.find(o => o.value === decimalValue)?.label || `${decimalValue}`;
                        else if (offset === 0x85) {
                          const bits = [];
                          if ((decimalValue & 0x01) === 0) bits.push('Manual');
                          else bits.push('Auto');
                          if ((decimalValue & 0x02) !== 0) bits.push('Knob On');
                          if ((decimalValue & 0x04) !== 0) bits.push('Side Key On');
                          uiValue = bits.join(', ') || 'Off';
                        }
                        else if (offset === 0x86) uiValue = `${decimalValue}s`;
                        else if (offset === 0x87 || offset === 0x88 || offset === 0x89 || offset === 0x8A || offset === 0x8D || offset === 0x8E || offset === 0x8F || offset === 0x90) {
                          uiValue = BUTTON_FUNCTION_OPTIONS.find(o => o.value === decimalValue)?.label || `${decimalValue}`;
                        }
                        else if (offset === 0x93) uiValue = `${decimalValue + 1}`; // +1 for display
                        else uiValue = `${decimalValue}`;
                        
                        return (
                          <tr
                            key={offset}
                            id={`offset-${offset}`}
                            className="border-b border-yellow-600/10 hover:bg-yellow-900/10"
                          >
                            <td className="py-2 px-3 text-cool-gray font-mono">0x{offset.toString(16).toUpperCase().padStart(3, '0')}</td>
                            <td className="py-2 px-3 text-yellow-300 font-mono">0x{hexValue.toString(16).toUpperCase().padStart(2, '0')}</td>
                            <td className="py-2 px-3 text-white">{decimalValue}</td>
                            <td className="py-2 px-3 text-cool-gray">{field}</td>
                            <td className="py-2 px-3 text-white">{uiValue}</td>
                          </tr>
                        );
                      }).filter(Boolean);
                    }, [rawRadioSettingsData, radioSettings])}
                  </tbody>
                </table>
              </div>
            </div>
        </div>

        {/* Field Verification Table */}
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-yellow-400">Field Verification</h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowFieldVerification(!showFieldVerification);
              }}
              className="text-xs text-yellow-400 hover:text-yellow-300"
            >
              {showFieldVerification ? '▼' : '▶'}
            </button>
          </div>
          <div className={`bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4 ${showFieldVerification ? '' : 'hidden'}`}>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-yellow-600/30">
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Field</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Offset</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Raw Hex</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Parsed Value</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">UI Value</th>
                      <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {useMemo(() => {
                      if (!rawRadioSettingsData) return [];
                      
                      try {
                        const parsed = parseRadioSettings(rawRadioSettingsData);
                        const fields: Array<{
                          name: string;
                          offset: number;
                          parsed: any;
                          ui: any;
                          isBit?: boolean;
                          note?: string;
                        }> = [
                          { name: 'Power On Interface', offset: 0x00, parsed: parsed.powerOnInterface, ui: radioSettings?.powerOnInterface },
                          { name: 'Backlight Brightness', offset: 0x30, parsed: parsed.backlightBrightness, ui: radioSettings?.backlightBrightness },
                          { name: 'Callsign Color', offset: 0x34, parsed: parsed.callsignColor, ui: radioSettings?.callsignColor },
                          { name: 'Standby Text Color', offset: 0x35, parsed: parsed.standbyTextColor, ui: radioSettings?.standbyTextColor },
                          { name: 'Channel A Color', offset: 0x38, parsed: parsed.channelAColor, ui: radioSettings?.channelAColor },
                          { name: 'Channel B Color', offset: 0x39, parsed: parsed.channelBColor, ui: radioSettings?.channelBColor },
                          { name: 'Zone A Color', offset: 0x3A, parsed: parsed.zoneAColor, ui: radioSettings?.zoneAColor },
                          { name: 'Zone B Color', offset: 0x3B, parsed: parsed.zoneBColor, ui: radioSettings?.zoneBColor },
                          { name: 'UTC Zone', offset: 0x41, parsed: parsed.utcZone, ui: radioSettings?.utcZone },
                          { name: 'Lock Key', offset: 0x85, parsed: parsed.lockKey, ui: radioSettings?.lockKey, isBit: true },
                          { name: 'Auto Keypad Lock Delay', offset: 0x86, parsed: parsed.autoKeypadLockDelayTime, ui: radioSettings?.autoKeypadLockDelayTime },
                          { name: 'SK1 Short', offset: 0x87, parsed: parsed.sk1Short, ui: radioSettings?.sk1Short },
                          { name: 'SK1 Long', offset: 0x88, parsed: parsed.sk1Long, ui: radioSettings?.sk1Long },
                          { name: 'SK2 Short', offset: 0x89, parsed: parsed.sk2Short, ui: radioSettings?.sk2Short },
                          { name: 'SK2 Long', offset: 0x8A, parsed: parsed.sk2Long, ui: radioSettings?.sk2Long },
                          { name: 'P1 Short', offset: 0x8D, parsed: parsed.p1Short, ui: radioSettings?.p1Short },
                          { name: 'P1 Long', offset: 0x8E, parsed: parsed.p1Long, ui: radioSettings?.p1Long },
                          { name: 'P2 Short', offset: 0x8F, parsed: parsed.p2Short, ui: radioSettings?.p2Short },
                          { name: 'P2 Long', offset: 0x90, parsed: parsed.p2Long, ui: radioSettings?.p2Long },
                          { name: 'Long Press Time', offset: 0x93, parsed: parsed.longPressTime, ui: radioSettings?.longPressTime },
                        ];
                        
                        return fields.map((field) => {
                          // For VFO fields, get data from block 0x41 instead of block 0x04
                          let rawHex = 0;
                          if (field.note === 'Block 0x41' && block41Data) {
                            rawHex = block41Data[field.offset] || 0;
                          } else {
                            rawHex = rawRadioSettingsData[field.offset];
                          }
                          const matches = field.isBit 
                            ? String(field.parsed) === String(field.ui)
                            : field.parsed === field.ui;
                          
                          return (
                            <tr
                              key={field.name}
                              className={`border-b border-yellow-600/10 hover:bg-yellow-900/10 ${!matches ? 'bg-red-900/20' : ''}`}
                            >
                              <td className="py-2 px-3 text-cool-gray">{field.name}{field.note ? ` (${field.note})` : ''}</td>
                              <td className="py-2 px-3 text-cool-gray font-mono">0x{field.offset.toString(16).toUpperCase().padStart(3, '0')}</td>
                              <td className="py-2 px-3 text-yellow-300 font-mono">0x{rawHex.toString(16).toUpperCase().padStart(2, '0')}</td>
                              <td className="py-2 px-3 text-white">{String(field.parsed)}</td>
                              <td className="py-2 px-3 text-white">{String(field.ui ?? 'N/A')}</td>
                              <td className="py-2 px-3">
                                {matches ? (
                                  <span className="text-green-400">✓</span>
                                ) : (
                                  <span className="text-red-400">✗</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      } catch (err) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-4 px-3 text-red-400 text-center">
                              Error parsing: {err instanceof Error ? err.message : String(err)}
                            </td>
                          </tr>
                        );
                      }
                    }, [rawRadioSettingsData, radioSettings])}
                  </tbody>
                </table>
              </div>
            </div>
        </div>

        {/* Hex Dump Viewer */}
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-yellow-400">Hex Dump (Full Block)</h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowHexDump(!showHexDump);
              }}
              className="text-xs text-yellow-400 hover:text-yellow-300"
            >
              {showHexDump ? '▼' : '▶'}
            </button>
          </div>
          <div className={`bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4 ${showHexDump ? '' : 'hidden'}`}>
              <div className="overflow-x-auto">
                <div className="font-mono text-xs">
                  {useMemo(() => {
                    const bytesPerRow = 16;
                    const rows = [];
                    
                    for (let i = 0; i < rawRadioSettingsData.length; i += bytesPerRow) {
                      const offset = i;
                      const rowBytes = rawRadioSettingsData.slice(i, i + bytesPerRow);
                      
                      // Format offset
                      const offsetHex = offset.toString(16).toUpperCase().padStart(4, '0');
                      
                      // Format hex bytes
                      const hexBytes = Array.from(rowBytes)
                        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
                        .join(' ');
                      
                      // Pad hex bytes if row is incomplete
                      const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
                      
                      // Format ASCII representation
                      const ascii = Array.from(rowBytes)
                        .map(b => {
                          const char = String.fromCharCode(b);
                          return (b >= 32 && b <= 126) ? char : '.';
                        })
                        .join('');
                      
                      rows.push(
                        <div key={offset} className="flex border-b border-yellow-600/10 hover:bg-yellow-900/10 py-1">
                          <div className="w-20 text-yellow-400 px-2">{offsetHex}</div>
                          <div className="flex-1 text-yellow-300 px-2">{hexBytes}{hexPadding}</div>
                          <div className="w-16 text-green-400 px-2">{ascii}</div>
                        </div>
                      );
                    }
                    
                    return rows;
                  }, [rawRadioSettingsData])}
                </div>
              </div>
            </div>
        </div>
      </div>

      {/* Metadata Block 0x10 - VFO/Other Settings */}
      {block10Data && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-yellow-400">Metadata Block 0x10</h3>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                VFO/Other Settings
              </span>
              {block10Address !== null && (
                <span className="px-2 py-1 bg-yellow-900/20 text-cool-gray text-xs rounded border border-yellow-600/20">
                  Address: 0x{block10Address.toString(16).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (block10Data) {
                    downloadHexDump(block10Data, 'metadata-0x10-hexdump.txt');
                  }
                }}
                className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                title="Download hex dump"
              >
                📥 Hex
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (block10Data) {
                    downloadBinary(block10Data, 'metadata-0x10.bin');
                  }
                }}
                className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                title="Download binary"
              >
                📥 Bin
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMetadataBlock10(!showMetadataBlock10);
                }}
                className="text-sm text-yellow-400 hover:text-yellow-300"
              >
                {showMetadataBlock10 ? '▼ Hide' : '▶ Show'}
              </button>
            </div>
          </div>
          <p className="text-cool-gray text-sm mb-4">4KB block containing VFO and other settings</p>

          <div className={`space-y-6 ${showMetadataBlock10 ? '' : 'hidden'}`}>
            {/* Hex Dump Viewer for Block 0x10 */}
            <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-yellow-400">Hex Dump (Full Block 0x10)</h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowHexDump10(!showHexDump10);
                  }}
                  className="text-xs text-yellow-400 hover:text-yellow-300"
                >
                  {showHexDump10 ? '▼' : '▶'}
                </button>
              </div>
              <div className={`bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4 ${showHexDump10 ? '' : 'hidden'}`}>
                <div className="mb-4">
                  <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inspectOffset10}
                      onChange={(e) => setInspectOffset10(e.target.value)}
                      placeholder="0x000"
                      className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const offset = parseInt(inspectOffset10.replace(/^0x/i, ''), 16);
                        if (!isNaN(offset) && offset >= 0 && offset < block10Data.length) {
                          const element = document.getElementById(`offset10-${offset}`);
                          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
                    >
                      Go
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="font-mono text-xs">
                    {useMemo(() => {
                      const bytesPerRow = 16;
                      const rows = [];
                      
                      for (let i = 0; i < block10Data.length; i += bytesPerRow) {
                        const offset = i;
                        const rowBytes = block10Data.slice(i, i + bytesPerRow);
                        
                        // Format offset
                        const offsetHex = offset.toString(16).toUpperCase().padStart(4, '0');
                        
                        // Format hex bytes
                        const hexBytes = Array.from(rowBytes)
                          .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
                          .join(' ');
                        
                        // Pad hex bytes if row is incomplete
                        const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
                        
                        // Format ASCII representation
                        const ascii = Array.from(rowBytes)
                          .map(b => {
                            const char = String.fromCharCode(b);
                            return (b >= 32 && b <= 126) ? char : '.';
                          })
                          .join('');
                        
                        rows.push(
                          <div key={offset} id={`offset10-${offset}`} className="flex border-b border-yellow-600/10 hover:bg-yellow-900/10 py-1">
                            <div className="w-20 text-yellow-400 px-2">{offsetHex}</div>
                            <div className="flex-1 text-yellow-300 px-2">{hexBytes}{hexPadding}</div>
                            <div className="w-16 text-green-400 px-2">{ascii}</div>
                          </div>
                        );
                      }
                      
                      return rows;
                    }, [block10Data])}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!block10Data && (
        <div className="mb-6">
          <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
            <h3 className="text-lg font-semibold text-yellow-400 mb-2">Metadata Block 0x10</h3>
            <p className="text-cool-gray text-sm">Block 0x10 not found. Read from radio to view this block.</p>
          </div>
        </div>
      )}

      {/* Metadata Block 0x41 */}
      {block41Data && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-yellow-400">Metadata Block 0x41</h3>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                Metadata 0x41
              </span>
              {block41Address !== null && (
                <span className="px-2 py-1 bg-yellow-900/20 text-cool-gray text-xs rounded border border-yellow-600/20">
                  Address: 0x{block41Address.toString(16).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (block41Data) {
                    downloadHexDump(block41Data, 'metadata-0x41-hexdump.txt');
                  }
                }}
                className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                title="Download hex dump"
              >
                📥 Hex
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (block41Data) {
                    downloadBinary(block41Data, 'metadata-0x41.bin');
                  }
                }}
                className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                title="Download binary"
              >
                📥 Bin
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMetadataBlock41(!showMetadataBlock41);
                }}
                className="text-sm text-yellow-400 hover:text-yellow-300"
              >
                {showMetadataBlock41 ? '▼ Hide' : '▶ Show'}
              </button>
            </div>
          </div>
          <p className="text-cool-gray text-sm mb-4">4KB block containing metadata 0x41</p>

          <div className={`space-y-6 ${showMetadataBlock41 ? '' : 'hidden'}`}>
            {/* Offset Inspector for Block 0x41 */}
            <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-yellow-400">Offset Inspector (Block 0x41)</h3>
              </div>
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <div className="mb-4">
                  <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inspectOffset41}
                      onChange={(e) => setInspectOffset41(e.target.value)}
                      placeholder="0x000"
                      className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const offset = parseInt(inspectOffset41.replace(/^0x/i, ''), 16);
                        if (!isNaN(offset) && offset >= 0 && offset < block41Data.length) {
                          const element = document.getElementById(`offset41-${offset}`);
                          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
                    >
                      Go
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-yellow-600/30">
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Offset</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Hex</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Decimal</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Field</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">UI Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {useMemo(() => {
                        const knownOffsets = [
                          { offset: 0x0F9F, field: 'VFO A Channel (4001) - Start' },
                          { offset: 0x0FAF, field: 'VFO A - RX Frequency (BCD)' },
                          { offset: 0x0FB3, field: 'VFO A - TX Frequency (BCD)' },
                          { offset: 0x0FB7, field: 'VFO A - Mode Flags' },
                          { offset: 0x0FCF, field: 'VFO B Channel (4002) - Start' },
                          { offset: 0x0FDF, field: 'VFO B - RX Frequency (BCD)' },
                          { offset: 0x0FE3, field: 'VFO B - TX Frequency (BCD)' },
                          { offset: 0x0FE7, field: 'VFO B - Mode Flags' },
                        ];
                        
                        return knownOffsets.map(({ offset, field }) => {
                          if (offset >= block41Data.length) return null;
                          const hexValue = block41Data[offset];
                          const decimalValue = hexValue;
                          let uiValue = '';
                          
                          if (offset === 0x0F9F || offset === 0x0FCF) {
                            // Channel name - try to decode
                            const nameBytes = block41Data.slice(offset, offset + 16);
                            const nullIndex = nameBytes.indexOf(0);
                            const name = new TextDecoder('ascii', { fatal: false })
                              .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : 16))
                              .replace(/\x00/g, '')
                              .trim();
                            uiValue = name || 'Empty';
                          } else {
                            uiValue = `${decimalValue}`;
                          }
                          
                          return (
                            <tr
                              key={offset}
                              id={`offset41-${offset}`}
                              className="border-b border-yellow-600/10 hover:bg-yellow-900/10"
                            >
                              <td className="py-2 px-3 text-cool-gray font-mono">0x{offset.toString(16).toUpperCase().padStart(3, '0')}</td>
                              <td className="py-2 px-3 text-yellow-300 font-mono">0x{hexValue.toString(16).toUpperCase().padStart(2, '0')}</td>
                              <td className="py-2 px-3 text-white">{decimalValue}</td>
                              <td className="py-2 px-3 text-cool-gray">{field}</td>
                              <td className="py-2 px-3 text-white">{uiValue}</td>
                            </tr>
                          );
                        }).filter(Boolean);
                      }, [block41Data])}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Field Verification for Block 0x41 */}
            <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-yellow-400">Field Verification (Block 0x41)</h3>
              </div>
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-yellow-600/30">
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Field</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Offset</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Raw Hex</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Parsed Value</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">UI Value</th>
                        <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {useMemo(() => {
                        if (!block41Data || !radioSettings) return [];
                        
                        const fields = [
                          { 
                            name: 'VFO A Channel (4001)', 
                            offset: 0x0F9F, 
                            parsed: radioSettings.vfoA?.name || 'N/A', 
                            ui: radioSettings.vfoA?.name || 'N/A' 
                          },
                          { 
                            name: 'VFO A RX Frequency', 
                            offset: 0x0FAF, 
                            parsed: radioSettings.vfoA?.rxFrequency?.toFixed(4) || 'N/A', 
                            ui: radioSettings.vfoA?.rxFrequency?.toFixed(4) || 'N/A' 
                          },
                          { 
                            name: 'VFO A TX Frequency', 
                            offset: 0x0FB3, 
                            parsed: radioSettings.vfoA?.txFrequency?.toFixed(4) || 'N/A', 
                            ui: radioSettings.vfoA?.txFrequency?.toFixed(4) || 'N/A' 
                          },
                          { 
                            name: 'VFO B Channel (4002)', 
                            offset: 0x0FCF, 
                            parsed: radioSettings.vfoB?.name || 'N/A', 
                            ui: radioSettings.vfoB?.name || 'N/A' 
                          },
                          { 
                            name: 'VFO B RX Frequency', 
                            offset: 0x0FDF, 
                            parsed: radioSettings.vfoB?.rxFrequency?.toFixed(4) || 'N/A', 
                            ui: radioSettings.vfoB?.rxFrequency?.toFixed(4) || 'N/A' 
                          },
                          { 
                            name: 'VFO B TX Frequency', 
                            offset: 0x0FE3, 
                            parsed: radioSettings.vfoB?.txFrequency?.toFixed(4) || 'N/A', 
                            ui: radioSettings.vfoB?.txFrequency?.toFixed(4) || 'N/A' 
                          },
                        ];
                        
                        return fields.map((field) => {
                          const rawHex = block41Data[field.offset] || 0;
                          const matches = field.parsed === field.ui;
                          
                          return (
                            <tr
                              key={field.name}
                              className={`border-b border-yellow-600/10 hover:bg-yellow-900/10 ${!matches ? 'bg-red-900/20' : ''}`}
                            >
                              <td className="py-2 px-3 text-cool-gray">{field.name}</td>
                              <td className="py-2 px-3 text-cool-gray font-mono">0x{field.offset.toString(16).toUpperCase().padStart(3, '0')}</td>
                              <td className="py-2 px-3 text-yellow-300 font-mono">0x{rawHex.toString(16).toUpperCase().padStart(2, '0')}</td>
                              <td className="py-2 px-3 text-white">{String(field.parsed)}</td>
                              <td className="py-2 px-3 text-white">{String(field.ui ?? 'N/A')}</td>
                              <td className="py-2 px-3">
                                {matches ? (
                                  <span className="text-green-400">✓</span>
                                ) : (
                                  <span className="text-red-400">✗</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      }, [block41Data, radioSettings])}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Hex Dump Viewer for Block 0x41 */}
            <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-yellow-400">Hex Dump (Full Block 0x41)</h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowHexDump41(!showHexDump41);
                  }}
                  className="text-xs text-yellow-400 hover:text-yellow-300"
                >
                  {showHexDump41 ? '▼' : '▶'}
                </button>
              </div>
              <div className={`bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4 ${showHexDump41 ? '' : 'hidden'}`}>
                <div className="mb-4">
                  <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inspectOffset41}
                      onChange={(e) => setInspectOffset41(e.target.value)}
                      placeholder="0x000"
                      className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const offset = parseInt(inspectOffset41.replace(/^0x/i, ''), 16);
                        if (!isNaN(offset) && offset >= 0 && offset < block41Data.length) {
                          const element = document.getElementById(`offset41-${offset}`);
                          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
                    >
                      Go
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="font-mono text-xs">
                    {useMemo(() => {
                      const bytesPerRow = 16;
                      const rows = [];
                      
                      for (let i = 0; i < block41Data.length; i += bytesPerRow) {
                        const offset = i;
                        const rowBytes = block41Data.slice(i, i + bytesPerRow);
                        
                        // Format offset
                        const offsetHex = offset.toString(16).toUpperCase().padStart(4, '0');
                        
                        // Format hex bytes
                        const hexBytes = Array.from(rowBytes)
                          .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
                          .join(' ');
                        
                        // Pad hex bytes if row is incomplete
                        const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
                        
                        // Format ASCII representation
                        const ascii = Array.from(rowBytes)
                          .map(b => {
                            const char = String.fromCharCode(b);
                            return (b >= 32 && b <= 126) ? char : '.';
                          })
                          .join('');
                        
                        rows.push(
                          <div key={offset} id={`offset41-${offset}`} className="flex border-b border-yellow-600/10 hover:bg-yellow-900/10 py-1">
                            <div className="w-20 text-yellow-400 px-2">{offsetHex}</div>
                            <div className="flex-1 text-yellow-300 px-2">{hexBytes}{hexPadding}</div>
                            <div className="w-16 text-green-400 px-2">{ascii}</div>
                          </div>
                        );
                      }
                      
                      return rows;
                    }, [block41Data])}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!block41Data && (
        <div className="mb-6">
          <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
            <h3 className="text-lg font-semibold text-yellow-400 mb-2">Metadata Block 0x41</h3>
            <p className="text-cool-gray text-sm">Block 0x41 not found. Read from radio to view this block.</p>
          </div>
        </div>
      )}

      {/* First Contact Block */}
      {rawContactBlockData && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-yellow-400">DMR Contact Block</h3>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                Contact Database
              </span>
              {rawContactBlockAddress !== null && (
                <span className="px-2 py-1 bg-yellow-900/20 text-cool-gray text-xs rounded border border-yellow-600/20">
                  Address: 0x{rawContactBlockAddress.toString(16).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (rawContactBlockData) {
                    downloadHexDump(rawContactBlockData, 'contact-block-0-hexdump.txt');
                  }
                }}
                className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                title="Download hex dump"
              >
                📥 Hex
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (rawContactBlockData) {
                    downloadBinary(rawContactBlockData, 'contact-block-0.bin');
                  }
                }}
                className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                title="Download binary"
              >
                📥 Bin
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowContactBlock(!showContactBlock);
                }}
                className="text-sm text-yellow-400 hover:text-yellow-300"
              >
                {showContactBlock ? '▼ Hide' : '▶ Show'}
              </button>
            </div>
          </div>
          <p className="text-cool-gray text-sm mb-4">
            First 4KB block from contact database. Each contact is 92 bytes (0x5C). 
            Use this to manually inspect the contact structure and fix parsing.
          </p>

          <div className={`space-y-6 ${showContactBlock ? '' : 'hidden'}`}>
            {/* Hex Dump Viewer for Contact Block */}
            <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-yellow-400">Hex Dump (Full Contact Block)</h3>
              </div>
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <div className="mb-4">
                  <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inspectContactOffset}
                      onChange={(e) => setInspectContactOffset(e.target.value)}
                      placeholder="0x000"
                      className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const offset = parseInt(inspectContactOffset.replace(/^0x/i, ''), 16);
                        if (!isNaN(offset) && offset >= 0 && offset < rawContactBlockData.length) {
                          const element = document.getElementById(`contact-offset-${offset}`);
                          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
                    >
                      Go
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto font-mono text-xs">
                  {Array.from({ length: Math.ceil(rawContactBlockData.length / 16) }, (_, row) => {
                    const offset = row * 16;
                    const rowBytes = rawContactBlockData.slice(offset, offset + 16);
                    const offsetHex = offset.toString(16).toUpperCase().padStart(4, '0');
                    const hexBytes = Array.from(rowBytes)
                      .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
                      .join(' ');
                    const hexPadding = '   '.repeat(16 - rowBytes.length);
                    const ascii = Array.from(rowBytes)
                      .map(b => {
                        const char = String.fromCharCode(b);
                        return (b >= 32 && b <= 126) ? char : '.';
                      })
                      .join('');
                    
                    // Highlight contact boundaries (every 92 bytes / 0x5C)
                    const isContactBoundary = offset % 0x5C === 0;
                    const contactNum = Math.floor(offset / 0x5C);
                    
                    return (
                      <div
                        key={offset}
                        id={`contact-offset-${offset}`}
                        className={`flex gap-4 py-1 ${isContactBoundary ? 'bg-yellow-900/20 border-t border-yellow-600/30' : ''} hover:bg-yellow-900/10`}
                      >
                        <span className="text-yellow-400 w-16">{offsetHex}</span>
                        <span className="text-white flex-1">{hexBytes}{hexPadding}</span>
                        <span className="text-cool-gray w-16">{ascii}</span>
                        {isContactBoundary && (
                          <span className="text-yellow-500 text-xs ml-2">Contact {contactNum}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Channel Parser */}
      {rawChannelData.size > 0 && (
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
            <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-cool-gray mb-2">Channel 1</label>
                  <select
                    value={selectedChannelNumber}
                    onChange={(e) => setSelectedChannelNumber(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm focus:outline-none focus:border-yellow-400"
                  >
                    {Array.from(rawChannelData.keys())
                      .sort((a, b) => a - b)
                      .map((chNum) => (
                        <option key={chNum} value={chNum}>
                          Channel {chNum} {channels.find(c => c.number === chNum)?.name ? `(${channels.find(c => c.number === chNum)?.name})` : ''}
                        </option>
                      ))}
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
                    {Array.from(rawChannelData.keys())
                      .sort((a, b) => a - b)
                      .filter(chNum => chNum !== selectedChannelNumber)
                      .map((chNum) => (
                        <option key={chNum} value={chNum}>
                          Channel {chNum} {channels.find(c => c.number === chNum)?.name ? `(${channels.find(c => c.number === chNum)?.name})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {(() => {
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
                    rxFreq = decodeBCDFrequency(channelBytes.slice(0x10, 0x14));
                    txFreq = decodeBCDFrequency(channelBytes.slice(0x14, 0x18));
                  } catch (e) {
                    // Ignore
                  }

                  const modeFlags = channelBytes[0x18];
                  const channelMode = (modeFlags >> 4) & 0x0F;
                  const modeMap = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
                  const mode = modeMap[channelMode] || 'Analog';
                  const forbidTx = (modeFlags & 0x08) !== 0;
                  // Busy Lock - location unknown, defaulting to 'Off' (bits 2-1 of 0x18 are used for power)
                  const busyLock: 'Off' | 'Carrier' | 'Repeater' = 'Off';
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

                  // Power is stored at 0x18, bits 2-1 (NOT 0x29!)
                  const modeFlagsForPower = channelBytes[0x18];
                  const powerValue = (modeFlagsForPower >> 1) & 0x03;
                  const power = powerValue === 0 ? 'Low' : powerValue === 1 ? 'Medium' : powerValue === 2 ? 'High' : 'Low';
                  
                  // APRS Report Mode is at 0x1C, bits 3-2
                  const powerAprs = channelBytes[0x1C];
                  const aprsReportValue = (powerAprs >> 2) & 0x03;
                  const aprsReportMode = aprsReportValue === 0 ? 'Off' : aprsReportValue === 1 ? 'Digital' : aprsReportValue === 2 ? 'Analog' : 'Off';

                  // const isDigital = mode === 'Digital' || mode === 'Fixed Digital'; // Unused for now
                  const analogFeatures = channelBytes[0x1D];
                  const squelchLevel = channelBytes[0x1E];
                  const pttIdSettings = channelBytes[0x1F];

                  const colorCode = channelBytes[0x20] & 0x0F;

                  let rxCtcssDcs: { type: 'None' | 'CTCSS' | 'DCS'; value?: number; polarity?: 'N' | 'P' } = { type: 'None' };
                  try {
                    rxCtcssDcs = decodeCTCSSDCS(channelBytes.slice(0x21, 0x23));
                  } catch (e) {
                    // Ignore
                  }

                  let txCtcssDcs: { type: 'None' | 'CTCSS' | 'DCS'; value?: number; polarity?: 'N' | 'P' } = { type: 'None' };
                  try {
                    txCtcssDcs = decodeCTCSSDCS(channelBytes.slice(0x23, 0x25));
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
                  const contactId = channelBytes[0x2B];
                  const reserved2C = channelBytes[0x2C];
                  const reserved2D = channelBytes[0x2D];

                  return {
                    name,
                    rxFreq,
                    txFreq,
                    mode,
                    forbidTx,
                    busyLock,
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
                    contactId,
                    reserved2C,
                    reserved2D,
                    // Raw bytes for all locations
                    bytes: {
                      0x18: channelBytes[0x18],
                      0x19: channelBytes[0x19],
                      0x1A: channelBytes[0x1A],
                      0x1B: channelBytes[0x1B],
                      0x1C: channelBytes[0x1C],
                      0x1D: channelBytes[0x1D],
                      0x1E: channelBytes[0x1E],
                      0x1F: channelBytes[0x1F],
                      0x20: channelBytes[0x20],
                      0x21: channelBytes[0x21],
                      0x22: channelBytes[0x22],
                      0x23: channelBytes[0x23],
                      0x24: channelBytes[0x24],
                      0x25: channelBytes[0x25],
                      0x26: channelBytes[0x26],
                      0x27: channelBytes[0x27],
                      0x28: channelBytes[0x28],
                      0x29: channelBytes[0x29],
                      0x2A: channelBytes[0x2A],
                      0x2B: channelBytes[0x2B],
                      0x2C: channelBytes[0x2C],
                      0x2D: channelBytes[0x2D],
                    }
                  };
                };

                const rawData1 = rawChannelData.get(selectedChannelNumber);
                const channel1 = channels.find(c => c.number === selectedChannelNumber);
                const rawData2 = selectedChannelNumber2 ? rawChannelData.get(selectedChannelNumber2) : null;
                const channel2 = selectedChannelNumber2 ? channels.find(c => c.number === selectedChannelNumber2) : null;

                if (!rawData1) return <div className="text-cool-gray">No raw data for channel {selectedChannelNumber}</div>;

                const fields1 = parseChannelFields(rawData1.data);
                const fields2 = rawData2 ? parseChannelFields(rawData2.data) : null;

                const fieldDefinitions = [
                  { offset: 0x00, label: 'Name (0x00-0x0F)', getValue: (f: typeof fields1) => f.name },
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
                  { offset: 0x19, label: 'Scan List ID (0x19 bits 5-2)', getValue: (f: typeof fields1) => f.scanListId.toString() },
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
                  { offset: 0x1C, label: 'APRS Report Mode (0x1C bits 3-2)', getValue: (f: typeof fields1) => {
                    const powerAprs = f.powerAprsByte;
                    return `${f.aprsReportMode} (0x${powerAprs.toString(16).toUpperCase().padStart(2, '0')}, bits3-2=${(powerAprs >> 2) & 0x03})`;
                  }},
                  { offset: 0x1D, label: 'Analog Features (0x1D)', getValue: (f: typeof fields1) => `0x${f.analogFeatures.toString(16).toUpperCase().padStart(2, '0')}` },
                  { offset: 0x1E, label: 'Squelch Level (0x1E)', getValue: (f: typeof fields1) => f.squelchLevel.toString() },
                  { offset: 0x1F, label: 'PTT ID Settings (0x1F)', getValue: (f: typeof fields1) => `0x${f.pttIdSettings.toString(16).toUpperCase().padStart(2, '0')}` },
                  { offset: 0x20, label: 'Color Code (0x20)', getValue: (f: typeof fields1) => f.colorCode.toString() },
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
                  { offset: 0x2A, label: 'Unknown 2A (0x2A)', getValue: (f: typeof fields1) => `0x${f.unknown2A.toString(16).toUpperCase().padStart(2, '0')} (${f.unknown2A})` },
                  { offset: 0x2B, label: 'Contact ID (0x2B)', getValue: (f: typeof fields1) => f.contactId.toString() },
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
                                Channel {selectedChannelNumber} {channel1?.name ? `(${channel1.name})` : ''}
                              </th>
                              {fields2 && (
                                <th className="text-left py-2 px-3 text-yellow-400 font-semibold min-w-[200px]">
                                  Channel {selectedChannelNumber2} {channel2?.name ? `(${channel2.name})` : ''}
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
                              const fieldName = offsetNum === 0x1C ? 'Power & APRS' :
                                offsetNum === 0x1D ? 'Analog Features' :
                                offsetNum === 0x1E ? 'Squelch Level' :
                                offsetNum === 0x1F ? 'PTT ID Settings' :
                                offsetNum === 0x18 ? 'Mode & Flags' :
                                offsetNum === 0x19 ? 'Scan & Bandwidth' :
                                offsetNum === 0x1A ? 'Talkaround & APRS' :
                                offsetNum === 0x1B ? 'Emergency' :
                                offsetNum === 0x20 ? 'Color Code' :
                                offsetNum === 0x21 || offsetNum === 0x22 ? 'RX CTCSS/DCS' :
                                offsetNum === 0x23 || offsetNum === 0x24 ? 'TX CTCSS/DCS' :
                                offsetNum === 0x25 ? 'Additional Flags' :
                                offsetNum === 0x26 ? 'RX Squelch & PTT' :
                                offsetNum === 0x27 ? 'Signaling' :
                                offsetNum === 0x29 ? 'PTT ID Type' :
                                offsetNum === 0x2A ? 'Unknown/Encryption ID' :
                                offsetNum === 0x2B ? 'Contact ID' :
                                offsetNum === 0x2C || offsetNum === 0x2D ? 'Reserved' : 'Unknown';
                              return (
                                <tr 
                                  key={offset} 
                                  className={`border-b border-yellow-600/10 hover:bg-yellow-900/10 ${isDifferent ? 'bg-yellow-900/20' : ''}`}
                                >
                                  <td className="py-1 px-2 text-cool-gray font-mono">{offset}</td>
                                  <td className={`py-1 px-2 font-mono ${offsetNum === 0x1C ? 'text-yellow-300 font-bold' : 'text-white'}`}>
                                    0x{value.toString(16).toUpperCase().padStart(2, '0')} ({value})
                                  </td>
                                  {fields2 && (
                                    <td className={`py-1 px-2 font-mono ${isDifferent ? 'text-yellow-300' : offsetNum === 0x1C ? 'text-yellow-300 font-bold' : 'text-white'}`}>
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
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* CPS CSV Comparison */}
      {rawChannelData.size > 0 && (
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
                      alert('CSV must have at least a header row and one data row');
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
                      rxFreq = decodeBCDFrequency(channelBytes.slice(0x10, 0x14));
                      txFreq = decodeBCDFrequency(channelBytes.slice(0x14, 0x18));
                    } catch (e) {
                      // Ignore
                    }

                    const modeFlags = channelBytes[0x18];
                    const channelMode = (modeFlags >> 4) & 0x0F;
                    const modeMap = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
                    const mode = modeMap[channelMode] || 'Analog';
                    const forbidTx = (modeFlags & 0x08) !== 0;
                    const busyLock: 'Off' | 'Carrier' | 'Repeater' = 'Off';
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

                    const colorCode = channelBytes[0x20] & 0x0F;

                    let rxCtcssDcs: { type: 'None' | 'CTCSS' | 'DCS'; value?: number; polarity?: 'N' | 'P' } = { type: 'None' };
                    try {
                      rxCtcssDcs = decodeCTCSSDCS(channelBytes.slice(0x21, 0x23));
                    } catch (e) {
                      // Ignore
                    }

                    let txCtcssDcs: { type: 'None' | 'CTCSS' | 'DCS'; value?: number; polarity?: 'N' | 'P' } = { type: 'None' };
                    try {
                      txCtcssDcs = decodeCTCSSDCS(channelBytes.slice(0x23, 0x25));
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

                    const contactId = channelBytes[0x2B];

                    return {
                      name, rxFreq, txFreq, mode, forbidTx, busyLock, loneWorker,
                      bandwidth, scanAdd, scanListId, forbidTalkaround, aprsReceive,
                      emergencyIndicator, emergencyAck, emergencySystemId,
                      power, aprsReportMode, squelchLevel, colorCode,
                      rxCtcssDcs, txCtcssDcs, companderDup, voxRelated,
                      pttIdDisplay2, rxSquelchMode, stepFrequency, signalingType,
                      pttIdType, contactId
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
                    { cpsField: 'Color Code', ourField: 'colorCode', offset: '0x20 bits 0-3', getOurValue: () => ourFields.colorCode.toString(), getCpsValue: () => cpsChannel['Color Code'] },
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
                    { cpsField: 'TX Contact', ourField: 'contactId', offset: '0x2B', getOurValue: () => ourFields.contactId.toString(), getCpsValue: () => {
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
      )}

      {/* Logs Viewer */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-yellow-400">Logs</h3>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
              {logs.length} logs
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLogViewer(!showLogViewer)}
              className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
            >
              {showLogViewer ? '▼ Hide' : '▶ Show'}
            </button>
            {showLogViewer && (
              <button
                type="button"
                onClick={() => clearLogs()}
                className="px-3 py-1 text-xs text-red-400 hover:text-red-300 border border-red-600/30 hover:border-red-400 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {showLogViewer && (
          <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-4">
            {/* Filters */}
            <div className="mb-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-cool-gray">Level:</label>
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                  className="px-2 py-1 text-sm bg-deep-gray border border-yellow-600/30 rounded text-yellow-400"
                >
                  <option value="ALL">All</option>
                  <option value="ERROR">Error</option>
                  <option value="WARN">Warn</option>
                  <option value="INFO">Info</option>
                  <option value="DEBUG">Debug</option>
                  <option value="VERBOSE">Verbose</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-cool-gray">Context:</label>
                <input
                  type="text"
                  value={logContextFilter}
                  onChange={(e) => setLogContextFilter(e.target.value)}
                  placeholder="Filter by context..."
                  className="px-2 py-1 text-sm bg-deep-gray border border-yellow-600/30 rounded text-yellow-400 w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-cool-gray">Max Logs:</label>
                <input
                  type="number"
                  value={maxLogs}
                  onChange={(e) => setMaxLogs(parseInt(e.target.value) || 1000)}
                  min="100"
                  max="10000"
                  step="100"
                  className="px-2 py-1 text-sm bg-deep-gray border border-yellow-600/30 rounded text-yellow-400 w-24"
                />
              </div>
              <div className="text-sm text-cool-gray">
                Showing {filteredLogs.length} of {logs.length} logs
              </div>
            </div>

            {/* Log Viewer */}
            <div
              ref={logViewerRef}
              className="bg-black/50 rounded border border-yellow-600/20 p-3 font-mono text-xs max-h-96 overflow-y-auto"
              style={{ fontFamily: 'monospace' }}
            >
              {filteredLogs.length === 0 ? (
                <div className="text-cool-gray text-center py-4">No logs to display</div>
              ) : (
                filteredLogs.map((log) => {
                  const timestamp = new Date(log.timestamp).toLocaleTimeString();
                  const levelColors = {
                    ERROR: 'text-red-400',
                    WARN: 'text-yellow-400',
                    INFO: 'text-blue-400',
                    DEBUG: 'text-green-400',
                    VERBOSE: 'text-gray-400',
                  };
                  const levelBg = {
                    ERROR: 'bg-red-900/20',
                    WARN: 'bg-yellow-900/20',
                    INFO: 'bg-blue-900/20',
                    DEBUG: 'bg-green-900/20',
                    VERBOSE: 'bg-gray-900/20',
                  };

                  return (
                    <div
                      key={log.id}
                      className={`mb-1 px-2 py-1 rounded ${levelBg[log.level]} border-l-2 ${
                        log.level === 'ERROR' ? 'border-red-500' :
                        log.level === 'WARN' ? 'border-yellow-500' :
                        log.level === 'INFO' ? 'border-blue-500' :
                        log.level === 'DEBUG' ? 'border-green-500' :
                        'border-gray-500'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`${levelColors[log.level]} font-semibold min-w-[60px]`}>
                          {log.level}
                        </span>
                        <span className="text-gray-500 min-w-[80px]">{timestamp}</span>
                        {log.context && (
                          <span className="text-purple-400 min-w-[100px]">[{log.context}]</span>
                        )}
                        <span className="text-white flex-1">{log.message}</span>
                      </div>
                      {log.error !== undefined && log.error !== null && (
                        <div className="mt-1 ml-[248px] text-red-300 text-xs">
                          {log.error instanceof Error ? log.error.message : String(log.error)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

