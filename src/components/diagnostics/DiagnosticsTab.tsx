import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useScanListsStore } from '../../store/scanListsStore';
import { useContactsStore } from '../../store/contactsStore';
import { useDigitalEmergencyStore } from '../../store/digitalEmergencyStore';
import { useAnalogEmergencyStore } from '../../store/analogEmergencyStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { useLogStore } from '../../store/logStore';
import { getCapabilitiesForModel } from '../../radios/capabilities';
import {
  POWER_ON_INTERFACE_OPTIONS,
  COLOR_OPTIONS,
  UTC_ZONE_OPTIONS,
  BUTTON_FUNCTION_OPTIONS,
} from './diagnosticsConstants';
import { MetadataBlockDisplay } from './MetadataBlockDisplay';
import { CollapsibleSection } from './CollapsibleSection';
import { OffsetInspector } from './OffsetInspector';
import { FieldVerificationTable } from './FieldVerificationTable';
import { exportFullDebug, exportWriteBlocks, downloadDebug } from '../../services/debugExport';
import { analyzeMetadata, generateMetadataReport } from '../../services/metadataAnalysis';
import { exportCodeplug } from '../../services/codeplugExport';
import { BOOT_IMAGE } from '../../utils/bootImage';
import JSZip from 'jszip';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmModal } from '../ui/ConfirmModal';

