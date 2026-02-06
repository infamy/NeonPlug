/**
 * DM-32UV Data Structure Parsing and Encoding
 * Parses/encodes channel, zone, contact, and settings structures; BCD frequency and CTCSS/DCS.
 */

import type { Channel, Contact, Zone, ScanList, RadioSettings, DigitalEmergency, DigitalEmergencyConfig, AnalogEmergency, QuickTextMessage, DMRRadioID, CalibrationData, RXGroup, EncryptionKey, QuickContact } from '../../models';
import { generateZoneId } from '../../utils/zoneHelpers';
import { OFFSET, BLOCK_SIZE, LIMITS, METADATA } from './constants';
import { createDefaultChannel } from '../../utils/channelHelpers';
import { log } from '../../utils/protocolLogger';

// --- BCD frequency and CTCSS/DCS encoding (inlined from encoding.ts) ---

export function decodeBCDFrequency(data: Uint8Array): number {
  if (data.length < 4) {
    throw new Error('BCD frequency must be 4 bytes');
  }
  const bcd = [data[3], data[2], data[1], data[0]];
  let freqInt = 0;
  for (let i = 0; i < 4; i++) {
    const high = (bcd[i] >> 4) & 0x0F;
    const low = bcd[i] & 0x0F;
    freqInt = freqInt * 100 + high * 10 + low;
  }
  return freqInt / 100000.0;
}

export function encodeBCDFrequency(frequency: number): Uint8Array {
  const freqInt = Math.round(frequency * 100000);
  const bcd: number[] = [];
  let temp = freqInt;
  for (let i = 3; i >= 0; i--) {
    const low = temp % 10;
    temp = Math.floor(temp / 10);
    const high = temp % 10;
    temp = Math.floor(temp / 10);
    bcd[i] = (high << 4) | low;
  }
  return new Uint8Array([bcd[3], bcd[2], bcd[1], bcd[0]]);
}

export interface CTCSSDCSResult {
  type: 'CTCSS' | 'DCS' | 'None';
  value?: number;
  polarity?: 'N' | 'P';
}

export function decodeCTCSSDCS(data: Uint8Array): CTCSSDCSResult {
  if (data.length < 2) {
    return { type: 'None' };
  }
  const low = data[0];
  const high = data[1];
  if (low === 0xFF && high === 0xFF) {
    return { type: 'None' };
  }
  if (high >= 0x80) {
    const isInverted = high >= 0xC0;
    const highNibble = high & 0x0F;
    const code = (highNibble << 8) | low;
    const polarity = isInverted ? 'P' : 'N';
    return { type: 'DCS', value: code, polarity };
  }
  const hundreds = (high >> 4) & 0x0F;
  const tens = high & 0x0F;
  const ones = (low >> 4) & 0x0F;
  const decimalPart = low & 0x0F;
  const frequency = (hundreds * 100 + tens * 10 + ones) + (decimalPart / 10.0);
  if (frequency === 0) {
    return { type: 'None' };
  }
  return { type: 'CTCSS', value: frequency };
}

export function encodeCTCSSDCS(ctcssDcs: CTCSSDCSResult): Uint8Array {
  if (ctcssDcs.type === 'None' || ctcssDcs.value === undefined) {
    return new Uint8Array([0x00, 0x00]);
  }
  if (ctcssDcs.type === 'DCS') {
    const code = ctcssDcs.value;
    const polarityBit = ctcssDcs.polarity === 'P' ? 0x01 : 0x00;
    return new Uint8Array([code, 0x80 | polarityBit]);
  }
  const frequency = ctcssDcs.value;
  const integerPart = Math.floor(frequency);
  const hundreds = Math.floor(integerPart / 100);
  const tens = Math.floor((integerPart % 100) / 10);
  const ones = integerPart % 10;
  const decimalPart = Math.round((frequency - integerPart) * 10);
  const low = (ones << 4) | decimalPart;
  const high = (hundreds << 4) | tens;
  return new Uint8Array([low, high]);
}

// --- Structure parsing and encoding ---

/**
 * Calculate the block offset for a channel's flag byte
 * 
 * The forbid TX flag is stored 8 bytes before the channel entry.
 * The offset is always relative to the base channel position (channelOffsetInBlock),
 * not the channel number.
 * 
 * @param channelOffsetInBlock - Offset of channel entry within block (base channel position)
 * @returns The byte offset within the block, or undefined if out of bounds
 */
export function getChannelFlagByteBlockOffset(
  channelOffsetInBlock: number
): number | undefined {
  // Forbid TX flag is always 8 bytes before the channel entry
  // Offset is relative to the base channel position, not channel number
  const flagByteOffsetInBlock = channelOffsetInBlock - 8;
  
  return flagByteOffsetInBlock;
}

/**
 * Read a flag byte for a channel from block data
 * 
 * @param blockData - Full block data (4096 bytes)
 * @param channelOffsetInBlock - Offset of channel entry within block (base channel position)
 * @returns The flag byte value, or undefined if offset is out of bounds
 */
export function readChannelFlagByte(
  blockData: Uint8Array,
  channelOffsetInBlock: number
): number | undefined {
  const flagByteOffsetInBlock = getChannelFlagByteBlockOffset(channelOffsetInBlock);
  
  if (flagByteOffsetInBlock === undefined) {
    return undefined;
  }
  
  // Ensure offset is within block bounds
  if (flagByteOffsetInBlock >= 0 && flagByteOffsetInBlock < blockData.length) {
    return blockData[flagByteOffsetInBlock];
  }
  
  return undefined;
}

/**
 * Write a flag bit to a channel's flag byte in block data
 * 
 * @param blockData - Full block data (4096 bytes) - will be modified
 * @param channelOffsetInBlock - Offset of channel entry within block (base channel position)
 * @param bitMask - Bit mask for the flag (e.g., 0x08 for bit 3)
 * @param value - Whether to set (true) or clear (false) the bit
 * @returns true if the flag was written, false if offset is out of bounds
 */
export function writeChannelFlagBit(
  blockData: Uint8Array,
  channelOffsetInBlock: number,
  bitMask: number,
  value: boolean
): boolean {
  const flagByteOffsetInBlock = getChannelFlagByteBlockOffset(channelOffsetInBlock);
  
  if (flagByteOffsetInBlock === undefined) {
    return false;
  }
  
  // Ensure offset is within block bounds
  if (flagByteOffsetInBlock >= 0 && flagByteOffsetInBlock < blockData.length) {
    if (value) {
      blockData[flagByteOffsetInBlock] |= bitMask;
    } else {
      blockData[flagByteOffsetInBlock] &= ~bitMask;
    }
    return true;
  }
  
  return false;
}

/**
 * Parse a single channel from 48-byte data
 * @param data - 48-byte channel data
 * @param channelNumber - Channel number (1-indexed)
 */
export function parseChannel(data: Uint8Array, channelNumber: number): Channel {
  if (data.length < 48) {
    throw new Error('Channel data must be 48 bytes');
  }

  // Name (0x00-0x0F, 16 bytes, null-terminated)
  const nameBytes = data.slice(0, 16);
  const nullIndex = nameBytes.indexOf(0);
  const name = new TextDecoder('ascii', { fatal: false })
    .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : 16))
    .replace(/\x00/g, '')
    .trim();

  // RX Frequency (0x10-0x13, 4 bytes BCD)
  let rxFreq: number;
  try {
    rxFreq = decodeBCDFrequency(data.slice(0x10, 0x14));
  } catch (error) {
    log.warn(`Failed to decode RX frequency for channel ${channelNumber}`, 'Structures', error);
    rxFreq = 0;
  }

  // TX Frequency (0x14-0x17, 4 bytes BCD)
  let txFreq: number;
  try {
    txFreq = decodeBCDFrequency(data.slice(0x14, 0x18));
  } catch (error) {
    log.warn(`Failed to decode TX frequency for channel ${channelNumber}`, 'Structures', error);
    txFreq = 0;
  }

  // Mode flags (0x18)
  // Bits 7-4 (mask 0xF0): Channel Mode (0=Analog, 1=Digital, 2=Fixed Analog, 3=Fixed Digital)
  // Bit 3 (mask 0x08): Forbid TX (0=Allow, 1=Forbid)
  // Bits 2-1 (mask 0x06): Power Level (0=Low, 1=Medium, 2=High) - NOT Busy Lock!
  // Bit 0 (mask 0x01): Lone Worker (0=Off, 1=On)
  const modeFlags = data[0x18];
  const channelMode = (modeFlags >> 4) & 0x0F;
  const modeMap: Channel['mode'][] = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
  const mode = modeMap[channelMode] || 'Analog';

  // Forbid TX is stored at byte 0x18, bit 3 (mask 0x08)
  const forbidTx = (modeFlags & 0x08) !== 0;
  
  // Power is stored at byte 0x18, bits 2-1 (mask 0x06)
  const powerValue = (modeFlags >> 1) & 0x03;
  const power: Channel['power'] = 
    powerValue === 0 ? 'Low' : 
    powerValue === 1 ? 'Medium' : 
    powerValue === 2 ? 'High' : 'Low';
  
  const loneWorker = (modeFlags & 0x01) !== 0;

  // Debug logging for VECTOR channels to diagnose forbid TX issues
  if (name.toUpperCase().includes('VECTOR') || name.toUpperCase().includes('BCF') || name.toUpperCase().includes('CZBB')) {
    const bit3 = (modeFlags & 0x08) !== 0;
    const bit3Raw = (modeFlags >> 3) & 0x01;
    const rxEqualsTx = Math.abs(rxFreq - txFreq) < 0.0001;
    log.debug(`Channel ${channelNumber} "${name}": modeFlags=0x${modeFlags.toString(16).padStart(2, '0')} (binary: ${modeFlags.toString(2).padStart(8, '0')}), mode=${mode} (${channelMode}), forbidTx=${forbidTx}, bit3=${bit3}, bit3Raw=${bit3Raw}, power=${power}, loneWorker=${loneWorker}, RX=${rxFreq.toFixed(4)}, TX=${txFreq.toFixed(4)}, RX==TX=${rxEqualsTx}`, 'Structures');
  }

  // Scan & Bandwidth (0x19)
  // Bit 7 (mask 0x80): Bandwidth (0=12.5kHz/Narrow, 1=25kHz/Wide) - NOTE: Spec appears inverted!
  // Bit 6 (mask 0x40): Scan Add (0=Off, 1=On)
  // Bits 5-2 (mask 0x3C): Scan List ID (0-15)
  // Bits 1-0 (mask 0x03): Reserved
  const scanBw = data[0x19];
  const bandwidth: Channel['bandwidth'] = (scanBw & 0x80) !== 0 ? '25kHz' : '12.5kHz';
  const scanAdd = (scanBw & 0x40) !== 0;
  const scanListId = (scanBw >> 2) & 0x0F;

  // Talkaround & APRS (0x1A)
  // Bit 7 (mask 0x80): Forbid Talkaround (0=Allow, 1=Forbid)
  // Bits 6-4 (mask 0x70): Unknown Setting (0-3, values ≥4 reset to 0)
  // Bit 3 (mask 0x08): Unknown
  // Bit 2 (mask 0x04): APRS Receive (0=Off, 1=On)
  // Bits 1-0 (mask 0x03): Reserved/Unknown
  const talkaroundAprs = data[0x1A];
  const forbidTalkaround = (talkaroundAprs & 0x80) !== 0;
  const unknown1A_6_4 = (talkaroundAprs >> 4) & 0x07;
  const unknown1A_3 = (talkaroundAprs & 0x08) !== 0;
  const aprsReceive = (talkaroundAprs & 0x04) !== 0;

  // Emergency (0x1B)
  // Bit 7: Emergency Indicator (0=Off, 1=On)
  // Bit 6: Emergency Acknowledgment (0=Off, 1=On)
  // Bits 0-5 (mask 0x1F): Emergency System ID (0-31, values >31 reset to 0)
  const emergency = data[0x1B];
  const emergencyIndicator = (emergency & 0x80) !== 0;
  const emergencyAck = (emergency & 0x40) !== 0;
  let emergencySystemId = emergency & 0x1F;
  // Validate: 0-31, reset >31 to 0
  if (emergencySystemId > 31) {
    emergencySystemId = 0;
  }

  // APRS & Squelch (0x1C)
  // Bits 7-4 (mask 0xF0): Squelch Level (0-15, value range 0-15)
  // Bits 3-2 (mask 0x0C): APRS Report Mode (0=Off, 1=Digital, 2=Analog)
  // Bits 1-0 (mask 0x03): Unknown/Reserved
  const aprsSquelch = data[0x1C];
  // Squelch Level: Bits 7-4
  let squelchLevel = (aprsSquelch >> 4) & 0x0F;
  // Validate: 0-15
  if (squelchLevel > 15) {
    squelchLevel = 0;
  }
  // APRS: Bits 3-2
  let aprsReportValue = (aprsSquelch >> 2) & 0x03;
  // Validate: 0-2, reset >2 to 0
  if (aprsReportValue > 2) {
    aprsReportValue = 0;
  }
  const aprsReportMode: Channel['aprsReportMode'] = 
    aprsReportValue === 0 ? 'Off' : 
    aprsReportValue === 1 ? 'Digital' : 
    aprsReportValue === 2 ? 'Analog' : 'Off';
  const unknown1C_1_0 = aprsSquelch & 0x03; // Bits 1-0

  // Byte 0x1D, 0x1E, 0x1F have different meanings for analog vs digital channels
  const isDigital = mode === 'Digital' || mode === 'Fixed Digital';
  
  let voxFunction = false;
  let scramble = false;
  let compander = false;
  let talkback = false;
  let unknown1D_3_0 = 0;
  let digitalEmergencySystemId = 0;
  let pttIdDisplay = false;
  let pttId = 0;
  
  // Digital-only fields
  let rxGroupListId: number | undefined;
  let slotOperation: number | undefined;
  let encryption: boolean | undefined;
  let tdmaDirectMode: boolean | undefined;
  let shortDataConfirm: boolean | undefined;
  let privateConfirm: boolean | undefined;

  // Squelch Level was already read from 0x1C bits 7-4 above
  
  // Digital Emergency System ID/Index - NOTE: This may be stored elsewhere
  // Squelch level is at 0x1C bits 7-4, not 0x1E
  digitalEmergencySystemId = 0; // TODO: Find correct location for digital emergency system ID

  // Power was already read from 0x18 bits 2-1 above

  let colorCode = 0; // Digital only: 0x1D bits 3-0. Analog has no CC.
  if (isDigital) {
    // Digital mode: Parse digital-specific fields from bytes 0x1D, 0x1F
    const digitalFeatures = data[0x1D];
    encryption = (digitalFeatures & 0x80) !== 0; // Bit 7
    shortDataConfirm = (digitalFeatures & 0x40) !== 0; // Bit 6
    tdmaDirectMode = (digitalFeatures & 0x20) !== 0; // Bit 5
    slotOperation = (digitalFeatures & 0x10) !== 0 ? 1 : 0; // Bit 4: Timeslot (0=TS1, 1=TS2)
    colorCode = digitalFeatures & 0x0F; // Bits 3-0: Color Code (0-15)
    
    // Byte 0x1F: RX Group List ID (bits 5-0) and Private Confirm (bit 6)
    const digitalSettings = data[0x1F];
    privateConfirm = (digitalSettings & 0x40) !== 0; // Bit 6
    rxGroupListId = digitalSettings & 0x3F; // Bits 5-0 (mask 0x3F): RX Group List ID
  } else {
    // Analog mode: Parse analog features from bytes 0x1D, 0x1F
    const analogFeatures = data[0x1D];
    voxFunction = (analogFeatures & 0x80) !== 0; // Bit 7: VOX Function
    scramble = (analogFeatures & 0x40) !== 0; // Bit 6: Scramble
    compander = (analogFeatures & 0x20) !== 0; // Bit 5: Compander
    talkback = (analogFeatures & 0x10) !== 0; // Bit 4: Talkback
    unknown1D_3_0 = analogFeatures & 0x0F; // Bits 3-0: Unknown Setting

    // PTT ID (0x1F) - Analog mode (power is also stored here!)
    // Bit 6 (mask 0x40): PTT ID Display (0=Off, 1=On)
    // NOTE: This is duplicated at 0x26 bit 7 - both locations control the same setting
    // Bits 0-5 (mask 0x3F): PTT ID value (0-63)
    const pttIdSettings = data[0x1F];
    pttIdDisplay = (pttIdSettings & 0x40) !== 0;
    pttId = pttIdSettings & 0x3F;
  }

  // RX CTCSS/DCS (0x21-0x22)
  const rxCtcssDcsData = decodeCTCSSDCS(data.slice(0x21, 0x23));
  const rxCtcssDcs: Channel['rxCtcssDcs'] = {
    type: rxCtcssDcsData.type,
    value: rxCtcssDcsData.value,
    polarity: rxCtcssDcsData.polarity,
  };

  // TX CTCSS/DCS (0x23-0x24)
  const txCtcssDcsData = decodeCTCSSDCS(data.slice(0x23, 0x25));
  const txCtcssDcs: Channel['txCtcssDcs'] = {
    type: txCtcssDcsData.type,
    value: txCtcssDcsData.value,
    polarity: txCtcssDcsData.polarity,
  };

  // Additional flags (0x25)
  // Bits 7-6 (mask 0xC0): Unknown
  // Bit 5 (mask 0x20): Compander (duplicate) (0=Off, 1=On)
  // Bit 4 (mask 0x10): VOX-Related Flag (0=Off, 1=On)
  // Bits 3-0 (mask 0x0F): Unknown Setting (0-15, possibly VOX or analog related)
  const additionalFlags = data[0x25];
  const unknown25_7_6 = (additionalFlags >> 6) & 0x03;
  const companderDup = (additionalFlags & 0x20) !== 0;
  const voxRelated = (additionalFlags & 0x10) !== 0;
  const unknown25_3_0 = additionalFlags & 0x0F;

  // RX Squelch & PTT ID (0x26)
  // Bit 7 (mask 0x80): PTT ID Display (0=Off, 1=On) - DUPLICATE of 0x1F bit 6
  //   Both 0x1F bit 6 and 0x26 bit 7 control the same PTT ID Display setting
  //   The radio firmware may read from either location, so both should be kept in sync
  // Bits 6-4 (mask 0x70): RX Squelch Mode (0=Carrier/CTC, 1=Optional, 2=CTC&Opt, 3=CTC|Opt)
  // Bits 3-1 (mask 0x0E): Unknown (0-7)
  // Bit 0 (mask 0x01): Unknown
  const rxSquelchPtt = data[0x26];
  const pttIdDisplay2 = (rxSquelchPtt & 0x80) !== 0;
  const rxSquelchValue = (rxSquelchPtt >> 4) & 0x07;
  const rxSquelchModeMap: Channel['rxSquelchMode'][] = [
    'Carrier/CTC',
    'Optional',
    'CTC&Opt',
    'CTC|Opt',
  ];
  const rxSquelchMode = rxSquelchModeMap[rxSquelchValue] || 'Carrier/CTC';
  const unknown26_3_1 = (rxSquelchPtt >> 1) & 0x07;
  const unknown26_0 = (rxSquelchPtt & 0x01) !== 0;

  // Signaling (0x27)
  // Bits 7-4 (mask 0xF0): Step Frequency (0=2.5K, 1=5K, 2=6.25K, 3=10K, 4=12.5K, 5=25K, 6=50K, 7=100K, values >7 reset to 0)
  // Bits 3-0 (mask 0x0F): Signaling Type (0=None, 1=DTMF, 2=Two Tone, 3=Five Tone, 4=MDC1200, values >4 reset to 0)
  const signaling = data[0x27];
  let stepFrequency = (signaling >> 4) & 0x0F;
  // Validate: 0-7, reset >7 to 0
  if (stepFrequency > 7) {
    stepFrequency = 0;
  }
  let signalingValue = signaling & 0x0F;
  // Validate: 0-4, reset >4 to 0
  if (signalingValue > 4) {
    signalingValue = 0;
  }
  const signalingTypeMap: Channel['signalingType'][] = [
    'None',
    'DTMF',
    'Two Tone',
    'Five Tone',
    'MDC1200',
  ];
  const signalingType = signalingTypeMap[signalingValue] || 'None';

  // Reserved (0x28) - Unknown purpose, possibly padding or reserved for future use
  // const reserved28 = data[0x28];

  // PTT ID Type (0x29) - restore original parsing
  // Bits 7-4 (mask 0xF0): PTT ID Type (0=Off, 1=BOT, 2=EOT, 3=Both, values >3 reset to 0)
  // Bits 3-2 (mask 0x0C): Unknown Setting (0-3)
  // Bits 1-0 (mask 0x03): Unknown
  const pttIdTypeByte = data[0x29];
  let pttIdTypeValue = (pttIdTypeByte >> 4) & 0x0F;
  // Validate: 0-3, reset >3 to 0
  if (pttIdTypeValue > 3) {
    pttIdTypeValue = 0;
  }
  const pttIdTypeMap: Channel['pttIdType'][] = ['Off', 'BOT', 'EOT', 'Both'];
  const pttIdType = pttIdTypeMap[pttIdTypeValue] || 'Off';
  const unknown29_3_2 = (pttIdTypeByte >> 2) & 0x03;
  const unknown29_1_0 = pttIdTypeByte & 0x03;

  // Encryption ID (0x2A) - Digital only
  // 0 = None (no encryption)
  // 1-8 = Encryption Key ID (references encryption keys 1-8)
  // For analog channels, this byte may be unused or have different meaning
  let encryptionId: number | undefined;
  let unknown2A: number;
  if (isDigital) {
    let encId = data[0x2A];
    if (encId > 8) encId = 0; // Validate: 0-8
    encryptionId = encId;
    unknown2A = 0; // Not used for digital channels
  } else {
    // Analog: keep as unknown for now
    unknown2A = data[0x2A];
  }

  // DMR Radio ID Index for TX (0x2B)
  // Radio uses 0-based indexing: 0=first entry (array index 0), 1=second entry (array index 1), etc.
  // 0xFF (255) = None (no DMR Radio ID)
  let radioByteValue = data[0x2B];
  let dmrRadioIdIndex: number | undefined;
  if (radioByteValue === 0xFF || radioByteValue === 255) {
    // 0xFF = None
    dmrRadioIdIndex = undefined; // Use undefined to represent None
  } else {
    // Radio byte value is 0-based index directly (0=first entry, 1=second entry, etc.)
    dmrRadioIdIndex = radioByteValue;
  }

  // Reserved (0x2C-0x2F) - Padding/reserved bytes, likely unused
  // const reserved2C_2F = data.slice(0x2C, 0x30);

  return {
    number: channelNumber,
    name: name || `Channel ${channelNumber}`,
    rxFrequency: rxFreq,
    txFrequency: txFreq,
    mode,
    forbidTx,
    loneWorker,
    bandwidth,
    scanAdd,
    scanListId,
    forbidTalkaround,
    aprsReceive,
    emergencyIndicator,
    emergencyAck,
    emergencySystemId,
    power,
    aprsReportMode,
    voxFunction,
    scramble,
    compander,
    talkback,
    squelchLevel,
    digitalEmergencySystemId,
    pttIdDisplay,
    pttId,
    colorCode,
    rxCtcssDcs,
    txCtcssDcs,
    companderDup,
    voxRelated,
    unknown25_7_6,
    unknown25_3_0,
    pttIdDisplay2,
    rxSquelchMode,
    unknown26_3_1,
    unknown26_0,
    stepFrequency,
    signalingType,
    pttIdType,
    unknown29_3_2,
    unknown29_1_0,
    unknown2A, // For digital, this is 0 (encryptionId is used instead)
    dmrRadioIdIndex, // DMR Radio ID index for TX (0-255, 0=None)
    contactId: 0, // Placeholder - actual TG comes from blocks 0x42/0x43
    unknown1A_6_4,
    unknown1A_3,
    unknown1C_1_0,
    unknown1D_3_0,
    // Digital-only fields (only set for digital channels)
    ...(isDigital ? {
      rxGroupListId,
      slotOperation,
      encryption,
      encryptionId, // Stored at byte 0x2A
      tdmaDirectMode,
      shortDataConfirm,
      privateConfirm,
    } : {}),
  };
}

