import { create } from 'zustand';

interface DebugState {
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;
}

// Load from localStorage on initialization
const loadDebugMode = (): boolean => {
  try {
    const stored = localStorage.getItem('neonplug-debug-mode');
    return stored === 'true';
  } catch {
    return false;
  }
};

// Save to localStorage when changed
const saveDebugMode = (enabled: boolean): void => {
  try {
    localStorage.setItem('neonplug-debug-mode', enabled ? 'true' : 'false');
  } catch {
    // Ignore localStorage errors
  }
};

export const useDebugStore = create<DebugState>((set) => ({
  debugMode: loadDebugMode(),
  setDebugMode: (enabled) => {
    saveDebugMode(enabled);
    set({ debugMode: enabled });
  },
}));

