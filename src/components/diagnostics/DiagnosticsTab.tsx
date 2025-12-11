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
  const { rawRadioSettingsData } = useRadioStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const [showMetadataBlock, setShowMetadataBlock] = useState(true);
  const [showOffsetInspector, setShowOffsetInspector] = useState(true);
  const [showFieldVerification, setShowFieldVerification] = useState(true);
  const [showHexDump, setShowHexDump] = useState(true);
  const [inspectOffset, setInspectOffset] = useState<string>('');

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
                        const fields = [
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
                          const rawHex = rawRadioSettingsData[field.offset];
                          const matches = field.isBit 
                            ? String(field.parsed) === String(field.ui)
                            : field.parsed === field.ui;
                          
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
    </div>
  );
};