export const DiagnosticsTab: React.FC = () => {
  const { rawRadioSettingsData, rawContactBlockAddress, rawContactBlocks, blockMetadata, blockData, writeBlockData, radioInfo, zoneComparisonData, bootImageRaw } = useRadioStore();
  const { settings: radioSettings, getChangedFields } = useRadioSettingsStore();
  const { channels, rawChannelData } = useChannelsStore();
  const { zones, rawZoneData } = useZonesStore();
  const { scanLists } = useScanListsStore();
  const { contacts } = useContactsStore();
  const { systems: digitalEmergencies, config: digitalEmergencyConfig } = useDigitalEmergencyStore();
  const { systems: analogEmergencies } = useAnalogEmergencyStore();
  const { groups: rxGroups, groupsLoaded: rxGroupsLoaded } = useRXGroupsStore();
  const { messages: quickMessages } = useQuickMessagesStore();
  const { contacts: quickContacts } = useQuickContactsStore();
  const { radioIds: dmrRadioIds } = useDMRRadioIDsStore();
  const caps = useMemo(() => getCapabilitiesForModel(radioInfo?.model), [radioInfo?.model]);
  const [showMetadataBlock, setShowMetadataBlock] = useState(false);
  const [showMetadataBlock41, setShowMetadataBlock41] = useState(false);
  const [showContactBlock, setShowContactBlock] = useState(true);
  const [showChannelParser, setShowChannelParser] = useState(false);
  const [inspectOffset41, setInspectOffset41] = useState<string>('');
  const [inspectContactOffset, setInspectContactOffset] = useState<string>('');
  const [showContactWriteBlocks, setShowContactWriteBlocks] = useState(false);
  const [expandedContactBlocks, setExpandedContactBlocks] = useState<Set<number>>(new Set());
  const [contactBlockOffsets, setContactBlockOffsets] = useState<Map<number, string>>(new Map());
  const [selectedContactBlock, setSelectedContactBlock] = useState<number | null>(null);
  const [showExpectedWriteData, setShowExpectedWriteData] = useState(false);

  // Initialize selected block to first block if available
  React.useEffect(() => {
    if (rawContactBlocks.size > 0 && selectedContactBlock === null) {
      const firstBlockAddr = Array.from(rawContactBlocks.keys()).sort((a, b) => a - b)[0];
      setSelectedContactBlock(firstBlockAddr);
    }
  }, [rawContactBlocks, selectedContactBlock]);
  const [selectedChannelNumber, setSelectedChannelNumber] = useState<number>(1);
  const [selectedChannelNumber2, setSelectedChannelNumber2] = useState<number | null>(null);
  const [showCpsComparison, setShowCpsComparison] = useState(false);
  const [cpsCsvData, setCpsCsvData] = useState<Map<number, Record<string, string>> | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE'>('ALL');
  const [logContextFilter, setLogContextFilter] = useState<string>('');
  const logViewerRef = useRef<HTMLDivElement>(null);
  const [txContactLookupChannel, setTxContactLookupChannel] = useState<string>('');
  const [showBootImageSection, setShowBootImageSection] = useState(true);
  const [inspectBootImageOffset, setInspectBootImageOffset] = useState<string>('');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  
  const { logs, clearLogs, maxLogs, setMaxLogs } = useLogStore();

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
  const block11 = getBlockByMetadata(0x11); // Scan Lists
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

    // Add all contact blocks if available
    if (rawContactBlocks.size > 0) {
      for (const [blockAddr, blockData] of rawContactBlocks.entries()) {
        const hexDump = generateHexDump(blockData, 'CONTACTS');
        const blockAddrHex = blockAddr.toString(16).toUpperCase().padStart(6, '0');
        zip.file(`contact-block-0x${blockAddrHex}.txt`, hexDump);
        zip.file(`contact-block-0x${blockAddrHex}.bin`, blockData);
        blocksAdded++;
      }
    }

    if (blocksAdded === 0) {
      setAlertMessage('No metadata blocks available to download. Please read from radio first.');
      setAlertOpen(true);
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
      setAlertMessage('Failed to create zip file. See console for details.');
      setAlertOpen(true);
    }
  };

  const handleExportExpectedWriteHex = () => {
    if (channels.length === 0) {
      setAlertMessage('No channels available to export.');
      setAlertOpen(true);
      return;
    }

    // Create a summary of expected write data in hex format
    const summary = {
      channels: channels.length,
      zones: zones.length,
      estimatedChannelBlocks: Math.ceil(channels.length / 125),
      estimatedZoneBlocks: zones.length > 0 ? 1 : 0,
      channelData: channels.map(ch => ({
        number: ch.number,
        name: ch.name,
        rxFreq: ch.rxFrequency.toFixed(4),
        txFreq: ch.txFrequency.toFixed(4),
        mode: ch.mode,
      })),
      zoneData: zones.map(zone => ({
        name: zone.name,
        channelCount: zone.channels.length,
        channels: zone.channels,
      })),
      note: 'This is a preview. Actual write data is generated during the write process.',
    };

    const hexContent = JSON.stringify(summary, null, 2);
    const blob = new Blob([hexContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.download = `expected-write-data-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportExpectedWriteBin = () => {
    if (channels.length === 0) {
      setAlertMessage('No channels available to export.');
      setAlertOpen(true);
      return;
    }

    // Create a text summary for binary format (JSON for now)
    const summary = {
      channels: channels.length,
      zones: zones.length,
      estimatedChannelBlocks: Math.ceil(channels.length / 125),
      estimatedZoneBlocks: zones.length > 0 ? 1 : 0,
      note: 'Full binary write data generation requires an active write operation.',
      suggestion: 'Use "Write to Radio" to generate actual binary blocks, then check writeBlockData in debug export.',
    };

    const content = JSON.stringify(summary, null, 2);
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.download = `expected-write-summary-${timestamp}.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFullDebugExport = async () => {
    if (channels.length === 0 && zones.length === 0 && logs.length === 0 && blockMetadata.size === 0 && blockData.size === 0) {
      setAlertMessage('No data or logs to export. Please read from radio first.');
      setAlertOpen(true);
      return;
    }

    try {
      const zip = new JSZip();

      // Convert logs to export format
      const exportLogs = logs.map(log => ({
        timestamp: new Date(log.timestamp).toISOString(),
        level: log.level.toLowerCase() as 'log' | 'warn' | 'error' | 'info' | 'debug' | 'verbose',
        message: log.message,
        error: log.error,
        context: log.context,
      }));

      // Get full debug data
      const debugData = exportFullDebug(
        channels, 
        zones, 
        rawChannelData, 
        rawZoneData, 
        exportLogs,
        blockMetadata,
        blockData,
        writeBlockData,
        zoneComparisonData
      );

      // Create read folder with data from radio
      const readFolder = zip.folder('read');
      if (readFolder) {
        readFolder.file('full-debug-data.json', debugData);
        
        // Add individual block data
        for (const [address, data] of blockData.entries()) {
          const metadataInfo = blockMetadata.get(address);
          if (metadataInfo) {
            const metadataHex = metadataInfo.metadata.toString(16).toUpperCase().padStart(2, '0');
            const addressHex = address.toString(16).toUpperCase().padStart(6, '0');
            readFolder.file(`block-0x${metadataHex}-addr-0x${addressHex}.bin`, data);
          }
        }
      }

      // Create write folder with expected write data
      const writeFolder = zip.folder('write');
      if (writeFolder && writeBlockData.size > 0) {
        // Add write blocks
        for (const [, block] of writeBlockData.entries()) {
          const metadataHex = block.metadata.toString(16).toUpperCase().padStart(2, '0');
          const addressHex = block.address.toString(16).toUpperCase().padStart(6, '0');
          writeFolder.file(`write-block-0x${metadataHex}-addr-0x${addressHex}.bin`, block.data);
        }
        
        // Add write summary
        const writeSummary = {
          totalBlocks: writeBlockData.size,
          channels: channels.length,
          zones: zones.length,
          blocks: Array.from(writeBlockData.values()).map(block => ({
            address: `0x${block.address.toString(16).toUpperCase().padStart(6, '0')}`,
            metadata: `0x${block.metadata.toString(16).toUpperCase().padStart(2, '0')}`,
            size: block.data.length,
          })),
        };
        writeFolder.file('write-summary.json', JSON.stringify(writeSummary, null, 2));
      } else if (writeFolder) {
        // Add placeholder if no write data
        const expectedWrite = {
          channels: channels.length,
          zones: zones.length,
          note: 'No write data available yet. Perform a "Write to Radio" operation to generate write blocks.',
          estimatedChannelBlocks: Math.ceil(channels.length / 125),
          estimatedZoneBlocks: zones.length > 0 ? 1 : 0,
        };
        writeFolder.file('expected-write-data.json', JSON.stringify(expectedWrite, null, 2));
      }

      // Add codeplug XLSX
      const codeplugData = {
        channels,
        zones,
        scanLists,
        contacts,
        digitalEmergencies,
        digitalEmergencyConfig,
        analogEmergencies,
        radioSettings,
        radioInfo,
        exportDate: new Date().toISOString(),
        version: '1.0.0',
      };

      const xlsxBlob = await exportCodeplug(codeplugData, true);
      if (xlsxBlob instanceof Blob) {
        zip.file('codeplug.xlsx', xlsxBlob);
      }

      // Generate and download zip
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `neonplug-full-export-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error creating export:', error);
      setAlertMessage('Failed to create export. See console for details.');
      setAlertOpen(true);
    }
  };

  const handleWriteBlocksExport = () => {
    if (writeBlockData.size === 0) {
      setAlertMessage('No write blocks available. Please write to radio first.');
      setAlertOpen(true);
      return;
    }

    const writeBlocksData = exportWriteBlocks(writeBlockData, blockData);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadDebug(writeBlocksData, `neonplug-write-blocks-${timestamp}.json`);
  };

  const handleMetadataAnalysisExport = () => {
    if (blockMetadata.size === 0) {
      setAlertMessage('No block metadata available. Please read from radio first.');
      setAlertOpen(true);
      return;
    }

    const analysis = analyzeMetadata(blockMetadata, blockData);
    const report = generateMetadataReport(analysis);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadDebug(report, `neonplug-metadata-analysis-${timestamp}.txt`);
  };

  if (!radioSettings || !rawRadioSettingsData) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6">
          <div className="mb-6">
            <SectionTitle as="h2" size="xl" bold className="text-2xl !text-yellow-400">Diagnostics & Debug</SectionTitle>
            <p className="text-cool-gray text-sm mt-1">Radio settings diagnostic tools</p>
          </div>

          {/* Debug Export Section - Always visible */}
          <div className="mb-6 bg-gradient-to-br from-cyan-900/20 to-blue-900/20 border border-cyan-600/40 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <h3 className="text-xl font-semibold text-cyan-400">Debug Exports</h3>
                  <p className="text-xs text-cyan-300/70">Download debug data, logs, and memory blocks</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={handleFullDebugExport}
                className="px-4 py-3 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-600/40 rounded-lg text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-cyan-300 font-semibold text-sm">Full Debug Export</div>
                    <div className="text-cyan-400/70 text-xs mt-0.5">
                      Complete ZIP with read/write folders + codeplug
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-cyan-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
              </button>

              <button
                onClick={handleWriteBlocksExport}
                disabled={writeBlockData.size === 0}
                className="px-4 py-3 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-600/40 rounded-lg text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-purple-300 font-semibold text-sm">Write Blocks</div>
                    <div className="text-purple-400/70 text-xs mt-0.5">
                      {writeBlockData.size > 0 ? `${writeBlockData.size} blocks` : 'No write data yet'}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
              </button>

              <button
                onClick={handleMetadataAnalysisExport}
                disabled={blockMetadata.size === 0}
                className="px-4 py-3 bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-600/40 rounded-lg text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-yellow-300 font-semibold text-sm">Metadata Analysis</div>
                    <div className="text-yellow-400/70 text-xs mt-0.5">
                      {blockMetadata.size > 0 ? `${blockMetadata.size} blocks` : 'No metadata yet'}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-yellow-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </button>

              <button
                onClick={downloadAllMetadataBlocks}
                disabled={blockMetadata.size === 0 && !rawRadioSettingsData}
                className="px-4 py-3 bg-green-600/30 hover:bg-green-600/50 border border-green-600/40 rounded-lg text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-green-300 font-semibold text-sm">All Blocks (ZIP)</div>
                    <div className="text-green-400/70 text-xs mt-0.5">
                      Individual HEX + BIN files
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-green-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
              </button>
            </div>
          </div>

          <Card className="!border-yellow-600/30">
            <EmptyState message="No radio settings data available. Read from radio to view diagnostics." />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="h-full overflow-y-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <SectionTitle as="h2" size="xl" bold className="text-2xl !text-yellow-400">Diagnostics & Debug</SectionTitle>
            <p className="text-cool-gray text-sm mt-1">Inspect raw memory offsets and verify field parsing</p>
          </div>
        </div>
      </div>

      {/* Debug Export Section */}
      <div className="mb-6 bg-gradient-to-br from-cyan-900/20 to-blue-900/20 border border-cyan-600/40 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <h3 className="text-xl font-semibold text-cyan-400">Debug Exports</h3>
              <p className="text-xs text-cyan-300/70">Download debug data, logs, and memory blocks</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={handleFullDebugExport}
            className="px-4 py-3 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-600/40 rounded-lg text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-cyan-300 font-semibold text-sm">Full Debug Export</div>
                <div className="text-cyan-400/70 text-xs mt-0.5">
                  Complete ZIP with read/write folders + codeplug
                </div>
              </div>
              <svg className="w-5 h-5 text-cyan-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
          </button>

          <button
            onClick={handleWriteBlocksExport}
            disabled={writeBlockData.size === 0}
            className="px-4 py-3 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-600/40 rounded-lg text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-purple-300 font-semibold text-sm">Write Blocks</div>
                <div className="text-purple-400/70 text-xs mt-0.5">
                  {writeBlockData.size > 0 ? `${writeBlockData.size} blocks` : 'No write data yet'}
                </div>
              </div>
              <svg className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
          </button>

          <button
            onClick={handleMetadataAnalysisExport}
            disabled={blockMetadata.size === 0}
            className="px-4 py-3 bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-600/40 rounded-lg text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-yellow-300 font-semibold text-sm">Metadata Analysis</div>
                <div className="text-yellow-400/70 text-xs mt-0.5">
                  {blockMetadata.size > 0 ? `${blockMetadata.size} blocks` : 'No metadata yet'}
                </div>
              </div>
              <svg className="w-5 h-5 text-yellow-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </button>

          <button
            onClick={downloadAllMetadataBlocks}
            disabled={blockMetadata.size === 0 && !rawRadioSettingsData}
            className="px-4 py-3 bg-green-600/30 hover:bg-green-600/50 border border-green-600/40 rounded-lg text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-green-300 font-semibold text-sm">All Blocks (ZIP)</div>
                <div className="text-green-400/70 text-xs mt-0.5">
                  Individual HEX + BIN files
                </div>
              </div>
              <svg className="w-5 h-5 text-green-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
          </button>
        </div>
      </div>

      {/* Boot Image (Raw) - from Settings read */}
      {bootImageRaw && bootImageRaw.length > 0 && (
        <div className="mb-6 bg-deep-gray rounded-lg border border-neon-cyan border-opacity-40 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-neon-cyan">Boot Image (Raw)</h3>
              <span className="px-2 py-1 bg-cyan-900/30 text-neon-cyan text-xs rounded border border-neon-cyan/40">
                {bootImageRaw.length.toLocaleString()} bytes · {BOOT_IMAGE.BLOCKS} blocks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadHexDump(bootImageRaw, 'boot-image-hexdump.txt')}
                className="px-3 py-1 text-xs text-neon-cyan hover:text-cyan-300 border border-neon-cyan/40 hover:border-neon-cyan rounded transition-colors"
                title="Download hex dump"
              >
                Hex
              </button>
              <button
                type="button"
                onClick={() => downloadBinary(bootImageRaw, 'boot-image.bin')}
                className="px-3 py-1 text-xs text-neon-cyan hover:text-cyan-300 border border-neon-cyan/40 hover:border-neon-cyan rounded transition-colors"
                title="Download binary"
              >
                Bin
              </button>
              <button
                type="button"
                onClick={() => setShowBootImageSection(!showBootImageSection)}
                className="text-sm text-neon-cyan hover:text-cyan-300"
              >
                {showBootImageSection ? '▼ Hide' : '▶ Show'}
              </button>
            </div>
          </div>
          <p className="text-cool-gray text-sm mb-4">
            Raw boot image from radio. Base address from V-Frame 0x0E (e.g. 0x150000). 153600 bytes raw BGR565, no header. Inspect to verify format/byte order.
          </p>
          {showBootImageSection && (
            <div className="space-y-6">
              <CollapsibleSection title="Offset Inspector (Boot Image)">
                <OffsetInspector
                  data={bootImageRaw}
                  idPrefix="bootimg"
                  placeholder="0x000"
                  knownOffsets={[
                    { offset: 0x000, field: 'Pixel data start (BGR565, 240×320×2)' },
                    { offset: 0x1000, field: 'Second 4KB block' },
                  ]}
                />
              </CollapsibleSection>
              <CollapsibleSection title="Hex Dump (Boot Image)">
                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan/20 p-4">
                  <div className="mb-4">
                    <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inspectBootImageOffset}
                        onChange={(e) => setInspectBootImageOffset(e.target.value)}
                        placeholder="0x000"
                        className="flex-1 px-3 py-2 bg-deep-gray border border-neon-cyan/30 rounded text-white text-sm font-mono focus:outline-none focus:border-neon-cyan"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const offset = parseInt(inspectBootImageOffset.replace(/^0x/i, ''), 16);
                          if (!isNaN(offset) && offset >= 0 && offset < bootImageRaw.length) {
                            document.getElementById(`bootimg-hex-${offset}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="px-4 py-2 bg-cyan-900/30 text-neon-cyan text-sm rounded border border-neon-cyan/30 hover:bg-cyan-900/50"
                      >
                        Go
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto font-mono text-xs">
                    {Array.from({ length: Math.ceil(bootImageRaw.length / 16) }, (_, row) => {
                      const offset = row * 16;
                      const rowBytes = bootImageRaw.slice(offset, offset + 16);
                      const hexBytes = Array.from(rowBytes)
                        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
                        .join(' ');
                      const ascii = Array.from(rowBytes)
                        .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
                        .join('');
                      return (
                        <div
                          key={offset}
                          id={`bootimg-hex-${offset}`}
                          className="flex gap-4 py-0.5 border-b border-neon-cyan/10 hover:bg-neon-cyan/5"
                        >
                          <span className="text-cyan-300 w-16 flex-shrink-0">0x{offset.toString(16).toUpperCase().padStart(4, '0')}</span>
                          <span className="text-green-400 break-all">{hexBytes}</span>
                          <span className="text-cool-gray flex-shrink-0">{ascii}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          )}
        </div>
      )}

      {/* Metadata Block 0x02 (Calibration) */}
      <MetadataBlockDisplay
        metadata={0x02}
        blockData={block02.data}
        blockAddress={block02.address}
        description="Calibration data"
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
          {rawRadioSettingsData && (
            <OffsetInspector
              data={rawRadioSettingsData}
              idPrefix="offset"
              placeholder="0x120"
              knownOffsets={[
                { offset: 0x00, field: 'Power On Interface', getUIValue: (hex) => POWER_ON_INTERFACE_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x30, field: 'Backlight Brightness', getUIValue: (hex) => `${hex + 1}` }, // Backlight: stored 0-5, displayed 1-6
                { offset: 0x34, field: 'Callsign Color', getUIValue: (hex) => COLOR_OPTIONS.find(o => o.value === (hex & 0x0F))?.label || `${hex & 0x0F}` },
                { offset: 0x35, field: 'Standby Text Color', getUIValue: (hex) => COLOR_OPTIONS.find(o => o.value === (hex & 0x0F))?.label || `${hex & 0x0F}` },
                { offset: 0x38, field: 'Channel A Color', getUIValue: (hex) => COLOR_OPTIONS.find(o => o.value === (hex & 0x0F))?.label || `${hex & 0x0F}` },
                { offset: 0x39, field: 'Channel B Color', getUIValue: (hex) => COLOR_OPTIONS.find(o => o.value === (hex & 0x0F))?.label || `${hex & 0x0F}` },
                { offset: 0x3A, field: 'Zone A Color', getUIValue: (hex) => COLOR_OPTIONS.find(o => o.value === (hex & 0x0F))?.label || `${hex & 0x0F}` },
                { offset: 0x3B, field: 'Zone B Color', getUIValue: (hex) => COLOR_OPTIONS.find(o => o.value === (hex & 0x0F))?.label || `${hex & 0x0F}` },
                { offset: 0x41, field: 'UTC Zone', getUIValue: (hex) => UTC_ZONE_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x85, field: 'Lock Key (bit 0), Knob Lock (bit 1), Side Key Lock (bit 2)', getUIValue: (hex) => {
                  const bits = [];
                  if ((hex & 0x01) === 0) bits.push('Manual');
                  else bits.push('Auto');
                  if ((hex & 0x02) !== 0) bits.push('Knob On');
                  if ((hex & 0x04) !== 0) bits.push('Side Key On');
                  return bits.join(', ') || 'Off';
                }},
                { offset: 0x86, field: 'Auto Keypad Lock Delay Time', getUIValue: (hex) => `${hex}s` },
                { offset: 0x87, field: 'SK1 Short', getUIValue: (hex) => BUTTON_FUNCTION_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x88, field: 'SK1 Long', getUIValue: (hex) => BUTTON_FUNCTION_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x89, field: 'SK2 Short', getUIValue: (hex) => BUTTON_FUNCTION_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x8A, field: 'SK2 Long', getUIValue: (hex) => BUTTON_FUNCTION_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x8D, field: 'P1 Short', getUIValue: (hex) => BUTTON_FUNCTION_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x8E, field: 'P1 Long', getUIValue: (hex) => BUTTON_FUNCTION_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x8F, field: 'P2 Short', getUIValue: (hex) => BUTTON_FUNCTION_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x90, field: 'P2 Long', getUIValue: (hex) => BUTTON_FUNCTION_OPTIONS.find(o => o.value === hex)?.label || `${hex}` },
                { offset: 0x93, field: 'Long Press Time', getUIValue: (hex) => `${hex + 1}` }, // +1 for display
                { offset: 0x120, field: 'Analog Call 1 - Call Type', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x121, field: 'Analog Call 1 - Call ID', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x122, field: 'Analog Call 2 - Call Type', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x123, field: 'Analog Call 2 - Call ID', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x124, field: 'Analog Call 3 - Call Type', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x125, field: 'Analog Call 3 - Call ID', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x126, field: 'Analog Call 4 - Call Type', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x127, field: 'Analog Call 4 - Call ID', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x200, field: 'One Touch Call 1 - Call Type', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x201, field: 'One Touch Call 1 - Call Object (low)', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x202, field: 'One Touch Call 1 - Call Object (high)', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x203, field: 'One Touch Call 1 - Digital Call Type', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x204, field: 'One Touch Call 1 - SMS', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x230, field: 'Fun+0 - Number Key', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x231, field: 'Fun+0 - Operate Mode', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x232, field: 'Fun+0 - Menu Select', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x233, field: 'Fun+0 - Call Way', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x234, field: 'Fun+0 - Call Object', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x235, field: 'Fun+0 - Digital Call Type', getUIValue: (_hex) => `${_hex}` },
                { offset: 0x236, field: 'Fun+0 - SMS', getUIValue: (_hex) => `${_hex}` },
              ]}
            />
          )}
        </CollapsibleSection>

        {/* Field Verification Table */}
        <CollapsibleSection title="Field Verification">
          {rawRadioSettingsData && !caps?.diagnostics && (
            <p className="text-cool-gray">Field verification not available for this radio.</p>
          )}
          {rawRadioSettingsData && caps?.diagnostics && (() => {
            try {
              const parsed = caps.diagnostics.parseRadioSettings(rawRadioSettingsData);
              const fields = [
                { name: 'Power On Interface', offset: 0x00, parsed: parsed.powerOnInterface, ui: radioSettings?.powerOnInterface, rawHex: rawRadioSettingsData[0x00] },
                { name: 'Backlight Brightness', offset: 0x30, parsed: parsed.backlightBrightness, ui: radioSettings?.backlightBrightness, rawHex: rawRadioSettingsData[0x30] },
                { name: 'Callsign Color', offset: 0x34, parsed: parsed.callsignColor, ui: radioSettings?.callsignColor, rawHex: rawRadioSettingsData[0x34] },
                { name: 'Standby Text Color', offset: 0x35, parsed: parsed.standbyTextColor, ui: radioSettings?.standbyTextColor, rawHex: rawRadioSettingsData[0x35] },
                { name: 'Channel A Color', offset: 0x38, parsed: parsed.channelAColor, ui: radioSettings?.channelAColor, rawHex: rawRadioSettingsData[0x38] },
                { name: 'Channel B Color', offset: 0x39, parsed: parsed.channelBColor, ui: radioSettings?.channelBColor, rawHex: rawRadioSettingsData[0x39] },
                { name: 'Zone A Color', offset: 0x3A, parsed: parsed.zoneAColor, ui: radioSettings?.zoneAColor, rawHex: rawRadioSettingsData[0x3A] },
                { name: 'Zone B Color', offset: 0x3B, parsed: parsed.zoneBColor, ui: radioSettings?.zoneBColor, rawHex: rawRadioSettingsData[0x3B] },
                { name: 'UTC Zone', offset: 0x41, parsed: parsed.utcZone, ui: radioSettings?.utcZone, rawHex: rawRadioSettingsData[0x41] },
                { name: 'Lock Key', offset: 0x85, parsed: parsed.lockKey, ui: radioSettings?.lockKey, isBit: true, rawHex: rawRadioSettingsData[0x85] },
                { name: 'Auto Keypad Lock Delay', offset: 0x86, parsed: parsed.autoKeypadLockDelayTime, ui: radioSettings?.autoKeypadLockDelayTime, rawHex: rawRadioSettingsData[0x86] },
                { name: 'SK1 Short', offset: 0x87, parsed: parsed.sk1Short, ui: radioSettings?.sk1Short, rawHex: rawRadioSettingsData[0x87] },
                { name: 'SK1 Long', offset: 0x88, parsed: parsed.sk1Long, ui: radioSettings?.sk1Long, rawHex: rawRadioSettingsData[0x88] },
                { name: 'SK2 Short', offset: 0x89, parsed: parsed.sk2Short, ui: radioSettings?.sk2Short, rawHex: rawRadioSettingsData[0x89] },
                { name: 'SK2 Long', offset: 0x8A, parsed: parsed.sk2Long, ui: radioSettings?.sk2Long, rawHex: rawRadioSettingsData[0x8A] },
                { name: 'P1 Short', offset: 0x8D, parsed: parsed.p1Short, ui: radioSettings?.p1Short, rawHex: rawRadioSettingsData[0x8D] },
                { name: 'P1 Long', offset: 0x8E, parsed: parsed.p1Long, ui: radioSettings?.p1Long, rawHex: rawRadioSettingsData[0x8E] },
                { name: 'P2 Short', offset: 0x8F, parsed: parsed.p2Short, ui: radioSettings?.p2Short, rawHex: rawRadioSettingsData[0x8F] },
                { name: 'P2 Long', offset: 0x90, parsed: parsed.p2Long, ui: radioSettings?.p2Long, rawHex: rawRadioSettingsData[0x90] },
                { name: 'Long Press Time', offset: 0x93, parsed: parsed.longPressTime, ui: radioSettings?.longPressTime, rawHex: rawRadioSettingsData[0x93] },
              ];
              return <FieldVerificationTable fields={fields} data={rawRadioSettingsData} />;
            } catch (err) {
              return (
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <div className="text-red-400 text-center">
                    Error parsing: {err instanceof Error ? err.message : String(err)}
                  </div>
                </div>
              );
            }
          })()}
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
                        <div className="w-[52ch] text-yellow-300 px-2">{hexBytes}{hexPadding}</div>
                        <div className="min-w-[16ch] w-[16ch] text-green-400 px-2 ml-4 whitespace-nowrap">{ascii}</div>
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
                      
                      const callType = typeByte === 0x30 ? 'Private Call' :
                                     typeByte === 0x40 ? 'Group Call' :
                                     typeByte === 0x50 ? 'All Call' :
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
                      
                      const callType = typeByte === 0x30 ? 'Private Call' :
                                     typeByte === 0x40 ? 'Group Call' :
                                     typeByte === 0x50 ? 'All Call' :
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
                      <li><span className="text-yellow-300 font-mono">0x30</span>: Private Call</li>
                      <li><span className="text-yellow-300 font-mono">0x40</span>: Group Call</li>
                      <li><span className="text-yellow-300 font-mono">0x50</span>: All Call</li>
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

      {/* Metadata Block 0x10 (Digital Emergency Systems and Encryption Keys) */}
      <MetadataBlockDisplay
        metadata={0x10}
        blockData={block10.data}
        blockAddress={block10.address}
        description="Digital Emergency Systems and Encryption Keys"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      />

      {/* Metadata Block 0x11 (Scan Lists) */}
      <MetadataBlockDisplay
        metadata={0x11}
        blockData={block11.data}
        blockAddress={block11.address}
        description="Scan Lists"
        downloadHexDump={downloadHexDump}
        downloadBinary={downloadBinary}
      />

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
              {block41Data && (
                <OffsetInspector
                  data={block41Data}
                  idPrefix="offset41"
                  placeholder="0x000"
                  knownOffsets={[
                    { 
                      offset: 0x0F9F, 
                      field: 'VFO A Channel (4001) - Start',
                      getUIValue: (_hex, data, offset) => {
                        const nameBytes = data.slice(offset, offset + 16);
                        const nullIndex = nameBytes.indexOf(0);
                        const name = new TextDecoder('ascii', { fatal: false })
                          .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : 16))
                          .replace(/\x00/g, '')
                          .trim();
                        return name || 'Empty';
                      }
                    },
                    { offset: 0x0FAF, field: 'VFO A - RX Frequency (BCD)' },
                    { offset: 0x0FB3, field: 'VFO A - TX Frequency (BCD)' },
                    { offset: 0x0FB7, field: 'VFO A - Mode Flags' },
                    { 
                      offset: 0x0FCF, 
                      field: 'VFO B Channel (4002) - Start',
                      getUIValue: (_hex, data, offset) => {
                        const nameBytes = data.slice(offset, offset + 16);
                        const nullIndex = nameBytes.indexOf(0);
                        const name = new TextDecoder('ascii', { fatal: false })
                          .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : 16))
                          .replace(/\x00/g, '')
                          .trim();
                        return name || 'Empty';
                      }
                    },
                    { offset: 0x0FDF, field: 'VFO B - RX Frequency (BCD)' },
                    { offset: 0x0FE3, field: 'VFO B - TX Frequency (BCD)' },
                    { offset: 0x0FE7, field: 'VFO B - Mode Flags' },
                  ]}
                />
              )}
            </CollapsibleSection>

            {/* Field Verification for Block 0x41 */}
            <CollapsibleSection title="Field Verification (Block 0x41)">
              {block41Data && radioSettings && (
                <FieldVerificationTable
                  fields={[
                    { 
                      name: 'VFO A Channel (4001)', 
                      offset: 0x0F9F, 
                      parsed: radioSettings.vfoA?.name || 'N/A', 
                      ui: radioSettings.vfoA?.name || 'N/A',
                      rawHex: block41Data[0x0F9F] || 0
                    },
                    { 
                      name: 'VFO A RX Frequency', 
                      offset: 0x0FAF, 
                      parsed: radioSettings.vfoA?.rxFrequency?.toFixed(4) || 'N/A', 
                      ui: radioSettings.vfoA?.rxFrequency?.toFixed(4) || 'N/A',
                      rawHex: block41Data[0x0FAF] || 0
                    },
                    { 
                      name: 'VFO A TX Frequency', 
                      offset: 0x0FB3, 
                      parsed: radioSettings.vfoA?.txFrequency?.toFixed(4) || 'N/A', 
                      ui: radioSettings.vfoA?.txFrequency?.toFixed(4) || 'N/A',
                      rawHex: block41Data[0x0FB3] || 0
                    },
                    { 
                      name: 'VFO B Channel (4002)', 
                      offset: 0x0FCF, 
                      parsed: radioSettings.vfoB?.name || 'N/A', 
                      ui: radioSettings.vfoB?.name || 'N/A',
                      rawHex: block41Data[0x0FCF] || 0
                    },
                    { 
                      name: 'VFO B RX Frequency', 
                      offset: 0x0FDF, 
                      parsed: radioSettings.vfoB?.rxFrequency?.toFixed(4) || 'N/A', 
                      ui: radioSettings.vfoB?.rxFrequency?.toFixed(4) || 'N/A',
                      rawHex: block41Data[0x0FDF] || 0
                    },
                    { 
                      name: 'VFO B TX Frequency', 
                      offset: 0x0FE3, 
                      parsed: radioSettings.vfoB?.txFrequency?.toFixed(4) || 'N/A', 
                      ui: radioSettings.vfoB?.txFrequency?.toFixed(4) || 'N/A',
                      rawHex: block41Data[0x0FE3] || 0
                    },
                  ]}
                  data={block41Data}
                />
              )}
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
                            <div className="w-[52ch] text-yellow-300 px-2">{hexBytes}{hexPadding}</div>
                            <div className="min-w-[16ch] w-[16ch] text-green-400 px-2 ml-4 whitespace-nowrap">{ascii}</div>
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

      {/* Contact Blocks */}
      {rawContactBlocks.size > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-yellow-400">DMR Contact Blocks</h3>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                {rawContactBlocks.size} Block(s)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {rawContactBlocks.size > 0 && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const zip = new JSZip();
                    
                    // Helper to generate hex dump
                    const generateHexDump = (data: Uint8Array, prefix: string): string => {
                      const bytesPerRow = 16;
                      let hexDump = `${prefix} Block Hex Dump\n`;
                      hexDump += `Length: ${data.length} bytes (0x${data.length.toString(16).toUpperCase()})\n`;
                      hexDump += '='.repeat(80) + '\n\n';
                      
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
                    
                    // Add all contact blocks to zip
                    for (const [blockAddr, blockData] of rawContactBlocks.entries()) {
                      const hexDump = generateHexDump(blockData, 'CONTACTS');
                      const blockAddrHex = blockAddr.toString(16).toUpperCase().padStart(6, '0');
                      zip.file(`contact-block-0x${blockAddrHex}.txt`, hexDump);
                      zip.file(`contact-block-0x${blockAddrHex}.bin`, blockData);
                    }
                    
                    // Generate and download zip
                    try {
                      const blob = await zip.generateAsync({ type: 'blob' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                      a.download = `contact-blocks-${timestamp}.zip`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      console.error('Error generating zip:', error);
                      setAlertMessage('Failed to generate zip file');
                      setAlertOpen(true);
                    }
                  }}
                  className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                  title="Download all contact blocks as zip"
                >
                  📦 Download All Blocks
                </button>
              )}
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
            All contact blocks from contact database. Each contact is 92 bytes (0x5C). 
            Use this to manually inspect the contact structure and fix parsing.
          </p>

          <div className={`space-y-6 ${showContactBlock ? '' : 'hidden'}`}>
            {/* Block Selector */}
            <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
              <label className="block text-sm text-cool-gray mb-2">Select Block</label>
              <select
                value={selectedContactBlock !== null ? selectedContactBlock : (rawContactBlockAddress !== null ? rawContactBlockAddress : '')}
                onChange={(e) => setSelectedContactBlock(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
              >
                {Array.from(rawContactBlocks.entries())
                  .sort(([addrA], [addrB]) => addrA - addrB)
                  .map(([blockAddr]) => (
                    <option key={blockAddr} value={blockAddr}>
                      0x{blockAddr.toString(16).toUpperCase().padStart(6, '0')}
                    </option>
                  ))}
              </select>
            </div>

            {/* Hex Dump Viewer for Selected Contact Block */}
            {selectedContactBlock !== null && rawContactBlocks.has(selectedContactBlock) && (
              <CollapsibleSection title={`Hex Dump - Block 0x${selectedContactBlock.toString(16).toUpperCase().padStart(6, '0')}`}>
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <div className="mb-4 flex items-center gap-4">
                    <div className="flex-1">
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
                            const blockData = rawContactBlocks.get(selectedContactBlock);
                            if (blockData && !isNaN(offset) && offset >= 0 && offset < blockData.length) {
                              const element = document.getElementById(`contact-offset-${selectedContactBlock}-${offset}`);
                              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }}
                          className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
                        >
                          Go
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const blockData = rawContactBlocks.get(selectedContactBlock);
                          if (blockData) {
                            downloadHexDump(blockData, `contact-block-0x${selectedContactBlock.toString(16).toUpperCase()}-hexdump.txt`);
                          }
                        }}
                        className="px-3 py-2 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                        title="Download hex dump"
                      >
                        📥 Hex
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const blockData = rawContactBlocks.get(selectedContactBlock);
                          if (blockData) {
                            downloadBinary(blockData, `contact-block-0x${selectedContactBlock.toString(16).toUpperCase()}.bin`);
                          }
                        }}
                        className="px-3 py-2 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                        title="Download binary"
                      >
                        📥 Bin
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto font-mono text-xs">
                    {(() => {
                      const blockData = rawContactBlocks.get(selectedContactBlock);
                      if (!blockData) return null;
                      return Array.from({ length: Math.ceil(blockData.length / 16) }, (_, row) => {
                        const offset = row * 16;
                        const rowBytes = blockData.slice(offset, offset + 16);
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
                        
                        return (
                          <div
                            key={offset}
                            id={`contact-offset-${selectedContactBlock}-${offset}`}
                            className="flex gap-4 py-0.5 hover:bg-yellow-900/5"
                          >
                            <span className="text-yellow-400 w-16 font-mono text-xs">{offsetHex}</span>
                            <span className="text-white w-[52ch] font-mono text-xs">{hexBytes}{hexPadding}</span>
                            <span className="text-cool-gray min-w-[16ch] w-[16ch] font-mono text-xs ml-4 whitespace-nowrap">{ascii}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </CollapsibleSection>
            )}
          </div>
        </div>
      )}

      {/* Contact Write Blocks */}
      {writeBlockData.size > 0 && rawContactBlockAddress !== null && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-yellow-400">Contact Write Blocks</h3>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                {writeBlockData.size} Block(s)
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowContactWriteBlocks(!showContactWriteBlocks);
              }}
              className="text-sm text-yellow-400 hover:text-yellow-300"
            >
              {showContactWriteBlocks ? '▼ Hide' : '▶ Show'}
            </button>
          </div>
          <p className="text-cool-gray text-sm mb-4">
            All contact blocks that were written to the radio. Each block is 4KB (0x1000 bytes). 
            Use this to verify contact data is being written correctly.
          </p>

          <div className={`space-y-4 ${showContactWriteBlocks ? '' : 'hidden'}`}>
            {Array.from(writeBlockData.entries())
              .sort(([addrA], [addrB]) => addrA - addrB)
              .map(([blockAddr, blockInfo]) => {
                const isExpanded = expandedContactBlocks.has(blockAddr);
                const ENTRY_SIZE = 0x5C; // 92 bytes per contact
                const BLOCK_SIZE = 0x1000; // 4KB
                
                // Calculate which contacts are in this block
                // Contacts start at baseAddr + 0x10, where baseAddr is the first contact block address
                // But we need to account for the fact that contacts can span blocks
                const contactsStartAddr = rawContactBlockAddress + 0x10;
                const blockEndAddr = blockAddr + BLOCK_SIZE;
                
                // Calculate contact indices in this block
                const firstContactInBlock = Math.max(0, Math.ceil((blockAddr - contactsStartAddr) / ENTRY_SIZE));
                const lastContactInBlock = Math.floor((blockEndAddr - contactsStartAddr - 1) / ENTRY_SIZE);
                
                return (
                  <div key={blockAddr} className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-semibold text-yellow-400">
                          Block at 0x{blockAddr.toString(16).toUpperCase()}
                        </h4>
                        <span className="px-2 py-1 bg-yellow-900/20 text-cool-gray text-xs rounded border border-yellow-600/20">
                          Metadata: 0x{blockInfo.metadata.toString(16).toUpperCase().padStart(2, '0')}
                        </span>
                        {firstContactInBlock <= lastContactInBlock && (
                          <span className="px-2 py-1 bg-yellow-900/20 text-cool-gray text-xs rounded border border-yellow-600/20">
                            Contacts: {firstContactInBlock} - {lastContactInBlock}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            downloadHexDump(blockInfo.data, `contact-write-block-0x${blockAddr.toString(16).toUpperCase()}-hexdump.txt`);
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
                            downloadBinary(blockInfo.data, `contact-write-block-0x${blockAddr.toString(16).toUpperCase()}.bin`);
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
                            const newExpanded = new Set(expandedContactBlocks);
                            if (isExpanded) {
                              newExpanded.delete(blockAddr);
                            } else {
                              newExpanded.add(blockAddr);
                            }
                            setExpandedContactBlocks(newExpanded);
                          }}
                          className="text-sm text-yellow-400 hover:text-yellow-300"
                        >
                          {isExpanded ? '▼ Hide' : '▶ Show'} Hex
                        </button>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="mt-4 space-y-4">
                        {/* Hex Dump Viewer */}
                        <div className="bg-deep-gray rounded-lg border border-yellow-600/20 p-4">
                          <div className="mb-4">
                            <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={contactBlockOffsets.get(blockAddr) || ''}
                                onChange={(e) => {
                                  const newOffsets = new Map(contactBlockOffsets);
                                  newOffsets.set(blockAddr, e.target.value);
                                  setContactBlockOffsets(newOffsets);
                                }}
                                placeholder="0x000"
                                className="flex-1 px-3 py-2 bg-dark-charcoal border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const offsetStr = contactBlockOffsets.get(blockAddr) || '';
                                  const offset = parseInt(offsetStr.replace(/^0x/i, ''), 16);
                                  if (!isNaN(offset) && offset >= 0 && offset < blockInfo.data.length) {
                                    const element = document.getElementById(`contact-write-offset-${blockAddr}-${offset}`);
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
                            {Array.from({ length: Math.ceil(blockInfo.data.length / 16) }, (_, row) => {
                              const offset = row * 16;
                              const rowBytes = blockInfo.data.slice(offset, offset + 16);
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
                              
                              return (
                                <div
                                  key={offset}
                                  id={`contact-write-offset-${blockAddr}-${offset}`}
                                  className="flex gap-4 py-0.5 hover:bg-yellow-900/5"
                                >
                                  <span className="text-yellow-400 w-16 font-mono text-xs">{offsetHex}</span>
                                  <span className="text-white w-[52ch] font-mono text-xs">{hexBytes}{hexPadding}</span>
                                  <span className="text-cool-gray min-w-[16ch] w-[16ch] font-mono text-xs ml-4 whitespace-nowrap">{ascii}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
                      setAlertMessage('CSV must have at least a header row and one data row');
                      setAlertOpen(true);
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
      )}

      {/* Expected Write Data Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-purple-400">Expected Write Data</h3>
            <span className="px-2 py-1 bg-purple-900/30 text-purple-400 text-xs rounded border border-purple-600/30">
              Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExpectedWriteData(!showExpectedWriteData)}
              className="px-3 py-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-600/30 hover:border-purple-400 rounded transition-colors"
            >
              {showExpectedWriteData ? '▼ Hide' : '▶ Show'}
            </button>
            {showExpectedWriteData && channels.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportExpectedWriteHex}
                  className="px-3 py-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-600/30 hover:border-purple-400 rounded transition-colors"
                >
                  Download HEX
                </button>
                <button
                  type="button"
                  onClick={handleExportExpectedWriteBin}
                  className="px-3 py-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-600/30 hover:border-purple-400 rounded transition-colors"
                >
                  Download BIN
                </button>
              </>
            )}
          </div>
        </div>

        {showExpectedWriteData && (
          <div className="bg-deep-gray rounded-lg border border-purple-600/30 p-4">
            <div className="text-sm text-purple-200 mb-4">
              <p className="mb-2">
                This shows what data would be written to the radio based on current channels and zones.
              </p>
              <p className="text-purple-300/70">
                Note: Actual write data generation happens during the write process and may include additional blocks.
              </p>
            </div>

            {channels.length === 0 && zones.length === 0 ? (
              <div className="text-center py-8 text-cool-gray">
                <p>No channels or zones available to generate write data.</p>
                <p className="text-sm mt-2">Add some channels or zones first.</p>
              </div>
            ) : (() => {
              // Calculate all estimated blocks
              const channelBlocks = Math.ceil(channels.length / 125);
              const zoneBlocks = zones.length > 0 ? 1 : 0;
              const scanListBlocks = scanLists.length > 0 ? 1 : 0;
              const quickContactBlocks = quickContacts && quickContacts.length > 0 ? 1 : 0;
              const quickMessageBlocks = quickMessages && quickMessages.length > 0 ? 1 : 0;
              const rxGroupBlocks = rxGroups && rxGroups.length > 0 && rxGroupsLoaded ? 1 : 0;
              const dmrRadioIdBlocks = dmrRadioIds && dmrRadioIds.length > 0 ? 1 : 0;
              const radioSettingBlocks = getChangedFields().length > 0 ? 1 : 0;
              
              const totalBlocks = channelBlocks + zoneBlocks + scanListBlocks + 
                                quickContactBlocks + quickMessageBlocks + rxGroupBlocks + 
                                dmrRadioIdBlocks + radioSettingBlocks;
              
              return (
                <div className="bg-black/30 rounded border border-purple-600/20 p-4">
                  <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                    <div className="bg-purple-900/20 rounded p-3 border border-purple-600/30">
                      <div className="text-purple-400 font-semibold mb-1">Channels</div>
                      <div className="text-2xl text-white">{channels.length}</div>
                    </div>
                    <div className="bg-purple-900/20 rounded p-3 border border-purple-600/30">
                      <div className="text-purple-400 font-semibold mb-1">Zones</div>
                      <div className="text-2xl text-white">{zones.length}</div>
                    </div>
                    <div className="bg-purple-900/20 rounded p-3 border border-purple-600/30">
                      <div className="text-purple-400 font-semibold mb-1">Est. Blocks</div>
                      <div className="text-2xl text-white">{totalBlocks}</div>
                    </div>
                  </div>
                  
                  <div className="text-xs text-purple-300/70 mt-4 space-y-1">
                    <p>• Channel blocks: {channelBlocks} (125 channels per block)</p>
                    <p>• Zone blocks: {zoneBlocks} (all zones in single block)</p>
                    {scanListBlocks > 0 && <p>• Scan list blocks: {scanListBlocks}</p>}
                    {quickContactBlocks > 0 && <p>• Talk group blocks: {quickContactBlocks} ({quickContacts?.length} talk groups)</p>}
                    {quickMessageBlocks > 0 && <p>• Quick message blocks: {quickMessageBlocks} ({quickMessages?.length} messages)</p>}
                    {rxGroupBlocks > 0 && <p>• RX group blocks: {rxGroupBlocks} ({rxGroups?.length} groups)</p>}
                    {dmrRadioIdBlocks > 0 && <p>• DMR Radio ID blocks: {dmrRadioIdBlocks} ({dmrRadioIds?.length} IDs)</p>}
                    {radioSettingBlocks > 0 && <p>• Radio settings blocks: {radioSettingBlocks} ({getChangedFields().length} changed fields)</p>}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

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
                    VERBOSE: 'text-cool-gray',
                  };
                  const levelBg = {
                    ERROR: 'bg-red-900/20',
                    WARN: 'bg-yellow-900/20',
                    INFO: 'bg-blue-900/20',
                    DEBUG: 'bg-green-900/20',
                    VERBOSE: 'bg-deep-gray/30',
                  };

                  return (
                    <div
                      key={log.id}
                      className={`mb-1 px-2 py-1 rounded ${levelBg[log.level]} border-l-2 ${
                        log.level === 'ERROR' ? 'border-red-500' :
                        log.level === 'WARN' ? 'border-yellow-500' :
                        log.level === 'INFO' ? 'border-blue-500' :
                        log.level === 'DEBUG' ? 'border-green-500' :
                        'border-neon-cyan border-opacity-30'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`${levelColors[log.level]} font-semibold min-w-[60px]`}>
                          {log.level}
                        </span>
                        <span className="text-cool-gray min-w-[80px]">{timestamp}</span>
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
    <ConfirmModal
      isOpen={alertOpen}
      onClose={() => setAlertOpen(false)}
      title="Notice"
      message={alertMessage}
      confirmLabel="OK"
      variant="alert"
    />
    </>
  );
};

