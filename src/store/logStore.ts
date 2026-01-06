import { create } from 'zustand';

export interface LogEntry {
  id: number;
  timestamp: number;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
  message: string;
  context?: string;
  error?: unknown;
}

interface LogState {
  logs: LogEntry[];
  maxLogs: number;
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setMaxLogs: (max: number) => void;
}

let logIdCounter = 0;

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  maxLogs: 1000, // Keep last 1000 logs by default
  
  addLog: (entry) => {
    const newLog: LogEntry = {
      id: logIdCounter++,
      timestamp: Date.now(),
      ...entry,
    };
    
    set((state) => {
      const newLogs = [...state.logs, newLog];
      // Keep only the most recent logs
      const maxLogs = state.maxLogs;
      const trimmedLogs = newLogs.length > maxLogs 
        ? newLogs.slice(-maxLogs)
        : newLogs;
      
      return { logs: trimmedLogs };
    });
  },
  
  clearLogs: () => {
    set({ logs: [] });
  },
  
  setMaxLogs: (max: number) => {
    set((state) => {
      const trimmedLogs = state.logs.length > max
        ? state.logs.slice(-max)
        : state.logs;
      return { logs: trimmedLogs, maxLogs: max };
    });
  },
}));