/**
 * Encode a channel to 48-byte binary data
 * This is the reverse of parseChannel()
 */
export function encodeChannel(channel: Channel): Uint8Array {
  const data = new Uint8Array(48);
  
  // Initialize to 0xFF (empty channel marker)
  data.fill(0xFF);
  
  // Name (0x00-0x0F, 16 bytes, null-terminated)
  const nameBytes = new TextEncoder().encode(channel.name.slice(0, 16));
  data.set(nameBytes, 0);
  if (nameBytes.length < 16) {
    data[nameBytes.length] = 0; // Null terminator
  }

  // RX Frequency (0x10-0x13, 4 bytes BCD)
  const rxFreqBytes = encodeBCDFrequency(channel.rxFrequency);
  data.set(rxFreqBytes, 0x10);

  // TX Frequency (0x14-0x17, 4 bytes BCD)
  const txFreqBytes = encodeBCDFrequency(channel.txFrequency);
  data.set(txFreqBytes, 0x14);

  // Mode flags (0x18)
  const modeMap: Record<Channel['mode'], number> = {
    'Analog': 0,
    'Digital': 1,
    'Fixed Analog': 2,
    'Fixed Digital': 3,
  };
  const channelMode = modeMap[channel.mode] || 0;
  let modeFlags = (channelMode << 4) & 0xF0;
  // Forbid TX: Set bit 3 (mask 0x08) if true, clear if false
  if (channel.forbidTx) {
    modeFlags |= 0x08;  // Set bit 3
  } else {
    modeFlags &= 0xF7;  // Clear bit 3 (0xF7 = ~0x08)
  }
  // Power is stored at bits 2-1 (NOT busy lock!)
  const powerValue = channel.power === 'Low' ? 0 : channel.power === 'Medium' ? 1 : 2;
  modeFlags |= (powerValue << 1) & 0x06;
  if (channel.loneWorker) modeFlags |= 0x01;
  data[0x18] = modeFlags;

  // Scan & Bandwidth (0x19)
  let scanBw = 0;
  if (channel.bandwidth === '25kHz') scanBw |= 0x80; // Bit 7: 1=25kHz, 0=12.5kHz
  if (channel.scanAdd) scanBw |= 0x40; // Bit 6
  scanBw |= (channel.scanListId << 2) & 0x3C; // Bits 5-2
  data[0x19] = scanBw;

  // Talkaround & APRS (0x1A)
  let talkaroundAprs = 0;
  if (channel.forbidTalkaround) talkaroundAprs |= 0x80; // Bit 7
  talkaroundAprs |= ((channel.unknown1A_6_4 & 0x07) << 4) & 0x70; // Bits 6-4
  if (channel.unknown1A_3) talkaroundAprs |= 0x08; // Bit 3
  if (channel.aprsReceive) talkaroundAprs |= 0x04; // Bit 2
  // Bits 1-0: Reserved/Unknown (preserve original value if reading, otherwise leave as 0)
  data[0x1A] = talkaroundAprs;

  // Emergency (0x1B)
  let emergency = 0;
  if (channel.emergencyIndicator) emergency |= 0x80; // Bit 7
  if (channel.emergencyAck) emergency |= 0x40; // Bit 6
  emergency |= channel.emergencySystemId & 0x1F; // Bits 4-0
  data[0x1B] = emergency;

  // APRS Report Mode & Squelch Level (0x1C)
  // Bits 7-4 (mask 0xF0): Squelch Level (0-15, value range 0-15)
  // Bits 3-2 (mask 0x0C): APRS Report Mode (0=Off, 1=Digital, 2=Analog)
  // Bits 1-0 (mask 0x03): Unknown/Reserved (preserve existing value if reading, otherwise 0)
  const squelchLevel = Math.min(15, Math.max(0, channel.squelchLevel || 0)) & 0x0F;
  const aprsReportValue = channel.aprsReportMode === 'Off' ? 0 : channel.aprsReportMode === 'Digital' ? 1 : 2;
  // Combine squelch (bits 7-4), APRS (bits 3-2), and preserve/reset bits 1-0
  data[0x1C] = ((squelchLevel << 4) & 0xF0) | ((aprsReportValue << 2) & 0x0C) | 0x00; // Bits 1-0 set to 0

  // Squelch Level is now at 0x1C bits 7-4, not 0x1E
  // 0x1E is available for other uses (possibly digital emergency system ID)
  
  // Digital Emergency System ID/Index (0x1E) - same for both analog and digital
  // NOTE: This conflicts with squelch level! According to spec, 0x1E is squelch level.
  // Digital Emergency System ID might be stored elsewhere or this is a conflict in the spec.
  // For now, we'll use 0x1E for squelch as per the spec.
  // If digital emergency system needs to be stored, it may need a different location.
  // const digitalEmergencySystemIdValue = Math.min(77, Math.max(0, channel.digitalEmergencySystemId ?? 0)) & 0xFF;
  // data[0x1E] = digitalEmergencySystemIdValue;

  // Byte 0x1D, 0x1F have different meanings for analog vs digital channels
  const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
  
  if (isDigital) {
    // Digital mode: Encode digital-specific fields (0x1D: bits 7-4 = flags, bits 3-0 = Color Code)
    let digitalFeatures = 0;
    if (channel.encryption) digitalFeatures |= 0x80; // Bit 7: Encryption
    if (channel.shortDataConfirm) digitalFeatures |= 0x40; // Bit 6: Short Data Confirm
    if (channel.tdmaDirectMode) digitalFeatures |= 0x20; // Bit 5: TDMA Direct Mode
    if ((channel.slotOperation ?? 0) === 1) digitalFeatures |= 0x10; // Bit 4: Timeslot (0=TS1, 1=TS2)
    digitalFeatures |= (channel.colorCode & 0x0F); // Bits 3-0: Color Code (0-15)
    data[0x1D] = digitalFeatures;
    
    // RX Group List ID and Private Confirm (0x1F) - Digital mode
    // Power is NOT here - it's at 0x18 bits 2-1!
    // Bits 5-0: RX Group List ID, Bit 6: Private Confirm
    let digitalSettings = (channel.rxGroupListId ?? 0) & 0x3F; // Bits 5-0: RX Group List ID
    if (channel.privateConfirm) digitalSettings |= 0x40; // Bit 6: Private Confirm
    data[0x1F] = digitalSettings;
  } else {
    // Analog mode: Encode analog features
    let analogFeatures = 0;
    if (channel.voxFunction) analogFeatures |= 0x80; // Bit 7
    if (channel.scramble) analogFeatures |= 0x40; // Bit 6
    if (channel.compander) analogFeatures |= 0x20; // Bit 5
    if (channel.talkback) analogFeatures |= 0x10; // Bit 4
    analogFeatures |= channel.unknown1D_3_0 & 0x0F; // Bits 3-0
    data[0x1D] = analogFeatures;

    // PTT ID (0x1F) - Analog mode
    // Power is NOT here - it's at 0x29!
    let pttIdSettings = channel.pttId & 0x3F; // Bits 5-0
    if (channel.pttIdDisplay) pttIdSettings |= 0x40; // Bit 6
    data[0x1F] = pttIdSettings;
  }

  // Color Code: digital = 0x1D bits 3-0 (already written above); analog has no CC

  // RX CTCSS/DCS (0x21-0x22)
  const rxCtcssDcsBytes = encodeCTCSSDCS(channel.rxCtcssDcs);
  data.set(rxCtcssDcsBytes, 0x21);

  // TX CTCSS/DCS (0x23-0x24)
  const txCtcssDcsBytes = encodeCTCSSDCS(channel.txCtcssDcs);
  data.set(txCtcssDcsBytes, 0x23);

  // Additional flags (0x25)
  let additionalFlags = 0;
  additionalFlags |= ((channel.unknown25_7_6 & 0x03) << 6) & 0xC0; // Bits 7-6
  if (channel.companderDup) additionalFlags |= 0x20; // Bit 5
  if (channel.voxRelated) additionalFlags |= 0x10; // Bit 4
  additionalFlags |= channel.unknown25_3_0 & 0x0F; // Bits 3-0
  data[0x25] = additionalFlags;

  // RX Squelch & PTT ID (0x26)
  const rxSquelchModeMap: Record<Channel['rxSquelchMode'], number> = {
    'Carrier/CTC': 0,
    'Optional': 1,
    'CTC&Opt': 2,
    'CTC|Opt': 3,
  };
  const rxSquelchValue = rxSquelchModeMap[channel.rxSquelchMode] || 0;
  let rxSquelchPtt = (rxSquelchValue << 4) & 0x70; // Bits 6-4
  if (channel.pttIdDisplay2) rxSquelchPtt |= 0x80; // Bit 7
  rxSquelchPtt |= ((channel.unknown26_3_1 & 0x07) << 1) & 0x0E; // Bits 3-1
  if (channel.unknown26_0) rxSquelchPtt |= 0x01; // Bit 0
  data[0x26] = rxSquelchPtt;

  // Signaling (0x27)
  const signalingTypeMap: Record<Channel['signalingType'], number> = {
    'None': 0,
    'DTMF': 1,
    'Two Tone': 2,
    'Five Tone': 3,
    'MDC1200': 4,
  };
  const signalingValue = signalingTypeMap[channel.signalingType] || 0;
  data[0x27] = ((channel.stepFrequency << 4) & 0xF0) | (signalingValue & 0x0F);

  // Reserved (0x28)
  data[0x28] = 0x00;

  // PTT ID Type (0x29) - restore original encoding
  const pttIdTypeMap: Record<Channel['pttIdType'], number> = {
    'Off': 0,
    'BOT': 1,
    'EOT': 2,
    'Both': 3,
  };
  const pttIdTypeValue = pttIdTypeMap[channel.pttIdType] || 0;
  let pttIdTypeByte = (pttIdTypeValue << 4) & 0xF0; // Bits 7-4
  pttIdTypeByte |= ((channel.unknown29_3_2 & 0x03) << 2) & 0x0C; // Bits 3-2
  pttIdTypeByte |= channel.unknown29_1_0 & 0x03; // Bits 1-0
  data[0x29] = pttIdTypeByte;

  // Encryption ID (0x2A) - Digital only
  // 0 = None (no encryption)
  // 1-8 = Encryption Key ID (references encryption keys 1-8)
  if (isDigital) {
    const encryptionIdValue = Math.min(8, Math.max(0, channel.encryptionId ?? 0)) & 0xFF;
    data[0x2A] = encryptionIdValue;
  } else {
    // Analog: preserve unknown2A
    data[0x2A] = channel.unknown2A & 0xFF;
  }

  // DMR Radio ID Index for TX (0x2B)
  // Radio uses 0-based indexing: 0=first entry (array index 0), 1=second entry (array index 1), etc.
  // 0xFF (255) = None (no DMR Radio ID)
  // Channel's dmrRadioIdIndex is 0-based (0=first entry, 1=second entry, etc.), undefined/255=None
  const radioIdIndex = channel.dmrRadioIdIndex ?? 255;
  if (radioIdIndex === 255) {
    data[0x2B] = 0xFF; // None
  } else {
    data[0x2B] = radioIdIndex & 0xFF;
  }

  // Reserved (0x2C-0x2F)
  // Already initialized to 0xFF, which is fine

  return data;
}

/**
 * Parse zones from zone block data
 * 
 * Zone structure (from debug analysis):
 * - Zones are 145 bytes apart, starting at offset 16
 * - Zone N starts at: 16 + (N - 1) * 145
 * - Within each zone:
 *   - Bytes 0-10: Name (11 bytes, null-terminated)
 *   - Bytes 11-56: Channels (46 bytes = 23 channels × 2 bytes, little-endian)
 *   - Bytes 57-144: Additional data/padding
 */
export function parseZones(
  data: Uint8Array,
  onRawZoneParsed?: (zoneNum: number, rawData: Uint8Array, name: string) => void
): Zone[] {
  const zones: Zone[] = [];

  // Zones are 145 bytes each, starting at offset 16
  // Zone 1: offset 16
  // Zone 2: offset 161 (16 + 145)
  // Zone 3: offset 306 (16 + 145*2)
  // Maximum zones: (4096 - 16) / 145 ≈ 28 zones per 4KB block
  for (let zoneNum = 1; zoneNum <= 30; zoneNum++) {
    const offset = 16 + (zoneNum - 1) * 145;
    if (offset + 145 > data.length) {
      log.debug(`Zone ${zoneNum} would be at offset ${offset}, but data length is only ${data.length}`, 'Structures');
      break;
    }

    const zoneData = data.slice(offset, offset + 145);

    // Name (11 bytes, null-terminated)
    // The zone name is null-terminated, and bytes after the null may be padding or metadata
    const nameBytes = zoneData.slice(0, 11);
    const nullIndex = nameBytes.indexOf(0);
    const name = new TextDecoder('ascii', { fatal: false })
      .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : 11))
      .replace(/\x00/g, '')
      .trim();

    // Empty zone (all 0xFF or all 0x00)
    // Check if name is empty AND first byte is 0xFF or 0x00
    if (name.length === 0 || nameBytes[0] === 0xFF || nameBytes[0] === 0x00) {
      // Check if this looks like a completely empty zone (all 0xFF or all 0x00)
      const isAllEmpty = zoneData.every(b => b === 0xFF || b === 0x00);
      if (isAllEmpty) {
        // If we hit a completely empty zone, we can stop (zones are contiguous)
        log.debug(`Zone ${zoneNum} at offset ${offset} is completely empty, stopping zone parsing`, 'Structures');
        break;
      }
      // Skip zones with empty names (even if not all empty)
      continue;
    }

    // Channel list structure (from debug analysis):
    // - Bytes 11-15: Padding (0xFF)
    // - Byte 16: Channel count (but may be unreliable for some zones)
    // - Bytes 17-18: Channel 1 (16-bit little-endian)
    // - Bytes 19-20: Channel 2 (16-bit little-endian)
    // - Bytes 21-22: Channel 3 (16-bit little-endian)
    // - ... all channels are 16-bit little-endian
    // - Bytes 17-144: Channels (128 bytes = 64 channels max)
    const channels: number[] = [];
    
    // Read channel count from byte 16 - this is the actual count of channels in the zone
    const channelCount = zoneData.length > 16 ? zoneData[16] : 0;
    
    // Maximum channels per zone: (145 - 17) / 2 = 128 bytes / 2 = 64 channels max
    // Read channels starting at offset 17
    // Read exactly channelCount channels (or until we hit 0x0000, whichever comes first)
    const maxChannels = (channelCount > 0 && channelCount <= 64) ? channelCount : 64;
    
    for (let i = 0; i < maxChannels; i++) {
      const chOffset = 17 + (i * 2);
      if (chOffset + 2 > zoneData.length) break;
      
      // Read 16-bit little-endian value (low byte first)
      const byte0 = zoneData[chOffset];
      const byte1 = zoneData[chOffset + 1];
      const chNum = byte0 | (byte1 << 8); // Little-endian
      
      // Empty slot is 0x0000 - this marks the end of the channel list
      if (chNum === 0) {
        // Stop if we hit empty slot, but only if we've read the expected count
        // (Some zones might have 0x0000 padding, but we should read the full count if available)
        if (channels.length >= channelCount && channelCount > 0) {
          break;
        }
        // If we haven't read enough channels yet, this might be a gap - continue
        // But be careful not to read into next zone
        break; // Actually, 0x0000 usually means end, so stop
      }
      
      // Channels in zones are stored as-is (1-indexed: 1, 2, 3...)
      // Use the value directly without any conversion
      // Valid channels are 1-4000
      if (chNum > 0 && chNum <= 4000) {
        channels.push(chNum);
      } else {
        // Invalid channel number, stop reading
        break;
      }
    }
    
    // If we read fewer channels than expected, check if there's one more channel
    // (Some zones might have the count off by one, or a channel after 0x0000)
    if (channels.length < channelCount && channelCount > 0) {
      const lastOffset = 17 + (channels.length * 2);
      if (lastOffset + 2 <= zoneData.length) {
        const byte0 = zoneData[lastOffset];
        const byte1 = zoneData[lastOffset + 1];
        const chNumRaw = byte0 | (byte1 << 8);
        // Channels in zones are stored as-is, no conversion needed
        if (chNumRaw > 0 && chNumRaw <= 4000) {
          channels.push(chNumRaw);
        }
      }
    }
    
    // Also check if byte 16 might be off by one - if we read exactly channelCount-1 channels
    // and there's one more valid channel, read it
    if (channels.length === channelCount - 1 && channelCount > 1) {
      const nextOffset = 17 + (channels.length * 2);
      if (nextOffset + 2 <= zoneData.length) {
        const byte0 = zoneData[nextOffset];
        const byte1 = zoneData[nextOffset + 1];
        const chNumRaw = byte0 | (byte1 << 8);
        // Channels in zones are stored as-is, no conversion needed
        if (chNumRaw > 0 && chNumRaw <= 4000) {
          channels.push(chNumRaw);
        }
      }
    }
    
    // Debug logging for zone parsing
    if (name.includes('FRS') || name.includes('DEFCON') || name.includes('Vector') || name.length > 0) {
      log.debug(`Zone "${name}" (Num ${zoneNum}, offset ${offset}): Found ${channels.length} channels (byte 16 count: ${channelCount}): ${channels.join(', ')}`, 'Structures');
    }

    const zone = { id: generateZoneId(), name, channels };
    zones.push(zone);
    
    // Call callback to store raw data - store full 145 bytes for complete debug info
    onRawZoneParsed?.(zoneNum, zoneData, name);
  }

  return zones;
}

