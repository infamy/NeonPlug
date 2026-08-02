import React from 'react';
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
import { useEncryptionKeysStore } from '../../store/encryptionKeysStore';
import { useLogStore } from '../../store/logStore';
import { formatHexDumpText } from '../../utils/hexdump';
import { exportFullDebug, exportWriteBlocks, downloadDebug } from '../../services/debugExport';
import { analyzeMetadata, generateMetadataReport } from '../../services/metadataAnalysis';
import { exportCodeplug } from '../../services/codeplugExport';
import { createZip, type ZipEntry } from '../../utils/zip';
import { downloadBlob } from '../../utils/download';

interface DebugExportsCardProps {
  showAlert: (message: string, title?: string) => void;
}

export const DebugExportsCard: React.FC<DebugExportsCardProps> = ({ showAlert }) => {
  const { rawRadioSettingsData, rawContactBlocks, blockMetadata, blockData, writeBlockData, radioInfo, zoneComparisonData } = useRadioStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const { channels, rawChannelData } = useChannelsStore();
  const { zones, rawZoneData } = useZonesStore();
  const { scanLists } = useScanListsStore();
  const { contacts } = useContactsStore();
  const { systems: digitalEmergencies, config: digitalEmergencyConfig } = useDigitalEmergencyStore();
  const { systems: analogEmergencies } = useAnalogEmergencyStore();
  const { groups: rxGroups } = useRXGroupsStore();
  const { messages: quickMessages } = useQuickMessagesStore();
  const { contacts: quickContacts } = useQuickContactsStore();
  const { radioIds: dmrRadioIds } = useDMRRadioIDsStore();
  const { keys: encryptionKeys } = useEncryptionKeysStore();
  const { logs } = useLogStore();

  const downloadAllMetadataBlocks = async () => {
    const entries: ZipEntry[] = [];
    let blocksAdded = 0;

    // Text hex dump with a metadata-block header
    const generateHexDump = (data: Uint8Array, metadataHex: string): string =>
      formatHexDumpText(data, [
        `Metadata Block 0x${metadataHex}`,
        `Size: ${data.length} bytes (${(data.length / 1024).toFixed(2)} KB)`,
        '='.repeat(80),
        '',
      ]);

    // Add Radio Settings (0x04)
    if (rawRadioSettingsData) {
      const hexDump = generateHexDump(rawRadioSettingsData, '04');
      entries.push({ name: 'metadata-0x04-radio-settings.txt', data: hexDump });
      entries.push({ name: 'metadata-0x04-radio-settings.bin', data: rawRadioSettingsData });
      blocksAdded++;
    }

    // Add all other metadata blocks
    for (const [address, metadata] of blockMetadata.entries()) {
      const data = blockData.get(address);
      if (data) {
        const metadataHex = metadata.metadata.toString(16).toUpperCase().padStart(2, '0');
        const hexDump = generateHexDump(data, metadataHex);
        entries.push({ name: `metadata-0x${metadataHex}.txt`, data: hexDump });
        entries.push({ name: `metadata-0x${metadataHex}.bin`, data });
        blocksAdded++;
      }
    }

    // Add all contact blocks if available
    if (rawContactBlocks.size > 0) {
      for (const [blockAddr, blockData] of rawContactBlocks.entries()) {
        const hexDump = generateHexDump(blockData, 'CONTACTS');
        const blockAddrHex = blockAddr.toString(16).toUpperCase().padStart(6, '0');
        entries.push({ name: `contact-block-0x${blockAddrHex}.txt`, data: hexDump });
        entries.push({ name: `contact-block-0x${blockAddrHex}.bin`, data: blockData });
        blocksAdded++;
      }
    }

    if (blocksAdded === 0) {
      showAlert('No metadata blocks available to download. Please read from radio first.');
      return;
    }

    // Generate zip and download
    try {
      const blob = await createZip(entries);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      downloadBlob(blob, `metadata-blocks-${timestamp}.zip`);
    } catch (error) {
      console.error('Error creating zip:', error);
      showAlert('Failed to create zip file. See console for details.');
    }
  };

  const handleFullDebugExport = async () => {
    if (channels.length === 0 && zones.length === 0 && logs.length === 0 && blockMetadata.size === 0 && blockData.size === 0) {
      showAlert('No data or logs to export. Please read from radio first.');
      return;
    }

    try {
      const entries: ZipEntry[] = [];

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

      // read/ — data from radio
      entries.push({ name: 'read/full-debug-data.json', data: debugData });
      for (const [address, data] of blockData.entries()) {
        const metadataInfo = blockMetadata.get(address);
        if (metadataInfo) {
          const metadataHex = metadataInfo.metadata.toString(16).toUpperCase().padStart(2, '0');
          const addressHex = address.toString(16).toUpperCase().padStart(6, '0');
          entries.push({ name: `read/block-0x${metadataHex}-addr-0x${addressHex}.bin`, data });
        }
      }

      // write/ — expected write data
      if (writeBlockData.size > 0) {
        for (const [, block] of writeBlockData.entries()) {
          const metadataHex = block.metadata.toString(16).toUpperCase().padStart(2, '0');
          const addressHex = block.address.toString(16).toUpperCase().padStart(6, '0');
          entries.push({ name: `write/write-block-0x${metadataHex}-addr-0x${addressHex}.bin`, data: block.data });
        }

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
        entries.push({ name: 'write/write-summary.json', data: JSON.stringify(writeSummary, null, 2) });
      } else {
        // Placeholder if no write data
        const expectedWrite = {
          channels: channels.length,
          zones: zones.length,
          note: 'No write data available yet. Perform a "Write to Radio" operation to generate write blocks.',
          estimatedChannelBlocks: Math.ceil(channels.length / 125),
          estimatedZoneBlocks: zones.length > 0 ? 1 : 0,
        };
        entries.push({ name: 'write/expected-write-data.json', data: JSON.stringify(expectedWrite, null, 2) });
      }

      // Add codeplug (.neonplug = zipped JSON)
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
        messages: quickMessages,
        radioIds: dmrRadioIds,
        quickContacts,
        rxGroups,
        encryptionKeys,
        exportDate: new Date().toISOString(),
        version: '1.0.0',
      };

      const codeplugBlob = await exportCodeplug(codeplugData, true);
      if (codeplugBlob instanceof Blob) {
        entries.push({ name: 'codeplug.neonplug', data: codeplugBlob });
      }

      // Generate and download zip
      const blob = await createZip(entries);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      downloadBlob(blob, `neonplug-full-export-${timestamp}.zip`);
    } catch (error) {
      console.error('Error creating export:', error);
      showAlert('Failed to create export. See console for details.');
    }
  };

  const handleWriteBlocksExport = () => {
    if (writeBlockData.size === 0) {
      showAlert('No write blocks available. Please write to radio first.');
      return;
    }

    const writeBlocksData = exportWriteBlocks(writeBlockData, blockData);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadDebug(writeBlocksData, `neonplug-write-blocks-${timestamp}.json`);
  };

  const handleMetadataAnalysisExport = () => {
    if (blockMetadata.size === 0) {
      showAlert('No block metadata available. Please read from radio first.');
      return;
    }

    const analysis = analyzeMetadata(blockMetadata, blockData);
    const report = generateMetadataReport(analysis);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadDebug(report, `neonplug-metadata-analysis-${timestamp}.txt`);
  };

  return (
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
  );
};
