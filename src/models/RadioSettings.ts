export interface RadioSettings {
  name: string;               // Radio name (read-only, from config header)
  model: string;               // "DM-32UV" (read-only)
  firmware: string;            // e.g., "DM32.01.01.046" (read-only)
  buildDate?: string;          // e.g., "2022-06-27" (read-only)
  bandLimits: {
    vhfMin: number;
    vhfMax: number;
    uhfMin: number;
    uhfMax: number;
  };
  // Configurable settings
  dmrId?: number;              // DMR ID (7 digits, 0-16777215)
  bootScreenText?: string;     // Boot screen text (appears on boot screen, e.g., "INFAMY" on second line)
  cannedMessages?: string[];   // Pre-canned text messages (max 16, each max length TBD)
  // Additional settings can be added here as discovered
}