/**
 * Encode a zone to 145-byte binary data
 * This is the reverse of parseZones()
 */
export function encodeZone(zone: Zone, _zoneIndex: number): Uint8Array {
  const data = new Uint8Array(145);
  
  // Initialize to 0xFF (empty zone marker)
  data.fill(0xFF);
  
  // Name (bytes 0-10, 11 bytes, null-terminated)
  // The name field is 11 bytes total, with the name null-terminated and the rest padded with 0xFF
  const nameBytes = new TextEncoder().encode(zone.name.slice(0, 10)); // Max 10 chars to leave room for null terminator
  const nameLength = Math.min(nameBytes.length, 10);
  
  // Write name bytes
  data.set(nameBytes.slice(0, nameLength), 0);
  
  // Always null-terminate the name
  data[nameLength] = 0;
  
  // Fill remaining bytes in name field (bytes nameLength+1 to 10) with 0xFF padding
  for (let i = nameLength + 1; i < 11; i++) {
    data[i] = 0xFF;
  }
  
  // Padding (bytes 11-15, 5 bytes of 0xFF)
  // Already initialized to 0xFF
  
  // Channel count (byte 16)
  const channelCount = Math.min(zone.channels.length, 64); // Max 64 channels per zone
  data[16] = channelCount;
  
  // Channels (bytes 17-144, 16-bit little-endian)
  // Each channel is 2 bytes (little-endian). Radio uses byte 16 (count) only - do NOT write 0x0000
  // terminator as the radio may treat it as an empty channel slot and show nulls / truncate.
  for (let i = 0; i < channelCount && i < 64; i++) {
    const chOffset = 17 + (i * 2);
    const chNum = zone.channels[i];
    
    // Write 16-bit little-endian (low byte first)
    data[chOffset] = chNum & 0xFF;
    data[chOffset + 1] = (chNum >> 8) & 0xFF;
  }
  
  // No 0x0000 terminator - pad with 0xFF only. Radio uses channel count (byte 16) to know how many
  // channels to read. Writing 0x0000 caused the radio to show null slots / lose channels.
  // Bytes 17 + (channelCount*2) through 144 are already 0xFF from initial fill.
  
  return data;
}

/**
 * Parse scan lists from scan list block data
 * Based on spec: Fixed 57-byte entries
 * 
 * Block Structure:
 * - Byte 0: Scan list count (1-32)
 * - Byte 1+: Scan list entries (57 bytes each)
 * 
 * Entry Offset Calculation: (57 * N) - 56
 * - Entry 1: offset 1
 * - Entry 2: offset 58
 * - Entry 3: offset 115
 * 
 * 57-Byte Entry Structure:
 * - +0x00: Name (11 bytes, null-terminated, max 10 chars)
 * - +0x0B: Channel Count (1 byte, 0-15)
 * - +0x0C: CTC/TX Mode (1 byte, bits 0-1: CTC, bits 2-3: TX)
 * - +0x0D: Hang Time (1 byte, tenths of seconds, 1-255 = 0.1s to 25.5s)
 * - +0x0E: Priority Types (1 byte, bits 0-3: Pri1 Type, bits 4-7: Pri2 Type)
 * - +0x0F: Priority Channel 1 (2 bytes LE, stored directly)
 * - +0x11: Designated TX Channel (2 bytes LE, ENCODED with -2)
 * - +0x13: Priority Channel 2 (2 bytes LE, ENCODED with -2)
 * - +0x15: Unknown (5 bytes)
 * - +0x1A: Channel List (30 bytes, uint16 array LE, 0x0000 terminated, max 15 channels)
 * - +0x38: Padding (1 byte)
 */
export function parseScanLists(
  data: Uint8Array,
  onRawScanListParsed?: (listNum: number, rawData: Uint8Array, name: string) => void
): ScanList[] {
  const scanLists: ScanList[] = [];
  
  // Read count from offset 0x00
  const count = data[0x00] || 0;
  
  if (count === 0) {
    return scanLists;
  }
  
  // Parse exactly the number of entries specified by the count
  for (let listNum = 1; listNum <= count; listNum++) {
    // Calculate entry offset: (57 * N) - 56
    const entryOffset = (BLOCK_SIZE.SCAN_LIST * listNum) - 56;
    
    if (entryOffset + BLOCK_SIZE.SCAN_LIST > data.length) {
      console.warn(`Scan list ${listNum} would exceed data length (offset ${entryOffset})`);
      break;
    }
    
    // Extract 57-byte entry
    const entry = data.slice(entryOffset, entryOffset + BLOCK_SIZE.SCAN_LIST);
    
    // Name at +0x00 (11 bytes, null-terminated, max 10 chars)
    const nameBytes = entry.slice(0x00, 0x0B);
    const nullIndex = nameBytes.indexOf(0);
    let name = '';
    if (nullIndex >= 0 && nullIndex > 0) {
      name = new TextDecoder('ascii', { fatal: false })
        .decode(nameBytes.slice(0, nullIndex))
        .trim();
    }
    if (!name) {
      name = `Scan List ${listNum}`;
    }
    
    // Channel Count at +0x0B (1 byte, 0-15)
    const channelCount = entry[0x0B];
    
    // CTC/TX Mode at +0x0C (1 byte)
    const ctcTxMode = entry[0x0C];
    const ctcScanMode = (ctcTxMode & 0x03); // Bits 0-1
    const scanTxMode = ((ctcTxMode >> 2) & 0x03); // Bits 2-3
    
    // Hang Time at +0x0D (1 byte, tenths of seconds)
    const hangTime = entry[0x0D] || undefined;
    
    // Priority Types at +0x0E (1 byte)
    const priorityTypes = entry[0x0E];
    const priority1Type = (priorityTypes & 0x0F); // Bits 0-3
    const priority2Type = ((priorityTypes >> 4) & 0x0F); // Bits 4-7
    
    // Priority Channel 1 at +0x0F (2 bytes LE, stored directly)
    const priorityCh1Raw = entry[0x0F] | (entry[0x10] << 8);
    const priorityChannel1 = (priority1Type === 2 && priorityCh1Raw > 0) ? priorityCh1Raw : undefined;
    
    // Designated TX Channel at +0x11 (2 bytes LE, ENCODED with -2)
    const designatedTxRaw = entry[0x11] | (entry[0x12] << 8);
    let designatedTxChannel: number | undefined;
    // Decode: if type==0 → 0 (None), if type==1 → 1 (Current), if type==2 → stored+2
    const designatedTxType = (scanTxMode === 2) ? 2 : (scanTxMode === 1 ? 1 : 0);
    if (designatedTxType === 0) {
      designatedTxChannel = undefined; // None
    } else if (designatedTxType === 1) {
      designatedTxChannel = undefined; // Current (we'll store in scanTxMode instead)
    } else {
      designatedTxChannel = designatedTxRaw + 2;
    }
    
    // Priority Channel 2 at +0x13 (2 bytes LE, ENCODED with -2)
    const priorityCh2Raw = entry[0x13] | (entry[0x14] << 8);
    let priorityChannel2: number | undefined;
    // Decode: if type==0 → 0 (None), if type==1 → 1 (Current), if type==2 → stored+2
    if (priority2Type === 0) {
      priorityChannel2 = undefined; // None
    } else if (priority2Type === 1) {
      priorityChannel2 = undefined; // Current (stored in priority2Type)
    } else {
      priorityChannel2 = priorityCh2Raw + 2;
    }
    
    // Channel List at +0x1A (30 bytes, uint16 array LE, 0x0000 terminated, max 15 channels)
    const channels: number[] = [];
    for (let i = 0; i < 15; i++) {
      const chOffset = 0x1A + (i * 2);
      if (chOffset + 2 > entry.length) break;
      
      const chNum = entry[chOffset] | (entry[chOffset + 1] << 8);
      if (chNum === 0 || chNum === 0xFFFF) {
        break; // End of channel list
      }
      if (chNum > 0 && chNum <= 65535) {
        channels.push(chNum);
      }
    }
    
    const scanList: ScanList = {
      name,
      channels,
      channelCount,
      ctcScanMode,
      scanTxMode,
      hangTime,
      priority1Type,
      priority2Type,
      priorityChannel1,
      priorityChannel2,
      designatedTxChannel,
    };
    
    scanLists.push(scanList);
    
    // Call callback to store raw data
    onRawScanListParsed?.(listNum - 1, entry, name);
  }

  return scanLists;
}

/**
 * Encode a scan list to binary format
 * Based on spec: Fixed 57-byte entry structure
 * 
 * @param scanList - Scan list to encode
 * @param listNum - Scan list number (1-indexed, unused but kept for compatibility)
 * @returns Encoded scan list data (57 bytes)
 */
export function encodeScanList(scanList: ScanList, _listNum: number): Uint8Array {
  const data = new Uint8Array(57);
  
  // Initialize to 0x00
  data.fill(0x00);
  
  // Name at +0x00 (11 bytes, null-terminated, max 10 chars)
  const nameBytes = new TextEncoder().encode(scanList.name.slice(0, 10));
  const nameLength = Math.min(nameBytes.length, 10);
  for (let i = 0; i < nameLength; i++) {
    data[0x00 + i] = nameBytes[i];
  }
  data[nameLength] = 0; // Null terminator
  
  // Channel Count at +0x0B (1 byte, 0-15)
  const channelCount = Math.min(scanList.channels.length, 15);
  data[0x0B] = channelCount;
  
  // CTC/TX Mode at +0x0C (1 byte)
  const ctcScanMode = (scanList.ctcScanMode || 0) & 0x03;
  const scanTxMode = (scanList.scanTxMode || 0) & 0x03;
  data[0x0C] = ctcScanMode | (scanTxMode << 2);
  
  // Hang Time at +0x0D (1 byte, tenths of seconds)
  if (scanList.hangTime) {
    data[0x0D] = scanList.hangTime & 0xFF;
  }
  
  // Priority Types at +0x0E (1 byte)
  const priority1Type = (scanList.priority1Type || 0) & 0x0F;
  const priority2Type = (scanList.priority2Type || 0) & 0x0F;
  data[0x0E] = priority1Type | (priority2Type << 4);
  
  // Priority Channel 1 at +0x0F (2 bytes LE, stored directly)
  if (scanList.priorityChannel1 && priority1Type === 2) {
    const ch1 = scanList.priorityChannel1;
    data[0x0F] = ch1 & 0xFF;
    data[0x10] = (ch1 >> 8) & 0xFF;
  }
  
  // Designated TX Channel at +0x11 (2 bytes LE, ENCODED with -2)
  // Encode: if (ch < 2) store 0, type=ch; else store ch-2, type=2
  if (scanList.designatedTxChannel !== undefined) {
    const ch = scanList.designatedTxChannel;
    const encoded = ch < 2 ? 0 : ch - 2;
    data[0x11] = encoded & 0xFF;
    data[0x12] = (encoded >> 8) & 0xFF;
  }
  
  // Priority Channel 2 at +0x13 (2 bytes LE, ENCODED with -2)
  // Encode: if (ch < 2) store 0, type=ch; else store ch-2, type=2
  if (scanList.priorityChannel2 !== undefined && priority2Type === 2) {
    const ch = scanList.priorityChannel2;
    const encoded = ch < 2 ? 0 : ch - 2;
    data[0x13] = encoded & 0xFF;
    data[0x14] = (encoded >> 8) & 0xFF;
  }
  
  // Channel List at +0x1A (30 bytes, uint16 array LE, 0x0000 terminated, max 15 channels)
  for (let i = 0; i < channelCount && i < 15; i++) {
    const chNum = scanList.channels[i];
    const offset = 0x1A + (i * 2);
    data[offset] = chNum & 0xFF;
    data[offset + 1] = (chNum >> 8) & 0xFF;
  }
  // End marker (0x0000 after last channel)
  if (channelCount < 15) {
    const endOffset = 0x1A + (channelCount * 2);
    data[endOffset] = 0x00;
    data[endOffset + 1] = 0x00;
  }
  
  // Padding at +0x38 (1 byte) - already 0x00 from fill
  
  return data;
}

/**
 * Parse a single contact from 92-byte entry data
 * Based on ContactReadWrite.md spec
 */
export function parseContactEntry(entryData: Uint8Array, contactIndex: number): Contact | null {
  if (entryData.length < 92) {
    return null;
  }

  // Fixed structure for Contact 1+:
  // +0x00-0x0F: Name (16 bytes, null-terminated)
  // +0x10-0x13: ID (4 bytes, uint32 LE)
  // +0x14-0x1B: Callsign (8 bytes, null-terminated, max 7 chars)
  // +0x1C-0x2B: City (16 bytes, null-terminated)
  // +0x2C-0x3B: Province (16 bytes, null-terminated)
  // +0x3C-0x4B: Country (16 bytes, null-terminated)
  // +0x4C-0x5B: Remark (16 bytes, null-terminated)
  const decoder = new TextDecoder('ascii', { fatal: false });
  const NAME_OFFSET = 0x00;
  const ID_OFFSET = 0x10;
  const FIELD_SIZE = 16;

  // Empty entry detection
  if (entryData[NAME_OFFSET] === 0xFF || entryData[NAME_OFFSET] === 0x00) {
    return null;
  }

  // Parse name (16 bytes, null-terminated)
  const nameBytes = entryData.slice(NAME_OFFSET, NAME_OFFSET + FIELD_SIZE);
  const nullIndex = nameBytes.indexOf(0x00);
  const name = (nullIndex >= 0 
    ? decoder.decode(nameBytes.slice(0, nullIndex))
    : decoder.decode(nameBytes.filter(b => b !== 0xFF && b !== 0x00))
  ).trim();
  
  if (!name) return null;

  // Parse DMR ID (4 bytes, little-endian uint32)
  const id = entryData[ID_OFFSET] | 
             (entryData[ID_OFFSET + 1] << 8) | 
             (entryData[ID_OFFSET + 2] << 16) | 
             (entryData[ID_OFFSET + 3] << 24);
  
  // Validate ID (allow 0 for Contact 0)
  if ((id === 0 || id === 0xFFFFFFFF || id > 0xFFFFFF) && contactIndex !== 0) {
    return null;
  }
  
  // Parse callsign (0x14-0x1B, 8 bytes, null-terminated, max 7 chars)
  const CALLSIGN_OFFSET = 0x14;
  const CALLSIGN_SIZE = 8;
  let callSign: string | undefined = undefined;
  if (CALLSIGN_OFFSET + CALLSIGN_SIZE <= entryData.length) {
    const callsignBytes = entryData.slice(CALLSIGN_OFFSET, CALLSIGN_OFFSET + CALLSIGN_SIZE);
    let dataStart = 0;
    while (dataStart < callsignBytes.length && callsignBytes[dataStart] === 0xFF) dataStart++;
    if (dataStart < callsignBytes.length && callsignBytes[dataStart] !== 0x00) {
      const nullIdx = callsignBytes.indexOf(0x00, dataStart);
      const valueBytes = nullIdx >= 0 
        ? callsignBytes.slice(dataStart, nullIdx)
        : callsignBytes.slice(dataStart).filter(b => b !== 0xFF && b !== 0x00);
      
      if (valueBytes.length > 0) {
        const value = decoder.decode(valueBytes).trim();
        callSign = value || undefined;
      }
    }
  }
  
  // Parse fixed-width fields (16 bytes each, null-terminated, may have 0xFF padding)
  const parseFixedField = (offset: number): string | undefined => {
    if (offset + FIELD_SIZE > entryData.length) return undefined;
    
    const fieldBytes = entryData.slice(offset, offset + FIELD_SIZE);
    let dataStart = 0;
    while (dataStart < fieldBytes.length && fieldBytes[dataStart] === 0xFF) dataStart++;
    if (dataStart >= fieldBytes.length || fieldBytes[dataStart] === 0x00) return undefined;
    
    const nullIdx = fieldBytes.indexOf(0x00, dataStart);
    const valueBytes = nullIdx >= 0 
      ? fieldBytes.slice(dataStart, nullIdx)
      : fieldBytes.slice(dataStart).filter(b => b !== 0xFF && b !== 0x00);
    
    if (!valueBytes.length) return undefined;
    const value = decoder.decode(valueBytes).trim();
    return value || undefined;
  };

  return {
    id: contactIndex + 1,
    name,
    dmrId: id,
    callSign,
    city: parseFixedField(0x1C),
    province: parseFixedField(0x2C),
    country: parseFixedField(0x3C),
    remark: parseFixedField(0x4C),
  };
}

/**
 * Parse contacts from contact block data
 * Based on ContactReadWrite.md: 92 bytes (0x5C) per contact entry
 */
export function parseContacts(data: Uint8Array): Contact[] {
  const contacts: Contact[] = [];
  const ENTRY_SIZE = 0x5C; // 92 bytes per contact

  for (let i = 0; i < data.length; i += ENTRY_SIZE) {
    if (i + ENTRY_SIZE > data.length) break;

    const entryData = data.slice(i, i + ENTRY_SIZE);
    const contact = parseContactEntry(entryData, contacts.length);
    
    if (contact) {
      contacts.push(contact);
    }
  }

  return contacts;
}

/**
 * Encode a single contact to 92-byte entry data
 * Based on ContactReadWrite.md spec
 * Structure: 
 * - Contact 0: Count (4 bytes) + Padding (12 bytes) + Name at 0x10 + ID + fields
 * - Contact 1+: Name at 0x10 + ID + fields
 */
/**
 * Encode a single contact entry to 92-byte (0x5C) format
 * All contacts use the same structure: Name (0x00-0x0F), ID (0x10-0x13), 
 * Padding (0x14-0x1B), City (0x1C), Province (0x2C), Country (0x3C), Remark (0x4C)
 */
export function encodeContactEntry(contact: Contact): Uint8Array {
  const entryData = new Uint8Array(0x5C);
  entryData.fill(0xFF);
  const encoder = new TextEncoder();

  // Name (0x00-0x0F, 16 bytes, null-terminated)
  if (contact.name) {
    const nameBytes = encoder.encode(contact.name);
    const len = Math.min(nameBytes.length, 15);
    entryData.set(nameBytes.slice(0, len), 0x00);
    entryData[len] = 0x00;
  } else {
    entryData[0x00] = 0x00;
  }

  // DMR ID (0x10-0x13, 4 bytes, little-endian)
  entryData[0x10] = contact.dmrId & 0xFF;
  entryData[0x11] = (contact.dmrId >> 8) & 0xFF;
  entryData[0x12] = (contact.dmrId >> 16) & 0xFF;
  entryData[0x13] = (contact.dmrId >> 24) & 0xFF;

  // Callsign (0x14-0x1B, 8 bytes, null-terminated, max 7 chars)
  const CALLSIGN_OFFSET = 0x14;
  const CALLSIGN_SIZE = 8;
  if (contact.callSign) {
    const callsignBytes = encoder.encode(contact.callSign);
    const len = Math.min(callsignBytes.length, CALLSIGN_SIZE - 1); // Leave room for null terminator
    entryData.set(callsignBytes.slice(0, len), CALLSIGN_OFFSET);
    entryData[CALLSIGN_OFFSET + len] = 0x00; // Null terminator
    // Fill remaining bytes with 0xFF
    for (let i = len + 1; i < CALLSIGN_SIZE; i++) {
      entryData[CALLSIGN_OFFSET + i] = 0xFF;
    }
  } else {
    // Write empty null-terminated string (0x00 at start, rest 0xFF)
    entryData[CALLSIGN_OFFSET] = 0x00;
    for (let i = 1; i < CALLSIGN_SIZE; i++) {
      entryData[CALLSIGN_OFFSET + i] = 0xFF;
    }
  }

  // Optional fields (16 bytes each, null-terminated)
  const fields = [
    { value: contact.city, offset: 0x1C },
    { value: contact.province, offset: 0x2C },
    { value: contact.country, offset: 0x3C },
    { value: contact.remark, offset: 0x4C },
  ];

  for (const field of fields) {
    if (field.value) {
      const bytes = encoder.encode(field.value);
      const len = Math.min(bytes.length, 15);
      entryData.set(bytes.slice(0, len), field.offset);
      entryData[field.offset + len] = 0x00;
      // Fill remaining bytes with 0xFF
      for (let i = len + 1; i < 16; i++) {
        entryData[field.offset + i] = 0xFF;
      }
    } else {
      // Write empty null-terminated string (0x00 at start, rest 0xFF)
      entryData[field.offset] = 0x00;
      for (let i = 1; i < 16; i++) {
        entryData[field.offset + i] = 0xFF;
      }
    }
  }

  return entryData;
}

