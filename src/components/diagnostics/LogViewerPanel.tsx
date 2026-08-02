import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLogStore } from '../../store/logStore';

export const LogViewerPanel: React.FC = () => {
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE'>('ALL');
  const [logContextFilter, setLogContextFilter] = useState<string>('');
  const logViewerRef = useRef<HTMLDivElement>(null);

  const { logs, clearLogs, maxLogs, setMaxLogs } = useLogStore();

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

  return (
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
  );
};
