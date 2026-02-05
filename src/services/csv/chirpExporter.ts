import type { Channel } from '../../models';

/**
 * Export channels to Chirp CSV format
 * 
 * Chirp CSV format fields:
 * - Location: Channel number
 * - Name: Channel name
 * - Frequency: RX Frequency (MHz)
 * - Duplex: Duplex mode (+, -, off, split)
 * - Offset: Offset in MHz
 * - Tone: Tone mode ('', Tone, TSQL, DTCS, DTCS-R, TSQL-R, Cross)
 * - rToneFreq: RX tone frequency (Hz)
 * - cToneFreq: TX tone frequency (Hz)
 * - DtcsCode: DCS code
 * - DtcsPolarity: DCS polarity (N or P)
 * - RxDtcsCode: RX DCS code
 * - CrossMode: Cross mode
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
    // Calculate offset
    const offset = channel.txFrequency - channel.rxFrequency;
    let duplex = 'off';
    let offsetStr = '';
    
    if (Math.abs(offset) < 0.0001) {
      duplex = 'off';
      offsetStr = '0';
    } else if (offset > 0) {
      duplex = '+';
      offsetStr = offset.toFixed(6);
    } else {
      duplex = '-';
      offsetStr = Math.abs(offset).toFixed(6);
    }

    // Determine tone mode (CHIRP expects '' for no tone). rToneFreq/cToneFreq must be
    // a valid CTCSS frequency (CHIRP rejects 0.0). When Tone is '', CHIRP ignores the values;
    // use 88.5 Hz as a standard placeholder so validation passes.
    const NO_TONE_PLACEHOLDER = '88.5';
    // When no DCS, CHIRP requires a valid DCS code; many drivers don't support 000. Use 023 (sample CSV); Tone='' means it's ignored.
    const NO_DCS_PLACEHOLDER = '023';
    let tone = '';
    let rToneFreq = NO_TONE_PLACEHOLDER;
    let cToneFreq = NO_TONE_PLACEHOLDER;
    let dtcsCode = NO_DCS_PLACEHOLDER;
    // CHIRP DtcsPolarity must be one of 'NN', 'NR', 'RN', 'RR' (RX then TX)
    let dtcsPolarity = 'NN';
    let rxDtcsCode = NO_DCS_PLACEHOLDER;

    // RX tone
    if (channel.rxCtcssDcs.type === 'CTCSS' && channel.rxCtcssDcs.value) {
      rToneFreq = channel.rxCtcssDcs.value.toFixed(1);
      if (channel.txCtcssDcs.type === 'CTCSS' && channel.txCtcssDcs.value) {
        cToneFreq = channel.txCtcssDcs.value.toFixed(1);
        if (rToneFreq === cToneFreq) {
          tone = 'TSQL';
        } else {
          tone = 'Cross';
        }
      } else {
        tone = 'Tone';
      }
    } else if (channel.rxCtcssDcs.type === 'DCS' && channel.rxCtcssDcs.value) {
      rxDtcsCode = channel.rxCtcssDcs.value.toString().padStart(3, '0');
      const rxPol = channel.rxCtcssDcs.polarity === 'P' ? 'R' : 'N';
      const txPol = (channel.txCtcssDcs.type === 'DCS' && channel.txCtcssDcs.polarity === 'P') ? 'R' : 'N';
      dtcsPolarity = rxPol + txPol;
      if (channel.txCtcssDcs.type === 'DCS' && channel.txCtcssDcs.value) {
        dtcsCode = channel.txCtcssDcs.value.toString().padStart(3, '0');
        if (rxDtcsCode === dtcsCode) {
          tone = 'DTCS';
        } else {
          tone = 'Cross';
        }
      } else {
        tone = 'DTCS-R';
      }
    }

    // TX tone (if not already set)
    if (cToneFreq === NO_TONE_PLACEHOLDER && channel.txCtcssDcs.type === 'CTCSS' && channel.txCtcssDcs.value) {
      cToneFreq = channel.txCtcssDcs.value.toFixed(1);
    }
    if (dtcsCode === NO_DCS_PLACEHOLDER && channel.txCtcssDcs.type === 'DCS' && channel.txCtcssDcs.value) {
      dtcsCode = channel.txCtcssDcs.value.toString().padStart(3, '0');
      const rxPol = channel.rxCtcssDcs.polarity === 'P' ? 'R' : 'N';
      const txPol = channel.txCtcssDcs.polarity === 'P' ? 'R' : 'N';
      dtcsPolarity = rxPol + txPol;
    }

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
      tone,
      rToneFreq,
      cToneFreq,
      dtcsCode,
      dtcsPolarity,
      rxDtcsCode,
      'Tone->Tone', // CrossMode (CHIRP requires a valid value; sample uses Tone->Tone when not Cross)
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