/**
 * Parse Radio Settings from metadata 0x04 block (4KB)
 */
export function parseRadioSettings(data: Uint8Array): RadioSettings {
  if (data.length < 0x508) {
    throw new Error('Radio Settings data must be at least 1288 bytes (0x508)');
  }

  // Helper to parse null-terminated string
  const parseString = (offset: number, length: number): string => {
    const bytes = data.slice(offset, offset + length);
    const nullIdx = bytes.indexOf(0);
    return new TextDecoder('ascii', { fatal: false })
      .decode(bytes.slice(0, nullIdx >= 0 ? nullIdx : length))
      .replace(/\x00/g, '')
      .trim();
  };

  // Header fields (0x00-0x20)
  const powerOnInterface = data[0x00] & 0xFF;
  const powerOnDisplayLine1 = parseString(0x01, 14);
  const powerOnDisplayLine2 = parseString(0x0F, 14);
  
  // Allow Reset: 0x1D (bit 0)
  const allowReset = (data[0x1D] & 0x01) !== 0;
  
  // Auto Power Off: 0x1E (0-5: 0=Off, 1=30 Min, 2=60 Min, 3=120 Min, 4=240 Min, 5=480 Min)
  const autoPowerOff = Math.max(0, Math.min(5, data[0x1E] & 0xFF));
  
  // Alert Tone Flags: 0x20 (8 bits, bit flags)
  const alertToneFlags = data[0x20];
  
  // Alert Tone Flags (cont): 0x21 (8 bits, bit flags + 2-bit field)
  const alertToneFlagsCont = data[0x21];

  // Display and UI settings (0x30-0x3B)
  // Backlight Brightness: 0x30 (stored as 0-5, displayed as 1-6, so add +1)
  const backlightBrightness = Math.max(1, Math.min(6, (data[0x30] & 0xFF) + 1)); // 1-6 (stored 0-5, displayed 1-6)
  // Auto Backlight Duration: 0x31 (5-30 seconds, step 5: 5, 10, 15, 20, 25, 30)
  // Stored as value/5 - 1 (0-5), so stored 0=5s, 1=10s, 2=15s, 3=20s, 4=25s, 5=30s
  const autoBacklightDurationRaw = Math.max(0, Math.min(5, data[0x31] & 0xFF)); // Clamp to valid range 0-5
  const autoBacklightDuration = (autoBacklightDurationRaw + 1) * 5; // Convert back: (raw+1)*5, always 5-30
  const unknownDisplay = data[0x32];
  const displayFlags = data[0x33];
  // Data Display Format: bit 3 of 0x33 (0x08 mask)
  // Bit 3 = 0: yyy/m/d (format 0)
  // Bit 3 = 1: d/m/yyy (format 1)
  const dataDisplayFormat = (data[0x33] & 0x08) !== 0 ? 1 : 0;
  const getColorField = (offset: number) => data[offset] & 0x0F;
  const callsignColor = getColorField(0x34);
  const standbyTextColor = getColorField(0x35);
  const menuExitTime = Math.max(1, Math.min(30, data[0x36] & 0xFF));
  const standbyCharacterColor1 = Math.max(0, Math.min(30, data[0x37] & 0xFF));
  const channelAColor = getColorField(0x38);
  const channelBColor = getColorField(0x39);
  const standbyCharacterColor2 = 0; // TODO: Find correct offset for Standby Character Color 2
  const zoneAColor = getColorField(0x3A);
  const zoneBColor = getColorField(0x3B);

  // Work mode and GPS settings (0x40-0x45)
  const workModeFlags = data[0x40];
  const utcZone = Math.max(0, Math.min(25, data[0x41] & 0xFF)); // 0-25
  const measurePeriodInterval = (data[0x42] & 0xFF) + 5; // value+5
  const unknownFlags = data[0x45];

  // GPS/APRS and Digital settings (0x60-0x67)
  const gpsAprsFlags = data[0x60];
  const callHoldTime = Math.max(0, Math.min(61, data[0x61] & 0xFF)); // 0-61
  const activeWaitTime = (data[0x62] & 0xFF) + 1; // value+1
  const activeRetriesTime = (data[0x63] & 0xFF) + 1; // value+1
  const preCarrierTime = data[0x64] & 0xFF; // direct value
  const digitalSettingsFlags = data[0x65];
  const remoteMonitorTime = data[0x66] & 0xFF; // direct value
  const digitalSettingsCont = data[0x67];

  // VFO/Embedded settings (0x80-0x81)
  const vfoEmbeddedFlags = data[0x80];
  const txDwellTime = data[0x81] & 0xFF; // direct value

  // Language/Other settings (0xA0-0xA7)
  const languageOtherSettings = data.slice(0xA0, 0xA0 + 8);

  // Key Lock Settings (0x85-0x86, 0x93)
  const lockKeyByte = data[0x85] & 0xFF;
  const lockKey: 'Manual' | 'Auto' = (lockKeyByte & 0x01) === 0 ? 'Manual' : 'Auto';  // Bit 0: 0=Manual, 1=Auto
  const knobLock = (lockKeyByte & 0x02) !== 0;  // Bit 1: 0=Off, 1=On
  const sideKeyLock = (lockKeyByte & 0x04) !== 0;  // Bit 2: 0=Off, 1=On
  const autoKeypadLockDelayTime = Math.max(5, Math.min(60, data[0x86] & 0xFF));  // Offset 0x86 (5-60, seconds)
  const longPressTime = Math.max(1, Math.min(5, (data[0x93] & 0xFF) + 1));  // Offset 0x93 (stored as 0-4, displayed as 1-5, 1=shortest, 5=longest)

  // Button Functions (0x87-0x90)
  const clamp42 = (val: number) => Math.max(0, Math.min(42, val & 0xFF));
  const sk1Short = clamp42(data[0x87]);
  const sk1Long = clamp42(data[0x88]);
  const sk2Short = clamp42(data[0x89]);
  const sk2Long = clamp42(data[0x8A]);
  const p1Short = clamp42(data[0x8D]);
  const p1Long = clamp42(data[0x8E]);
  const p2Short = clamp42(data[0x8F]);
  const p2Long = clamp42(data[0x90]);

  // One Key Operation
  // Analog Call (4 entries, 2 bytes each, starting at 0x120)
  const analogCall: Array<{ callType: number; callId: number }> = [];
  for (let i = 0; i < 4; i++) {
    const offset = 0x120 + i * 2;
    analogCall.push({
      callType: data[offset] & 0xFF,      // 0=No., 1=Call Type, 2=Call ID
      callId: data[offset + 1] & 0xFF,    // Contact number or ID
    });
  }

  // One Touch Call (5 entries, 5 bytes each, starting at 0x200)
  const oneTouchCall: Array<{ callType: number; callObject: number; digitalCallType: number; sms: number }> = [];
  for (let i = 0; i < 5; i++) {
    const baseOffset = 0x200 + i * 5;
    oneTouchCall.push({
      callType: data[baseOffset] & 0xFF,                    // 0=Off, 1=Analog, 2=Digital
      callObject: data[baseOffset + 1] | (data[baseOffset + 2] << 8),  // uint16, little-endian
      digitalCallType: data[baseOffset + 3] & 0xFF,          // 0=Off, 1=Private, 2=Group, etc.
      sms: data[baseOffset + 4] & 0xFF,                     // SMS number/index
    });
  }

  // Fun+ (10 entries, 7 bytes each, starting at 0x230)
  // Fun+Number is determined by entry index (0-9), not stored in data
  const funPlus: Array<{ operateMode: number; menuSelect: number; callWay: number; callObject: number; digitalCallType: number; sms: number }> = [];
  for (let i = 0; i < 10; i++) {
    const baseOffset = 0x230 + i * 7;  // Base offset 0x230, 7 bytes per entry
    funPlus.push({
      operateMode: data[baseOffset + 0x00] & 0xFF,              // +0x00: 0=Call, 1=Menu
      menuSelect: data[baseOffset + 0x01] & 0xFF,               // +0x01: Menu item (0-13)
      // +0x02: Reserved/Padding (not used)
      callWay: data[baseOffset + 0x03] & 0xFF,                   // +0x03: 0=Off, 1=Analog, 2=Digital
      callObject: data[baseOffset + 0x04] & 0xFF,               // +0x04: Contact/ID
      digitalCallType: data[baseOffset + 0x05] & 0xFF,           // +0x05: Digital call type (0-8)
      sms: data[baseOffset + 0x06] & 0xFF,                      // +0x06: SMS number/index
    });
  }

  // Legacy fields (0x301+) - keeping for backward compatibility
  const unknownRadioSetting = data[0x301];
  const radioFlag = data[0x302];
  const radioEnabled = (radioFlag & 0x01) !== 0;
  
  const latitude = parseString(0x306, 14);
  const latitudeDirection: 'N' | 'S' = data[0x30F] === 0x4E ? 'N' : 'S';
  const longitude = parseString(0x310, 14);

  // Longitude direction (0x319)
  const lonDirByte = data[0x319];
  const longitudeDirection: 'E' | 'W' = lonDirByte === 0x45 ? 'E' : 'W';

  // Channel settings (little-endian uint16)
  // Note: Channels are stored as 1-based (channel 1 = 1, channel 2 = 2, 0 = none)
  const currentChannelA = data[0x320] | (data[0x321] << 8);
  const currentChannelB = data[0x322] | (data[0x323] << 8);
  const channelSetting3 = data[0x324] | (data[0x325] << 8);
  const channelSetting4 = data[0x326] | (data[0x327] << 8);
  const channelSetting5 = data[0x328] | (data[0x329] << 8);
  const channelSetting6 = data[0x32A] | (data[0x32B] << 8);
  const channelSetting7 = data[0x32C] | (data[0x32D] << 8);
  const channelSetting8 = data[0x32E] | (data[0x32F] << 8);

  // Zone settings
  const currentZone = data[0x330];
  const zoneFlag = data[0x331];
  const zoneEnabled = (zoneFlag & 0x01) !== 0;

  // Unknown value (0x332, 3 bytes, formatted as hex string)
  const unknownValueBytes = data.slice(0x332, 0x335);
  const unknownValue = Array.from(unknownValueBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');

  // VFO Channel Information
  // Note: VFO A and VFO B are now parsed from block 0x41 as channels 4001 and 4002
  // They are set in readRadioSettings() after parsing block 0x41
  // Create default empty channels here - will be overridden if block 0x41 is available
  const vfoA = createDefaultChannel({ number: 4001, name: '', rxFrequency: 0, txFrequency: 0 });
  const vfoB = createDefaultChannel({ number: 4002, name: '', rxFrequency: 0, txFrequency: 0 });

  // Menu Enable/Disable Flags (0x500-0x507)
  /**
   * Read a menu bit from the 4KB memory block
   * @param data - The 4KB memory block data
   * @param offset - Byte offset (e.g., 0x500)
   * @param bit - Bit number (0-7)
   * @returns true if enabled (bit=1), false if disabled (bit=0)
   */
  const readMenuBit = (data: Uint8Array, offset: number, bit: number): boolean => {
    if (offset >= data.length) {
      log.warn(`readMenuBit: offset ${offset} (0x${offset.toString(16)}) is out of bounds (data length: ${data.length})`, 'Structures');
      return false;
    }
    const byte = data[offset];
    const mask = 1 << bit;
    const bitValue = (byte & mask) !== 0;
    // Normal bits: bit=1 means enabled, bit=0 means disabled
    return bitValue;
  };

  const menuEnableFlags = {
    // Offset 0x500
    zoneList: readMenuBit(data, 0x500, 0),      // Bit 0
    newZone: readMenuBit(data, 0x500, 1),       // Bit 1
    
    // Offset 0x501
    callAlert: readMenuBit(data, 0x501, 0),      // Bit 0
    radioCheck: readMenuBit(data, 0x501, 1),     // Bit 1
    remoteMonitor: readMenuBit(data, 0x501, 2),  // Bit 2
    radioEnable: readMenuBit(data, 0x501, 3),    // Bit 3
    radioDisable: readMenuBit(data, 0x501, 4),   // Bit 4
    measurePeriod: readMenuBit(data, 0x501, 5),  // Bit 5
    
    // Offset 0x502
    talkaround: readMenuBit(data, 0x502, 0),     // Bit 0
    alertTone: readMenuBit(data, 0x502, 1),       // Bit 1
    txPower: readMenuBit(data, 0x502, 2),        // Bit 2
    startDisplay: readMenuBit(data, 0x502, 3),    // Bit 3
    langSelect: readMenuBit(data, 0x502, 4),      // Bit 4
    matchPrivate: readMenuBit(data, 0x502, 5),   // Bit 5
    matchGroup: readMenuBit(data, 0x502, 6),      // Bit 6
    displayMode: readMenuBit(data, 0x502, 7),     // Bit 7
    
    // Offset 0x503
    smsFormat: readMenuBit(data, 0x503, 0),      // Bit 0
    subChannelMode: readMenuBit(data, 0x503, 1),  // Bit 1
    powerSave: readMenuBit(data, 0x503, 2),      // Bit 2
    fmRadio: readMenuBit(data, 0x503, 3),         // Bit 3
    gps: readMenuBit(data, 0x503, 4),             // Bit 4
    aprs: readMenuBit(data, 0x503, 5),            // Bit 5
    record: readMenuBit(data, 0x503, 6),          // Bit 6
    
    // Offset 0x504
    addContact: readMenuBit(data, 0x504, 0),     // Bit 0
    delContact: readMenuBit(data, 0x504, 1),     // Bit 1
    editContact: readMenuBit(data, 0x504, 2),    // Bit 2
    sendMessage: readMenuBit(data, 0x504, 3),    // Bit 3
    functionality: readMenuBit(data, 0x504, 4),   // Bit 4
    manualDial: readMenuBit(data, 0x504, 5),      // Bit 5
    csvContacts: readMenuBit(data, 0x504, 6),     // Bit 6
    
    // Offset 0x505 (Call Log section)
    missedCall: readMenuBit(data, 0x505, 0),      // Bit 0
    answeredCall: readMenuBit(data, 0x505, 1),    // Bit 1
    sentCall: readMenuBit(data, 0x505, 2),        // Bit 2
    delLog: readMenuBit(data, 0x505, 3),          // Bit 3
    
    // Offset 0x506 (Program section)
    rxFrequency: readMenuBit(data, 0x506, 0),    // Bit 0
    txFrequency: readMenuBit(data, 0x506, 1),    // Bit 1
    ctcDcs: readMenuBit(data, 0x506, 2),         // Bit 2
    txContact: readMenuBit(data, 0x506, 3),      // Bit 3
    colorCode: readMenuBit(data, 0x506, 4),      // Bit 4
    timeSlot: readMenuBit(data, 0x506, 5),       // Bit 5
    radioId: readMenuBit(data, 0x506, 6),        // Bit 6
    radioName: readMenuBit(data, 0x506, 7),      // Bit 7
    
    // Offset 0x507 (Program section continued)
    channelType: readMenuBit(data, 0x507, 0),    // Bit 0
    tdmaDirectMode: readMenuBit(data, 0x507, 1),  // Bit 1
    rxGroupList: readMenuBit(data, 0x507, 2),     // Bit 2
    addChannel: readMenuBit(data, 0x507, 3),     // Bit 3
    channelName: readMenuBit(data, 0x507, 4),    // Bit 4
  };

  return {
    unknownFlag: 0, // No longer used - Power On Interface is at 0x00
    powerOnDisplayLine1,
    powerOnDisplayLine2,
    allowReset,
    autoPowerOff,
    powerOnInterface,
    alertToneFlags,
    alertToneFlagsCont,
    channelAColor,
    channelBColor,
    unknownDisplay,
    displayFlags,
    dataDisplayFormat,
    callsignColor,
    standbyTextColor,
    backlightBrightness,
    autoBacklightDuration,
    menuExitTime,
    standbyCharacterColor1,
    standbyCharacterColor2,
    zoneAColor,
    zoneBColor,
    workModeFlags,
    utcZone,
    measurePeriodInterval,
    unknownFlags,
    gpsAprsFlags,
    callHoldTime,
    activeWaitTime,
    activeRetriesTime,
    preCarrierTime,
    digitalSettingsFlags,
    remoteMonitorTime,
    digitalSettingsCont,
    vfoEmbeddedFlags,
    txDwellTime,
    languageOtherSettings,
    lockKey,
    knobLock,
    sideKeyLock,
    autoKeypadLockDelayTime,
    longPressTime,
    sk1Short,
    sk1Long,
    sk2Short,
    sk2Long,
    p1Short,
    p1Long,
    p2Short,
    p2Long,
    analogCall,
    oneTouchCall,
    funPlus,
    unknownRadioSetting,
    radioEnabled,
    latitude,
    latitudeDirection,
    longitude,
    longitudeDirection,
    currentChannelA,
    currentChannelB,
    channelSetting3,
    channelSetting4,
    channelSetting5,
    channelSetting6,
    channelSetting7,
    channelSetting8,
    currentZone,
    zoneEnabled,
    unknownValue,
    vfoA,
    vfoB,
    menuEnableFlags,
  };
}

/**
 * Encode Radio Settings to metadata 0x04 block format
 * @param settings - The radio settings to encode
 * @param originalData - Optional original data block to preserve unknown bytes. If provided, starts with this data instead of 0xFF.
 * @param changedFields - Optional array of field names to encode. If provided, only these fields will be encoded, preserving all others from originalData.
 */
export function encodeRadioSettings(settings: RadioSettings, originalData?: Uint8Array, changedFields?: string[]): Uint8Array {
  const data = new Uint8Array(0x1000); // 4KB block
  
  // Start with original data if provided, otherwise fill with 0xFF
  if (originalData && originalData.length >= 0x1000) {
    // Copy original data to preserve unknown bytes
    data.set(originalData.slice(0, 0x1000));
  } else {
    // Fill with 0xFF (typical for unused areas) if no original data
    data.fill(0xFF);
  }

  // Helper to check if a field should be encoded
  const shouldEncode = (fieldName: string): boolean => {
    return !changedFields || changedFields.includes(fieldName);
  };

  // Header fields (0x00-0x20)
  // Power On Interface: 0x00 (0-2)
  if (shouldEncode('powerOnInterface')) {
    data[0x00] = Math.max(0, Math.min(2, settings.powerOnInterface)) & 0xFF;
  }
  
  // Power On Display Line 1: 0x01-0x0D (14 bytes, null-terminated)
  if (shouldEncode('powerOnDisplayLine1')) {
    const powerOnLine1Bytes = new Uint8Array(14);
    const powerOnLine1Encoded = new TextEncoder().encode(settings.powerOnDisplayLine1.substring(0, 13));
    powerOnLine1Bytes.set(powerOnLine1Encoded, 0);
    if (powerOnLine1Encoded.length < 14) {
      powerOnLine1Bytes[powerOnLine1Encoded.length] = 0; // Null terminator
    }
    data.set(powerOnLine1Bytes, 0x01);
  }
  
  // Power On Display Line 2: 0x0F-0x1B (14 bytes, null-terminated)
  if (shouldEncode('powerOnDisplayLine2')) {
    const powerOnLine2Bytes = new Uint8Array(14);
    const powerOnLine2Encoded = new TextEncoder().encode(settings.powerOnDisplayLine2.substring(0, 13));
    powerOnLine2Bytes.set(powerOnLine2Encoded, 0);
    if (powerOnLine2Encoded.length < 14) {
      powerOnLine2Bytes[powerOnLine2Encoded.length] = 0; // Null terminator
    }
    data.set(powerOnLine2Bytes, 0x0F);
  }
  
  // Allow Reset: 0x1D (bit 0)
  if (shouldEncode('allowReset')) {
    data[0x1D] = settings.allowReset ? (data[0x1D] | 0x01) : (data[0x1D] & ~0x01);
  }
  
  // Auto Power Off: 0x1E (0-5: 0=Off, 1=30 Min, 2=60 Min, 3=120 Min, 4=240 Min, 5=480 Min)
  if (shouldEncode('autoPowerOff')) {
    data[0x1E] = Math.max(0, Math.min(5, settings.autoPowerOff)) & 0xFF;
  }
  
  // Alert Tone Flags: 0x20 (8 bits, bit flags)
  if (shouldEncode('alertToneFlags')) {
    data[0x20] = settings.alertToneFlags & 0xFF;
  }
  
  // Alert Tone Flags (cont): 0x21 (8 bits, bit flags + 2-bit field)
  if (shouldEncode('alertToneFlagsCont')) {
    data[0x21] = settings.alertToneFlagsCont & 0xFF;
  }

  // Display and UI settings (0x30-0x3B)
  // Backlight Brightness: 0x30 (stored as 0-5, displayed as 1-6, so subtract 1)
  if (shouldEncode('backlightBrightness')) {
    data[0x30] = Math.max(0, Math.min(5, settings.backlightBrightness - 1)) & 0xFF;
  }
  // Auto Backlight Duration at 0x31 (5-30 seconds, step 5)
  // Stored as value/5 - 1 (0-5), so 5s=0, 10s=1, 15s=2, 20s=3, 25s=4, 30s=5
  if (shouldEncode('autoBacklightDuration')) {
    const autoBacklightDurationValue = Math.max(5, Math.min(30, settings.autoBacklightDuration));
    data[0x31] = Math.max(0, Math.min(5, Math.floor(autoBacklightDurationValue / 5) - 1)) & 0xFF;
  }
  if (shouldEncode('unknownDisplay')) {
    data[0x32] = settings.unknownDisplay & 0xFF;
  }
  // Display Flags: 0x33
  // Preserve existing bits, only modify bit 3 (0x08) based on dataDisplayFormat
  if (shouldEncode('displayFlags') || shouldEncode('dataDisplayFormat')) {
    const currentDisplayFlags = originalData ? originalData[0x33] : settings.displayFlags;
    let displayFlagsValue = currentDisplayFlags & 0xFF;
    if (settings.dataDisplayFormat === 1) {
      displayFlagsValue |= 0x08; // Set bit 3
    } else {
      displayFlagsValue &= ~0x08; // Clear bit 3
    }
    data[0x33] = displayFlagsValue;
  }
  // Color fields (preserve upper 4 bits, modify lower 4 bits)
  const setColorField = (offset: number, value: number, fieldName: string) => {
    if (shouldEncode(fieldName)) {
      data[offset] = (data[offset] & 0xF0) | (Math.max(0, Math.min(15, value)) & 0x0F);
    }
  };
  setColorField(0x34, settings.callsignColor, 'callsignColor');
  setColorField(0x35, settings.standbyTextColor, 'standbyTextColor');
  if (shouldEncode('menuExitTime')) {
    data[0x36] = Math.max(1, Math.min(30, settings.menuExitTime)) & 0xFF;
  }
  if (shouldEncode('standbyCharacterColor1')) {
    data[0x37] = Math.max(0, Math.min(30, settings.standbyCharacterColor1)) & 0xFF;
  }
  setColorField(0x38, settings.channelAColor, 'channelAColor');
  setColorField(0x39, settings.channelBColor, 'channelBColor');
  setColorField(0x3A, settings.zoneAColor, 'zoneAColor');
  setColorField(0x3B, settings.zoneBColor, 'zoneBColor');

  // Work mode and GPS settings (0x40-0x45)
  if (shouldEncode('workModeFlags')) {
    data[0x40] = settings.workModeFlags & 0xFF;
  }
  if (shouldEncode('utcZone')) {
    data[0x41] = Math.max(0, Math.min(25, settings.utcZone)) & 0xFF;
  }
  if (shouldEncode('measurePeriodInterval')) {
    data[0x42] = Math.max(0, Math.min(255, settings.measurePeriodInterval - 5)) & 0xFF; // value+5, so subtract 5
  }
  if (shouldEncode('unknownFlags')) {
    data[0x45] = settings.unknownFlags & 0xFF;
  }

  // GPS/APRS and Digital settings (0x60-0x67)
  if (shouldEncode('gpsAprsFlags')) {
    data[0x60] = settings.gpsAprsFlags & 0xFF;
  }
  if (shouldEncode('callHoldTime')) {
    data[0x61] = Math.max(0, Math.min(61, settings.callHoldTime)) & 0xFF;
  }
  if (shouldEncode('activeWaitTime')) {
    data[0x62] = Math.max(0, Math.min(255, settings.activeWaitTime - 1)) & 0xFF; // value+1, so subtract 1
  }
  if (shouldEncode('activeRetriesTime')) {
    data[0x63] = Math.max(0, Math.min(255, settings.activeRetriesTime - 1)) & 0xFF; // value+1, so subtract 1
  }
  if (shouldEncode('preCarrierTime')) {
    data[0x64] = settings.preCarrierTime & 0xFF;
  }
  if (shouldEncode('digitalSettingsFlags')) {
    data[0x65] = settings.digitalSettingsFlags & 0xFF;
  }
  if (shouldEncode('remoteMonitorTime')) {
    data[0x66] = settings.remoteMonitorTime & 0xFF;
  }
  if (shouldEncode('digitalSettingsCont')) {
    data[0x67] = settings.digitalSettingsCont & 0xFF;
  }

  // VFO/Embedded settings (0x80-0x81)
  if (shouldEncode('vfoEmbeddedFlags')) {
    data[0x80] = settings.vfoEmbeddedFlags & 0xFF;
  }
  if (shouldEncode('txDwellTime')) {
    data[0x81] = settings.txDwellTime & 0xFF;
  }

  // Language/Other settings (0xA0-0xA7)
  if (shouldEncode('languageOtherSettings') && settings.languageOtherSettings && settings.languageOtherSettings.length >= 8) {
    data.set(settings.languageOtherSettings.slice(0, 8), 0xA0);
  }

  // Key Lock Settings (0x85-0x86, 0x93)
  // Lock Key: bit 0 of 0x85 (0=Manual, 1=Auto)
  // Knob Lock: bit 1 of 0x85 (0=Off, 1=On)
  // Side Key Lock: bit 2 of 0x85 (0=Off, 1=On)
  if (shouldEncode('lockKey') || shouldEncode('knobLock') || shouldEncode('sideKeyLock')) {
    let lockKeyByte = data[0x85] & 0xFF;
    if (shouldEncode('lockKey')) {
      lockKeyByte = settings.lockKey === 'Auto' ? (lockKeyByte | 0x01) : (lockKeyByte & ~0x01);  // Bit 0
    }
    if (shouldEncode('knobLock')) {
      lockKeyByte = settings.knobLock ? (lockKeyByte | 0x02) : (lockKeyByte & ~0x02);  // Bit 1
    }
    if (shouldEncode('sideKeyLock')) {
      lockKeyByte = settings.sideKeyLock ? (lockKeyByte | 0x04) : (lockKeyByte & ~0x04);  // Bit 2
    }
    data[0x85] = lockKeyByte & 0xFF;
  }
  if (shouldEncode('autoKeypadLockDelayTime')) {
    data[0x86] = Math.max(5, Math.min(60, settings.autoKeypadLockDelayTime)) & 0xFF;  // Auto Keypad Lock Delay Time (5-60 seconds)
  }
  if (shouldEncode('longPressTime')) {
    data[0x93] = Math.max(0, Math.min(4, settings.longPressTime - 1)) & 0xFF;  // Long Press Time (stored as 0-4, displayed as 1-5, 1=shortest, 5=longest)
  }

  // Button Functions (0x87-0x90)
  const clamp42 = (val: number) => Math.max(0, Math.min(42, val)) & 0xFF;
  if (shouldEncode('sk1Short')) {
    data[0x87] = clamp42(settings.sk1Short);
  }
  if (shouldEncode('sk1Long')) {
    data[0x88] = clamp42(settings.sk1Long);
  }
  if (shouldEncode('sk2Short')) {
    data[0x89] = clamp42(settings.sk2Short);
  }
  if (shouldEncode('sk2Long')) {
    data[0x8A] = clamp42(settings.sk2Long);
  }
  if (shouldEncode('p1Short')) {
    data[0x8D] = clamp42(settings.p1Short);
  }
  if (shouldEncode('p1Long')) {
    data[0x8E] = clamp42(settings.p1Long);
  }
  if (shouldEncode('p2Short')) {
    data[0x8F] = clamp42(settings.p2Short);
  }
  if (shouldEncode('p2Long')) {
    data[0x90] = clamp42(settings.p2Long);
  }

  // One Key Operation
  // Analog Call (4 entries, 2 bytes each, starting at 0x120)
  if (shouldEncode('analogCall') && settings.analogCall && settings.analogCall.length >= 4) {
    for (let i = 0; i < 4; i++) {
      const offset = 0x120 + i * 2;
      const entry = settings.analogCall[i];
      if (entry) {
        data[offset] = Math.max(0, Math.min(2, entry.callType)) & 0xFF;
        data[offset + 1] = (entry.callId & 0xFF);
      }
    }
  }

  // One Touch Call (5 entries, 5 bytes each, starting at 0x200)
  if (shouldEncode('oneTouchCall') && settings.oneTouchCall && settings.oneTouchCall.length >= 5) {
    for (let i = 0; i < 5; i++) {
      const baseOffset = 0x200 + i * 5;
      const entry = settings.oneTouchCall[i];
      if (entry) {
        data[baseOffset] = Math.max(0, Math.min(2, entry.callType)) & 0xFF;
        data[baseOffset + 1] = entry.callObject & 0xFF;
        data[baseOffset + 2] = (entry.callObject >> 8) & 0xFF;
        data[baseOffset + 3] = Math.max(0, Math.min(8, entry.digitalCallType)) & 0xFF;
        data[baseOffset + 4] = entry.sms & 0xFF;
      }
    }
  }

  // Fun+ (10 entries, 7 bytes each, starting at 0x230)
  // Fun+Number is determined by entry index (0-9), not stored in data
  if (shouldEncode('funPlus') && settings.funPlus && settings.funPlus.length >= 10) {
    for (let i = 0; i < 10; i++) {
      const baseOffset = 0x230 + i * 7;  // Base offset 0x230, 7 bytes per entry
      const entry = settings.funPlus[i];
      if (entry) {
        data[baseOffset + 0x00] = Math.max(0, Math.min(1, entry.operateMode)) & 0xFF;
        data[baseOffset + 0x01] = Math.max(0, Math.min(13, entry.menuSelect)) & 0xFF;
        data[baseOffset + 0x02] = 0x00;
        data[baseOffset + 0x03] = Math.max(0, Math.min(2, entry.callWay)) & 0xFF;
        data[baseOffset + 0x04] = entry.callObject & 0xFF;
        data[baseOffset + 0x05] = Math.max(0, Math.min(8, entry.digitalCallType)) & 0xFF;
        data[baseOffset + 0x06] = entry.sms & 0xFF;
      }
    }
  }

  // Legacy fields (0x301+)
  if (shouldEncode('unknownRadioSetting')) {
    data[0x301] = settings.unknownRadioSetting;
  }
  if (shouldEncode('radioEnabled')) {
    data[0x302] = settings.radioEnabled ? 0x01 : 0x00;
  }

  // Latitude (0x306, 14 bytes, null-terminated)
  if (shouldEncode('latitude')) {
    const latBytes = new Uint8Array(14);
    const latEncoded = new TextEncoder().encode(settings.latitude.substring(0, 13));
    latBytes.set(latEncoded, 0);
    latBytes[latEncoded.length] = 0;
    data.set(latBytes, 0x306);
  }

  // Latitude direction (0x30F)
  if (shouldEncode('latitudeDirection')) {
    data[0x30F] = settings.latitudeDirection === 'N' ? 0x4E : 0x53;
  }

  // Longitude (0x310, 14 bytes, null-terminated)
  if (shouldEncode('longitude')) {
    const lonBytes = new Uint8Array(14);
    const lonEncoded = new TextEncoder().encode(settings.longitude.substring(0, 13));
    lonBytes.set(lonEncoded, 0);
    lonBytes[lonEncoded.length] = 0;
    data.set(lonBytes, 0x310);
  }

  // Longitude direction (0x319)
  if (shouldEncode('longitudeDirection')) {
    data[0x319] = settings.longitudeDirection === 'E' ? 0x45 : 0x57;
  }

  // Channel settings (little-endian uint16) - these are runtime state, usually don't need to write
  if (shouldEncode('currentChannelA')) {
    data[0x320] = settings.currentChannelA & 0xFF;
    data[0x321] = (settings.currentChannelA >> 8) & 0xFF;
  }
  if (shouldEncode('currentChannelB')) {
    data[0x322] = settings.currentChannelB & 0xFF;
    data[0x323] = (settings.currentChannelB >> 8) & 0xFF;
  }
  if (shouldEncode('channelSetting3')) {
    data[0x324] = settings.channelSetting3 & 0xFF;
    data[0x325] = (settings.channelSetting3 >> 8) & 0xFF;
  }
  if (shouldEncode('channelSetting4')) {
    data[0x326] = settings.channelSetting4 & 0xFF;
    data[0x327] = (settings.channelSetting4 >> 8) & 0xFF;
  }
  if (shouldEncode('channelSetting5')) {
    data[0x328] = settings.channelSetting5 & 0xFF;
    data[0x329] = (settings.channelSetting5 >> 8) & 0xFF;
  }
  if (shouldEncode('channelSetting6')) {
    data[0x32A] = settings.channelSetting6 & 0xFF;
    data[0x32B] = (settings.channelSetting6 >> 8) & 0xFF;
  }
  if (shouldEncode('channelSetting7')) {
    data[0x32C] = settings.channelSetting7 & 0xFF;
    data[0x32D] = (settings.channelSetting7 >> 8) & 0xFF;
  }
  if (shouldEncode('channelSetting8')) {
    data[0x32E] = settings.channelSetting8 & 0xFF;
    data[0x32F] = (settings.channelSetting8 >> 8) & 0xFF;
  }

  // Zone settings - runtime state, usually don't need to write
  if (shouldEncode('currentZone')) {
    data[0x330] = settings.currentZone;
  }
  if (shouldEncode('zoneEnabled')) {
    data[0x331] = settings.zoneEnabled ? 0x01 : 0x00;
  }

  // Unknown value (0x332, 3 bytes)
  if (shouldEncode('unknownValue')) {
    const unknownValueParts = settings.unknownValue.split(' ').filter(s => s.length > 0);
    for (let i = 0; i < Math.min(3, unknownValueParts.length); i++) {
      const byte = parseInt(unknownValueParts[i], 16);
      if (!isNaN(byte)) {
        data[0x332 + i] = byte;
      }
    }
  }

  // VFO Channel Information
  // Note: VFO A and VFO B are now written to block 0x41 as channels 4001 and 4002
  // They are written in writeRadioSettings() to block 0x41

  // Menu Enable/Disable Flags (0x500-0x507)
  /**
   * Write a menu bit to a byte
   * @param byte - The byte to modify
   * @param bit - Bit number (0-7)
   * @param enabled - true if enabled, false if disabled
   * @returns The modified byte
   */
  const writeMenuBit = (byte: number, bit: number, enabled: boolean): number => {
    const mask = 1 << bit;
    // Normal bits: enabled=true means write 1, enabled=false means write 0
    if (enabled) {
      return byte | mask;  // Set bit (bit=1 = enabled)
    } else {
      return byte & ~mask; // Clear bit (bit=0 = disabled)
    }
  };

  // Menu Enable Flags - only encode if menuEnableFlags changed
  const shouldEncodeMenuFlags = shouldEncode('menuEnableFlags');
  
  // Initialize menu bytes from original data if not encoding, otherwise start fresh
  let menuByte500 = shouldEncodeMenuFlags ? 0x00 : (originalData ? originalData[0x500] : 0x00);
  let menuByte501 = shouldEncodeMenuFlags ? 0x00 : (originalData ? originalData[0x501] : 0x00);
  let menuByte502 = shouldEncodeMenuFlags ? 0x00 : (originalData ? originalData[0x502] : 0x00);
  let menuByte503 = shouldEncodeMenuFlags ? 0x00 : (originalData ? originalData[0x503] : 0x00);
  let menuByte504 = shouldEncodeMenuFlags ? 0x00 : (originalData ? originalData[0x504] : 0x00);
  let menuByte505 = shouldEncodeMenuFlags ? 0x00 : (originalData ? originalData[0x505] : 0x00);
  let menuByte506 = shouldEncodeMenuFlags ? 0x00 : (originalData ? originalData[0x506] : 0x00);
  let menuByte507 = shouldEncodeMenuFlags ? 0x00 : (originalData ? originalData[0x507] : 0x00);

  const flags = settings.menuEnableFlags;

  // Offset 0x500
  menuByte500 = writeMenuBit(menuByte500, 0, flags.zoneList);      // Bit 0
  menuByte500 = writeMenuBit(menuByte500, 1, flags.newZone);       // Bit 1
  
  // Offset 0x501
  menuByte501 = writeMenuBit(menuByte501, 0, flags.callAlert);     // Bit 0
  menuByte501 = writeMenuBit(menuByte501, 1, flags.radioCheck);     // Bit 1
  menuByte501 = writeMenuBit(menuByte501, 2, flags.remoteMonitor);  // Bit 2
  menuByte501 = writeMenuBit(menuByte501, 3, flags.radioEnable);    // Bit 3
  menuByte501 = writeMenuBit(menuByte501, 4, flags.radioDisable);   // Bit 4
  menuByte501 = writeMenuBit(menuByte501, 5, flags.measurePeriod);  // Bit 5
  
  // Offset 0x502
  menuByte502 = writeMenuBit(menuByte502, 0, flags.talkaround);    // Bit 0
  menuByte502 = writeMenuBit(menuByte502, 1, flags.alertTone);       // Bit 1
  menuByte502 = writeMenuBit(menuByte502, 2, flags.txPower);        // Bit 2
  menuByte502 = writeMenuBit(menuByte502, 3, flags.startDisplay);    // Bit 3
  menuByte502 = writeMenuBit(menuByte502, 4, flags.langSelect);      // Bit 4
  menuByte502 = writeMenuBit(menuByte502, 5, flags.matchPrivate);   // Bit 5
  menuByte502 = writeMenuBit(menuByte502, 6, flags.matchGroup);      // Bit 6
  menuByte502 = writeMenuBit(menuByte502, 7, flags.displayMode);     // Bit 7
  
  // Offset 0x503
  menuByte503 = writeMenuBit(menuByte503, 0, flags.smsFormat);     // Bit 0
  menuByte503 = writeMenuBit(menuByte503, 1, flags.subChannelMode);  // Bit 1
  menuByte503 = writeMenuBit(menuByte503, 2, flags.powerSave);      // Bit 2
  menuByte503 = writeMenuBit(menuByte503, 3, flags.fmRadio);         // Bit 3
  menuByte503 = writeMenuBit(menuByte503, 4, flags.gps);             // Bit 4
  menuByte503 = writeMenuBit(menuByte503, 5, flags.aprs);            // Bit 5
  menuByte503 = writeMenuBit(menuByte503, 6, flags.record);          // Bit 6
  
  // Offset 0x504
  menuByte504 = writeMenuBit(menuByte504, 0, flags.addContact);     // Bit 0
  menuByte504 = writeMenuBit(menuByte504, 1, flags.delContact);     // Bit 1
  menuByte504 = writeMenuBit(menuByte504, 2, flags.editContact);    // Bit 2
  menuByte504 = writeMenuBit(menuByte504, 3, flags.sendMessage);    // Bit 3
  menuByte504 = writeMenuBit(menuByte504, 4, flags.functionality);   // Bit 4
  menuByte504 = writeMenuBit(menuByte504, 5, flags.manualDial);      // Bit 5
  menuByte504 = writeMenuBit(menuByte504, 6, flags.csvContacts);     // Bit 6
  
  // Offset 0x505 (Call Log section)
  menuByte505 = writeMenuBit(menuByte505, 0, flags.missedCall);      // Bit 0
  menuByte505 = writeMenuBit(menuByte505, 1, flags.answeredCall);    // Bit 1
  menuByte505 = writeMenuBit(menuByte505, 2, flags.sentCall);        // Bit 2
  menuByte505 = writeMenuBit(menuByte505, 3, flags.delLog);          // Bit 3
  
  // Offset 0x506 (Program section)
  menuByte506 = writeMenuBit(menuByte506, 0, flags.rxFrequency);     // Bit 0
  menuByte506 = writeMenuBit(menuByte506, 1, flags.txFrequency);    // Bit 1
  menuByte506 = writeMenuBit(menuByte506, 2, flags.ctcDcs);         // Bit 2
  menuByte506 = writeMenuBit(menuByte506, 3, flags.txContact);      // Bit 3
  menuByte506 = writeMenuBit(menuByte506, 4, flags.colorCode);      // Bit 4
  menuByte506 = writeMenuBit(menuByte506, 5, flags.timeSlot);       // Bit 5
  menuByte506 = writeMenuBit(menuByte506, 6, flags.radioId);        // Bit 6
  menuByte506 = writeMenuBit(menuByte506, 7, flags.radioName);      // Bit 7
  
  // Offset 0x507 (Program section continued)
  menuByte507 = writeMenuBit(menuByte507, 0, flags.channelType);     // Bit 0
  menuByte507 = writeMenuBit(menuByte507, 1, flags.tdmaDirectMode);  // Bit 1
  menuByte507 = writeMenuBit(menuByte507, 2, flags.rxGroupList);     // Bit 2
  menuByte507 = writeMenuBit(menuByte507, 3, flags.addChannel);     // Bit 3
  menuByte507 = writeMenuBit(menuByte507, 4, flags.channelName);    // Bit 4

  // Write menu bytes only if menuEnableFlags changed
  if (shouldEncodeMenuFlags) {
    data[0x500] = menuByte500;
    data[0x501] = menuByte501;
    data[0x502] = menuByte502;
    data[0x503] = menuByte503;
    data[0x504] = menuByte504;
    data[0x505] = menuByte505;
    data[0x506] = menuByte506;
    data[0x507] = menuByte507;
  }

  // Set metadata byte at offset 0xFFF
  data[0xFFF] = 0x04;

  return data;
}

/**
 * Parse quick text messages from message block data
 * 
 * Quick Message structure (from format spec):
 * - Header: Offset 0x00 (1 byte count), 0x01-0x0F (15 bytes padding)
 * - Entry size: 129 bytes per message (0x81)
 * - Entries start at offset 0x10
 * - Max entries: 20
 * 
 * Entry N (1-based):
 * - Status byte: (N * 0x81) - 0x71
 * - Message text: (N * 0x81) - 0x70 (128 bytes, ASCII, terminated with 0xFF)
 * 
 * Example:
 * - Entry 1: Status at 0x10, Message at 0x11-0x90
 * - Entry 2: Status at 0x91, Message at 0x92-0x111
 */
export function parseQuickMessages(
  data: Uint8Array,
  onRawMessageParsed?: (messageIndex: number, rawData: Uint8Array) => void
): QuickTextMessage[] {
  const messages: QuickTextMessage[] = [];

  // Read count field at offset 0
  const messageCount = data.length > 0 ? data[0] : 0;
  const maxMessages = Math.min(messageCount, LIMITS.QUICK_MESSAGES_MAX);

  // Parse each message entry (1-based indexing)
  for (let entryNum = 1; entryNum <= maxMessages; entryNum++) {
    // Calculate offsets using formula: (N * 0x81) - 0x71 for status, (N * 0x81) - 0x70 for message
    const statusOffset = (entryNum * 0x81) - 0x71;
    const messageOffset = (entryNum * 0x81) - 0x70;
    const messageEndOffset = messageOffset + 128; // 128 bytes for message text
    
    if (messageEndOffset > data.length) {
      log.debug(`Message ${entryNum} would extend to offset ${messageEndOffset}, but data length is only ${data.length}`, 'Structures');
      break;
    }

    // Read status/flag byte
    const flag = data[statusOffset];

    // Read message text (128 bytes, terminated with 0xFF)
    const messageBytes = data.slice(messageOffset, messageEndOffset);
    
    // Find end of text (0xFF terminator)
    let textEndOffset = messageBytes.length;
    for (let i = 0; i < messageBytes.length; i++) {
      if (messageBytes[i] === 0xFF) {
        textEndOffset = i;
        break;
      }
    }

    const textBytes = messageBytes.slice(0, textEndOffset);
    const text = new TextDecoder('ascii', { fatal: false })
      .decode(textBytes)
      .trim();

    // Skip empty messages
    if (text.length === 0) {
      continue;
    }

    // Extract entry data for callback (129 bytes: status + message)
    const entryData = new Uint8Array(129);
    entryData[0] = flag;
    entryData.set(messageBytes, 1);

    const message: QuickTextMessage = {
      index: entryNum - 1, // 0-based for UI
      text,
      flag,
      checkValue: 0, // Check value not in this format
    };

    messages.push(message);

    // Call callback to store raw data
    onRawMessageParsed?.(entryNum - 1, entryData);
  }

  return messages;
}

/**
 * Encode a quick text message into binary format
 * 
 * Format:
 * - Status byte at offset (N * 0x81) - 0x71
 * - Message text at offset (N * 0x81) - 0x70 (128 bytes, ASCII, terminated with 0xFF)
 * 
 * @param message - Quick text message to encode
 * @param messageIndex - 0-based index of the message (will be converted to 1-based for calculation)
 * @param buffer - Full 4KB buffer to write into (will be modified)
 * @returns Updated buffer with message encoded
 */
export function encodeQuickMessage(message: QuickTextMessage, buffer: Uint8Array): Uint8Array {
  // Convert 0-based index to 1-based for formula
  const entryNum = message.index + 1;
  
  // Calculate offsets using formula: (N * 0x81) - 0x71 for status, (N * 0x81) - 0x70 for message
  const statusOffset = (entryNum * 0x81) - 0x71;
  const messageOffset = (entryNum * 0x81) - 0x70;
  
  // Write status/flag byte (character count)
  buffer[statusOffset] = message.flag;
  
  // Encode message text (max 128 bytes, ASCII)
  const textBytes = new TextEncoder().encode(message.text);
  const textLength = Math.min(textBytes.length, 128);
  
  // Write message text
  for (let i = 0; i < textLength; i++) {
    buffer[messageOffset + i] = textBytes[i];
  }
  
  // Terminate with 0xFF and pad remaining with 0xFF
  if (textLength < 128) {
    buffer[messageOffset + textLength] = 0xFF;
    // Pad remaining bytes with 0xFF
    for (let i = textLength + 1; i < 128; i++) {
      buffer[messageOffset + i] = 0xFF;
    }
  } else {
    // If text is exactly 128 bytes, last byte should be 0xFF
    buffer[messageOffset + 127] = 0xFF;
  }
  
  return buffer;
}

/**
 * Encode all quick messages into a 4KB block
 * 
 * Format:
 * - Header: Offset 0x00 (1 byte count), 0x01-0x0F (15 bytes padding)
 * - Entries start at offset 0x10
 * - Each entry: Status byte + 128 bytes message text
 * 
 * @param messages - Array of quick messages to encode
 * @param buffer - Existing 4KB block buffer to modify (preserves other data)
 * @returns Updated buffer with messages encoded
 */
export function encodeQuickMessages(messages: QuickTextMessage[], buffer: Uint8Array): Uint8Array {
  // Write message count at offset 0x00
  const messageCount = Math.min(messages.length, LIMITS.QUICK_MESSAGES_MAX);
  buffer[0x00] = messageCount;
  
  // Clear all message entries first (entries 1-20) to 0xFF
  for (let entryNum = 1; entryNum <= LIMITS.QUICK_MESSAGES_MAX; entryNum++) {
    const statusOffset = (entryNum * 0x81) - 0x71;
    const messageOffset = (entryNum * 0x81) - 0x70;
    
    // Clear status byte
    if (statusOffset < buffer.length) {
      buffer[statusOffset] = 0xFF;
    }
    
    // Clear message text area (128 bytes)
    if (messageOffset < buffer.length) {
      for (let i = 0; i < 128 && (messageOffset + i) < buffer.length; i++) {
        buffer[messageOffset + i] = 0xFF;
      }
    }
  }
  
  // Encode each message using the helper function
  for (let i = 0; i < messageCount; i++) {
    const message = messages[i];
    // Ensure message has correct index and flag is set to text length
    const textLength = new TextEncoder().encode(message.text).length;
    encodeQuickMessage({ 
      ...message, 
      index: i,
      flag: textLength  // Ensure flag is set to character count
    }, buffer);
  }
  
  return buffer;
}


/**
 * Parse Digital Emergency Systems from metadata 0x10 block
 * Entry structure: 20 bytes (0x14) starting at offset 0x000
 * Entry Calculation: entry_base = 0x000 + entry_num * 0x14
 * Max entries: 8
 */
export function parseDigitalEmergencies(data: Uint8Array): { systems: DigitalEmergency[]; config: DigitalEmergencyConfig } {
  const initialOffset = 0x000;
  const entrySize = 0x14; // 20 bytes per entry
  const maxEntries = 8; // 8 total entries

  const systems: DigitalEmergency[] = [];

  for (let i = 0; i < maxEntries; i++) {
    const entryOffset = initialOffset + (i * entrySize); // Entry 0 → 0x000, Entry 1 → 0x014, etc.
    if (entryOffset + entrySize > data.length) break;

    // Check if entry is empty (all zeros or all 0xFF)
    const entryData = data.slice(entryOffset, entryOffset + entrySize);
    if (entryData.every(b => b === 0x00 || b === 0xFF)) {
      continue;
    }

    // Name (10 bytes at +0x00-0x09, ASCII string)
    const nameBytes = data.slice(entryOffset + 0x00, entryOffset + 0x0A);
    const nullIndex = nameBytes.indexOf(0);
    const name = new TextDecoder('ascii', { fatal: false })
      .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : nameBytes.length))
      .replace(/\x00/g, '')
      .trim();

    // Fields (10 bytes at +0x0A-0x13, structure TBD)
    const fields = data.slice(entryOffset + 0x0A, entryOffset + 0x14);

    systems.push({
      index: i,
      name: name || `[Entry ${i}]`,
      fields: new Uint8Array(fields),
    });
  }

  return { systems, config: {} };
}

