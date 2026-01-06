import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useRadioStore } from '../../store/radioStore';
import { useLogStore } from '../../store/logStore';
import { exportFullDebug, exportWriteBlocks, downloadDebug } from '../../services/debugExport';
import { analyzeMetadata, generateMetadataReport } from '../../services/metadataAnalysis';

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

  const handleDebugExport = () => {
    if (channels.length === 0 && zones.length === 0 && allLogs.length === 0 && blockMetadata.size === 0 && blockData.size === 0) {
      alert('No data or logs to export. Please read from radio first.');
      return;
    }

    // Convert logs to export format (Date -> ISO string)
    const exportLogs = allLogs.map(log => ({
      timestamp: log.timestamp.toISOString(),
      level: log.level,
      message: log.message,
      data: log.data,
    }));

    // Get block metadata and data from store
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadDebug(debugData, `neonplug-debug-${timestamp}.json`);
  };

  const handleWriteBlocksExport = () => {
    if (writeBlockData.size === 0) {
      alert('No write blocks available. Please write to radio first.');
      return;
    }

    const writeBlocksData = exportWriteBlocks(writeBlockData, blockData);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadDebug(writeBlocksData, `neonplug-write-blocks-${timestamp}.json`);
  };

  const handleMetadataAnalysisExport = () => {
    if (blockMetadata.size === 0) {
      alert('No block metadata available. Please read from radio first.');
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
      case 'verbose': return 'text-gray-400';
      default: return 'text-gray-300';
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
              <span className="text-xs text-gray-400">Console Output</span>
              <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
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
              <div className="text-gray-300 space-y-0.5">
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
              <div className="text-gray-500 text-center py-4">No logs yet...</div>
            ) : (
              allLogs.map((log, index) => (
                <div
                  key={index}
                  className={`mb-1 ${getLogColor(log.level)}`}
                >
                  <span className="text-gray-500 mr-2">
                    [{formatTime(log.timestamp)}]
                  </span>
                  <span className="text-gray-400 mr-2">
                    [{log.level.toUpperCase()}]
                  </span>
                  <span>{log.message}</span>
                  {log.data && (
                    <pre className="text-gray-400 text-xs mt-1 ml-8 whitespace-pre-wrap">
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
  );
};

