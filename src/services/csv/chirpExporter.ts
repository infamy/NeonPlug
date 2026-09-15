import type { Channel, CTCSSDCS } from '../../models';
import { isNoTxFrequency } from '../validation/frequencyValidator';

// CHIRP rejects a tone of 0.0 and many drivers reject code 000, so a tone column a row doesn't
// use gets 88.5 Hz or 023, as in CHIRP's own exports. CHIRP ignores them unless Tone says otherwise.
const NO_TONE_PLACEHOLDER = '88.5';
const NO_DCS_PLACEHOLDER = '023';

interface ChirpToneColumns {
  tone: string;
  rToneFreq: string;
  cToneFreq: string;
  dtcsCode: string;
  dtcsPolarity: string;
  rxDtcsCode: string;
  crossMode: string;
}

const toneMode = (t: CTCSSDCS): '' | 'Tone' | 'DTCS' =>
  t.type === 'CTCSS' && t.value ? 'Tone' : t.type === 'DCS' && t.value ? 'DTCS' : '';
const hz = (t: CTCSSDCS): string => (t.value ?? 0).toFixed(1);
const code = (t: CTCSSDCS): string => String(t.value ?? 0).padStart(3, '0');
// NeonPlug calls an inverted code P; CHIRP calls it R.
const polarity = (t: CTCSSDCS): string => (toneMode(t) === 'DTCS' && t.polarity === 'P' ? 'R' : 'N');

/**
 * A channel's tones as CHIRP's tone columns, set the way CHIRP sets them (split_tone_decode in
 * chirp_common.py), so chirpRowTones in chirpImporter.ts reads them back:
 *
 * - A TX tone only:            Tone, rToneFreq
 * - The same tone both ways:   TSQL, cToneFreq
 * - The same code both ways:   DTCS, DtcsCode
 * - Anything else:             Cross, CrossMode "TX->RX". A TX tone goes in rToneFreq, an RX
 *                              tone in cToneFreq, a TX code in DtcsCode, an RX code in RxDtcsCode.
 *
 * TSQL and DTCS also fill the other column of their pair, so a reader that takes either one
 * gets the tone. DtcsPolarity is two letters, TX then RX.
 */
function chirpToneColumns(tx: CTCSSDCS, rx: CTCSSDCS): ChirpToneColumns {
  const txMode = toneMode(tx);
  const rxMode = toneMode(rx);
  const columns: ChirpToneColumns = {
    tone: '',
    rToneFreq: NO_TONE_PLACEHOLDER,
    cToneFreq: NO_TONE_PLACEHOLDER,
    dtcsCode: NO_DCS_PLACEHOLDER,
    dtcsPolarity: polarity(tx) + polarity(rx),
    rxDtcsCode: NO_DCS_PLACEHOLDER,
    crossMode: 'Tone->Tone', // CHIRP needs a valid CrossMode on every row
  };

  if (!txMode && !rxMode) return columns;
  if (txMode === 'Tone' && !rxMode) return { ...columns, tone: 'Tone', rToneFreq: hz(tx) };
  if (txMode === 'Tone' && rxMode === 'Tone' && hz(tx) === hz(rx)) {
    return { ...columns, tone: 'TSQL', rToneFreq: hz(tx), cToneFreq: hz(tx) };
  }
  if (txMode === 'DTCS' && rxMode === 'DTCS' && code(tx) === code(rx)) {
    return { ...columns, tone: 'DTCS', dtcsCode: code(tx), rxDtcsCode: code(tx) };
  }

  columns.tone = 'Cross';
  columns.crossMode = `${txMode}->${rxMode}`;
  if (txMode === 'Tone') columns.rToneFreq = hz(tx);
  if (txMode === 'DTCS') columns.dtcsCode = code(tx);
  if (rxMode === 'Tone') columns.cToneFreq = hz(rx);
  if (rxMode === 'DTCS') columns.rxDtcsCode = code(rx);
  return columns;
}