/**
 * Encode Digital Emergency Systems to metadata 0x10 block format
 * Entry structure: 20 bytes (0x14) starting at offset 0x000
 * Entry Calculation: entry_base = 0x000 + entry_num * 0x14
 */
export function encodeDigitalEmergencies(systems: DigitalEmergency[], _config: DigitalEmergencyConfig): Uint8Array {
  const data = new Uint8Array(0x1000); // 4KB block
  data.fill(0xFF);

  const initialOffset = 0x000;
  const entrySize = 0x14; // 20 bytes per entry
  const maxEntries = 8; // 8 total entries

  // Write emergency system entries
  for (let i = 0; i < Math.min(systems.length, maxEntries); i++) {
    const system = systems[i];
    const entryOffset = initialOffset + (i * entrySize);
    
    if (entryOffset + entrySize > data.length) break;

    // Name (10 bytes at +0x00-0x09, ASCII string)
    const nameBytes = new Uint8Array(10);
    nameBytes.fill(0);
    if (system.name) {
      const encoded = new TextEncoder().encode(system.name.slice(0, 10));
      nameBytes.set(encoded, 0);
    }
    data.set(nameBytes, entryOffset + 0x00);

    // Fields (10 bytes at +0x0A-0x13)
    if (system.fields && system.fields.length >= 10) {
      data.set(system.fields.slice(0, 10), entryOffset + 0x0A);
    }
  }

  // Set metadata byte at offset 0xFFF
  data[0xFFF] = 0x10;

  return data;
}

