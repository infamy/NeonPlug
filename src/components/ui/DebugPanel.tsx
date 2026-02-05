import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useRadioStore } from '../../store/radioStore';
import { useLogStore } from '../../store/logStore';
import { exportFullDebug, exportWriteBlocks, downloadDebug } from '../../services/debugExport';
import { analyzeMetadata, generateMetadataReport } from '../../services/metadataAnalysis';
import { ConfirmModal } from './ConfirmModal';

export interface LogEntry {
  timestamp: Date;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug' | 'verbose';
  message: string;
  data?: any;
}

export const DebugPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [maxLogs] = useState(100);
  const [showProtocolLogs, setShowProtocolLogs] = useState(true);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const { channels, rawChannelData } = useChannelsStore();
  const { zones, rawZoneData } = useZonesStore();
  const { blockMetadata, blockData, writeBlockData, zoneComparisonData } = useRadioStore();
  const { logs: protocolLogs } = useLogStore();

  useEffect(() => {
    // Capture console.log, console.warn, console.error
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    const addLog = (level: LogEntry['level'], ...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      setLogs(prev => {
        const newLogs = [...prev, {
          timestamp: new Date(),
          level,
          message,
          data: args.length > 1 ? args : undefined,
        }];
        // Keep only the last maxLogs entries
        return newLogs.slice(-maxLogs);
      });
    };

    console.log = (...args: any[]) => {
      originalLog(...args);
      addLog('log', ...args);
    };

    console.warn = (...args: any[]) => {
      originalWarn(...args);
      addLog('warn', ...args);
    };

    console.error = (...args: any[]) => {
      originalError(...args);
      addLog('error', ...args);
    };

    console.info = (...args: any[]) => {
      originalInfo(...args);
      addLog('info', ...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, []);

  // Convert protocol logs to LogEntry format for display
  const protocolLogEntries = useMemo(() => {
    return protocolLogs.map(log => {
      // Map protocol log levels to LogEntry levels
      let level: LogEntry['level'] = 'log';
      if (log.level === 'ERROR') level = 'error';
      else if (log.level === 'WARN') level = 'warn';
      else if (log.level === 'INFO') level = 'info';
      else if (log.level === 'DEBUG') level = 'debug';
      else if (log.level === 'VERBOSE') level = 'verbose';
      
      return {
        timestamp: new Date(log.timestamp),
        level,
        message: log.context ? `[${log.context}] ${log.message}` : log.message,
        data: log.error,
      };
    });
  }, [protocolLogs]);

  // Combine console logs and protocol logs
  const allLogs = useMemo(() => {
    if (showProtocolLogs) {
      return [...logs, ...protocolLogEntries].sort((a, b) => 
        a.timestamp.getTime() - b.timestamp.getTime()
      ).slice(-maxLogs);
    }
    return logs;
  }, [logs, protocolLogEntries, showProtocolLogs, maxLogs]);

  useEffect(() => {
    // Auto-scroll to bottom when new logs are added
    if (isOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allLogs, isOpen]);

  const clearLogs = () => {
    setLogs([]);
  };

  const handleDebugExport = async () => {
    if (channels.length === 0 && zones.length === 0 && allLogs.length === 0 && blockMetadata.size === 0 && blockData.size === 0) {
      setAlertMessage('No data or logs to export. Please read from radio first.');
      setAlertOpen(true);
      return;
    }

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Convert logs to export format (Date -> ISO string)
      const exportLogs = allLogs.map(log => ({
        timestamp: log.timestamp.toISOString(),
        level: log.level,
        message: log.message,
        data: log.data,
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
      const { exportCodeplug } = await import('../../services/codeplugExport');
      const { useRadioStore } = await import('../../store/radioStore');
      const { useRadioSettingsStore } = await import('../../store/radioSettingsStore');
      const { useDigitalEmergencyStore } = await import('../../store/digitalEmergencyStore');
      const { useAnalogEmergencyStore } = await import('../../store/analogEmergencyStore');
      const { useScanListsStore } = await import('../../store/scanListsStore');
      const { useContactsStore } = await import('../../store/contactsStore');
      
      const radioStore = useRadioStore.getState();
      const radioSettingsStore = useRadioSettingsStore.getState();
      const digitalEmergencyStore = useDigitalEmergencyStore.getState();
      const analogEmergencyStore = useAnalogEmergencyStore.getState();
      const scanListsStore = useScanListsStore.getState();
      const contactsStore = useContactsStore.getState();

      const codeplugData = {
        channels,
        zones,
        scanLists: scanListsStore.scanLists,
        contacts: contactsStore.contacts,
        digitalEmergencies: digitalEmergencyStore.systems,
        digitalEmergencyConfig: digitalEmergencyStore.config,
        analogEmergencies: analogEmergencyStore.systems,
        radioSettings: radioSettingsStore.settings,
        radioInfo: radioStore.radioInfo,
        exportDate: new Date().toISOString(),
        version: '1.0.0',
      };

      // Export codeplug returns a blob, we need to get it and add to zip
      const xlsxBlob = exportCodeplug(codeplugData, true); // Pass true to return blob
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

  // Calculate metadata summary for display
  const metadataSummary = blockMetadata.size > 0 ? analyzeMetadata(blockMetadata, blockData) : null;

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-cyan-400';
      case 'debug': return 'text-green-400';
      case 'verbose': return 'text-cool-gray';
      default: return 'text-cool-gray';
    }
  };

  const formatTime = (date: Date) => {
    const time = date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
  };

  return (
    <>
    <div className="fixed bottom-4 left-4 z-50">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded-lg px-3 py-2 hover:bg-deep-gray-light transition-colors flex items-center gap-2 shadow-lg"
          title="Open Debug Console"
        >
          <span className="text-neon-cyan text-xs font-mono">
            🐛 Debug
          </span>
          {(logs.length > 0 || protocolLogs.length > 0) && (
            <span className="bg-neon-cyan text-dark-charcoal text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {allLogs.length}
            </span>
          )}
        </button>
      ) : (
        <div className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded-lg shadow-lg w-96 max-h-[70vh] flex flex-col">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full bg-deep-gray border-b border-neon-cyan border-opacity-30 px-4 py-2 text-left hover:bg-deep-gray-light transition-colors flex items-center justify-between rounded-t-lg"
          >
            <span className="text-neon-cyan text-sm font-mono">
              Debug Console {allLogs.length > 0 && `(${allLogs.length})`}
            </span>
            <span className="text-neon-cyan text-xs">
              ✕
            </span>
          </button>
          
          <div className="bg-black border-neon-cyan border-opacity-30 flex-1 overflow-hidden flex flex-col rounded-b-lg">
          <div className="flex items-center justify-between px-4 py-2 border-b border-neon-cyan border-opacity-20">
            <div className="flex items-center gap-3">
              <span className="text-xs text-cool-gray">Console Output</span>
              <label className="flex items-center gap-1 text-xs text-cool-gray cursor-pointer">
                <input
                  type="checkbox"
                  checked={showProtocolLogs}
                  onChange={(e) => setShowProtocolLogs(e.target.checked)}
                  className="cursor-pointer"
                />
                <span>Protocol Logs ({protocolLogs.length})</span>
              </label>
            </div>
            <div className="flex gap-2">
              {writeBlockData.size > 0 && (
                <button
                  onClick={handleWriteBlocksExport}
                  className="text-xs text-neon-cyan hover:text-neon-cyan-bright px-2 py-1"
                  title="Export write blocks for confirmation"
                >
                  Export Write Blocks
                </button>
              )}
              <button
                onClick={handleMetadataAnalysisExport}
                className="text-xs text-neon-cyan hover:text-neon-cyan-bright px-2 py-1"
                title="Export metadata analysis report"
              >
                Metadata Report
              </button>
              <button
                onClick={handleDebugExport}
                className="text-xs text-neon-cyan hover:text-neon-cyan-bright px-2 py-1"
              >
                Export Debug
              </button>
              <button
                onClick={clearLogs}
                className="text-xs text-neon-cyan hover:text-neon-cyan-bright px-2 py-1"
              >
                Clear
              </button>
            </div>
          </div>
          
          {metadataSummary && (
            <div className="px-4 py-2 border-b border-neon-cyan border-opacity-20 bg-deep-gray text-xs">
              <div className="text-neon-cyan font-semibold mb-1">Metadata Summary:</div>
              <div className="text-cool-gray space-y-0.5">
                <div>Total: {metadataSummary.totalBlocks} | Known: {metadataSummary.knownBlocks} | Unknown: {metadataSummary.unknownBlocks} | Empty: {metadataSummary.emptyBlocks}</div>
                {metadataSummary.unknownMetadataValues.length > 0 && (
                  <div className="text-yellow-400">
                    Unknown metadata: {metadataSummary.unknownMetadataValues.map(m => `0x${m.toString(16).padStart(2, '0')}`).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
            {allLogs.length === 0 ? (
              <div className="text-cool-gray text-center py-4">No logs yet...</div>
            ) : (
              allLogs.map((log, index) => (
                <div
                  key={index}
                  className={`mb-1 ${getLogColor(log.level)}`}
                >
                  <span className="text-cool-gray mr-2">
                    [{formatTime(log.timestamp)}]
                  </span>
                  <span className="text-cool-gray mr-2">
                    [{log.level.toUpperCase()}]
                  </span>
                  <span>{log.message}</span>
                  {log.data && (
                    <pre className="text-cool-gray text-xs mt-1 ml-8 whitespace-pre-wrap">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
        </div>
      )}
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