/**
 * Export channels to Chirp CSV format
 *
 * Chirp CSV format fields:
 * - Location: Channel number
 * - Name: Channel name
 * - Frequency: RX Frequency (MHz)
 * - Duplex: '+' or '-' for a TX offset, '' for simplex, 'off' for no TX
 * - Offset: The offset's size in MHz, always positive
 * - Tone, rToneFreq, cToneFreq, DtcsCode, DtcsPolarity, RxDtcsCode, CrossMode: see chirpToneColumns
 * - Mode: FM, NFM, DV, etc.
 * - TStep: Step frequency (kHz)
 * - Skip: Skip flag (S = skip, empty = scan)
 * - Power: Power level
 * - Comment: Comment
 * - URCALL, RPT1CALL, RPT2CALL, DVCODE: Digital fields
 */
export function exportChannelsToChirpCSV(channels: Channel[]): string {
  const headers = [
    'Location',
    'Name',
    'Frequency',
    'Duplex',
    'Offset',
    'Tone',
    'rToneFreq',
    'cToneFreq',
    'DtcsCode',
    'DtcsPolarity',
    'RxDtcsCode',
    'CrossMode',
    'Mode',
    'TStep',
    'Skip',
    'Power',
    'Comment',
    'URCALL',
    'RPT1CALL',
    'RPT2CALL',
    'DVCODE',
  ];

  // Filter out digital channels - Chirp doesn't support them
  const analogChannels = channels.filter(channel =>
    channel.mode === 'Analog' || channel.mode === 'Fixed Analog'
  );

  const rows = analogChannels.map(channel => {
    // CHIRP's 'off' means no TX at all, so it is only for a channel that can't transmit.
    // Simplex is ''.
    const offset = channel.txFrequency - channel.rxFrequency;
    let duplex = '';
    let offsetStr = '0.000000';
    if (channel.forbidTx || isNoTxFrequency(channel.txFrequency)) {
      duplex = 'off';
    } else if (Math.abs(offset) >= 0.0001) {
      duplex = offset > 0 ? '+' : '-';
      offsetStr = Math.abs(offset).toFixed(6);
    }

    const tones = chirpToneColumns(channel.txCtcssDcs, channel.rxCtcssDcs);

    // Determine mode (only analog channels reach here after filtering)
    const mode = channel.bandwidth === '12.5kHz' ? 'NFM' : 'FM';

    // Determine step frequency
    const stepFreqMap: Record<number, number> = {
      0: 2.5,
      1: 5,
      2: 6.25,
      3: 10,
      4: 12.5,
      5: 25,
      6: 50,
      7: 100,
    };
    const tStep = stepFreqMap[channel.stepFrequency] || 25;

    // Skip flag
    const skip = channel.scanAdd ? '' : 'S';

    // Power level - generic_csv expects wattage like "5.0W", "1.0W" (see CHIRP sample CSV)
    const powerMap: Record<string, string> = {
      High: '5.0W',
      Medium: '2.5W',
      Low: '1.0W',
    };
    let power = powerMap[channel.power ?? ''];
    if (!power) {
      console.warn(`Channel ${channel.number} has invalid power value: ${channel.power}, defaulting to 5.0W`);
      power = '5.0W';
    }

    // Comment
    const comment = channel.source || '';

    // Digital fields (always empty since we only export analog channels)
    const urcall = '';
    const rpt1call = '';
    const rpt2call = '';
    const dvcode = '';

    return [
      channel.number.toString(),
      channel.name,
      channel.rxFrequency.toFixed(6),
      duplex,
      offsetStr,
      tones.tone,
      tones.rToneFreq,
      tones.cToneFreq,
      tones.dtcsCode,
      tones.dtcsPolarity,
      tones.rxDtcsCode,
      tones.crossMode,
      mode,
      tStep.toString(),
      skip,
      power,
      comment,
      urcall,
      rpt1call,
      rpt2call,
      dvcode,
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
}