/**
 * Parse Encryption Keys from metadata 0x10 block
 * Entry structure: 44 bytes (0x2C) starting at offset 0x300
 * Max entries: 8
 * Entry Calculation: entry_base = 0x300 + (entry_num - 1) * 0x2C
 */
export function parseEncryptionKeys(data: Uint8Array): EncryptionKey[] {
  const initialOffset = 0x300;
  const entrySize = 0x2C; // 44 bytes per entry
  const maxEntries = 8;
  const requiredLength = initialOffset + (maxEntries * entrySize);

  if (data.length < requiredLength) {
    throw new Error(`Encryption Keys data must be at least ${requiredLength} bytes (0x${requiredLength.toString(16)}) for 8 entries`);
  }

  const keys: EncryptionKey[] = [];

  for (let i = 0; i < maxEntries; i++) {
    const entryOffset = initialOffset + (i * entrySize); // Entry 1 → 0x300, Entry 2 → 0x32C, etc.
    if (entryOffset + entrySize > data.length) break;

    // Check if entry is empty (all 0x00 or 0xFF)
    const entryData = data.slice(entryOffset, entryOffset + entrySize);
    if (entryData.every(b => b === 0x00 || b === 0xFF)) {
      // Create empty entry
      keys.push({
        entryNumber: i + 1, // 1-based for UI
        id: 0,
        name: '',
        encryptionType: 0,
        key: '',
      });
      continue;
    }

    // ID (1 byte at +0x00, 0x01-0x08)
    const entryId = data[entryOffset + 0x00] & 0xFF;

    // Name (10 bytes at +0x01-0x0A, ASCII string)
    const nameBytes = data.slice(entryOffset + 0x01, entryOffset + 0x0B);
    const nullIndex = nameBytes.indexOf(0);
    const name = new TextDecoder('ascii', { fatal: false })
      .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : nameBytes.length))
      .replace(/\x00/g, '')
      .trim();

    // Encryption Type (1 byte at +0x0B, 0-4)
    const encryptionType = data[entryOffset + 0x0B] & 0xFF;

    // Key (32 bytes at +0x0C-0x2B, 64 hex chars)
    const keyBytes = data.slice(entryOffset + 0x0C, entryOffset + 0x2C); // 32 bytes total
    
    // Convert bytes to hex string, drop trailing zeros
    let key = Array.from(keyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    
    // Remove trailing zeros
    key = key.replace(/0+$/, '');

    keys.push({
      entryNumber: i + 1, // 1-based for UI
      id: entryId,
      name,
      encryptionType,
      key,
    });
  }

  return keys;
}

/**
 * Encode Encryption Keys to metadata 0x10 block format
 * Entry structure: 44 bytes (0x2C) starting at offset 0x300
 * Entry Calculation: entry_base = 0x300 + (entry_num - 1) * 0x2C
 */
export function encodeEncryptionKey(key: EncryptionKey, data: Uint8Array): void {
  const initialOffset = 0x300;
  const entrySize = 0x2C; // 44 bytes per entry
  const entryNumber = key.entryNumber; // 1-based
  const entryOffset = initialOffset + ((entryNumber - 1) * entrySize);

  if (entryOffset + entrySize > data.length) {
    throw new Error(`Encryption key entry ${entryNumber} offset ${entryOffset} (0x${entryOffset.toString(16)}) exceeds data length`);
  }

  // ID (1 byte at +0x00, 0x01-0x08)
  data[entryOffset + 0x00] = Math.max(0x01, Math.min(0x08, key.id || entryNumber)) & 0xFF;

  // Name (10 bytes at +0x01-0x0A, ASCII string)
  const nameBytes = new Uint8Array(10);
  nameBytes.fill(0);
  if (key.name) {
    const encoded = new TextEncoder().encode(key.name.slice(0, 10));
    nameBytes.set(encoded, 0);
  }
  data.set(nameBytes, entryOffset + 0x01);

  // Encryption Type (1 byte at +0x0B, 0-4: 0=None, 1=Custom, 2=ARC4, 3=AES128, 4=AES256)
  data[entryOffset + 0x0B] = Math.max(0, Math.min(4, key.encryptionType ?? 0)) & 0xFF;

  // Key (32 bytes at +0x0C-0x2B, 64 hex chars)
  const keyBytes = new Uint8Array(32);
  keyBytes.fill(0);
  if (key.key) {
    // Convert hex string to bytes (pad with zeros if needed)
    const hexString = key.key.replace(/[^0-9A-Fa-f]/g, '').slice(0, 64); // Max 64 hex chars = 32 bytes
    for (let i = 0; i < hexString.length && i < 64; i += 2) {
      const hexByte = hexString.slice(i, i + 2);
      if (hexByte.length === 2) {
        keyBytes[i / 2] = parseInt(hexByte, 16);
      }
    }
  }
  data.set(keyBytes, entryOffset + 0x0C);
}

/**
 * Parse Analog Emergency Systems from metadata 0x10 block
 */
export function parseAnalogEmergencies(data: Uint8Array): AnalogEmergency[] {
  if (data.length < 0x2D5) {
    throw new Error('Analog Emergency data must be at least 725 bytes (0x2D5)');
  }

  const systems: AnalogEmergency[] = [];
  const entryBaseOffset = 0xAC; // Entry base offset
  const entrySize = 36; // 36 bytes per entry
  const maxEntries = Math.floor((data.length - entryBaseOffset) / entrySize);

  // NOTE: Structure parsing is experimental - data may be encrypted or structure may differ from spec
  for (let i = 0; i < maxEntries; i++) {
    const entryOffset = entryBaseOffset + (i * entrySize);
    if (entryOffset + entrySize > data.length) break;

    // Check if entry is empty
    const entryData = data.slice(entryOffset, entryOffset + entrySize);
    if (entryData.every(b => b === 0 || b === 0xFF)) {
      continue;
    }

    // Name (17 bytes, null-terminated)
    // Try to decode name, but be defensive as data may be encrypted
    const nameBytes = data.slice(entryOffset, entryOffset + 17);
    const nullIndex = nameBytes.indexOf(0);
    let name = '';
    
    if (nullIndex >= 0) {
      // Try ASCII decoding
      const decoded = new TextDecoder('ascii', { fatal: false })
        .decode(nameBytes.slice(0, nullIndex))
        .replace(/\x00/g, '')
        .trim();
      
      // Only use if it looks like readable text (printable ASCII)
      if (decoded.length > 0 && /^[\x20-\x7E]+$/.test(decoded)) {
        name = decoded;
      }
    }
    
    // If name couldn't be decoded, it might be encrypted or binary
    if (name.length === 0) {
      name = `[encrypted/binary-${i}]`;
    }

    // Padding (1 byte at offset +0x11)
    // Alarm Type (1 byte at offset +0x12, values 0-4)
    const alarmType = data[entryOffset + 0x12];

    // Alarm Mode (1 byte at offset +0x13, values 0-1)
    const alarmMode = data[entryOffset + 0x13];

    // Signalling (1 byte at offset +0x14, values 0-3)
    const signalling = data[entryOffset + 0x14];

    // Revert Channel (2 bytes at offset +0x15, little-endian, stored as value - 1)
    const revertChannelRaw = data[entryOffset + 0x15] | (data[entryOffset + 0x16] << 8);
    const revertChannel = revertChannelRaw + 1; // Add 1 to get actual value

    // Squelch Mode (1 byte at offset +0x17, stored as value + 1)
    const squelchModeRaw = data[entryOffset + 0x17];
    const squelchMode = squelchModeRaw - 1; // Subtract 1 to get actual value

    // ID Type (1 byte at offset +0x18, stored as value + 1)
    const idTypeRaw = data[entryOffset + 0x18];
    const idType = idTypeRaw - 1; // Subtract 1 to get actual value

    // Flags (1 byte at offset +0x19)
    const flags = data[entryOffset + 0x19];

    // Frequency/ID (2 bytes at offset +0x1A, little-endian)
    const frequencyId = data[entryOffset + 0x1A] | (data[entryOffset + 0x1B] << 8);

    // Flags (1 byte at offset +0x1B, bit 0: enabled/disabled)
    // Wait, that's the same offset as frequencyId high byte...
    // Let me check - frequencyId is at +0x1A-0x1B, so flags should be at +0x1C
    const enabledFlag = data[entryOffset + 0x1C];
    const enabled = (enabledFlag & 0x01) !== 0;

    // Secondary structure (20 bytes at offset -0x14 + entry*0x14)
    const secondaryOffset = -0x14 + (i * 0x14);
    let secondaryData: Uint8Array | undefined;
    if (secondaryOffset >= 0 && secondaryOffset + 20 <= data.length) {
      secondaryData = data.slice(secondaryOffset, secondaryOffset + 20);
    }

    // Tertiary structure (44 bytes at offset 0x2D5 + entry*0x2C)
    const tertiaryOffset = 0x2D5 + (i * 0x2C);
    let tertiaryData: Uint8Array | undefined;
    if (tertiaryOffset >= 0 && tertiaryOffset + 44 <= data.length) {
      tertiaryData = data.slice(tertiaryOffset, tertiaryOffset + 44);
    }

    systems.push({
      index: i,
      name,
      alarmType,
      alarmMode,
      signalling,
      revertChannel,
      squelchMode,
      idType,
      flags,
      frequencyId,
      enabled,
      secondaryData,
      tertiaryData,
    });
  }

  return systems;
}

/**
 * Encode Analog Emergency Systems to metadata 0x10 block format
 */
