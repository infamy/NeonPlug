import type { Channel, CTCSSDCS } from '../../models';
import { createDefaultChannel } from '../../utils/channelHelpers';
import { CTCSS_FREQUENCIES } from '../../utils/ctcssConstants';
import { parseCSV, type ImportResult } from './csvImporter';

/**
 * Parse Chirp CSV format and convert to Channel objects
 * 
 * Chirp CSV format fields:
 * - Location: Channel number (we ignore this and use next available)
 * - Name: Channel name
 * - Frequency: RX Frequency (MHz)
 * - Duplex: Duplex mode (we ignore)
 * - Offset: Offset in MHz (positive = +, negative = -)
 * - Tone: Tone mode (Tone, TSQL, DTCS, Cross, None)
 * - rToneFreq: RX tone frequency (Hz)
 * - cToneFreq: TX tone frequency (Hz)
 * - DtcsCode: DCS code
 * - DtcsPolarity: DCS polarity (N or P)
 * - RxDtcsCode: RX DCS code
 * - CrossMode: Cross mode
 * - Mode: FM, NFM, DV, etc.
 * - TStep: Step frequency (kHz)
 * - Skip: Skip flag
 * - Power: Power level
 * - Comment: Comment
 * - URCALL, RPT1CALL, RPT2CALL, DVCODE: Digital fields
 */
