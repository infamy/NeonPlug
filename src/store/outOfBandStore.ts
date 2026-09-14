import { create } from 'zustand';

/**
 * The hidden out-of-band switch (About, shown once debug mode is on). For radios with
 * modified firmware: while it is on, channels aren't checked against the radio's bands.
 * It stays on until turned off, and only applies to a radio that declares
 * supportsOutOfBandFrequencies (see useOutOfBandActive). Nothing turns it on but the
 * user: not a read, and not a codeplug file.
 */
interface OutOfBandState {
  allowOutOfBandFrequencies: boolean;
  setAllowOutOfBandFrequencies: (allow: boolean) => void;
}

const STORAGE_KEY = 'neonplug-allow-oob';

const load = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const useOutOfBandStore = create<OutOfBandState>((set) => ({
  allowOutOfBandFrequencies: load(),
  setAllowOutOfBandFrequencies: (allow) => {
    try {
      localStorage.setItem(STORAGE_KEY, allow ? 'true' : 'false');
    } catch {
      // Blocked storage: the switch still applies until the page closes.
    }
    set({ allowOutOfBandFrequencies: allow });
  },
}));