export function encodeAnalogEmergency(system: AnalogEmergency, index: number, data: Uint8Array): void {
  const entryBaseOffset = 0xAC;
  const entryOffset = entryBaseOffset + (index * 36);

  if (entryOffset + 36 > data.length) {
    throw new Error('Entry offset exceeds block size');
  }

  // Name (17 bytes, null-terminated)
  const nameBytes = new Uint8Array(17);
  const nameEncoded = new TextEncoder().encode(system.name.substring(0, 16));
  nameBytes.set(nameEncoded, 0);
  nameBytes[nameEncoded.length] = 0; // Null terminator
  data.set(nameBytes, entryOffset);

  // Padding (1 byte)
  data[entryOffset + 0x11] = 0x00;

  // Alarm Type (1 byte)
  data[entryOffset + 0x12] = system.alarmType;

  // Alarm Mode (1 byte)
  data[entryOffset + 0x13] = system.alarmMode;

  // Signalling (1 byte)
  data[entryOffset + 0x14] = system.signalling;

  // Revert Channel (2 bytes, little-endian, stored as value - 1)
  const revertChannelValue = Math.max(0, system.revertChannel - 1);
  data[entryOffset + 0x15] = revertChannelValue & 0xFF;
  data[entryOffset + 0x16] = (revertChannelValue >> 8) & 0xFF;

  // Squelch Mode (1 byte, stored as value + 1)
  data[entryOffset + 0x17] = system.squelchMode + 1;

  // ID Type (1 byte, stored as value + 1)
  data[entryOffset + 0x18] = system.idType + 1;

  // Flags (1 byte)
  data[entryOffset + 0x19] = system.flags;

  // Frequency/ID (2 bytes, little-endian)
  data[entryOffset + 0x1A] = system.frequencyId & 0xFF;
  data[entryOffset + 0x1B] = (system.frequencyId >> 8) & 0xFF;

  // Flags (1 byte, bit 0: enabled/disabled)
  data[entryOffset + 0x1C] = system.enabled ? 0x01 : 0x00;

  // Secondary structure (if provided)
  if (system.secondaryData && system.secondaryData.length === 20) {
    const secondaryOffset = -0x14 + (index * 0x14);
    if (secondaryOffset >= 0 && secondaryOffset + 20 <= data.length) {
      data.set(system.secondaryData, secondaryOffset);
    }
  }

  // Tertiary structure (if provided)
  if (system.tertiaryData && system.tertiaryData.length === 44) {
    const tertiaryOffset = 0x2D5 + (index * 0x2C);
    if (tertiaryOffset >= 0 && tertiaryOffset + 44 <= data.length) {
      data.set(system.tertiaryData, tertiaryOffset);
    }
  }
}

/**
 * Encode all Analog Emergency Systems to metadata 0x10 block format
 */
export function encodeAnalogEmergencies(systems: AnalogEmergency[]): Uint8Array {
  const data = new Uint8Array(0x1000); // 4KB block
  data.fill(0xFF);

  for (let i = 0; i < systems.length; i++) {
    encodeAnalogEmergency(systems[i], i, data);
  }

  // Set metadata byte at offset 0xFFF
  data[0xFFF] = 0x10;

  return data;
}

/**
 * Parse DMR Radio IDs from radio ID block data
 * 
 * DMR Radio ID structure (from spec):
 * - Count field: Offset 0 (4 bytes, DWORD, little-endian)
 * - Entry size: 16 bytes per entry (0x10)
 * - Entry base: Offset 0x00 (entries start at buffer base)
 * - Max entries: 250 entries per spec
 * 
 * Entry calculation: buffer + entry_num * 0x10
 * 
 * Entry structure (16 bytes):
 * - Offset +0x00: DMR Radio ID (3 bytes, BCD or binary)
 * - Offset +0x03: Name (12 bytes, null-terminated)
 * 
 * ID encoding: 3 bytes displayed as hex "XX XX XX" (e.g., "01 23 45" for ID 0x012345)
 */
export function parseDMRRadioIDs(
  data: Uint8Array,
  onRawIDParsed?: (idIndex: number, rawData: Uint8Array, _name: string) => void
): DMRRadioID[] {
  const radioIds: DMRRadioID[] = [];

  // Read count field at offset 0 (1 byte, max 250)
  const idCount = data.length >= 1 ? data[0] : 0;
  const maxIds = Math.min(idCount, LIMITS.DMR_RADIO_IDS_MAX);

  // According to spec: "Entry Calculation: buffer + entry_num * 0x10"
  // The count is stored at offset 0 (4 bytes), which is within entry 0 (0x00-0x0F).
  // So entry 0 (offset 0x00-0x0F) contains the count in its first 4 bytes.
  // Actual data entries likely start at entry 1 (offset 0x10).
  // However, the spec says "Entry Base Offset: 0x00", so let's try both:
  // 1. Entries start at 0x00, entry 0 contains count (skip it)
  // 2. Entries start at 0x10, entry 0 is reserved for count
  
  // Try: entries start at 0x10 (entry 1), entry 0 is reserved for count
  const entryStartOffset = BLOCK_SIZE.DMR_RADIO_ID; // Start at 0x10 (entry 1)

  // Parse each entry
  for (let entryNum = 0; entryNum < maxIds; entryNum++) {
    const entryOffset = entryStartOffset + (entryNum * BLOCK_SIZE.DMR_RADIO_ID);
    
    if (entryOffset + BLOCK_SIZE.DMR_RADIO_ID > data.length) {
      break;
    }

    const entryData = data.slice(entryOffset, entryOffset + BLOCK_SIZE.DMR_RADIO_ID);

    // Check if entry is empty (all 0xFF or all 0x00)
    const isAllEmpty = entryData.every(b => b === 0xFF || b === 0x00);
    if (isAllEmpty) {
      continue;
    }

    // Read DMR Radio ID (3 bytes at offset +0x00 within entry)
    // Stored as little-endian 24-bit number
    const idBytes = entryData.slice(0, 3);
    // Parse as little-endian: byte0 + (byte1 << 8) + (byte2 << 16)
    const dmrIdValue = idBytes[0] | (idBytes[1] << 8) | (idBytes[2] << 16);

    // Read name (12 bytes at offset +0x03, null-terminated)
    const nameBytes = entryData.slice(3, 15);
    const nullIndex = nameBytes.indexOf(0);
    const name = new TextDecoder('ascii', { fatal: false })
      .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : 12))
      .replace(/\x00/g, '')
      .replace(/\xFF/g, '')
      .trim();

    // Skip entries with empty names and zero IDs
    if (name.length === 0 && dmrIdValue === 0) {
      continue;
    }

    const radioId: DMRRadioID = {
      index: entryNum,
      dmrId: dmrIdValue.toString(), // Display as decimal number
      dmrIdValue: dmrIdValue,
      dmrIdBytes: new Uint8Array(idBytes),
      name: name || `ID ${dmrIdValue}`,
    };

    radioIds.push(radioId);

    // Call callback to store raw data
    onRawIDParsed?.(entryNum, entryData, name);
  }

  return radioIds;
}

/**
 * Encode a DMR Radio ID into binary format
 * 
 * @param radioId - DMR Radio ID to encode
 * @returns 16-byte encoded ID entry
 */
export function encodeDMRRadioID(radioId: DMRRadioID): Uint8Array {
  const data = new Uint8Array(BLOCK_SIZE.DMR_RADIO_ID);
  
  // Initialize to 0xFF (empty/padding)
  data.fill(0xFF);

  // DMR Radio ID (3 bytes at offset +0x00, stored as little-endian)
  let dmrIdValue: number;
  if (radioId.dmrIdValue !== undefined) {
    dmrIdValue = radioId.dmrIdValue;
  } else if (radioId.dmrIdBytes && radioId.dmrIdBytes.length === 3) {
    // Reconstruct from bytes
    dmrIdValue = radioId.dmrIdBytes[0] | (radioId.dmrIdBytes[1] << 8) | (radioId.dmrIdBytes[2] << 16);
  } else {
    // Parse decimal string
    dmrIdValue = parseInt(radioId.dmrId, 10) || 0;
  }
  
  // Encode as little-endian 24-bit
  data[0] = dmrIdValue & 0xFF;
  data[1] = (dmrIdValue >> 8) & 0xFF;
  data[2] = (dmrIdValue >> 16) & 0xFF;

  // Name (12 bytes at offset +0x03, null-terminated)
  const nameBytes = new TextEncoder().encode(radioId.name);
  const maxNameLength = 12;
  const nameLength = Math.min(nameBytes.length, maxNameLength - 1); // -1 for null terminator
  
  for (let i = 0; i < nameLength; i++) {
    data[3 + i] = nameBytes[i];
  }
  
  // Null terminator
  if (nameLength < maxNameLength) {
    data[3 + nameLength] = 0x00;
  }

  return data;
}

/**
 * Parse frequency adjustment/calibration data from calibration block
 * 
 * Calibration structure (from spec):
 * - Frequency array 1: indexed by param * 4, relative offset -4
 * - Frequency array 2: indexed by param * 4, offset 0x3C (60)
 * - Value array 1: indexed by param * 2, offset 0x7E (126)
 * - Value array 2: indexed by param * 2, offset 0x9E (158)
 * - Value array 3: indexed by param * 2, offset 0xB0 (176)
 * 
 * Frequencies are 4-byte BCD values, formatted as "XXX.XXXXXX" MHz
 * Values are 2-byte little-endian integers
 */
export function parseCalibration(data: Uint8Array): CalibrationData {
  const frequencyArray1 = new Map<number, number>();
  const frequencyArray2 = new Map<number, number>();
  const valueArray1 = new Map<number, number>();
  const valueArray2 = new Map<number, number>();
  const valueArray3 = new Map<number, number>();

  // Frequency array 1: relative offset -4, indexed by param * 4
  // This means for param 0, offset is -4 (which doesn't make sense in a buffer)
  // Likely means the array starts at offset 0, and param 0 is at offset 0
  // Let's interpret as: base offset 0, indexed by param * 4
  // Store as raw 32-bit little-endian unsigned integer (not decoded to MHz)
  for (let param = 1; param <= 77; param++) { // Parameters are 1-indexed (1-77)
    const paramIndex = param - 1; // Convert to 0-indexed for offset calculation
    const offset = paramIndex * 4;
    if (offset + 4 <= data.length) {
      // Read as 32-bit little-endian unsigned integer (0 to 4,294,967,295)
      const value = (data[offset] | 
                    (data[offset + 1] << 8) | 
                    (data[offset + 2] << 16) | 
                    (data[offset + 3] << 24)) >>> 0; // >>> 0 ensures unsigned
      if (value !== 0 && value !== 0xFFFFFFFF) { // Skip empty/zero values
        frequencyArray1.set(param, value);
      }
    }
  }

  // Frequency array 2: offset 0x3C (60), indexed by param * 4
  const baseOffset2 = 0x3C;
  for (let param = 1; param <= 77; param++) {
    const paramIndex = param - 1; // Convert to 0-indexed for offset calculation
    const offset = baseOffset2 + (paramIndex * 4);
    if (offset + 4 <= data.length) {
      // Read as 32-bit little-endian unsigned integer (0 to 4,294,967,295)
      const value = (data[offset] | 
                    (data[offset + 1] << 8) | 
                    (data[offset + 2] << 16) | 
                    (data[offset + 3] << 24)) >>> 0; // >>> 0 ensures unsigned
      if (value !== 0 && value !== 0xFFFFFFFF) { // Skip empty/zero values
        frequencyArray2.set(param, value);
      }
    }
  }

  // Value array 1: offset 0x7E (126), indexed by param * 2
  // Parameters are 1-indexed (1-77)
  const baseOffset3 = 0x7E;
  for (let param = 1; param <= 77; param++) {
    const paramIndex = param - 1; // Convert to 0-indexed for offset calculation
    const offset = baseOffset3 + (paramIndex * 2);
    if (offset + 2 <= data.length) {
      // Read as 16-bit little-endian unsigned integer (0 to 65,535)
      const value = (data[offset] | (data[offset + 1] << 8)) & 0xFFFF; // & 0xFFFF ensures unsigned 16-bit
      if (value !== 0 && value !== 0xFFFF) { // Skip empty/zero values
        valueArray1.set(param, value);
      }
    }
  }

  // Value array 2: offset 0x9E (158), indexed by param * 2
  const baseOffset4 = 0x9E;
  for (let param = 1; param <= 77; param++) {
    const paramIndex = param - 1; // Convert to 0-indexed for offset calculation
    const offset = baseOffset4 + (paramIndex * 2);
    if (offset + 2 <= data.length) {
      // Read as 16-bit little-endian unsigned integer (0 to 65,535)
      const value = (data[offset] | (data[offset + 1] << 8)) & 0xFFFF; // & 0xFFFF ensures unsigned 16-bit
      if (value !== 0 && value !== 0xFFFF) {
        valueArray2.set(param, value);
      }
    }
  }

  // Value array 3: offset 0xB0 (176), indexed by param * 2
  const baseOffset5 = 0xB0;
  for (let param = 1; param <= 77; param++) {
    const paramIndex = param - 1; // Convert to 0-indexed for offset calculation
    const offset = baseOffset5 + (paramIndex * 2);
    if (offset + 2 <= data.length) {
      // Read as 16-bit little-endian unsigned integer (0 to 65,535)
      const value = (data[offset] | (data[offset + 1] << 8)) & 0xFFFF; // & 0xFFFF ensures unsigned 16-bit
      if (value !== 0 && value !== 0xFFFF) {
        valueArray3.set(param, value);
      }
    }
  }

  return {
    frequencyArray1,
    frequencyArray2,
    valueArray1,
    valueArray2,
    valueArray3,
  };
}

/**
 * Parse DMR RX Groups from metadata 0x0F block data
 * 
 * DMR RX Group structure (from spec):
 * - Entry size: 109 bytes per entry (0x6D)
 * - Entry calculation: buffer + entry_num * 0x6D
 * - Max entries: ~37 entries (floor(4096 / 109) = 37)
 * 
 * Entry structure (109 bytes):
 * - Offset +0x00: Bitmask (4 bytes, little-endian, 32-bit)
 * - Offset +0x04: Status flag (1 byte)
 * - Offset +0x05: Reserved (10 bytes)
 * - Offset +0x0F: Entry flag (1 byte)
 * 
 * Additional fields stored BEFORE entry base:
 * - entry_base - 0x5D: Validation flag (1 byte)
 * - entry_base - 0x5C: Group name (11 bytes, null-terminated)
 * - entry_base - 0x54: Contact ID slots (3 bytes per slot, variable number)
 * 
 * Note: The "before entry base" fields suggest a header area. For now, we'll parse
 * the main entry structure and attempt to find the name/ID fields in adjacent areas.
 */
export function parseRXGroups(
  data: Uint8Array,
  onRawGroupParsed?: (groupIndex: number, rawData: Uint8Array, name: string) => void
): RXGroup[] {
  const groups: RXGroup[] = [];

  if (data.length < 0x11) {
    return groups; // Need at least header
  }

  // Read header (17 bytes at 0x00-0x10)
  // Bitmask (4 bytes, little-endian) at 0x00-0x03
  const bitmask = (data[0] | 
                   (data[1] << 8) | 
                   (data[2] << 16) | 
                   (data[3] << 24)) >>> 0; // Unsigned 32-bit
  
  // Flag (1 byte) at 0x10, should be 0x01
  const headerFlag = data[0x10];

  // Count active groups from bitmask (bits 0-N set = N+1 groups exist)
  let activeGroupCount = 0;
  for (let i = 0; i < 32; i++) {
    if ((bitmask & (1 << i)) !== 0) {
      activeGroupCount = i + 1;
    }
  }

  // Parse entries starting at 0x11 (each entry is 109 bytes)
  const ENTRY_START = 0x11;
  const ENTRY_SIZE = 109;
  
  for (let entryNum = 0; entryNum < activeGroupCount && entryNum < LIMITS.RX_GROUPS_MAX; entryNum++) {
    const entryOffset = ENTRY_START + (entryNum * ENTRY_SIZE);
    
    if (entryOffset + ENTRY_SIZE > data.length) {
      break;
    }

    const entryData = data.slice(entryOffset, entryOffset + ENTRY_SIZE);

    // Check if entry is empty (all 0xFF)
    const isAllEmpty = entryData.every(b => b === 0xFF);
    if (isAllEmpty) {
      continue;
    }

    // Read name (11 bytes at 0x00-0x0A within entry)
    const nameBytes = entryData.slice(0, 11);
    const nullIndex = nameBytes.indexOf(0);
    const endIndex = nullIndex >= 0 ? nullIndex : 11;
    const name = new TextDecoder('ascii', { fatal: false })
      .decode(nameBytes.slice(0, endIndex))
      .replace(/\x00/g, '')
      .trim();

    // Read Talk Group indices (96 bytes at 0x0B-0x6A, up to 32 × 3-byte little-endian)
    const talkGroupIndices: number[] = [];
    const CONTACT_IDS_START = 0x0B;
    const CONTACT_ID_SIZE = 3;
    const MAX_CONTACTS = 32;

    for (let slot = 0; slot < MAX_CONTACTS; slot++) {
      const idOffset = CONTACT_IDS_START + (slot * CONTACT_ID_SIZE);
      if (idOffset + CONTACT_ID_SIZE > entryData.length) {
        break;
      }

      // Read 3-byte little-endian DMR ID (contactNumber)
      const dmrId = entryData[idOffset] | 
                   (entryData[idOffset + 1] << 8) | 
                   (entryData[idOffset + 2] << 16);
      
      if (dmrId === 0 || dmrId === 0xFFFFFF) {
        // Empty slot, stop reading
        break;
      }
      
      // Store DMR ID (contactNumber) - radio format
      talkGroupIndices.push(dmrId);
    }

    // Skip entries with empty names
    if (name.length === 0 && talkGroupIndices.length === 0) {
      continue;
    }

    const group: RXGroup = {
      index: entryNum,
      name: name || `RX Group ${entryNum + 1}`,
      bitmask: 0, // Individual entry doesn't store bitmask, it's in header
      statusFlag: 0,
      entryFlag: headerFlag, // Use header flag
      validationFlag: 0,
      talkGroupIndices,
    };

    groups.push(group);

    // Call callback to store raw data
    onRawGroupParsed?.(entryNum, entryData, name);
  }

  return groups;
}

/**
 * Encode a single DMR RX Group entry into binary format
 * 
 * @param group - DMR RX Group to encode
 * @returns 109-byte encoded group entry
 */
export function encodeRXGroup(group: RXGroup): Uint8Array {
  const data = new Uint8Array(BLOCK_SIZE.RX_GROUP);
  
  // Initialize to 0x00 (padding for empty slots)
  data.fill(0x00);

  // Name (11 bytes at 0x00-0x0A, ASCII, null-terminated, 0x00 padded)
  const nameBytes = new TextEncoder().encode(group.name.slice(0, 10));
  for (let i = 0; i < 11; i++) {
    if (i < nameBytes.length) {
      data[i] = nameBytes[i];
    } else {
      data[i] = 0x00; // Null-terminate and pad with 0x00
    }
  }

  // Talk Group indices (96 bytes at 0x0B-0x6A, up to 32 × 3-byte little-endian)
  const CONTACT_IDS_START = 0x0B;
  const CONTACT_ID_SIZE = 3;
  const MAX_CONTACTS = 32;

  for (let slot = 0; slot < MAX_CONTACTS && slot < group.talkGroupIndices.length; slot++) {
    const idOffset = CONTACT_IDS_START + (slot * CONTACT_ID_SIZE);
    const dmrId = group.talkGroupIndices[slot]; // DMR ID (contactNumber)
    
    // Write 3-byte little-endian DMR ID
    data[idOffset] = dmrId & 0xFF;
    data[idOffset + 1] = (dmrId >> 8) & 0xFF;
    data[idOffset + 2] = (dmrId >> 16) & 0xFF;
  }
  // Empty contact slots after the last valid contact are already 0x00 from fill

  // Padding (2 bytes at 0x6B-0x6C) - 0x00 (already set from fill)
  // No need to set explicitly, already 0x00

  return data;
}

/**
 * Encode all DMR RX Groups into a 4KB block
 * 
 * @param groups - Array of RX Groups to encode
 * @param existingData - Optional existing block data to preserve
 * @returns 4KB encoded block
 */
