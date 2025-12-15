import { create } from 'zustand';
import type { RadioSettings } from '../models/RadioSettings';

interface RadioSettingsState {
  settings: RadioSettings | null;
  originalSettings: RadioSettings | null; // Store original settings from radio
  changedFields: Set<string>; // Track which fields have been modified
  setSettings: (settings: RadioSettings | null) => void;
  updateSettings: (updates: Partial<RadioSettings>) => void;
  hasChanges: () => boolean; // Check if any settings have been modified
  getChangedFields: () => string[]; // Get list of changed field names
  clearChanges: () => void; // Clear change tracking (after successful write)
}

// Deep comparison helper for RadioSettings
function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    
    const val1 = obj1[key];
    const val2 = obj2[key];
    
    if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null) {
      if (Array.isArray(val1) && Array.isArray(val2)) {
        if (val1.length !== val2.length) return false;
        for (let i = 0; i < val1.length; i++) {
          if (!deepEqual(val1[i], val2[i])) return false;
        }
      } else if (!deepEqual(val1, val2)) {
        return false;
      }
    } else if (val1 !== val2) {
      return false;
    }
  }
  
  return true;
}

export const useRadioSettingsStore = create<RadioSettingsState>((set, get) => ({
  settings: null,
  originalSettings: null,
  changedFields: new Set<string>(),
  setSettings: (settings) => set({ 
    settings,
    originalSettings: settings ? JSON.parse(JSON.stringify(settings)) : null, // Deep clone
    changedFields: new Set<string>(), // Reset changes when loading new settings
  }),
  updateSettings: (updates) =>
    set((state) => {
      if (!state.settings || !state.originalSettings) {
        return { settings: state.settings ? { ...state.settings, ...updates } : null };
      }
      
      // Track which fields are being changed
      const newChangedFields = new Set(state.changedFields);
      for (const key of Object.keys(updates)) {
        // Compare with original to see if it's actually different
        const originalValue = state.originalSettings[key as keyof RadioSettings];
        const newValue = updates[key as keyof RadioSettings];
        
        // If new value differs from original, mark as changed
        if (!deepEqual(newValue, originalValue)) {
          newChangedFields.add(key);
        } else {
          // If new value matches original, remove from changed set
          newChangedFields.delete(key);
        }
      }
      
      return {
        settings: { ...state.settings, ...updates },
        changedFields: newChangedFields,
      };
    }),
  hasChanges: () => {
    const { changedFields } = get();
    return changedFields.size > 0;
  },
  getChangedFields: () => {
    const { changedFields } = get();
    return Array.from(changedFields);
  },
  clearChanges: () => set({ changedFields: new Set<string>() }),
}));