export function importChannelsFromChirpCSV(
  content: string,
  startChannelNumber: number = 1
): ImportResult {
  try {
    const rows = parseCSV(content);
    if (rows.length < 2) {
      return { success: false, errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = rows[0].map(h => h.trim());
    const channels: Channel[] = [];
    const errors: string[] = [];

    // Find column indices
    const getIndex = (headerName: string): number => {
      return headers.findIndex(h => h.toLowerCase() === headerName.toLowerCase());
    };

    // Location field is ignored - we use next available channel number
    const nameIdx = getIndex('Name');
    const frequencyIdx = getIndex('Frequency');
    const offsetIdx = getIndex('Offset');
    const toneIdx = getIndex('Tone');
    const rToneFreqIdx = getIndex('rToneFreq');
    const cToneFreqIdx = getIndex('cToneFreq');
    const dtcsCodeIdx = getIndex('DtcsCode');
    const dtcsPolarityIdx = getIndex('DtcsPolarity');
    const rxDtcsCodeIdx = getIndex('RxDtcsCode');
    // CrossMode is handled via tone mode, not stored separately
    const modeIdx = getIndex('Mode');
    const tStepIdx = getIndex('TStep');
    const skipIdx = getIndex('Skip');
    const powerIdx = getIndex('Power');
    const commentIdx = getIndex('Comment');
    // Digital fields are not used since we import everything as analog

    let currentChannelNumber = startChannelNumber;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      try {
        const getValue = (idx: number): string => {
          return idx >= 0 && idx < row.length ? row[idx].trim() : '';
        };

        const getNumber = (idx: number, defaultValue: number = 0): number => {
          const val = getValue(idx);
          if (!val) return defaultValue;
          const num = parseFloat(val);
          return isNaN(num) ? defaultValue : num;
        };

        // Get basic fields
        const name = getValue(nameIdx) || `Channel ${currentChannelNumber}`;
        const rxFrequency = getNumber(frequencyIdx, 0);
        const offset = getValue(offsetIdx);
        const tone = getValue(toneIdx);
        const rToneFreq = getNumber(rToneFreqIdx, 0);
        const cToneFreq = getNumber(cToneFreqIdx, 0);
        const dtcsCode = getNumber(dtcsCodeIdx, 0);
        const dtcsPolarity = getValue(dtcsPolarityIdx).toUpperCase() as 'N' | 'P' | '';
        const rxDtcsCode = getNumber(rxDtcsCodeIdx, 0);
        // CrossMode is handled via tone mode, not stored separately
        const mode = getValue(modeIdx).toUpperCase();
        const tStep = getNumber(tStepIdx, 0);
        const skip = getValue(skipIdx);
        const power = getValue(powerIdx);
        const comment = getValue(commentIdx);
        // Digital fields are not used since we import everything as analog

        // Validate RX frequency
        if (rxFrequency <= 0) {
          errors.push(`Row ${i + 1}: Invalid RX frequency`);
          continue;
        }

        // Calculate TX frequency from offset
        let txFrequency = rxFrequency;
        if (offset) {
          const offsetNum = parseFloat(offset);
          if (!isNaN(offsetNum)) {
            txFrequency = rxFrequency + offsetNum;
          }
        }

        // Determine channel mode
        // Note: Chirp doesn't actually support digital channels, so even if we detect
        // digital indicators (DV mode, URCALL, etc.), we'll import as analog
        let channelMode: Channel['mode'] = 'Analog';
        // If mode is explicitly FM or NFM, use Analog
        if (mode === 'NFM' || mode === 'FM') {
          channelMode = 'Analog';
        }
        // Even if we see DV/DMR indicators, import as analog since Chirp doesn't support digital
        // The user can manually convert to digital later if needed

        // Determine bandwidth from mode
        const bandwidth: Channel['bandwidth'] = mode === 'NFM' ? '12.5kHz' : '25kHz';

        // Parse tone settings
        const parseTone = (toneMode: string, toneFreq: number, dcsCode: number, dcsPolarity: 'N' | 'P' | ''): CTCSSDCS => {
          if (toneMode === 'DTCS' || toneMode === 'DTCS-R' || dcsCode > 0) {
            // Use DCS code if available
            const code = dcsCode > 0 ? dcsCode : (toneFreq > 0 ? Math.round(toneFreq) : 0);
            if (code > 0) {
              // Accept any DCS code, not just ones in the predefined list
              // The radio will handle validation
              return {
                type: 'DCS',
                value: code,
                polarity: dcsPolarity || 'N',
              };
            }
          }
          
          if (toneMode === 'Tone' || toneMode === 'TSQL' || toneMode === 'Cross' || toneFreq > 0) {
            // Use CTCSS frequency
            const freq = toneFreq > 0 ? toneFreq : 0;
            if (freq > 0) {
              // Accept any CTCSS frequency in the standard range (67-250.3 Hz)
              // Check if it's close to a standard frequency or just use it directly
              const isStandardFreq = CTCSS_FREQUENCIES.some(stdFreq => Math.abs(stdFreq - freq) < 0.1);
              if (isStandardFreq || (freq >= 67 && freq <= 250.3)) {
                return {
                  type: 'CTCSS',
                  value: freq,
                };
              }
            }
          }
          
          return { type: 'None' };
        };

        // Parse RX and TX tones
        // RX tone mode: TSQL/Cross use the tone value, DTCS uses DTCS-R if rxDtcsCode is set, otherwise check if tone is DTCS
        const rxToneMode = tone === 'TSQL' || tone === 'Cross' 
          ? tone 
          : (tone === 'DTCS' || rxDtcsCode > 0 ? 'DTCS-R' : '');
        
        // TX tone mode: Tone/TSQL/Cross use the tone value, DTCS uses DTCS if tone is DTCS or dtcsCode is set
        const txToneMode = tone === 'Tone' || tone === 'TSQL' || tone === 'Cross' 
          ? tone 
          : (tone === 'DTCS' || dtcsCode > 0 ? 'DTCS' : '');
        
        const rxCtcssDcs = parseTone(
          rxToneMode,
          rToneFreq,
          rxDtcsCode > 0 ? rxDtcsCode : dtcsCode,
          dtcsPolarity
        );
        
        const txCtcssDcs = parseTone(
          txToneMode,
          cToneFreq,
          dtcsCode,
          dtcsPolarity
        );

        // Determine power level
        let powerLevel: Channel['power'] = 'High';
        if (power) {
          const powerLower = power.toLowerCase();
          if (powerLower.includes('low') || powerLower === '1') {
            powerLevel = 'Low';
          } else if (powerLower.includes('med') || powerLower === '2') {
            powerLevel = 'Medium';
          } else if (powerLower.includes('high') || powerLower === '3') {
            powerLevel = 'High';
          }
        }

        // Determine step frequency
        let stepFreq: number = 5; // Default 25kHz
        if (tStep > 0) {
          // Map common step frequencies
          if (tStep <= 2.5) stepFreq = 0; // 2.5kHz
          else if (tStep <= 5) stepFreq = 1; // 5kHz
          else if (tStep <= 6.25) stepFreq = 2; // 6.25kHz
          else if (tStep <= 10) stepFreq = 3; // 10kHz
          else if (tStep <= 12.5) stepFreq = 4; // 12.5kHz
          else if (tStep <= 25) stepFreq = 5; // 25kHz
          else if (tStep <= 50) stepFreq = 6; // 50kHz
          else stepFreq = 7; // 100kHz
        }

        // Create channel
        const channel = createDefaultChannel({
          number: currentChannelNumber++,
          name: name.substring(0, 16), // Max 16 chars
          rxFrequency,
          txFrequency,
          mode: channelMode,
          bandwidth,
          power: powerLevel,
          rxCtcssDcs,
          txCtcssDcs,
          stepFrequency: stepFreq,
          scanAdd: skip.toLowerCase() !== 's', // Skip = 'S' means don't scan
          source: comment || `Imported from Chirp CSV`,
        });

        // Note: We import everything as analog, so we don't set digital fields
        // If dvcode is present, we could store it in a comment or ignore it
        // since Chirp doesn't actually support digital channels

        channels.push(channel);
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      channels,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to parse Chirp CSV'],
    };
  }
}

