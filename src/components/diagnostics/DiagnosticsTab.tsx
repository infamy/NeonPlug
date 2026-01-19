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
import { MetadataBlockDisplay } from './MetadataBlockDisplay';
import { CollapsibleSection } from './CollapsibleSection';
import JSZip from 'jszip';

export const DiagnosticsTab: React.FC = () => {
  const { rawRadioSettingsData, rawContactBlockData, rawContactBlockAddress, blockMetadata, blockData } = useRadioStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const { channels, rawChannelData } = useChannelsStore();
  const [showMetadataBlock, setShowMetadataBlock] = useState(false);
  const [showMetadataBlock10, setShowMetadataBlock10] = useState(false);
  const [showMetadataBlock41, setShowMetadataBlock41] = useState(false);
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
  const [txContactLookupChannel, setTxContactLookupChannel] = useState<string>('');
  
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

  // Helper function to find block data by metadata number
  const getBlockByMetadata = (metadataNum: number): { data: Uint8Array | null; address: number | null } => {
    for (const [address, metadata] of blockMetadata.entries()) {
      if (metadata.metadata === metadataNum) {
        return {
          data: blockData.get(address) || null,
          address
        };
      }
    }
    return { data: null, address: null };
  };

  const block02 = getBlockByMetadata(0x02);
  const block10 = getBlockByMetadata(0x10); // Digital Emergency Systems and Encryption Keys
  const block06 = getBlockByMetadata(0x06);
  const block0A = getBlockByMetadata(0x0A);
  const block0B = getBlockByMetadata(0x0B);
  const block0F = getBlockByMetadata(0x0F);
  const block42 = getBlockByMetadata(0x42);
  const block43 = getBlockByMetadata(0x43);
  const block44 = getBlockByMetadata(0x44);
  const block67 = getBlockByMetadata(0x67);

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

  // Generate proposed TX Contact write data for block 0x42 (channels 1-2047)
  const generateProposedTxContact42 = (): Uint8Array | null => {
    if (!block42.data) return null;
    
    // Start with a copy of current block data
    const proposedData = new Uint8Array(block42.data);
    
    // Update with current channel contactId values
    for (const channel of channels) {
      if (channel.number >= 1 && channel.number <= 2047) {
        const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
        const contactId = channel.contactId ?? 0;
        
        const offset = (channel.number - 1) * 2;
        
        // Encode: high nibble is contact ID high, bit 0 is digital flag
        const contactIdHigh = (contactId >> 8) & 0x0F;
        const contactIdLow = contactId & 0xFF;
        const byte0 = (contactIdHigh << 4) | (isDigital ? 0x01 : 0x00);
        const byte1 = contactIdLow;
        
        proposedData[offset] = byte0;
        proposedData[offset + 1] = byte1;
      }
    }
    
    // Set metadata byte
    proposedData[0xFFF] = 0x42;
    
    return proposedData;
  };

  // Download proposed vs current comparison for a specific channel
  const downloadTxContactComparison = () => {
    if (!block42.data) return;
    
    const currentData = block42.data;
    const proposedData = generateProposedTxContact42();
    if (!proposedData) return;
    
    let report = 'TX Contact Block 0x42 - Current vs Proposed Comparison\n';
    report += '='.repeat(80) + '\n\n';
    report += 'Channel | Current Bytes | Current TG | Proposed Bytes | Proposed TG | Changed?\n';
    report += '-'.repeat(80) + '\n';
    
    for (const channel of channels) {
      if (channel.number >= 1 && channel.number <= 2047) {
        const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
        if (!isDigital) continue; // Only show digital channels
        
        const offset = (channel.number - 1) * 2;
        
        const currByte0 = currentData[offset];
        const currByte1 = currentData[offset + 1];
        const currTg = ((currByte0 >> 4) << 8) | currByte1;
        
        const propByte0 = proposedData[offset];
        const propByte1 = proposedData[offset + 1];
        const propTg = ((propByte0 >> 4) << 8) | propByte1;
        
        const changed = currByte0 !== propByte0 || currByte1 !== propByte1;
        
        report += `Ch ${channel.number.toString().padStart(4)} | `;
        report += `${currByte0.toString(16).padStart(2, '0')} ${currByte1.toString(16).padStart(2, '0')}`.padEnd(13) + ' | ';
        report += `${currTg}`.padEnd(10) + ' | ';
        report += `${propByte0.toString(16).padStart(2, '0')} ${propByte1.toString(16).padStart(2, '0')}`.padEnd(14) + ' | ';
        report += `${propTg}`.padEnd(11) + ' | ';
        report += changed ? 'YES <<<' : 'no';
        report += '\n';
      }
    }
    
    report += '\n\nChannel Store Values:\n';
    report += '-'.repeat(80) + '\n';
    for (const channel of channels) {
      if (channel.number >= 1 && channel.number <= 2047) {
        const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
        if (!isDigital) continue;
        report += `Ch ${channel.number}: contactId=${channel.contactId}, txContactId=${channel.txContactId}, mode=${channel.mode}\n`;
      }
    }
    
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tx_contact_comparison.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllMetadataBlocks = async () => {
    const zip = new JSZip();
    let blocksAdded = 0;

    // Function to generate hex dump content
    const generateHexDump = (data: Uint8Array, metadataHex: string): string => {
      const bytesPerRow = 16;
      let hexDump = `Metadata Block 0x${metadataHex}\n`;
      hexDump += `Size: ${data.length} bytes (${(data.length / 1024).toFixed(2)} KB)\n`;
      hexDump += `${'='.repeat(80)}\n\n`;
      
      for (let i = 0; i < data.length; i += bytesPerRow) {
        const offset = i;
        const rowBytes = data.slice(i, i + bytesPerRow);
        
        const offsetHex = offset.toString(16).toUpperCase().padStart(4, '0');
        const hexBytes = Array.from(rowBytes)
          .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
          .join(' ');
        const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
        const ascii = Array.from(rowBytes)
          .map(b => {
            const char = String.fromCharCode(b);
            return (b >= 32 && b <= 126) ? char : '.';
          })
          .join('');
        
        hexDump += `${offsetHex}  ${hexBytes}${hexPadding}  ${ascii}\n`;
      }
      
      return hexDump;
    };

    // Add Radio Settings (0x04)
    if (rawRadioSettingsData) {
      const hexDump = generateHexDump(rawRadioSettingsData, '04');
      zip.file('metadata-0x04-radio-settings.txt', hexDump);
      zip.file('metadata-0x04-radio-settings.bin', rawRadioSettingsData);
      blocksAdded++;
    }

    // Add all other metadata blocks
    for (const [address, metadata] of blockMetadata.entries()) {
      const data = blockData.get(address);
      if (data) {
        const metadataHex = metadata.metadata.toString(16).toUpperCase().padStart(2, '0');
        const hexDump = generateHexDump(data, metadataHex);
        zip.file(`metadata-0x${metadataHex}.txt`, hexDump);
        zip.file(`metadata-0x${metadataHex}.bin`, data);
        blocksAdded++;
      }
    }

    // Add contact block if available
    if (rawContactBlockData) {
      const hexDump = generateHexDump(rawContactBlockData, 'CONTACTS');
      zip.file('contact-block-first-4kb.txt', hexDump);
      zip.file('contact-block-first-4kb.bin', rawContactBlockData);
      blocksAdded++;
    }

    if (blocksAdded === 0) {
      alert('No metadata blocks available to download. Please read from radio first.');
      return;
    }

    // Generate zip and download
    try {
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `metadata-blocks-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error creating zip:', error);
      alert('Failed to create zip file. See console for details.');
    }
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-yellow-400">Diagnostics & Debug</h2>
            <p className="text-cool-gray text-sm mt-1">Inspect raw memory offsets and verify field parsing</p>
          </div>
          <button
            type="button"
            onClick={downloadAllMetadataBlocks}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded transition-colors flex items-center gap-2"
            title="Download all metadata blocks as a zip file"
          >
            📦 Download All Blocks (.zip)
          </button>
        </div>
      </div>

      {/* Metadata Block 0x02 (Calibration) */}
      <MetadataBlockDisplay
        metadata={0x02}
        blockData={block02.data}
        blockAddress={block02.address}
        description="Calibration data"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      />

      {/* Metadata Block 0x10 (Digital Emergency Systems and Encryption Keys) */}
      <MetadataBlockDisplay
        metadata={0x10}
        blockData={block10.data}
        blockAddress={block10.address}
        description="Digital Emergency Systems and Encryption Keys"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      />

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
        <CollapsibleSection title="Offset Inspector">
          <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
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
                    {(() => {
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
                    })()}
                  </tbody>
                </table>
              </div>
          </div>
        </CollapsibleSection>

        {/* Field Verification Table */}
        <CollapsibleSection title="Field Verification">
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
                    {(() => {
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
                    })()}
                  </tbody>
                </table>
              </div>
          </div>
        </CollapsibleSection>

        {/* Hex Dump Viewer */}
        <CollapsibleSection title="Hex Dump (Full Block)">
          <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
            <div className="overflow-x-auto">
              <div className="font-mono text-xs">
                {(() => {
                  const bytesPerRow = 16;
                  const rows = [];
                  
                  for (let i = 0; i < rawRadioSettingsData.length; i += bytesPerRow) {
                    const offset = i;
                    const rowBytes = rawRadioSettingsData.slice(i, i + bytesPerRow);
                    
                    const offsetHex = offset.toString(16).toUpperCase().padStart(4, '0');
                    const hexBytes = Array.from(rowBytes)
                      .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
                      .join(' ');
                    const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
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
                })()}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Metadata Block 0x06 (Config Section 4 - Talk Groups Counter) */}
      <MetadataBlockDisplay
        metadata={0x06}
        blockData={block06.data}
        blockAddress={block06.address}
        description="Config Section 4 - Talk Groups counter at offset 0x1FF"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      />

      {/* Metadata Block 0x0A (Quick Messages) */}
      <MetadataBlockDisplay
        metadata={0x0A}
        blockData={block0A.data}
        blockAddress={block0A.address}
        description="Quick Messages"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      />

      {/* Metadata Block 0x0B - Quick Access Contact List */}
      <MetadataBlockDisplay
        metadata={0x0B}
        blockData={block0B.data}
        blockAddress={block0B.address}
        description="Quick Access Contact List"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      >
        {block0B.data && (() => {
          const data = block0B.data!; // TypeScript refinement
          return (
          <>
            {/* Header Information */}
            <CollapsibleSection title="Header & Counts" defaultOpen={true}>
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-yellow-600/30">
                      <th className="text-left py-2 px-3 text-yellow-400">Field</th>
                      <th className="text-left py-2 px-3 text-yellow-400">Offset</th>
                      <th className="text-left py-2 px-3 text-yellow-400">Size</th>
                      <th className="text-left py-2 px-3 text-yellow-400">Value</th>
                      <th className="text-left py-2 px-3 text-yellow-400">Hex</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-yellow-600/10">
                      <td className="py-2 px-3 text-cool-gray">Total Contact Count</td>
                      <td className="py-2 px-3 text-green-400 font-mono">0x00-0x01</td>
                      <td className="py-2 px-3 text-cool-gray">2 bytes</td>
                      <td className="py-2 px-3 text-white font-semibold">
                        {data[0] | (data[1] << 8)}
                      </td>
                      <td className="py-2 px-3 text-yellow-300 font-mono">
                        {data[0].toString(16).toUpperCase().padStart(2, '0')} {data[1].toString(16).toUpperCase().padStart(2, '0')}
                      </td>
                    </tr>
                    <tr className="border-b border-yellow-600/10">
                      <td className="py-2 px-3 text-cool-gray">Group Call Count</td>
                      <td className="py-2 px-3 text-green-400 font-mono">0x02-0x03</td>
                      <td className="py-2 px-3 text-cool-gray">2 bytes</td>
                      <td className="py-2 px-3 text-white font-semibold">
                        {data[2] | (data[3] << 8)}
                      </td>
                      <td className="py-2 px-3 text-yellow-300 font-mono">
                        {data[2].toString(16).toUpperCase().padStart(2, '0')} {data[3].toString(16).toUpperCase().padStart(2, '0')}
                      </td>
                    </tr>
                    <tr className="border-b border-yellow-600/10">
                      <td className="py-2 px-3 text-cool-gray">Private Call Count</td>
                      <td className="py-2 px-3 text-green-400 font-mono">0x04</td>
                      <td className="py-2 px-3 text-cool-gray">1 byte</td>
                      <td className="py-2 px-3 text-white font-semibold">
                        {data[4]}
                      </td>
                      <td className="py-2 px-3 text-yellow-300 font-mono">
                        {data[4].toString(16).toUpperCase().padStart(2, '0')}
                      </td>
                    </tr>
                    <tr className="border-b border-yellow-600/10">
                      <td className="py-2 px-3 text-cool-gray">Reserved</td>
                      <td className="py-2 px-3 text-green-400 font-mono">0x05-0x0F</td>
                      <td className="py-2 px-3 text-cool-gray">11 bytes</td>
                      <td className="py-2 px-3 text-cool-gray">
                        {Array.from(data.slice(5, 16)).every(b => b === 0xFF) ? '(All 0xFF)' : '(Mixed)'}
                      </td>
                      <td className="py-2 px-3 text-yellow-300 font-mono text-xs">
                        {Array.from(data.slice(5, 16)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            {/* Slot Usage Bitmask */}
            <CollapsibleSection title="Slot Usage Bitmask (0x10-0x1F)">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <p className="text-sm text-cool-gray mb-3">
                  16 bytes controlling 128 slots. Each bit represents one slot (0 = used, 1 = free).
                </p>
                <div className="font-mono text-xs space-y-1">
                  {Array.from({ length: 16 }, (_, byteIdx) => {
                    const byte = data[0x10 + byteIdx];
                    const binaryStr = byte.toString(2).padStart(8, '0');
                    const usedBits = binaryStr.split('').filter(b => b === '0').length;
                    return (
                      <div key={byteIdx} className="flex items-center gap-3 hover:bg-yellow-900/10 py-1 px-2 rounded">
                        <span className="text-yellow-400 w-16">0x{(0x10 + byteIdx).toString(16).toUpperCase().padStart(2, '0')}</span>
                        <span className="text-yellow-300 w-12">{byte.toString(16).toUpperCase().padStart(2, '0')}</span>
                        <span className="text-green-400 w-20">{binaryStr}</span>
                        <span className="text-cool-gray text-xs">
                          Slots {byteIdx * 8}-{byteIdx * 8 + 7} ({usedBits} used)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CollapsibleSection>

            {/* Index Table 1 Preview */}
            <CollapsibleSection title="Index Table 1 (0x100-0x6FF) - Name Sorted">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <p className="text-sm text-cool-gray mb-3">
                  Entries sorted by name. Each entry: 2 bytes [contact_index] [type_byte]
                </p>
                <div className="font-mono text-xs">
                  <div className="flex font-semibold text-yellow-400 mb-2 pb-2 border-b border-yellow-600/30">
                    <div className="w-16">Offset</div>
                    <div className="w-24">Contact ID</div>
                    <div className="w-24">Type Byte</div>
                    <div className="w-32">Call Type</div>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {Array.from({ length: Math.min(20, Math.floor((0x700 - 0x100) / 2)) }, (_, i) => {
                      const offset = 0x100 + (i * 2);
                      const contactIndex = data[offset];
                      const typeByte = data[offset + 1];
                      
                      // Skip if both bytes are 0xFF (empty entry)
                      if (contactIndex === 0xFF && typeByte === 0xFF) return null;
                      
                      const callType = typeByte === 0x30 ? 'All Call' :
                                     typeByte === 0x40 ? 'Group Call' :
                                     typeByte === 0x50 ? 'Private Call' :
                                     `Unknown (0x${typeByte.toString(16).toUpperCase()})`;
                      
                      return (
                        <div key={i} className="flex hover:bg-yellow-900/10 py-1 px-2 rounded">
                          <div className="w-16 text-yellow-400">0x{offset.toString(16).toUpperCase()}</div>
                          <div className="w-24 text-white">{contactIndex}</div>
                          <div className="w-24 text-yellow-300">0x{typeByte.toString(16).toUpperCase().padStart(2, '0')}</div>
                          <div className="w-32 text-green-400">{callType}</div>
                        </div>
                      );
                    }).filter(Boolean)}
                  </div>
                  <p className="text-xs text-cool-gray mt-2 pt-2 border-t border-yellow-600/20">
                    Showing first 20 entries. Total capacity: {Math.floor((0x700 - 0x100) / 2)} entries
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Index Table 2 Preview */}
            <CollapsibleSection title="Index Table 2 (0x740-0xCFF) - Alphabetically Sorted">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <p className="text-sm text-cool-gray mb-3">
                  Entries sorted alphabetically. Each entry: 2 bytes [contact_index] [type_byte]
                </p>
                <div className="font-mono text-xs">
                  <div className="flex font-semibold text-yellow-400 mb-2 pb-2 border-b border-yellow-600/30">
                    <div className="w-16">Offset</div>
                    <div className="w-24">Contact ID</div>
                    <div className="w-24">Type Byte</div>
                    <div className="w-32">Call Type</div>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {Array.from({ length: Math.min(20, Math.floor((0xD00 - 0x740) / 2)) }, (_, i) => {
                      const offset = 0x740 + (i * 2);
                      const contactIndex = data[offset];
                      const typeByte = data[offset + 1];
                      
                      // Skip if both bytes are 0xFF (empty entry)
                      if (contactIndex === 0xFF && typeByte === 0xFF) return null;
                      
                      const callType = typeByte === 0x30 ? 'All Call' :
                                     typeByte === 0x40 ? 'Group Call' :
                                     typeByte === 0x50 ? 'Private Call' :
                                     `Unknown (0x${typeByte.toString(16).toUpperCase()})`;
                      
                      return (
                        <div key={i} className="flex hover:bg-yellow-900/10 py-1 px-2 rounded">
                          <div className="w-16 text-yellow-400">0x{offset.toString(16).toUpperCase()}</div>
                          <div className="w-24 text-white">{contactIndex}</div>
                          <div className="w-24 text-yellow-300">0x{typeByte.toString(16).toUpperCase().padStart(2, '0')}</div>
                          <div className="w-32 text-green-400">{callType}</div>
                        </div>
                      );
                    }).filter(Boolean)}
                  </div>
                  <p className="text-xs text-cool-gray mt-2 pt-2 border-t border-yellow-600/20">
                    Showing first 20 entries. Total capacity: {Math.floor((0xD00 - 0x740) / 2)} entries
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Structure Reference */}
            <CollapsibleSection title="Structure Reference">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="text-yellow-400 font-semibold mb-2">Memory Layout</h4>
                    <ul className="list-disc list-inside text-cool-gray space-y-1">
                      <li><span className="text-green-400 font-mono">0x0000-0x000F</span>: Header (16 bytes)</li>
                      <li><span className="text-green-400 font-mono">0x0010-0x001F</span>: Slot Usage Bitmask (16 bytes, 128 slots, 0=used, 1=free)</li>
                      <li><span className="text-green-400 font-mono">0x0100-0x06FF</span>: Index Table 1 - Name Sorted (768 entries max)</li>
                      <li><span className="text-green-400 font-mono">0x0740-0x0CFF</span>: Index Table 2 - Alphabetically Sorted (704 entries max)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-yellow-400 font-semibold mb-2">Type Byte Values</h4>
                    <ul className="list-disc list-inside text-cool-gray space-y-1">
                      <li><span className="text-yellow-300 font-mono">0x30</span>: All Call</li>
                      <li><span className="text-yellow-300 font-mono">0x40</span>: Group Call</li>
                      <li><span className="text-yellow-300 font-mono">0x50</span>: Private Call</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-yellow-400 font-semibold mb-2">Update Requirements</h4>
                    <p className="text-cool-gray mb-2">When adding a Talk Group:</p>
                    <ul className="list-disc list-inside text-cool-gray space-y-1">
                      <li>Update Metadata 0x44 with Talk Group entry data</li>
                      <li>Update Metadata 0x0B:
                        <ul className="list-circle list-inside ml-6 mt-1 space-y-1">
                          <li>Increment total count at 0x00-0x01</li>
                          <li>Update Group Call count at 0x02-0x03 (if Group Call)</li>
                          <li>Clear bit in bitmask at 0x10-0x1F (0=used, 1=free)</li>
                          <li>Append entry to Index Table 1 at 0x100+</li>
                          <li>Insert entry (sorted) in Index Table 2 at 0x740+</li>
                        </ul>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </>
          );
        })()}
      </MetadataBlockDisplay>

      {/* Metadata Block 0x0F (RX Groups) */}
      <MetadataBlockDisplay
        metadata={0x0F}
        blockData={block0F.data}
        blockAddress={block0F.address}
        description="RX Groups"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      />

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
            <CollapsibleSection title="Hex Dump (Full Block 0x10)">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
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
                    {(() => {
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
                    })()}
                  </div>
                </div>
              </div>
            </CollapsibleSection>
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
            <CollapsibleSection title="Offset Inspector (Block 0x41)">
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
                      {(() => {
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
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </CollapsibleSection>

            {/* Field Verification for Block 0x41 */}
            <CollapsibleSection title="Field Verification (Block 0x41)">
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
                      {(() => {
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
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </CollapsibleSection>

            {/* Hex Dump Viewer for Block 0x41 */}
            <CollapsibleSection title="Hex Dump (Full Block 0x41)">
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
                  <div className="font-mono text-xs">
                    {(() => {
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
                    })()}
                  </div>
                </div>
              </div>
            </CollapsibleSection>
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

      {/* Metadata Block 0x42 (TX Contact - Channels 1-2048) */}
      <MetadataBlockDisplay
        metadata={0x42}
        blockData={block42.data}
        blockAddress={block42.address}
        description="TX Contact for Channels 1-2048 (2 bytes per channel: Talk Group Index)"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      >
        {block42.data && (() => {
          const data = block42.data!;
          return (
            <>
              <CollapsibleSection title="TX Contact Structure Reference" defaultOpen={true}>
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Entry Structure (2 bytes per channel)</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-green-400 font-mono">Byte 0 bits 7-4:</span> Talk Group Index bits 11-8</li>
                        <li><span className="text-green-400 font-mono">Byte 0 bits 3-1:</span> Reserved</li>
                        <li><span className="text-green-400 font-mono">Byte 0 bit 0:</span> Digital Flag (1=Digital, 0=Analog)</li>
                        <li><span className="text-green-400 font-mono">Byte 1:</span> Talk Group Index bits 7-0</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Offset Calculation</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-yellow-300 font-mono">Channels 1-2047:</span> (channel - 1) * 2</li>
                        <li><span className="text-yellow-300 font-mono">Example:</span> Channel 1 → offset 0x0000, Channel 2 → offset 0x0002</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Debug Tools</h4>
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={downloadTxContactComparison}
                          className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-500 transition-colors text-xs font-semibold"
                        >
                          📥 Download Current vs Proposed Comparison
                        </button>
                        <button
                          onClick={() => {
                            const proposed = generateProposedTxContact42();
                            if (proposed) downloadBinary(proposed, 'proposed_block_0x42.bin');
                          }}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-500 transition-colors text-xs font-semibold"
                        >
                          📥 Download Proposed Block 0x42
                        </button>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Channel Lookup</h4>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="number"
                          min="1"
                          max="2047"
                          placeholder="Enter channel # (1-2047)"
                          value={txContactLookupChannel}
                          onChange={(e) => setTxContactLookupChannel(e.target.value)}
                          className="w-48 bg-dark-charcoal border border-yellow-600/30 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-yellow-400"
                        />
                        {txContactLookupChannel && (() => {
                          const chNum = parseInt(txContactLookupChannel);
                          if (chNum >= 1 && chNum <= 2047) {
                            const offset = (chNum - 1) * 2;
                            const byte0 = data[offset] ?? 0;
                            const byte1 = data[offset + 1] ?? 0;
                            const tgIndex = ((byte0 >> 4) << 8) | byte1;
                            const isDigital = (byte0 & 0x01) !== 0;
                            return (
                              <div className="flex items-center gap-2 font-mono text-xs bg-yellow-900/20 px-3 py-1 rounded">
                                <span className="text-yellow-400">Ch {chNum}</span>
                                <span className="text-green-400">0x{offset.toString(16).toUpperCase().padStart(4, '0')}</span>
                                <span className="text-yellow-300">{byte0.toString(16).toUpperCase().padStart(2, '0')} {byte1.toString(16).toUpperCase().padStart(2, '0')}</span>
                                <span className="text-white font-bold">TG Index: {tgIndex}</span>
                                <span className={isDigital ? 'text-green-400 font-bold' : 'text-cool-gray'}>{isDigital ? 'Digital' : 'Analog'}</span>
                              </div>
                            );
                          }
                          return <span className="text-red-400 text-xs">Invalid channel (1-2047)</span>;
                        })()}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">First 10 Channels</h4>
                      <div className="font-mono text-xs space-y-1">
                        {Array.from({ length: 10 }, (_, i) => {
                          const chNum = i + 1;
                          const offset = i * 2;
                          const byte0 = data[offset] ?? 0;
                          const byte1 = data[offset + 1] ?? 0;
                          const tgIndex = ((byte0 >> 4) << 8) | byte1;
                          const isDigital = (byte0 & 0x01) !== 0;
                          const hasData = offset + 1 < data.length;
                          return (
                            <div key={i} className="flex items-center gap-2 hover:bg-yellow-900/10 py-1 px-2 rounded">
                              <span className="text-yellow-400 w-20">Ch {chNum}</span>
                              <span className="text-green-400 w-16">0x{offset.toString(16).toUpperCase().padStart(4, '0')}</span>
                              {hasData ? (
                                <>
                                  <span className="text-yellow-300 w-16">{byte0.toString(16).toUpperCase().padStart(2, '0')} {byte1.toString(16).toUpperCase().padStart(2, '0')}</span>
                                  <span className="text-white w-24">TG Index: {tgIndex}</span>
                                  <span className={isDigital ? 'text-green-400' : 'text-cool-gray'}>{isDigital ? 'Digital' : 'Analog'}</span>
                                </>
                              ) : (
                                <span className="text-red-400">No data</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleSection>
            </>
          );
        })()}
      </MetadataBlockDisplay>

      {/* Metadata Block 0x43 (TX Contact - Channels 2049+ and VFOs) */}
      <MetadataBlockDisplay
        metadata={0x43}
        blockData={block43.data}
        blockAddress={block43.address}
        description="TX Contact for Channels 2049+ and VFOs (2 bytes per channel: Talk Group Index)"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      >
        {block43.data && (() => {
          const data = block43.data!;
          return (
            <>
              <CollapsibleSection title="TX Contact Structure Reference" defaultOpen={true}>
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">VFO TX Contact (Fixed Offsets)</h4>
                      <p className="text-xs text-cool-gray mb-2">Offsets shown are within this 4KB block (combined buffer offset - 0x1000)</p>
                      <div className="font-mono text-xs space-y-1">
                        {[
                          { name: 'VFO A (4001)', bufferOffset: 0x1FFA, blockOffset: 0x0FFA },
                          { name: 'VFO B (4002)', bufferOffset: 0x1FFC, blockOffset: 0x0FFC },
                        ].map((vfo) => {
                          const byte0 = data[vfo.blockOffset] ?? 0;
                          const byte1 = data[vfo.blockOffset + 1] ?? 0;
                          const tgIndex = ((byte0 >> 4) << 8) | byte1;
                          const isDigital = (byte0 & 0x01) !== 0;
                          const hasData = vfo.blockOffset < data.length;
                          return (
                            <div key={vfo.name} className="flex items-center gap-2 hover:bg-yellow-900/10 py-1 px-2 rounded">
                              <span className="text-yellow-400 w-24">{vfo.name}</span>
                              <span className="text-green-400 w-16">0x{vfo.blockOffset.toString(16).toUpperCase().padStart(4, '0')}</span>
                              {hasData ? (
                                <>
                                  <span className="text-yellow-300 w-16">{byte0.toString(16).toUpperCase().padStart(2, '0')} {byte1.toString(16).toUpperCase().padStart(2, '0')}</span>
                                  <span className="text-white w-24">TG Index: {tgIndex}</span>
                                  <span className={isDigital ? 'text-green-400' : 'text-cool-gray'}>{isDigital ? 'Digital' : 'Analog'}</span>
                                </>
                              ) : (
                                <span className="text-red-400">Offset out of bounds</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Entry Structure (2 bytes per channel)</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-green-400 font-mono">Byte 0 bits 7-4:</span> Talk Group Index bits 11-8</li>
                        <li><span className="text-green-400 font-mono">Byte 0 bits 3-1:</span> Reserved</li>
                        <li><span className="text-green-400 font-mono">Byte 0 bit 0:</span> Digital Flag (1=Digital, 0=Analog)</li>
                        <li><span className="text-green-400 font-mono">Byte 1:</span> Talk Group Index bits 7-0</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Offset Calculation (Channels 2049+)</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-yellow-300 font-mono">Formula:</span> 0x1000 + (channel & 0x7FF) * 2</li>
                        <li><span className="text-yellow-300 font-mono">Example:</span> Channel 2049 → offset 0x1002</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CollapsibleSection>
            </>
          );
        })()}
      </MetadataBlockDisplay>

      {/* Metadata Block 0x44 (Talk Groups) */}
      <MetadataBlockDisplay
        metadata={0x44}
        blockData={block44.data}
        blockAddress={block44.address}
        description="Talk Groups (DMR Group IDs)"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      >
        {block44.data && (() => {
          const data = block44.data!;
          const quickAccessData = block0B.data;
          
          // Parse Talk Group entries
          const parsedEntries: Array<{
            index: number;
            offset: number;
            hasHeader: boolean;
            flag: number;
            name: string;
            contactNumber: number;
            callType: number;
            callTypeStr: string;
            rawBytes: string;
            displayOrder: number;
          }> = [];
          
          // Helper function to parse a single entry at a specific offset
          const parseEntryAtOffset = (startOffset: number, contactIndex: number, displayOrder: number) => {
            let offset = startOffset;
            const entryStart = offset;
            let hasHeader = false;
            
            // Check for header byte on first entry
            if (contactIndex === 1 && data[offset] === 0x00) {
              hasHeader = true;
              offset++;
            }
            
            // Read flag byte
            const flag = data[offset];
            offset++;
            
            // Read name (16 bytes)
            let nameLength = 0;
            for (let i = 0; i < 16; i++) {
              const byte = data[offset + i];
              if (byte === 0x00 || byte === 0xFF) break;
              nameLength++;
            }
            
            const nameBytes = data.slice(offset, offset + nameLength);
            const name = new TextDecoder('ascii', { fatal: false }).decode(nameBytes).trim();
            offset += 16;
            
            // Skip null terminator
            offset++;
            
            // Read contact number (3 bytes, little-endian)
            const contactNumber = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
            offset += 3;
            
            // Read call type
            const callType = data[offset];
            offset++;
            
            // Skip 2 bytes padding
            offset += 2;
            
            const callTypeStr = callType === 0x05 ? 'All Call' :
                              callType === 0x04 ? 'Group Call' :
                              callType === 0x03 ? 'Private Call' :
                              `Unknown (0x${callType.toString(16).toUpperCase()})`;
            
            // Get raw bytes for this entry
            const rawBytes = Array.from(data.slice(entryStart, offset))
              .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
              .join(' ');
            
            return {
              index: contactIndex,
              offset: entryStart,
              hasHeader,
              flag,
              name,
              contactNumber,
              callType,
              callTypeStr,
              rawBytes,
              displayOrder
            };
          };
          
          // Helper to calculate entry offset based on sequential position
          const calculateOffset = (position: number): number => {
            if (position === 1) {
              return 0; // First entry starts at 0
            }
            // Entry 1: 25 bytes (1 header + 24 data)
            // Entry 2+: 24 bytes each
            return 25 + ((position - 2) * 24);
          };
          
          // First, parse all entries sequentially to build a map of contactIndex → parsed entry
          const entriesByIndex = new Map<number, ReturnType<typeof parseEntryAtOffset>>();
          let entryPosition = 1;
          
          while (true) {
            try {
              const offset = calculateOffset(entryPosition);
              
              if (offset >= data.length - 24) {
                break;
              }
              
              // Check if this is an empty entry
              let checkOffset = offset;
              if (entryPosition === 1 && data[offset] === 0x00) {
                checkOffset++; // Skip header
              }
              const nameStartOffset = checkOffset + 1; // Skip flag byte
              if (data[nameStartOffset] === 0x00) {
                break; // Empty entry, stop parsing
              }
              
              // Parse this entry
              const entry = parseEntryAtOffset(offset, entryPosition, entryPosition);
              
              // Skip empty entries
              if (entry.name.length === 0 && entry.contactNumber === 0) {
                break;
              }
              
              entriesByIndex.set(entryPosition, entry);
              entryPosition++;
            } catch (e) {
              console.error(`Failed to parse entry at position ${entryPosition}:`, e);
              break;
            }
          }
          
          // Use block 0x0B to determine display order
          if (quickAccessData && quickAccessData.length >= 0x700) {
            // Read Index Table 1 (0x100-0x6FF) - Name sorted order
            for (let i = 0; i < Math.floor((0x700 - 0x100) / 2); i++) {
              const tableOffset = 0x100 + (i * 2);
              const contactIndex = quickAccessData[tableOffset];
              const typeByte = quickAccessData[tableOffset + 1];
              
              // Stop at empty entry (0xFF 0xFF)
              if (contactIndex === 0xFF && typeByte === 0xFF) {
                break;
              }
              
              // Get the parsed entry for this contact index
              const entry = entriesByIndex.get(contactIndex);
              if (entry) {
                // Update display order
                parsedEntries.push({
                  ...entry,
                  displayOrder: i + 1
                });
              }
            }
          } else {
            // No block 0x0B available, use sequential order
            parsedEntries.push(...Array.from(entriesByIndex.values()));
          }
          
          return (
            <>
              {/* Talk Group Entries Summary */}
              <CollapsibleSection title="Talk Group Entries" defaultOpen={true}>
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <p className="text-sm text-cool-gray mb-3">
                    Parsed {parsedEntries.length} Talk Group entries from metadata block 0x44 using Quick Access List (0x0B) index table.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-yellow-600/30">
                          <th className="text-left py-2 px-3 text-yellow-400">Order</th>
                          <th className="text-left py-2 px-3 text-yellow-400">ID</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Offset</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Hdr</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Flag</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Name</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Contact #</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Call Type</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Raw Hex Bytes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedEntries.map((entry) => (
                          <tr key={`${entry.displayOrder}-${entry.index}`} className="border-b border-yellow-600/10 hover:bg-yellow-900/10">
                            <td className="py-2 px-3 text-yellow-400 font-mono">{entry.displayOrder}</td>
                            <td className="py-2 px-3 text-white font-mono">{entry.index}</td>
                            <td className="py-2 px-3 text-green-400 font-mono">0x{entry.offset.toString(16).toUpperCase().padStart(4, '0')}</td>
                            <td className="py-2 px-3 text-cool-gray font-mono text-xs">
                              {entry.hasHeader ? '✓' : '-'}
                            </td>
                            <td className="py-2 px-3 text-yellow-300 font-mono">0x{entry.flag.toString(16).toUpperCase().padStart(2, '0')}</td>
                            <td className="py-2 px-3 text-white">{entry.name || '(empty)'}</td>
                            <td className="py-2 px-3 text-white font-mono">{entry.contactNumber}</td>
                            <td className="py-2 px-3 text-green-400">{entry.callTypeStr}</td>
                            <td className="py-2 px-3 text-yellow-300 font-mono text-xs break-all max-w-md">
                              {entry.rawBytes}
                            </td>
                          </tr>
                        ))}
                        {parsedEntries.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-4 px-3 text-center text-cool-gray">
                              No Talk Group entries found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Structure Reference */}
              <CollapsibleSection title="Block 0x44 Structure Reference">
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Entry Structure</h4>
                      <p className="text-cool-gray mb-2">Each Talk Group entry:</p>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-green-400 font-mono">Entry 1:</span> 1 byte header (0x00) + 1 byte flag + 16 bytes name + 1 byte null + 3 bytes contact# + 1 byte call type + 2 bytes padding = 25 bytes</li>
                        <li><span className="text-green-400 font-mono">Entry 2+:</span> 1 byte flag + 16 bytes name + 1 byte null + 3 bytes contact# + 1 byte call type + 2 bytes padding = 24 bytes</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Field Details</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-yellow-300 font-mono">Header (Entry 1 only):</span> Always 0x00</li>
                        <li><span className="text-yellow-300 font-mono">Flag:</span> 0x00 = PC-created, 0x01 = Radio-created</li>
                        <li><span className="text-yellow-300 font-mono">Name:</span> 16 bytes, ASCII, null or 0xFF padded</li>
                        <li><span className="text-yellow-300 font-mono">Contact Number:</span> 3 bytes, little-endian (0-16777215)</li>
                        <li><span className="text-yellow-300 font-mono">Call Type:</span> 0x03 = Private Call, 0x04 = Group Call, 0x05 = All Call</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Parsing Method</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-yellow-300 font-mono">Using Block 0x0B:</span> We use Index Table 1 (at 0x100) from Quick Access Contact List (0x0B) to determine which contacts are active and their display order</li>
                        <li><span className="text-yellow-300 font-mono">Index Table Format:</span> Each entry is 2 bytes: [contact_index] [type_byte]</li>
                        <li><span className="text-yellow-300 font-mono">Contact Index:</span> Points to the specific entry in block 0x44 (0-based)</li>
                        <li><span className="text-yellow-300 font-mono">Entry Offset Calculation:</span> Entry 1 at 0x00, Entry 2+ at (25 + (index-2)*24)</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Notes</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li>Block size: 4096 bytes (4KB)</li>
                        <li>Metadata byte at 0xFFF: 0x44</li>
                        <li>First entry MUST have header byte for radio recognition</li>
                        <li>Entries are stored sequentially with no gaps</li>
                        <li>Empty entries have name starting with 0x00 and contact# = 0</li>
                        <li>Display order matches Index Table 1 from block 0x0B (name-sorted)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CollapsibleSection>
            </>
          );
        })()}
      </MetadataBlockDisplay>

      {/* Metadata Block 0x67 */}
      <MetadataBlockDisplay
        metadata={0x67}
        blockData={block67.data}
        blockAddress={block67.address}
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      />

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
            <CollapsibleSection title="Hex Dump (Full Contact Block)">
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
            </CollapsibleSection>
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
                  const dmrRadioIdIndex = channelBytes[0x2B]; // DMR Radio ID Index for TX (0-255, 0=None)
                  const reserved2C = channelBytes[0x2C];
                  const reserved2D = channelBytes[0x2D];

                  // Digital-only fields (only valid when mode is Digital or Fixed Digital)
                  const isDigital = mode === 'Digital' || mode === 'Fixed Digital';
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
                                offsetNum === 0x20 ? 'Color Code' :
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
                            <div className="w-36 text-yellow-400 font-bold text-center">ASCII</div>
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
                                  <div className="flex-1">{hexBytes}</div>
                                  <div className="w-36 text-green-400 text-center">{ascii}</div>
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
                                      <div className="flex-1">{hexBytes}</div>
                                      <div className="w-36 text-green-400 text-center">{ascii}</div>
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
      )}

      {/* CPS CSV Comparison */}
      {rawChannelData && rawChannelData.size > 0 && (
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

                    const dmrRadioIdIndex = channelBytes[0x2B]; // DMR Radio ID Index for TX (0-255, 0=None)

                    return {
                      name, rxFreq, txFreq, mode, forbidTx, busyLock, loneWorker,
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

