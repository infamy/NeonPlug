/**
 * DM-32UV Data Structure Parsing
 * Parses channel, zone, and contact structures from radio memory
 */

import type { Channel, Contact, Zone, ScanList } from '../../models';
import { decodeBCDFrequency, decodeCTCSSDCS } from './encoding';

/**
 * Parse a single channel from 48-byte data
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
  const rxFreq = decodeBCDFrequency(data.slice(0x10, 0x14));

  // TX Frequency (0x14-0x17, 4 bytes BCD)
  const txFreq = decodeBCDFrequency(data.slice(0x14, 0x18));

  // Mode flags (0x18)
  const modeFlags = data[0x18];
  const channelMode = (modeFlags >> 4) & 0x0F;
  const modeMap: Channel['mode'][] = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
  const mode = modeMap[channelMode] || 'Analog';

  const forbidTx = (modeFlags & 0x08) !== 0;
  const busyLockValue = (modeFlags >> 1) & 0x03;
  const busyLock: Channel['busyLock'] = 
    busyLockValue === 0 ? 'Off' : 
    busyLockValue === 1 ? 'Carrier' : 'Repeater';
  const loneWorker = (modeFlags & 0x01) !== 0;

  // Scan & Bandwidth (0x19)
  const scanBw = data[0x19];
  const bandwidth: Channel['bandwidth'] = (scanBw & 0x80) !== 0 ? '12.5kHz' : '25kHz';
  const scanAdd = (scanBw & 0x40) !== 0;
  const scanListId = (scanBw >> 2) & 0x0F;

  // Talkaround & APRS (0x1A)
  const talkaroundAprs = data[0x1A];
  const forbidTalkaround = (talkaroundAprs & 0x80) !== 0;
  const aprsReceive = (talkaroundAprs & 0x04) !== 0;
  const reverseFreq = talkaroundAprs & 0x03;

  // Emergency (0x1B)
  const emergency = data[0x1B];
  const emergencyIndicator = (emergency & 0x80) !== 0;
  const emergencyAck = (emergency & 0x40) !== 0;
  const emergencySystemId = emergency & 0x1F;

  // Power & APRS (0x1C)
  const powerAprs = data[0x1C];
  const powerValue = (powerAprs >> 4) & 0x0F;
  const power: Channel['power'] = 
    powerValue === 0 ? 'Low' : 
    powerValue === 1 ? 'Medium' : 'High';
  const aprsReportValue = (powerAprs >> 2) & 0x03;
  const aprsReportMode: Channel['aprsReportMode'] = 
    aprsReportValue === 0 ? 'Off' : 
    aprsReportValue === 1 ? 'Digital' : 'Analog';

  // Analog features (0x1D)
  const analogFeatures = data[0x1D];
  const voxFunction = (analogFeatures & 0x80) !== 0;
  const scramble = (analogFeatures & 0x40) !== 0;
  const compander = (analogFeatures & 0x20) !== 0;
  const talkback = (analogFeatures & 0x10) !== 0;

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
  const additionalFlags = data[0x25];
  const companderDup = (additionalFlags & 0x20) !== 0;
  const voxRelated = (additionalFlags & 0x10) !== 0;

  // RX Squelch & PTT ID (0x26)
  const rxSquelchPtt = data[0x26];
  const rxSquelchValue = (rxSquelchPtt >> 4) & 0x07;
  const rxSquelchModeMap: Channel['rxSquelchMode'][] = [
    'Carrier/CTC',
    'Optional',
    'CTC&Opt',
    'CTC|Opt',
  ];
  const rxSquelchMode = rxSquelchModeMap[rxSquelchValue] || 'Carrier/CTC';

  // Signaling (0x27)
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

  // PTT ID Type (0x29)
  const pttIdTypeValue = (data[0x29] >> 4) & 0x0F;
  const pttIdTypeMap: Channel['pttIdType'][] = ['Off', 'BOT', 'EOT', 'Both'];
  const pttIdType = pttIdTypeMap[pttIdTypeValue] || 'Off';

  // Contact ID (0x2B)
  const contactId = data[0x2B];

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
    rxSquelchMode,
    stepFrequency,
    signalingType,
    pttIdType,
    contactId,
  };
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
 * Parse scan lists from scan list block data
 * Scan lists are 92 bytes each
 * Offset 16 for lists 1-44, offset 0 for lists 45+
 */
export function parseScanLists(
  data: Uint8Array,
  onRawScanListParsed?: (listNum: number, rawData: Uint8Array, name: string) => void
): ScanList[] {
  const scanLists: ScanList[] = [];

  // Scan lists are 92 bytes each
  // Lists 1-44 start at offset 16, lists 45+ start at offset 0
  // Maximum would be ~44 lists (4096 / 92 ≈ 44) for first block
  // But we can have multiple blocks
  
  // First, try lists 1-44 (offset 16)
  for (let listNum = 1; listNum <= 44; listNum++) {
    const offset = 16 + (listNum - 1) * 92;
    if (offset + 92 > data.length) break;

    const listData = data.slice(offset, offset + 92);

    // Name (16 bytes, null-terminated)
    const nameBytes = listData.slice(0, 16);
    const nullIndex = nameBytes.indexOf(0);
    const name = new TextDecoder('ascii', { fatal: false })
      .decode(nameBytes.slice(0, nullIndex >= 0 ? nullIndex : 16))
      .replace(/\x00/g, '')
      .trim();

    // Skip empty scan lists
    if (name.length === 0 || nameBytes[0] === 0xFF || nameBytes[0] === 0x00) {
      const isAllEmpty = listData.every(b => b === 0xFF || b === 0x00);
      if (isAllEmpty && listNum > 1) {
        // Stop if we hit a completely empty scan list (after the first one)
        break;
      }
      continue;
    }

    // CTC scan mode (byte 0x10)
    const ctcScanMode = listData[0x10];

    // Settings (bytes 0x11-0x18, 8 bytes)
    const settings = Array.from(listData.slice(0x11, 0x19));

    // Channel list (bytes 0x19-0x58, 64 bytes = up to 16 channels × 4 bytes each)
    // Per spec: channel_list[64] with up to 16 channels
    // Format: Each channel entry is 4 bytes, but only first 2 bytes are channel number (16-bit little-endian)
    // The last 2 bytes of each entry are reserved/padding
    const channels: number[] = [];
    for (let i = 0; i < 16; i++) { // Up to 16 channels
      const chOffset = 0x19 + (i * 4); // Start at byte 0x19, 4 bytes per entry
      if (chOffset + 2 > listData.length) break;
      
      // Read 16-bit little-endian channel number (first 2 bytes of 4-byte entry)
      const chNum = listData[chOffset] | (listData[chOffset + 1] << 8);
      if (chNum > 0 && chNum <= 4000) {
        channels.push(chNum);
      }
    }

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


