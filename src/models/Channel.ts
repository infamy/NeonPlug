export type ChannelMode = 'Analog' | 'Digital' | 'Fixed Analog' | 'Fixed Digital';
export type Bandwidth = '12.5kHz' | '25kHz';
export type PowerLevel = 'Low' | 'Medium' | 'High';

export interface CTCSSDCS {
  type: 'CTCSS' | 'DCS' | 'None';
  value?: number;  // CTCSS Hz or DCS code (required for CTCSS/DCS, optional for None)
  polarity?: 'N' | 'P';  // DCS polarity
}

export interface Channel {
  number: number;              // 1-4000
  name: string;                // Max 16 chars (0x00-0x0F)
  
  // Frequencies (0x10-0x17)
  rxFrequency: number;         // MHz (e.g., 145.3500) - 4 bytes BCD
  txFrequency: number;         // MHz (e.g., 145.4500) - 4 bytes BCD
  
  // Mode & Flags (0x18)
  mode: ChannelMode;           // Bits 7-4: 0=Analog, 1=Digital, 2=Fixed Analog, 3=Fixed Digital
  forbidTx: boolean;           // Bit 3: 0=Allow, 1=Forbid
  busyLock: 'Off' | 'Carrier' | 'Repeater'; // Bits 2-1: 0=Off, 1=Carrier, 2=Repeater
  loneWorker: boolean;         // Bit 0: 0=Off, 1=On
  
  // Scan & Bandwidth (0x19)
  bandwidth: Bandwidth;        // Bit 7: 0=12.5KHz/Narrow, 1=25KHz/Wide (spec appears inverted)
  scanAdd: boolean;            // Bit 6: 0=Off, 1=On
  scanListId: number;         // Bits 5-2: 0-15
  
  // Talkaround & APRS (0x1A)
  forbidTalkaround: boolean;  // Bit 7: 0=Allow, 1=Forbid
  unknown1A_6_4: number;      // Bits 6-4: Unknown Setting (0-3, values ≥4 reset to 0)
  unknown1A_3: boolean;       // Bit 3: Unknown
  aprsReceive: boolean;       // Bit 2: 0=Off, 1=On
  reverseFreq: number;         // Bits 1-0: 0-2
  
  // Emergency Settings (0x1B)
  emergencyIndicator: boolean; // Bit 7: 0=Off, 1=On
  emergencyAck: boolean;       // Bit 6: 0=Off, 1=On
  emergencySystemId: number;  // Bits 4-0: 0-31
  
  // Power & APRS (0x1C)
  power: PowerLevel;           // Bits 7-4: 0=Low, 1=Medium, 2=High
  aprsReportMode: 'Off' | 'Digital' | 'Analog'; // Bits 3-2: 0=Off, 1=Digital, 2=Analog
  unknown1C_1_0: number;       // Bits 1-0: Unknown
  
  // Analog Features (0x1D)
  voxFunction: boolean;        // Bit 7: 0=Off, 1=On
  scramble: boolean;           // Bit 6: 0=Off, 1=On
  compander: boolean;         // Bit 5: 0=Off, 1=On
  talkback: boolean;          // Bit 4: 0=Off, 1=On
  unknown1D_3_0: number;      // Bits 3-0: Unknown Setting (0-15, possibly VOX or analog related)
  
  // Squelch (0x1E)
  squelchLevel: number;       // 0-255
  
  // PTT ID Settings (0x1F)
  pttIdDisplay: boolean;      // Bit 6: 0=Off, 1=On
  pttId: number;              // Bits 5-0: 0-63
  
  // Color Code (0x20)
  colorCode: number;          // 0-15 (DMR only)
  
  // CTCSS/DCS (0x21-0x24)
  rxCtcssDcs: CTCSSDCS;       // 2 bytes
  txCtcssDcs: CTCSSDCS;       // 2 bytes
  
  // Additional Flags (0x25)
  unknown25_7_6: number;       // Bits 7-6: Unknown
  companderDup: boolean;       // Bit 5: 0=Off, 1=On
  voxRelated: boolean;        // Bit 4: 0=Off, 1=On
  unknown25_3_0: number;       // Bits 3-0: Unknown Setting (0-15, possibly VOX or analog related)
  
  // RX Squelch & PTT ID (0x26)
  pttIdDisplay2: boolean;      // Bit 7: PTT ID Display (duplicate of 0x1F bit 6?)
  rxSquelchMode: 'Carrier/CTC' | 'Optional' | 'CTC&Opt' | 'CTC|Opt'; // Bits 6-4
  unknown26_3_1: number;       // Bits 3-1: Unknown (0-7)
  unknown26_0: boolean;        // Bit 0: Unknown
  
  // Signaling Settings (0x27)
  stepFrequency: number;      // Bits 7-4: 0=2.5K, 1=5K, 2=6.25K, 3=10K, 4=12.5K, 5=25K, 6=50K, 7=100K
  signalingType: 'None' | 'DTMF' | 'Two Tone' | 'Five Tone' | 'MDC1200'; // Bits 3-0
  
  // PTT ID Type (0x29)
  pttIdType: 'Off' | 'BOT' | 'EOT' | 'Both'; // Bits 7-4: 0=OFF, 1=BOT, 2=EOT, 3=BOTH
  unknown29_3_2: number;       // Bits 3-2: Unknown Setting (0-3)
  unknown29_1_0: number;       // Bits 1-0: Unknown
  
  // Unknown Setting (0x2A)
  unknown2A: number;           // 8-bit value (0-255), possibly DMR or signaling related
  
  // Contact ID (0x2B)
  contactId: number;          // 0-249 (displayed as 1-250)
  
  // Metadata (not in protocol)
  source?: string;            // Source attribution for imported channels
}

