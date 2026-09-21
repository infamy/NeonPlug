import type { Channel, CTCSSDCS } from '../../models';
import { createDefaultChannel } from '../../utils/channelHelpers';
import { CTCSS_FREQUENCIES } from '../../utils/ctcssConstants';
import { parseCSV, type ImportResult } from './csvImporter';

const NO_TONE: CTCSSDCS = { type: 'None' };

function ctcss(hz: number): CTCSSDCS {
  // Any standard tone, or anything in the CTCSS range
  const standard = CTCSS_FREQUENCIES.some((std) => Math.abs(std - hz) < 0.1);
  return standard || (hz >= 67 && hz <= 250.3) ? { type: 'CTCSS', value: hz } : NO_TONE;
}

function dcs(code: number, polarity: string | undefined): CTCSSDCS {
  // CHIRP marks a reversed (inverted) code R; NeonPlug calls it P.
  return code > 0 ? { type: 'DCS', value: code, polarity: polarity === 'R' ? 'P' : 'N' } : NO_TONE;
}

/**
 * A row's TX and RX tones, read the way CHIRP reads its own columns (split_tone_encode in
 * chirp_common.py). CHIRP writes every tone column on every row, 88.5 Hz and code 023 where
 * nothing is set, so only the Tone column says which of them count:
 *
 * - Tone:  TX rToneFreq, RX none
 * - TSQL:  TX and RX cToneFreq
 * - DTCS:  TX and RX DtcsCode
 * - Cross: CrossMode is "TX->RX". Tone is rToneFreq on TX and cToneFreq on RX, DTCS is
 *          DtcsCode on TX and RxDtcsCode on RX, and an empty side has no tone.
 *
 * Anything else, a blank Tone included, has no tones. DtcsPolarity is two letters, TX then RX.
 */
function chirpRowTones(columns: {
  tone: string;
  rToneFreq: number;
  cToneFreq: number;
  dtcsCode: number;
  rxDtcsCode: number;
  dtcsPolarity: string;
  crossMode: string;
}): { tx: CTCSSDCS; rx: CTCSSDCS } {
  const [txPolarity, rxPolarity] = columns.dtcsPolarity.toUpperCase();
  switch (columns.tone) {
    case 'Tone':
      return { tx: ctcss(columns.rToneFreq), rx: NO_TONE };
    case 'TSQL':
      return { tx: ctcss(columns.cToneFreq), rx: ctcss(columns.cToneFreq) };
    case 'DTCS':
      return { tx: dcs(columns.dtcsCode, txPolarity), rx: dcs(columns.dtcsCode, rxPolarity) };
    case 'Cross': {
      const [txMode = '', rxMode = ''] = columns.crossMode.split('->');
      const tx =
        txMode === 'Tone' ? ctcss(columns.rToneFreq) : txMode === 'DTCS' ? dcs(columns.dtcsCode, txPolarity) : NO_TONE;
      const rx =
        rxMode === 'Tone' ? ctcss(columns.cToneFreq) : rxMode === 'DTCS' ? dcs(columns.rxDtcsCode, rxPolarity) : NO_TONE;
      return { tx, rx };
    }
    default:
      return { tx: NO_TONE, rx: NO_TONE };
  }
}

/**
 * Parse Chirp CSV format and convert to Channel objects
 *
 * Chirp CSV format fields:
 * - Location: Channel number (we ignore this and use next available)
 * - Name: Channel name
 * - Frequency: RX Frequency (MHz)
 * - Duplex: '+' or '-' shifts TX by Offset, 'split' makes Offset the TX frequency, 'off' means no TX
 * - Offset: A size in MHz, always positive; Duplex gives its direction
 * - Tone, rToneFreq, cToneFreq, DtcsCode, DtcsPolarity, RxDtcsCode, CrossMode: see chirpRowTones
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
    const duplexIdx = getIndex('Duplex');
    const offsetIdx = getIndex('Offset');
    const toneIdx = getIndex('Tone');
    const rToneFreqIdx = getIndex('rToneFreq');
    const cToneFreqIdx = getIndex('cToneFreq');
    const dtcsCodeIdx = getIndex('DtcsCode');
    const dtcsPolarityIdx = getIndex('DtcsPolarity');
    const rxDtcsCodeIdx = getIndex('RxDtcsCode');
    const crossModeIdx = getIndex('CrossMode');
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
        const duplex = getValue(duplexIdx).toLowerCase();
        const offset = getNumber(offsetIdx, 0);
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

        // TX frequency from Duplex and Offset. Offset is only a size: without Duplex it
        // means nothing, which is why a '-' repeater used to come in transmitting above RX.
        const mhz = (value: number) => Math.round(value * 1e6) / 1e6;
        let txFrequency = rxFrequency;
        let forbidTx = false;
        if (duplex === '+') txFrequency = mhz(rxFrequency + offset);
        else if (duplex === '-') txFrequency = mhz(rxFrequency - offset);
        else if (duplex === 'split' && offset > 0) txFrequency = offset;
        else if (duplex === 'off') forbidTx = true;

        // Determine channel mode
        // Note: Chirp doesn't actually support digital channels, so even if we detect
        // digital indicators (DV mode, URCALL, etc.), we'll import as analog
        const channelMode: Channel['mode'] = 'Analog';

        // Determine bandwidth from mode
        const bandwidth: Channel['bandwidth'] = mode === 'NFM' ? '12.5kHz' : '25kHz';

        const tones = chirpRowTones({
          tone: getValue(toneIdx),
          rToneFreq: getNumber(rToneFreqIdx, 0),
          cToneFreq: getNumber(cToneFreqIdx, 0),
          dtcsCode: getNumber(dtcsCodeIdx, 0),
          rxDtcsCode: getNumber(rxDtcsCodeIdx, 0),
          dtcsPolarity: getValue(dtcsPolarityIdx),
          crossMode: getValue(crossModeIdx),
        });

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
          forbidTx,
          mode: channelMode,
          bandwidth,
          power: powerLevel,
          rxCtcssDcs: tones.rx,
          txCtcssDcs: tones.tx,
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
