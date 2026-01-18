export interface Contact {
  id: number;                   // 1-250
  name: string;                // Max 16 chars
  dmrId: number;              // DMR ID (7 digits) / Talkgroup ID
  callSign?: string;           // Callsign (8 bytes, max 7 chars, stored at 0x14-0x1B)
  city?: string;               // City
  province?: string;           // Province/State
  country?: string;            // Country
  remark?: string;             // Additional remarks/notes
}

