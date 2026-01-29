export interface Zone {
  id: string;                 // Unique identifier for UI (generated)
  name: string;                // Zone name (max 10 chars, written to radio)
  channels: number[];         // Array of channel numbers
}

