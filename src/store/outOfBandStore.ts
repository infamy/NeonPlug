import { create } from 'zustand';

interface OutOfBandState {
  allowOutOfBandFrequencies: boolean;
  setAllowOutOfBandFrequencies: (v: boolean) => void;
}

const loadAllowOob = (): boolean => {
  try {
    return localStorage.getItem('neonplug-allow-oob') === 'true';
  } catch {
    return false;
  }
};

const saveAllowOob = (v: boolean): void => {
  try {
    localStorage.setItem('neonplug-allow-oob', v ? 'true' : 'false');
  } catch {}
};

export const useOutOfBandStore = create<OutOfBandState>((set) => ({
  allowOutOfBandFrequencies: loadAllowOob(),
  setAllowOutOfBandFrequencies: (v) => {
    saveAllowOob(v);
    set({ allowOutOfBandFrequencies: v });
  },
}));
