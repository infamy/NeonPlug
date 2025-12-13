import React, { useState, useMemo } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { parseRadioSettings } from '../../protocol/dm32uv/structures';
import {
  POWER_ON_INTERFACE_OPTIONS,
  COLOR_OPTIONS,
  UTC_ZONE_OPTIONS,
  BUTTON_FUNCTION_OPTIONS,
} from './diagnosticsConstants';

export const DiagnosticsTab: React.FC = () => {
  const { rawRadioSettingsData, rawContactBlockData, rawContactBlockAddress, blockMetadata, blockData } = useRadioStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const [showMetadataBlock, setShowMetadataBlock] = useState(false);
  const [showMetadataBlock10, setShowMetadataBlock10] = useState(false);
  const [showMetadataBlock41, setShowMetadataBlock41] = useState(false);
  const [showOffsetInspector, setShowOffsetInspector] = useState(false);
  const [showFieldVerification, setShowFieldVerification] = useState(false);
  const [showHexDump, setShowHexDump] = useState(false);
  const [showHexDump10, setShowHexDump10] = useState(false);
  const [showHexDump41, setShowHexDump41] = useState(false);
  const [showContactBlock, setShowContactBlock] = useState(false);
  const [inspectOffset, setInspectOffset] = useState<string>('');
  const [inspectOffset10, setInspectOffset10] = useState<string>('');
  const [inspectOffset41, setInspectOffset41] = useState<string>('');
  const [inspectContactOffset, setInspectContactOffset] = useState<string>('');

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
    </div>
  );
};

