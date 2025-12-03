export interface RadioSettings {
  name: string;
  model: string;               // "DM-32UV" (read-only)
  firmware: string;            // e.g., "DM32.01.01.046" (read-only)
  buildDate?: string;          // e.g., "2022-06-27" (read-only)
  bandLimits: {
    vhfMin: number;
    vhfMax: number;
    uhfMin: number;
    uhfMax: number;
  };
}