export function encodeRXGroups(
  groups: RXGroup[],
  existingData?: Uint8Array
): Uint8Array {
  const BLOCK_SIZE_BYTES = 4096;
  const data = existingData ? new Uint8Array(existingData) : new Uint8Array(BLOCK_SIZE_BYTES);
  
  // Initialize to 0xFF if new block
  if (!existingData) {
    data.fill(0xFF);
  }

  // Header (17 bytes at 0x00-0x10)
  // Calculate bitmask: bits 0-N set = N+1 groups exist
  let bitmask = 0;
  const activeGroupCount = Math.min(groups.length, LIMITS.RX_GROUPS_MAX);
  for (let i = 0; i < activeGroupCount; i++) {
    bitmask |= (1 << i);
  }

  // Write bitmask (4 bytes, little-endian) at 0x00-0x03
  data[0] = bitmask & 0xFF;
  data[1] = (bitmask >> 8) & 0xFF;
  data[2] = (bitmask >> 16) & 0xFF;
  data[3] = (bitmask >> 24) & 0xFF;

  // Reserved (12 bytes at 0x04-0x0F) - fill with 0x00
  for (let i = 0x04; i < 0x10; i++) {
    data[i] = 0x00;
  }

  // Flag (1 byte at 0x10) - always 0x01
  data[0x10] = 0x01;

  // Entries start at 0x11, each 109 bytes
  const ENTRY_START = 0x11;
  const ENTRY_SIZE = 109;

  // Clear all entry slots to 0x00 first (for valid entries, empty slots will be 0x00)
  for (let i = 0; i < LIMITS.RX_GROUPS_MAX; i++) {
    const entryOffset = ENTRY_START + (i * ENTRY_SIZE);
    if (entryOffset + ENTRY_SIZE <= data.length) {
      data.fill(0x00, entryOffset, entryOffset + ENTRY_SIZE);
    }
  }

  // Write each group entry
  for (let i = 0; i < activeGroupCount; i++) {
    const group = groups[i];
    const entryOffset = ENTRY_START + (i * ENTRY_SIZE);
    
    if (entryOffset + ENTRY_SIZE > data.length) {
      break;
    }

    const entryData = encodeRXGroup(group);
    data.set(entryData, entryOffset);
  }

  // Fill unused entries at the END with 0xFF (only completely unused entries)
  for (let i = activeGroupCount; i < LIMITS.RX_GROUPS_MAX; i++) {
    const entryOffset = ENTRY_START + (i * ENTRY_SIZE);
    if (entryOffset + ENTRY_SIZE <= data.length) {
      data.fill(0xFF, entryOffset, entryOffset + ENTRY_SIZE);
    }
  }

  return data;
}

/**
 * Parse Talk Groups from metadata block 0x44
 * Fixed-size entries:
 * - Contact 1: 26 bytes total = 2-byte header (0x0000) + 24-byte structure
 * - Contact 2+: 24 bytes total (no header)
 * 
 * The 24-byte structure contains:
 * - Variable-length name (null-terminated)
 * - Remaining bytes: padding + 3-byte contact number + 1-byte call type + padding
 */
export function parseQuickContacts(
  data: Uint8Array,
  onRawContactParsed?: (contactIndex: number, rawData: Uint8Array, name: string) => void
): QuickContact[] {
  const contacts: QuickContact[] = [];
  let offset = 0;
  let contactIndex = 1; // 1-based index

  while (offset < data.length) {
    const entryStartOffset = offset;
    let hasHeader = false;

    // Check if this is Contact 1 with 1-byte header (0x00)
    if (contactIndex === 1 && offset + 1 <= data.length) {
      const header = data[offset];
      if (header === 0x00) {
        hasHeader = true;
        offset += 1; // Skip the 1-byte header
      }
    }

    // Read flag byte (0x00 = PC-created, 0x01 = radio-created)
    const flagByte = data[offset];
    offset++;

    // Name is fixed at 16 bytes, followed by null byte (17 bytes total)
    const nameStart = offset;
    const nameEnd = nameStart + 16; // Fixed 16-byte name field
    
    if (nameEnd + 1 > data.length) {
      break; // Not enough space for name + null
    }

    // Check if entry is empty (first byte of name is 0x00)
    if (data[nameStart] === 0x00) {
      // Empty/unused entry - skip it
      // Skip entire entry: 16 (name) + 1 (null) + 3 (contact) + 1 (call) + 2 (pad) = 23 bytes
      // Note: flag byte already consumed above, so offset is already after it
      offset = nameStart + 23;
      contactIndex++;
      continue;
    }

    // Extract name (16 bytes, null-padded or 0xFF-padded)
    // Find the actual length by looking for null byte or 0xFF padding
    let nameLength = 0;
    for (let i = 0; i < 16; i++) {
      const byte = data[nameStart + i];
      if (byte === 0x00 || byte === 0xFF) {
        break;
      }
      nameLength++;
    }
    
    const nameBytes = data.slice(nameStart, nameStart + nameLength);
    const name = new TextDecoder('ascii', { fatal: false })
      .decode(nameBytes)
      .trim();

    // The null terminator is at nameEnd (after 16-byte name field)
    // Structure: [null at nameEnd] [3 contact] [1 call] [2 pad]
    // Fixed fields: 1 (null) + 3 (contact) + 1 (call) + 2 (pad) = 7 bytes
    if (nameEnd + 7 > data.length) {
      break; // Not enough space for fixed fields
    }
    
    // Skip to contact number: just the null byte (1 byte from nameEnd)
    const contactNumberOffset = nameEnd + 1; // Contact number (3 bytes) - immediately after null
    const callTypeOffset = contactNumberOffset + 3; // Call type immediately after 3-byte contact number (no padding)
    
    if (callTypeOffset >= data.length) {
      break;
    }

    // Read contact number (3 bytes, little-endian)
    const contactNumber = data[contactNumberOffset] | 
                         (data[contactNumberOffset + 1] << 8) | 
                         (data[contactNumberOffset + 2] << 16);

    // Read call type (1 byte)
    const callType = data[callTypeOffset];

    // Entry ends after the 2 bytes of final padding
    // callTypeOffset is at the call type byte, so:
    // callTypeOffset + 1 = after call type, start of 2 bytes padding
    // callTypeOffset + 3 = after call type + 2 bytes padding = start of next entry
    const entryEnd = callTypeOffset + 3; // call type (1 byte) + 2 bytes padding = start of next entry
    offset = entryEnd;

    // Extract raw entry data for debugging
    const rawData = data.slice(entryStartOffset, offset);

    const contact: QuickContact = {
      index: contactIndex,
      offset: entryStartOffset,
      name: name,
      contactNumber: contactNumber,
      callType: callType,
      hasHeader: hasHeader,
      flag: flagByte,
      rawData: new Uint8Array(rawData),
    };

    contacts.push(contact);

    // Callback for raw data access
    if (onRawContactParsed) {
      onRawContactParsed(contactIndex, rawData, contact.name);
    }

    contactIndex++;
  }

  return contacts;
}

/**
 * Encode Talk Groups to binary format for metadata block 0x44
 * This is the reverse of parseQuickContacts()
 * 
 * @param contacts - Array of Talk Groups to encode
 * @returns Encoded data (4KB block)
 */
export function encodeQuickContacts(contacts: QuickContact[]): Uint8Array {
  const data = new Uint8Array(BLOCK_SIZE.STANDARD);
  data.fill(0x00); // Initialize entire block to 0x00

  // Set metadata byte at 0xFFF to 0x44 (metadata for Talk Groups block)
  data[OFFSET.METADATA_BYTE] = METADATA.METADATA_0x44;

  // Radio requires at least one contact - if none provided, create default "All" contact
  // This prevents the radio from crashing when the block is empty
  const contactsToEncode = contacts.length === 0 ? [{
    index: 1,
    offset: 0,
    name: 'All',
    contactNumber: 16777215, // All Call contact number
    callType: 0x05, // All Call (0x05)
    hasHeader: true,
    rawData: new Uint8Array(0),
  }] : contacts;
  
  if (contacts.length === 0) {
    log.warn('No contacts provided - creating default "All" contact to prevent radio crash', 'Structures');
  }

  let offset = 0;

  for (let i = 0; i < contactsToEncode.length; i++) {
    const contact = contactsToEncode[i];
    const isFirstContact = i === 0;

    // Contact 1 ALWAYS has 1-byte header (0x00) - this is critical for the radio to recognize the block
    if (isFirstContact) {
      if (offset + 1 > data.length) {
        log.warn(`Not enough space for contact ${contact.index} header, truncating`, 'Structures');
        break;
      }
      data[offset] = 0x00;
      offset += 1;
    }

    // Structure: [header?] [flag] [16 name] [1 null] [3 contact] [1 call] [2 pad]
    // Entry 1: 1 (header) + 1 (flag) + 16 (name) + 1 (null) + 3 (contact) + 1 (call) + 2 (pad) = 25 bytes
    // Entry 2+: 1 (flag) + 16 (name) + 1 (null) + 3 (contact) + 1 (call) + 2 (pad) = 24 bytes
    const requiredSpace = isFirstContact ? 25 : 24; // Entry 1 includes 1-byte header + flag
    
    if (offset + requiredSpace > data.length) {
      log.warn(`Not enough space for contact ${contact.index}, truncating at offset ${offset}`, 'Structures');
      break;
    }

    // Write flag byte (0x00 for PC-created contacts)
    // Note: Radio-created contacts may have 0x01, but we write 0x00
    data[offset] = 0x00;
    offset++;

    // Write name (16 bytes, null-padded)
    // Clean the name: remove any non-ASCII printable characters (including ÿ from old parsing)
    const cleanName = contact.name
      .split('')
      .filter(char => {
        const code = char.charCodeAt(0);
        return code >= 0x20 && code <= 0x7E; // Only ASCII printable characters
      })
      .join('')
      .substring(0, 16); // Limit to 16 bytes
    
    const nameBytes = new TextEncoder().encode(cleanName);
    for (let j = 0; j < 16; j++) {
      data[offset] = j < nameBytes.length ? nameBytes[j] : 0x00;
      offset++;
    }

    // Null terminator (after 16-byte name field)
    data[offset] = 0x00;
    offset++;

    // Write contact number (3 bytes, little-endian)
    // Example: 3023401 (0x002E2229) should be written as: 29 22 2E
    // Example: 1 (0x00000001) should be written as: 01 00 00
    const contactNumber = contact.contactNumber;
    data[offset] = (contactNumber & 0xFF);                    // Low byte (bits 0-7)
    data[offset + 1] = ((contactNumber >> 8) & 0xFF);         // Mid byte (bits 8-15)
    data[offset + 2] = ((contactNumber >> 16) & 0xFF);        // High byte (bits 16-23)
    offset += 3;

    // Write call type (1 byte) - immediately after contact number (no padding)
    data[offset] = contact.callType;
    offset++;

    // 2 bytes padding
    data[offset] = 0x00;
    data[offset + 1] = 0x00;
    offset += 2;
  }

  // Add sentinel entry after the last contact to mark the end
  // Sentinel: [1 flag (0x00)] [16 name (all 0x00)] [1 null] [3 contact (all 0x00)] [1 call (0x00)] [2 pad (all 0x00)]
  if (offset + 24 <= data.length) {
    // Flag byte
    data[offset] = 0x00;
    offset++;
    
    // 16-byte name field (all zeros)
    for (let j = 0; j < 16; j++) {
      data[offset] = 0x00;
      offset++;
    }
    
    // Null terminator
    data[offset] = 0x00;
    offset++;
    
    // 3 bytes contact number (all 0x00)
    for (let j = 0; j < 3; j++) {
      data[offset] = 0x00;
      offset++;
    }
    
    // 1 byte call type (0x00)
    data[offset] = 0x00;
    offset++;
    
    // 2 bytes padding
    data[offset] = 0x00;
    data[offset + 1] = 0x00;
    offset += 2;
  }

  // Fill all remaining bytes from after termination to 0xFFF with 0x00
  // (0xFFF is the metadata byte, which we already set to 0x44)
  const metadataOffset = OFFSET.METADATA_BYTE;
  for (let j = offset; j < metadataOffset; j++) {
    data[j] = 0x00;
  }

  // Ensure metadata byte at 0xFFF is set to 0x44
  data[metadataOffset] = METADATA.METADATA_0x44;

  return data;
}

/**
 * TX Contact Block Structure (Metadata blocks 0x42 and 0x43)
 * 
 * Each channel has a 2-byte TX Contact entry that maps the channel to a Talk Group.
 * This stores an index into the Talk Groups list (block 0x44).
 * 
 * Buffer Layout:
 * - Block 0x42: Channels 1-2048 (4KB block)
 * - Block 0x43: Channels 2049+ and VFOs
 * 
 * Per-Channel Entry (2 bytes):
 * Byte 0:
 *   - Bits 7-4: TG Index High (bits 11-8 of index)
 *   - Bits 3-1: Reserved
 *   - Bit 0: Digital Flag (1=Digital, 0=Analog/Mixed)
 * Byte 1:
 *   - Bits 7-0: TG Index Low (bits 7-0 of index)
 * 
 * Talk Group Index Formula: (byte0 >> 4) * 256 + byte1 = 12-bit index (0-4095)
 * This is an index into the Talk Groups list (0=None, 1+=index into Talk Groups)
 * The Talk Groups list in block 0x44 contains the full 24-bit DMR Talk Group IDs
 * 
 * Offset Formulas (block-relative, within 4KB block):
 * - Block 0x42: Channels 1-2047: (channel - 1) * 2
 * - Block 0x43: VFO A (4001): Fixed at 0x0FFA
 * - Block 0x43: VFO B (4002): Fixed at 0x0FFC
 * - Block 0x43: Channels 2048+: (channel & 0x7FF) * 2
 */

/**
 * Parse TX Contact entry for a single channel
 * @param byte0 - First byte of TX Contact entry
 * @param byte1 - Second byte of TX Contact entry
 * @returns Object with contactId (TG index) and isDigital flag
 */
export function parseTxContactEntry(byte0: number, byte1: number): { contactId: number; isDigital: boolean } {
  // Contact ID (TG index): (byte0 >> 4) * 256 + byte1 = 12-bit value
  const contactIdHigh = (byte0 >> 4) & 0x0F; // bits 11-8
  const contactIdLow = byte1 & 0xFF;          // bits 7-0
  const contactId = (contactIdHigh << 8) | contactIdLow;
  
  // Digital flag is bit 0 of byte0
  const isDigital = (byte0 & 0x01) !== 0;
  
  return { contactId, isDigital };
}

/**
 * Encode TX Contact entry for a single channel
 * @param contactId - Contact index (0-4095, 12-bit value)
 * @param isDigital - Whether channel is digital mode
 * @returns 2-byte array [byte0, byte1]
 */
export function encodeTxContactEntry(contactId: number, isDigital: boolean): [number, number] {
  // Clamp contactId to 12 bits (0-4095)
  const clampedId = Math.max(0, Math.min(4095, contactId));
  
  // Split into high (bits 11-8) and low (bits 7-0) parts
  const contactIdHigh = (clampedId >> 8) & 0x0F; // bits 11-8
  const contactIdLow = clampedId & 0xFF;         // bits 7-0
  
  // Byte 0: high nibble is contact ID high, bit 0 is digital flag
  const byte0 = (contactIdHigh << 4) | (isDigital ? 0x01 : 0x00);
  const byte1 = contactIdLow;
  
  return [byte0, byte1];
}

/**
 * Calculate the offset within TX Contact block for a given channel number
 * @param channelNumber - Channel number (1-4000) or VFO (4001, 4002)
 * @returns Object with blockType (0x42 or 0x43) and offset within that block
 */
export function getTxContactOffset(channelNumber: number): { blockMetadata: number; offset: number } {
  if (channelNumber === 4001) {
    // VFO A - fixed offset in block 0x43 (0x0FFA within the 4KB block)
    // Combined buffer offset would be 0x1FFA, but block 0x43 is only 4KB so we use 0x0FFA
    return { blockMetadata: 0x43, offset: 0x0FFA };
  }
  
  if (channelNumber === 4002) {
    // VFO B - fixed offset in block 0x43 (0x0FFC within the 4KB block)
    // Combined buffer offset would be 0x1FFC, but block 0x43 is only 4KB so we use 0x0FFC
    return { blockMetadata: 0x43, offset: 0x0FFC };
  }
  
  if (channelNumber >= 1 && channelNumber <= 2047) {
    // Channels 1-2047 in block 0x42
    const offset = (channelNumber - 1) * 2;
    return { blockMetadata: 0x42, offset };
  }
  
  if (channelNumber >= 2048) {
    // Channels 2048+ in block 0x43
    // Combined buffer offset would be 0x1000 + (channel & 0x7FF) * 2
    // Block-relative offset (within 4KB block): (channel & 0x7FF) * 2
    const offset = (channelNumber & 0x7FF) * 2;
    return { blockMetadata: 0x43, offset };
  }
  
  // Default fallback (shouldn't happen)
  return { blockMetadata: 0x42, offset: 0 };
}

/**
 * Parse TX Contact for a specific channel from the TX Contact blocks
 * @param channelNumber - Channel number (1-4000) or VFO (4001, 4002)
 * @param block42Data - Data from metadata block 0x42 (channels 1-2048)
 * @param block43Data - Data from metadata block 0x43 (channels 2049+ and VFOs)
 * @returns Object with contactId and isDigital, or null if not found
 */
export function parseTxContactForChannel(
  channelNumber: number,
  block42Data: Uint8Array | null,
  block43Data: Uint8Array | null
): { contactId: number; isDigital: boolean } | null {
  const { blockMetadata, offset } = getTxContactOffset(channelNumber);
  
  const blockData = blockMetadata === 0x42 ? block42Data : block43Data;
  
  if (!blockData || offset + 1 >= blockData.length) {
    return null;
  }
  
  const byte0 = blockData[offset];
  const byte1 = blockData[offset + 1];
  
  return parseTxContactEntry(byte0, byte1);
}

/**
 * Parse all TX Contact entries from the TX Contact blocks
 * @param block42Data - Data from metadata block 0x42
 * @param block43Data - Data from metadata block 0x43
 * @returns Map of channel number to TX Contact info
 */
export function parseAllTxContacts(
  block42Data: Uint8Array | null,
  block43Data: Uint8Array | null
): Map<number, { contactId: number; isDigital: boolean }> {
  const result = new Map<number, { contactId: number; isDigital: boolean }>();
  
  // Parse block 0x42 (channels 1-2047)
  if (block42Data) {
    for (let ch = 1; ch <= 2047; ch++) {
      const offset = (ch - 1) * 2;
      if (offset + 1 < block42Data.length) {
        const entry = parseTxContactEntry(block42Data[offset], block42Data[offset + 1]);
        result.set(ch, entry);
      }
    }
  }
  
  // Parse block 0x43 (channels 2048+)
  if (block43Data) {
    // Channels 2048-4000
    // Block-relative offset: (channel & 0x7FF) * 2
    for (let ch = 2048; ch <= 4000; ch++) {
      const offset = (ch & 0x7FF) * 2;
      if (offset + 1 < block43Data.length) {
        const entry = parseTxContactEntry(block43Data[offset], block43Data[offset + 1]);
        result.set(ch, entry);
      }
    }
    
    // VFO A (4001) - offset 0x0FFA within block 0x43
    if (0x0FFA + 1 < block43Data.length) {
      const entry = parseTxContactEntry(block43Data[0x0FFA], block43Data[0x0FFB]);
      result.set(4001, entry);
    }
    
    // VFO B (4002) - offset 0x0FFC within block 0x43
    if (0x0FFC + 1 < block43Data.length) {
      const entry = parseTxContactEntry(block43Data[0x0FFC], block43Data[0x0FFD]);
      result.set(4002, entry);
    }
  }
  
  return result;
}

/**
 * Encode TX Contact for a specific channel into the appropriate block
 * @param channelNumber - Channel number (1-4000) or VFO (4001, 4002)
 * @param contactId - Contact index (0-4095)
 * @param isDigital - Whether channel is digital mode
 * @param block42Data - Data for metadata block 0x42 (will be modified)
 * @param block43Data - Data for metadata block 0x43 (will be modified)
 */
export function encodeTxContactForChannel(
  channelNumber: number,
  contactId: number,
  isDigital: boolean,
  block42Data: Uint8Array,
  block43Data: Uint8Array
): void {
  const { blockMetadata, offset } = getTxContactOffset(channelNumber);
  const [byte0, byte1] = encodeTxContactEntry(contactId, isDigital);
  
  const blockData = blockMetadata === 0x42 ? block42Data : block43Data;
  
  if (offset + 1 < blockData.length) {
    blockData[offset] = byte0;
    blockData[offset + 1] = byte1;
  }
}