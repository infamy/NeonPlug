/**
 * DM-32UV Encoding/Decoding Utilities
 * Handles BCD frequency encoding and CTCSS/DCS encoding
 */

/**
 * Decode BCD frequency (4 bytes, little-endian, reversed)
 * Example: 00 50 53 14 = 145.350 MHz
 * 
 * Algorithm per spec:
 * 1. Reverse from little-endian to big-endian
 * 2. Extract BCD digits (two per byte)
 * 3. Convert to 8-digit integer
 * 4. Divide by 100000.0 to get MHz
 */
export function decodeBCDFrequency(data: Uint8Array): number {
  if (data.length < 4) {
    throw new Error('BCD frequency must be 4 bytes');
  }

  // Reverse from little-endian to big-endian
  const bcd = [data[3], data[2], data[1], data[0]];
  
  // Extract BCD digits and convert to 8-digit integer
  let freqInt = 0;
  for (let i = 0; i < 4; i++) {
    const high = (bcd[i] >> 4) & 0x0F;
    const low = bcd[i] & 0x0F;
    freqInt = freqInt * 100 + high * 10 + low;
  }
  
  // Convert to MHz (14535000 → 145.35000)
  return freqInt / 100000.0;
}

/**
 * Encode frequency to BCD (4 bytes, little-endian, reversed)
 * 
 * Algorithm per spec:
 * 1. Convert frequency to 8-digit integer (multiply by 100000)
 * 2. Convert to BCD (big-endian)
 * 3. Reverse to little-endian
 */
export function encodeBCDFrequency(frequency: number): Uint8Array {
  // Convert to 8-digit integer (145.35000 MHz → 14535000)
  const freqInt = Math.round(frequency * 100000);
  
  // Convert to BCD (big-endian)
  const bcd: number[] = [];
  let temp = freqInt;
  for (let i = 3; i >= 0; i--) {
    const low = temp % 10;
    temp = Math.floor(temp / 10);
    const high = temp % 10;
    temp = Math.floor(temp / 10);
    bcd[i] = (high << 4) | low;
  }
  
  // Reverse to little-endian
  return new Uint8Array([bcd[3], bcd[2], bcd[1], bcd[0]]);
}

/**
 * Decode CTCSS/DCS (2 bytes)
 * CTCSS: <tone_low> <tone_high> (e.g., 127.3 Hz = 73 12)
 * DCS: High byte >= 0x80 (e.g., D023N = 23 80)
 */
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

  // Check if DCS (high byte >= 0x80)
  if (high >= 0x80) {
    const code = low;
    const polarity = (high & 0x01) === 0 ? 'N' : 'P';
    return { type: 'DCS', value: code, polarity };
  }

  // CTCSS: tone in Hz
  // Format: <tone_low> <tone_high>
  // Example: 73 12 = 127.3 Hz
  if (low === 0 && high === 0) {
    return { type: 'None' };
  }

  // Convert to Hz (tone_low is integer part, tone_high is decimal * 10)
  const integerPart = low;
  const decimalPart = high / 10;
  const frequency = integerPart + decimalPart;

  return { type: 'CTCSS', value: frequency };
}

/**
 * Encode CTCSS/DCS to 2 bytes
 */
export function encodeCTCSSDCS(ctcssDcs: CTCSSDCSResult): Uint8Array {
  if (ctcssDcs.type === 'None' || ctcssDcs.value === undefined) {
    return new Uint8Array([0x00, 0x00]);
  }

  if (ctcssDcs.type === 'DCS') {
    const code = ctcssDcs.value;
    const polarityBit = ctcssDcs.polarity === 'P' ? 0x01 : 0x00;
    return new Uint8Array([code, 0x80 | polarityBit]);
  }

  // CTCSS
  const frequency = ctcssDcs.value;
  const integerPart = Math.floor(frequency);
  const decimalPart = Math.round((frequency - integerPart) * 10);
  return new Uint8Array([integerPart, decimalPart]);
}

