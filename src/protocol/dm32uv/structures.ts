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
  // Bits 6-3: Reserved
  // Bit 2: APRS Receive (0=Off, 1=On)
  // Bits 1-0: Reverse Frequency (0-3)
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
  // Bits 7-4: Power Level (0=Low, 1=Medium, 2=High, 3-15=Reserved/Invalid)
  // Bits 3-2: APRS Report Mode (0=Off, 1=Digital, 2=Analog, 3=Reserved)
  // Bits 1-0: Reserved
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
  // Bits 7-4: RX Squelch Mode (0=Carrier/CTC, 1=Optional, 2=CTC&Opt, 3=CTC|Opt, 4-7=Reserved)
  // Bits 3-0: Reserved (possibly PTT ID related, but not in Channel interface)
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
  // Bits 3-0: Reserved
  const pttIdTypeValue = (data[0x29] >> 4) & 0x0F;
  const pttIdTypeMap: Channel['pttIdType'][] = ['Off', 'BOT', 'EOT', 'Both'];
  const pttIdType = pttIdTypeMap[pttIdTypeValue] || 'Off';

  // Reserved (0x2A) - Unknown purpose, possibly padding or reserved for future use
  // const reserved2A = data[0x2A];

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



