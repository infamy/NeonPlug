export interface Contact {
  id: number;                   // 1-250
  name: string;                // Max 16 chars
  dmrId: number;              // DMR ID (7 digits)
  callSign?: string;
}

