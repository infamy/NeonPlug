export interface Contact {
  id: number;                   // 1-250
  name: string;                // Max 16 chars
  dmrId: number;              // DMR ID (7 digits) / Talkgroup ID
  callSign?: string;
  callType?: string;           // Call type (e.g., "Private", "Group", "All")
  repeater?: string;           // Repeater callsign or identifier
  city?: string;               // City
  province?: string;           // Province/State
  country?: string;            // Country
  remark?: string;             // Additional remarks/notes
}

