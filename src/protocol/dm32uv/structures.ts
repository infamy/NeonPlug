/**
 * DM-32UV Data Structure Parsing
 * Parses channel, zone, and contact structures from radio memory
 */

import type { Channel, Contact, Zone, ScanList, QuickTextMessage, DMRRadioID, CalibrationData, RXGroup } from '../../models';
import { decodeBCDFrequency, decodeCTCSSDCS, encodeBCDFrequency, encodeCTCSSDCS } from './encoding';
import { OFFSET, BLOCK_SIZE, LIMITS } from './constants';

/**
 * Calculate the byte offset for a channel's flag byte based on channel number
 * This is used for flags like Forbid TX that are stored at variable offsets
 * 
 * @param channelNumber - Channel number (1-indexed)
 * @returns The byte offset relative to the channel buffer start
 */
export function getChannelFlagByteOffset(channelNumber: number): number {
  if (channelNumber < 85) {
    // For channels 1-84: channel_num * 0x30 - 8 (8 bytes before channel entry)
    return (channelNumber * 0x30) - 8;
  } else {
    // For channels >= 85: ((channel_num % 0x55) * 0x30) + 0x18 + ((channel_num / 0x55) * 0x1000)
    const channelNumMod = channelNumber % 0x55;
    const channelNumDiv = Math.floor(channelNumber / 0x55);
    return (channelNumMod * 0x30) + 0x18 + (channelNumDiv * 0x1000);
  }
}

/**
 * Calculate the block offset for a channel's flag byte
 * 
 * @param channelNumber - Channel number (1-indexed)
 * @param channelOffsetInBlock - Offset of channel entry within block
 * @param blockIndex - Block index (0 for first block, 1 for second, etc.)
 * @returns The byte offset within the block, or undefined if out of bounds
 */
export function getChannelFlagByteBlockOffset(
  channelNumber: number,
  channelOffsetInBlock: number,
  blockIndex: number
): number | undefined {
  const isFirstBlock = blockIndex === 0;
  const blockStartAdjustment = isFirstBlock ? 0x10 : 0x00; // First block has 0x10 header
  
  let flagByteOffsetInBlock: number;
  if (channelNumber < 85) {
    // For channels 1-84: 8 bytes before channel entry
    flagByteOffsetInBlock = channelOffsetInBlock - 8;
  } else {
    // For channels >= 85: Calculate offset within current block
    const flagByteOffsetInBuffer = getChannelFlagByteOffset(channelNumber);
    const blockContribution = blockIndex * 0x1000;
    flagByteOffsetInBlock = flagByteOffsetInBuffer - blockContribution + blockStartAdjustment;
  }
  
  return flagByteOffsetInBlock;
}

/**
 * Read a flag byte for a channel from block data
 * 
 * @param channelNumber - Channel number (1-indexed)
 * @param blockData - Full block data (4096 bytes)
 * @param channelOffsetInBlock - Offset of channel entry within block
 * @param blockIndex - Block index (0 for first block, 1 for second, etc.)
 * @returns The flag byte value, or undefined if offset is out of bounds
 */
export function readChannelFlagByte(
  channelNumber: number,
  blockData: Uint8Array,
  channelOffsetInBlock: number,
  blockIndex: number
): number | undefined {
  const flagByteOffsetInBlock = getChannelFlagByteBlockOffset(channelNumber, channelOffsetInBlock, blockIndex);
  
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
 * @param channelNumber - Channel number (1-indexed)
 * @param blockData - Full block data (4096 bytes) - will be modified
 * @param channelOffsetInBlock - Offset of channel entry within block
 * @param blockIndex - Block index (0 for first block, 1 for second, etc.)
 * @param bitMask - Bit mask for the flag (e.g., 0x08 for bit 3)
 * @param value - Whether to set (true) or clear (false) the bit
 * @returns true if the flag was written, false if offset is out of bounds
 */
export function writeChannelFlagBit(
  channelNumber: number,
  blockData: Uint8Array,
  channelOffsetInBlock: number,
  blockIndex: number,
  bitMask: number,
  value: boolean
): boolean {
  const flagByteOffsetInBlock = getChannelFlagByteBlockOffset(channelNumber, channelOffsetInBlock, blockIndex);
  
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
 * @param blockData - Optional full block data (4096 bytes) to access bytes before channel entry for forbid TX
 * @param channelOffsetInBlock - Optional offset of channel entry within block (for forbid TX calculation)
 * @param blockIndex - Optional block index (0 for first block, 1 for second, etc.) for forbid TX calculation
 */
export function parseChannel(data: Uint8Array, channelNumber: number, blockData?: Uint8Array, channelOffsetInBlock?: number, blockIndex?: number): Channel {
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
  const rxFreq = decodeBCDFrequency(data.slice(0x10, 0x14));

  // TX Frequency (0x14-0x17, 4 bytes BCD)
  const txFreq = decodeBCDFrequency(data.slice(0x14, 0x18));

  // Mode flags (0x18)
  const modeFlags = data[0x18];
  const channelMode = (modeFlags >> 4) & 0x0F;
  const modeMap: Channel['mode'][] = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
  const mode = modeMap[channelMode] || 'Analog';

  // Forbid TX is stored at a variable offset depending on channel number
  // Use the reusable helper function to read the flag byte
  let forbidTx = false;
  if (blockData && channelOffsetInBlock !== undefined && blockIndex !== undefined) {
    const forbidTxByte = readChannelFlagByte(channelNumber, blockData, channelOffsetInBlock, blockIndex);
    if (forbidTxByte !== undefined) {
      forbidTx = (forbidTxByte & 0x08) !== 0;
    } else {
      // Fallback to reading from channel data if offset is out of bounds
      console.warn(`Forbid TX byte out of bounds for channel ${channelNumber} (block ${blockIndex}), using channel data byte 0x18`);
      forbidTx = (modeFlags & 0x08) !== 0;
    }
  } else {
    // Fallback: read from channel data byte 0x18 (may be incorrect for some channels)
    forbidTx = (modeFlags & 0x08) !== 0;
  }
  
  const busyLockValue = (modeFlags >> 1) & 0x03;
  const busyLock: Channel['busyLock'] = 
    busyLockValue === 0 ? 'Off' : 
    busyLockValue === 1 ? 'Carrier' : 'Repeater';
  const loneWorker = (modeFlags & 0x01) !== 0;

  // Debug logging for VECTOR channels to diagnose forbid TX issues
  if (name.toUpperCase().includes('VECTOR') || name.toUpperCase().includes('BCF') || name.toUpperCase().includes('CZBB')) {
    const bit3 = (modeFlags & 0x08) !== 0;
    const bit3Raw = (modeFlags >> 3) & 0x01;
    const rxEqualsTx = Math.abs(rxFreq - txFreq) < 0.0001;
    console.log(`[DEBUG] Channel ${channelNumber} "${name}": modeFlags=0x${modeFlags.toString(16).padStart(2, '0')} (binary: ${modeFlags.toString(2).padStart(8, '0')}), mode=${mode} (${channelMode}), forbidTx=${forbidTx}, bit3=${bit3}, bit3Raw=${bit3Raw}, busyLock=${busyLockValue}, loneWorker=${loneWorker}, RX=${rxFreq.toFixed(4)}, TX=${txFreq.toFixed(4)}, RX==TX=${rxEqualsTx}`);
  }

  // Scan & Bandwidth (0x19)
  // Bit 7: Bandwidth (0=12.5kHz/Narrow, 1=25kHz/Wide) - NOTE: Spec appears inverted!
  // Bit 6: Scan Add (0=Off, 1=On)
  // Bits 5-2: Scan List ID (0-15)
  // Bits 1-0: Reserved
  const scanBw = data[0x19];
  const bandwidth: Channel['bandwidth'] = (scanBw & 0x80) !== 0 ? '25kHz' : '12.5kHz';
  const scanAdd = (scanBw & 0x40) !== 0;
  const scanListId = (scanBw >> 2) & 0x0F;

  // Talkaround & APRS (0x1A)
  // Bit 7: Forbid Talkaround (0=Allow, 1=Forbid)
  // Bits 6-4: Unknown Setting (0-3, values ≥4 reset to 0)
  // Bit 3: Unknown
  // Bit 2: APRS Receive (0=Off, 1=On)
  // Bits 1-0: Reverse Frequency (0-2)
  const talkaroundAprs = data[0x1A];
  const forbidTalkaround = (talkaroundAprs & 0x80) !== 0;
  const unknown1A_6_4 = (talkaroundAprs >> 4) & 0x07;
  const unknown1A_3 = (talkaroundAprs & 0x08) !== 0;
  const aprsReceive = (talkaroundAprs & 0x04) !== 0;
  const reverseFreq = talkaroundAprs & 0x03;

  // Emergency (0x1B)
  const emergency = data[0x1B];
  const emergencyIndicator = (emergency & 0x80) !== 0;
  const emergencyAck = (emergency & 0x40) !== 0;
  const emergencySystemId = emergency & 0x1F;

  // Power & APRS (0x1C)
  // Bits 7-4: Power Level (0=Low, 1=Medium, 2=High, 3-15=Reserved/Invalid)
  // Bits 3-2: APRS Report Mode (0=Off, 1=Digital, 2=Analog, 3=Reserved)
  // Bits 1-0: Unknown
  const powerAprs = data[0x1C];
  const powerValue = (powerAprs >> 4) & 0x0F;
  const power: Channel['power'] = 
    powerValue === 0 ? 'Low' : 
    powerValue === 1 ? 'Medium' : 
    powerValue === 2 ? 'High' : 'Low'; // Default to Low for invalid values
  const aprsReportValue = (powerAprs >> 2) & 0x03;
  const aprsReportMode: Channel['aprsReportMode'] = 
    aprsReportValue === 0 ? 'Off' : 
    aprsReportValue === 1 ? 'Digital' : 
    aprsReportValue === 2 ? 'Analog' : 'Off'; // Default to Off for invalid values
  const unknown1C_1_0 = powerAprs & 0x03;

  // Analog features (0x1D)
  // Bit 7: VOX Function (0=Off, 1=On)
  // Bit 6: Scramble (0=Off, 1=On)
  // Bit 5: Compander (0=Off, 1=On)
  // Bit 4: Talkback (0=Off, 1=On)
  // Bits 3-0: Unknown Setting (0-15)
  const analogFeatures = data[0x1D];
  const voxFunction = (analogFeatures & 0x80) !== 0;
  const scramble = (analogFeatures & 0x40) !== 0;
  const compander = (analogFeatures & 0x20) !== 0;
  const talkback = (analogFeatures & 0x10) !== 0;
  const unknown1D_3_0 = analogFeatures & 0x0F;

  // Squelch (0x1E)
  const squelchLevel = data[0x1E];

  // PTT ID (0x1F)
  const pttIdSettings = data[0x1F];
  const pttIdDisplay = (pttIdSettings & 0x40) !== 0;
  const pttId = pttIdSettings & 0x3F;

  // Color Code (0x20)
  const colorCode = data[0x20] & 0x0F;

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
  // Bits 7-6: Unknown
  // Bit 5: Compander (duplicate) (0=Off, 1=On)
  // Bit 4: VOX-Related Flag (0=Off, 1=On)
  // Bits 3-0: Unknown Setting (0-15, possibly VOX or analog related)
  const additionalFlags = data[0x25];
  const unknown25_7_6 = (additionalFlags >> 6) & 0x03;
  const companderDup = (additionalFlags & 0x20) !== 0;
  const voxRelated = (additionalFlags & 0x10) !== 0;
  const unknown25_3_0 = additionalFlags & 0x0F;

  // RX Squelch & PTT ID (0x26)
  // Bit 7: PTT ID Display (0=Off, 1=On) - duplicate of 0x1F bit 6?
  // Bits 6-4: RX Squelch Mode (0=Carrier/CTC, 1=Optional, 2=CTC&Opt, 3=CTC|Opt)
  // Bits 3-1: Unknown (0-7)
  // Bit 0: Unknown
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
  // Bits 7-4: Step Frequency (0=2.5K, 1=5K, 2=6.25K, 3=10K, 4=12.5K, 5=25K, 6=50K, 7=100K, 8-15=Reserved)
  // Bits 3-0: Signaling Type (0=None, 1=DTMF, 2=Two Tone, 3=Five Tone, 4=MDC1200, 5-15=Reserved)
  const signaling = data[0x27];
  const stepFrequency = (signaling >> 4) & 0x0F;
  const signalingValue = signaling & 0x0F;
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

  // PTT ID Type (0x29)
  // Bits 7-4: PTT ID Type (0=Off, 1=BOT, 2=EOT, 3=Both, 4-15=Reserved)
  // Bits 3-2: Unknown Setting (0-3)
  // Bits 1-0: Unknown
  const pttIdTypeByte = data[0x29];
  const pttIdTypeValue = (pttIdTypeByte >> 4) & 0x0F;
  const pttIdTypeMap: Channel['pttIdType'][] = ['Off', 'BOT', 'EOT', 'Both'];
  const pttIdType = pttIdTypeMap[pttIdTypeValue] || 'Off';
  const unknown29_3_2 = (pttIdTypeByte >> 2) & 0x03;
  const unknown29_1_0 = pttIdTypeByte & 0x03;

  // Unknown Setting (0x2A)
  // 8-bit value (0-255), possibly DMR or signaling related
  const unknown2A = data[0x2A];

  // Contact ID (0x2B)
  // 0-249 (displayed as 1-250 in radio UI)
  const contactId = data[0x2B];

  // Reserved (0x2C-0x2F) - Padding/reserved bytes, likely unused
  // const reserved2C_2F = data.slice(0x2C, 0x30);

  return {
    number: channelNumber,
    name: name || `Channel ${channelNumber}`,
    rxFrequency: rxFreq,
    txFrequency: txFreq,
    mode,
    forbidTx,
    busyLock,
    loneWorker,
    bandwidth,
    scanAdd,
    scanListId,
    forbidTalkaround,
    aprsReceive,
    reverseFreq,
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
    unknown2A,
    contactId,
    unknown1A_6_4,
    unknown1A_3,
    unknown1C_1_0,
    unknown1D_3_0,
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
  if (channel.forbidTx) modeFlags |= 0x08;
  const busyLockValue = channel.busyLock === 'Off' ? 0 : channel.busyLock === 'Carrier' ? 1 : 2;
  modeFlags |= (busyLockValue << 1) & 0x06;
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
  talkaroundAprs |= channel.reverseFreq & 0x03; // Bits 1-0
  data[0x1A] = talkaroundAprs;

  // Emergency (0x1B)
  let emergency = 0;
  if (channel.emergencyIndicator) emergency |= 0x80; // Bit 7
  if (channel.emergencyAck) emergency |= 0x40; // Bit 6
  emergency |= channel.emergencySystemId & 0x1F; // Bits 4-0
  data[0x1B] = emergency;

  // Power & APRS (0x1C)
  const powerValue = channel.power === 'Low' ? 0 : channel.power === 'Medium' ? 1 : 2;
  const aprsReportValue = channel.aprsReportMode === 'Off' ? 0 : channel.aprsReportMode === 'Digital' ? 1 : 2;
  data[0x1C] = ((powerValue << 4) & 0xF0) | ((aprsReportValue << 2) & 0x0C) | (channel.unknown1C_1_0 & 0x03);

  // Analog features (0x1D)
  let analogFeatures = 0;
  if (channel.voxFunction) analogFeatures |= 0x80; // Bit 7
  if (channel.scramble) analogFeatures |= 0x40; // Bit 6
  if (channel.compander) analogFeatures |= 0x20; // Bit 5
  if (channel.talkback) analogFeatures |= 0x10; // Bit 4
  analogFeatures |= channel.unknown1D_3_0 & 0x0F; // Bits 3-0
  data[0x1D] = analogFeatures;

  // Squelch (0x1E)
  data[0x1E] = channel.squelchLevel & 0xFF;

  // PTT ID (0x1F)
  let pttIdSettings = channel.pttId & 0x3F; // Bits 5-0
  if (channel.pttIdDisplay) pttIdSettings |= 0x40; // Bit 6
  data[0x1F] = pttIdSettings;

  // Color Code (0x20)
  data[0x20] = channel.colorCode & 0x0F;

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

  // PTT ID Type (0x29)
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

  // Unknown Setting (0x2A)
  data[0x2A] = channel.unknown2A & 0xFF;

  // Contact ID (0x2B)
  data[0x2B] = channel.contactId & 0xFF;

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
      console.log(`Zone ${zoneNum} would be at offset ${offset}, but data length is only ${data.length}`);
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
        console.log(`Zone ${zoneNum} at offset ${offset} is completely empty, stopping zone parsing`);
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
      console.log(`Zone "${name}" (Num ${zoneNum}, offset ${offset}): Found ${channels.length} channels (byte 16 count: ${channelCount}):`, channels);
    }

    const zone = { name, channels };
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
  const nameBytes = new TextEncoder().encode(zone.name.slice(0, 11));
  data.set(nameBytes, 0);
  if (nameBytes.length < 11) {
    data[nameBytes.length] = 0; // Null terminator
  }
  
  // Padding (bytes 11-15, 5 bytes of 0xFF)
  // Already initialized to 0xFF
  
  // Channel count (byte 16)
  const channelCount = Math.min(zone.channels.length, 64); // Max 64 channels per zone
  data[16] = channelCount;
  
  // Channels (bytes 17-144, 16-bit little-endian)
  // Each channel is 2 bytes (little-endian)
  for (let i = 0; i < channelCount && i < 64; i++) {
    const chOffset = 17 + (i * 2);
    const chNum = zone.channels[i];
    
    // Write 16-bit little-endian (low byte first)
    data[chOffset] = chNum & 0xFF;
    data[chOffset + 1] = (chNum >> 8) & 0xFF;
  }
  
  // Remaining bytes (17 + channelCount*2 to 144) are already 0xFF (padding)
  
  return data;
}

/**
 * Parse scan lists from scan list block data
 * Structure discovered from debug analysis:
 * - Scan lists are NOT at fixed 92-byte boundaries starting at offset 16
 * - Names are at variable positions: 1, 58, 115, 172 (absolute offsets)
 * - After name, there's data, then channels start
 * - Channels are 16-bit LE, 4 bytes apart (2 bytes channel, 2 bytes padding)
 */
export function parseScanLists(
  data: Uint8Array,
  onRawScanListParsed?: (listNum: number, rawData: Uint8Array, name: string) => void
): ScanList[] {
  const scanLists: ScanList[] = [];

  // Find scan list names by searching for readable ASCII strings
  // We know the exact positions: 1, 58, 115, 172
  // But we'll search more carefully to avoid duplicates
  const foundLists: Array<{ namePos: number; name: string }> = [];
  const usedPositions = new Set<number>();
  
  // Search through the data for potential scan list names
  for (let i = 0; i < Math.min(data.length - 10, 500); i++) {
    // Skip padding bytes
    if (data[i] === 0x00 || data[i] === 0xFF || data[i] < 32 || data[i] >= 127) {
      continue;
    }
    
    // Skip if we've already used a position near this one (within 20 bytes)
    let tooClose = false;
    for (const usedPos of usedPositions) {
      if (Math.abs(i - usedPos) < 20) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    
    // Try to read a name starting here (max 16 bytes per spec)
    const nameBytes = data.slice(i, i + 16);
    const nullIndex = nameBytes.indexOf(0);
    if (nullIndex < 2) continue; // Need at least 2 chars
    
    const potentialName = new TextDecoder('ascii', { fatal: false })
      .decode(nameBytes.slice(0, nullIndex))
      .replace(/\x00/g, '')
      .trim();
    
    // Check if it looks like a scan list name
    // Should have letters/numbers, might contain "List", dots, spaces
    if (potentialName.length >= 2 && 
        /^[A-Za-z0-9\s\.\-]+$/.test(potentialName) &&
        (potentialName.includes('List') || 
         /^[A-Z]{2,}/.test(potentialName) || // Starts with uppercase letters
         /^[A-Z]/.test(potentialName))) {   // Starts with uppercase
      
      // Check if this is a duplicate of an existing name (exact match or substring)
      const isDuplicate = foundLists.some(l => {
        const existing = l.name;
        const newName = potentialName;
        // Check if one is a substring of the other (but not too short)
        return existing === newName || 
               (existing.length > 3 && newName.length > 3 && 
                (existing.includes(newName) || newName.includes(existing)));
      });
      
      if (!isDuplicate) {
        foundLists.push({ namePos: i, name: potentialName });
        usedPositions.add(i);
        console.log(`Found scan list name "${potentialName}" at offset ${i}`);
      }
    }
  }
  
  // Sort by position
  foundLists.sort((a, b) => a.namePos - b.namePos);
  
  // Parse each found scan list
  for (let listNum = 0; listNum < foundLists.length; listNum++) {
    const { namePos, name } = foundLists[listNum];
    
    // Find where channels start by searching for a SEQUENCE of valid channels after the name
    // Name is null-terminated, so find the end
    const nameEnd = namePos + name.length + 1; // +1 for null terminator
    let channelStart = -1;
    
    // Search for a sequence of at least 3 consecutive valid channels
    // This avoids false matches on single channel numbers that appear in metadata
    // Channels are 2 bytes apart, so we need to check every 2 bytes
    for (let i = nameEnd; i < Math.min(nameEnd + 100, data.length - 5); i++) {
      // Check for at least 3 consecutive valid channels (6 bytes total)
      const ch1 = data[i] | (data[i + 1] << 8);
      const ch2 = data[i + 2] | (data[i + 3] << 8);
      const ch3 = data[i + 4] | (data[i + 5] << 8);
      
      // All three must be valid channels
      if (ch1 > 0 && ch1 <= 4000 && ch2 > 0 && ch2 <= 4000 && ch3 > 0 && ch3 <= 4000) {
        // Verify this is a sequence - channels should be close together (within 20 of each other)
        // This ensures we're reading actual channel lists, not random valid numbers
        if (Math.abs(ch2 - ch1) <= 20 && Math.abs(ch3 - ch2) <= 20) {
          channelStart = i;
          break;
        }
      }
    }
    
    if (channelStart === -1) {
      console.warn(`Could not find channel start for scan list "${name}"`);
      continue;
    }
    
    // Read channels (2 bytes each, 16-bit LE, up to 16 channels)
    const channels: number[] = [];
    for (let i = 0; i < 16; i++) {
      const offset = channelStart + (i * 2); // 2 bytes per channel
      if (offset + 2 > data.length) break;
      
      const chNum = data[offset] | (data[offset + 1] << 8);
      if (chNum === 0) {
        break; // End of channel list
      }
      if (chNum > 0 && chNum <= 4000) {
        channels.push(chNum);
      } else {
        break; // Invalid channel number
      }
    }
    
    // Extract 92 bytes for raw data storage (starting from name or before if header exists)
    let listStart = namePos;
    if (namePos > 0 && data[namePos - 1] === 0x04) {
      listStart = namePos - 1; // Include 0x04 header
    }
    const listData = data.slice(listStart, Math.min(listStart + 92, data.length));

    // CTC mode and settings - try to find, but for now use defaults
    const ctcScanMode = 0;
    const settings = new Array(8).fill(0);

    const scanList = {
      name,
      ctcScanMode,
      settings,
      channels,
    };
    scanLists.push(scanList);
    
    // Call callback to store raw data
    onRawScanListParsed?.(listNum, listData, name);
  }

  // TODO: Handle lists 45+ which start at offset 0 in subsequent blocks
  // For now, we only parse lists 1-44 which start at offset 16

  return scanLists;
}

/**
 * Parse contacts from contact block data
 */
export function parseContacts(data: Uint8Array): Contact[] {
  const contacts: Contact[] = [];
  
  // Contact structure: 16 bytes per contact
  // Format: Name (16 bytes, null-terminated)
  // DMR ID is stored separately, need to check protocol spec for exact format
  
  // For now, basic parsing - will need to verify exact structure
  const contactSize = 16;
  for (let i = 0; i < data.length; i += contactSize) {
    if (i + contactSize > data.length) break;

    const contactData = data.slice(i, i + contactSize);
    
    // Check if empty (all 0xFF or all 0x00)
    if (contactData.every(b => b === 0xFF || b === 0x00)) {
      continue;
    }

    const nullIndex = contactData.indexOf(0);
    const name = new TextDecoder('ascii', { fatal: false })
      .decode(contactData.slice(0, nullIndex >= 0 ? nullIndex : 16))
      .replace(/\x00/g, '')
      .trim();

    if (name.length > 0) {
      contacts.push({
        id: (i / contactSize) + 1,
        name,
        dmrId: 0, // Will need to read from separate location
        callSign: undefined,
      });
    }
  }

  return contacts;
}

/**
 * Parse quick text messages from message block data
 * 
 * Quick Message structure (from spec):
 * - Count field: Offset 0 (1 byte)
 * - Entry size: 129 bytes per message (0x81)
 * - Entry base: Offset 0x80 (128) for entry 0
 * - Max entries: ~30 messages (floor((4096 - 128) / 129) = 30)
 * 
 * Entry calculation: buffer + 0x80 + entry_num * 0x80 = buffer + 0x80 * (entry_num + 1)
 * 
 * Entry structure (129 bytes):
 * - Offset +0x70 (112): Check value (2 bytes)
 * - Offset +0x70+2 (114): Message text (null-terminated, 0xFF indicates end)
 * - Offset +0xF (15): Flag/status (1 byte, set to 0 when message is set)
 */
export function parseQuickMessages(
  data: Uint8Array,
  onRawMessageParsed?: (messageIndex: number, rawData: Uint8Array) => void
): QuickTextMessage[] {
  const messages: QuickTextMessage[] = [];

  // Read count field at offset 0
  const messageCount = data.length > 0 ? data[0] : 0;
  const maxMessages = Math.min(messageCount, LIMITS.QUICK_MESSAGES_MAX);

  // Parse each message entry
  for (let entryNum = 0; entryNum < maxMessages; entryNum++) {
    // Entry offset: 0x80 * (entryNum + 1)
    const entryOffset = OFFSET.QUICK_MESSAGE_BASE * (entryNum + 1);
    
    if (entryOffset + BLOCK_SIZE.QUICK_MESSAGE > data.length) {
      console.log(`Message ${entryNum} would be at offset ${entryOffset}, but data length is only ${data.length}`);
      break;
    }

    const entryData = data.slice(entryOffset, entryOffset + BLOCK_SIZE.QUICK_MESSAGE);

    // Check if entry is empty (all 0xFF or all 0x00)
    const isAllEmpty = entryData.every(b => b === 0xFF || b === 0x00);
    if (isAllEmpty) {
      continue;
    }

    // Read flag/status at offset +0xF (15)
    const flag = entryData[0x0F];

    // Read check value at offset +0x70 (112) - 2 bytes
    const checkValueOffset = 0x70;
    const checkValue = entryData[checkValueOffset] | (entryData[checkValueOffset + 1] << 8);

    // Read message text starting at offset +0x70+2 (114)
    // Text is null-terminated, 0xFF indicates end
    const textStartOffset = 0x70 + 2;
    let textEndOffset = textStartOffset;
    
    // Find end of text (null terminator or 0xFF)
    for (let i = textStartOffset; i < entryData.length; i++) {
      if (entryData[i] === 0x00 || entryData[i] === 0xFF) {
        textEndOffset = i;
        break;
      }
    }

    const textBytes = entryData.slice(textStartOffset, textEndOffset);
    const text = new TextDecoder('ascii', { fatal: false })
      .decode(textBytes)
      .replace(/\x00/g, '')
      .replace(/\xFF/g, '')
      .trim();

    // Skip empty messages
    if (text.length === 0) {
      continue;
    }

    const message: QuickTextMessage = {
      index: entryNum,
      text,
      flag,
      checkValue,
    };

    messages.push(message);

    // Call callback to store raw data
    onRawMessageParsed?.(entryNum, entryData);
  }

  return messages;
}

/**
 * Encode a quick text message into binary format
 * 
 * @param message - Quick text message to encode
 * @param messageIndex - 0-based index of the message
 * @returns 129-byte encoded message entry
 */
export function encodeQuickMessage(message: QuickTextMessage): Uint8Array {
  const data = new Uint8Array(BLOCK_SIZE.QUICK_MESSAGE);
  
  // Initialize to 0xFF (empty/padding)
  data.fill(0xFF);

  // Flag/status at offset +0xF (15) - set to 0 when message is set
  data[0x0F] = message.flag;

  // Check value at offset +0x70 (112) - 2 bytes, little-endian
  data[0x70] = message.checkValue & 0xFF;
  data[0x71] = (message.checkValue >> 8) & 0xFF;

  // Message text starting at offset +0x70+2 (114)
  // Text is null-terminated, 0xFF indicates end
  const textStartOffset = 0x70 + 2;
  const textBytes = new TextEncoder().encode(message.text);
  
  // Copy text bytes (up to available space)
  const maxTextLength = data.length - textStartOffset - 1; // -1 for null terminator
  const textLength = Math.min(textBytes.length, maxTextLength);
  
  for (let i = 0; i < textLength; i++) {
    data[textStartOffset + i] = textBytes[i];
  }
  
  // Null terminator
  if (textLength < maxTextLength) {
    data[textStartOffset + textLength] = 0x00;
  } else {
    // If text fills the space, mark end with 0xFF
    data[textStartOffset + textLength] = 0xFF;
  }

  return data;
}

/**
 * Parse DMR Radio IDs from radio ID block data
 * 
 * DMR Radio ID structure (from spec):
 * - Count field: Offset 0 (4 bytes, DWORD, little-endian)
 * - Entry size: 16 bytes per entry (0x10)
 * - Entry base: Offset 0x00 (entries start at buffer base)
 * - Max entries: 256 entries (4096 / 16 = 256)
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

  // Read count field at offset 0 (4 bytes, DWORD, little-endian)
  const idCount = data.length >= 4 
    ? data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)
    : 0;
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

  // Parse each entry (109 bytes each)
  for (let entryNum = 0; entryNum < LIMITS.RX_GROUPS_MAX; entryNum++) {
    const entryOffset = entryNum * BLOCK_SIZE.RX_GROUP;
    
    if (entryOffset + BLOCK_SIZE.RX_GROUP > data.length) {
      break;
    }

    const entryData = data.slice(entryOffset, entryOffset + BLOCK_SIZE.RX_GROUP);

    // Check if entry is empty (all 0xFF or all 0x00)
    const isAllEmpty = entryData.every(b => b === 0xFF || b === 0x00);
    if (isAllEmpty) {
      continue;
    }

    // Read bitmask (4 bytes, little-endian, at offset +0x00)
    const bitmask = (entryData[0] | 
                     (entryData[1] << 8) | 
                     (entryData[2] << 16) | 
                     (entryData[3] << 24)) >>> 0; // Unsigned 32-bit

    // Read status flag (1 byte at offset +0x04)
    const statusFlag = entryData[0x04];

    // Read entry flag (1 byte at offset +0x0F)
    const entryFlag = entryData[0x0F];

    // Try to find contact name and IDs
    // The spec says these are stored "before entry base", which might mean:
    // - In a header area before the entries
    // - Or in the previous entry's space
    // For now, let's try looking in the block before this entry's start
    let name = '';
    let validationFlag = 0;
    const contactIds: number[] = [];

    // Try to read name from offset entry_base - 0x5C (entryOffset - 0x5C)
    // But if entryOffset < 0x5C, we can't read before the buffer start
    if (entryOffset >= 0x5C) {
      const nameOffset = entryOffset - 0x5C;
      if (nameOffset + 11 <= data.length) {
        const nameBytes = data.slice(nameOffset, nameOffset + 11);
        const nullIndex = nameBytes.indexOf(0);
        const ffIndex = nameBytes.indexOf(0xFF);
        const endIndex = nullIndex >= 0 ? nullIndex : (ffIndex >= 0 ? ffIndex : 11);
        name = new TextDecoder('ascii', { fatal: false })
          .decode(nameBytes.slice(0, endIndex))
          .replace(/\x00/g, '')
          .replace(/\xFF/g, '')
          .trim();
      }

      // Read validation flag from entry_base - 0x5D
      const validationOffset = entryOffset - 0x5D;
      if (validationOffset >= 0 && validationOffset < data.length) {
        validationFlag = data[validationOffset];
      }

      // Try to read contact IDs from entry_base - 0x54
      // Contact IDs are 3 bytes each, stored as little-endian DMR IDs
      // We'll try to read a reasonable number (up to 10 slots = 30 bytes)
      const idsStartOffset = entryOffset - 0x54;
      if (idsStartOffset >= 0) {
        for (let slot = 0; slot < 10; slot++) {
          const idOffset = idsStartOffset + (slot * 3);
          if (idOffset + 3 <= data.length && idOffset + 3 <= entryOffset) {
            // Read 3-byte little-endian DMR ID
            const idValue = data[idOffset] | 
                           (data[idOffset + 1] << 8) | 
                           (data[idOffset + 2] << 16);
            if (idValue !== 0 && idValue !== 0xFFFFFF) {
              contactIds.push(idValue);
            } else {
              // Stop at first empty slot
              break;
            }
          }
        }
      }
    }

    // Skip entries with empty names and zero bitmasks
    if (name.length === 0 && bitmask === 0 && contactIds.length === 0) {
      continue;
    }

    const group: RXGroup = {
      index: entryNum,
      name: name || `DMR RX Group ${entryNum + 1}`,
      bitmask,
      statusFlag,
      entryFlag,
      validationFlag,
      contactIds,
    };

    groups.push(group);

    // Call callback to store raw data
    onRawGroupParsed?.(entryNum, entryData, name);
  }

  return groups;
}

/**
 * Encode a DMR RX Group into binary format
 * 
 * @param group - DMR RX Group to encode
 * @returns 109-byte encoded group entry
 */
export function encodeRXGroup(group: RXGroup): Uint8Array {
  const data = new Uint8Array(BLOCK_SIZE.RX_GROUP);
  
  // Initialize to 0xFF (empty/padding)
  data.fill(0xFF);

  // Bitmask (4 bytes, little-endian, at offset +0x00)
  data[0] = group.bitmask & 0xFF;
  data[1] = (group.bitmask >> 8) & 0xFF;
  data[2] = (group.bitmask >> 16) & 0xFF;
  data[3] = (group.bitmask >> 24) & 0xFF;

  // Status flag (1 byte at offset +0x04)
  data[0x04] = group.statusFlag & 0xFF;

  // Reserved (10 bytes at offset +0x05) - already 0xFF from fill

  // Entry flag (1 byte at offset +0x0F)
  data[0x0F] = group.entryFlag & 0xFF;

  // Note: Name, validation flag, and contact IDs would need to be written
  // to the "before entry base" area, which requires knowing the entry's position
  // in the block. This encoding function only handles the main 109-byte entry.

  return data;
}



