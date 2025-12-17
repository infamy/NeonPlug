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
 * - Tone: Tone mode (Tone, TSQL, DTCS, Cross, None)
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

    // Determine tone mode
    let tone = 'None';
    let rToneFreq = '';
    let cToneFreq = '';
    let dtcsCode = '';
    let dtcsPolarity = '';
    let rxDtcsCode = '';

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
      rxDtcsCode = channel.rxCtcssDcs.value.toString();
      dtcsPolarity = channel.rxCtcssDcs.polarity || 'N';
      if (channel.txCtcssDcs.type === 'DCS' && channel.txCtcssDcs.value) {
        dtcsCode = channel.txCtcssDcs.value.toString();
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
    if (!cToneFreq && channel.txCtcssDcs.type === 'CTCSS' && channel.txCtcssDcs.value) {
      cToneFreq = channel.txCtcssDcs.value.toFixed(1);
    }
    if (!dtcsCode && channel.txCtcssDcs.type === 'DCS' && channel.txCtcssDcs.value) {
      dtcsCode = channel.txCtcssDcs.value.toString();
      if (!dtcsPolarity) {
        dtcsPolarity = channel.txCtcssDcs.polarity || 'N';
      }
    }

    // Determine mode
    let mode = 'FM';
    if (channel.mode === 'Digital' || channel.mode === 'Fixed Digital') {
      mode = 'DV';
    } else if (channel.bandwidth === '12.5kHz') {
      mode = 'NFM';
    } else {
      mode = 'FM';
    }

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

    // Power level - Chirp typically uses "High", "Low", "Medium" or sometimes "H", "L", "M"
    // Based on the sample CSV showing "50W", Chirp may also accept wattage, but we'll use standard values
    // Most Chirp exports use "High" and "Low", but some use "H" and "L"
    // We'll use "High"/"Low"/"Medium" as that's the most compatible format
    let power: string;
    switch (channel.power) {
      case 'Low':
        power = 'Low';
        break;
      case 'Medium':
        power = 'Medium';
        break;
      case 'High':
        power = 'High';
        break;
      default:
        // Default to High if power is somehow undefined or invalid
        console.warn(`Channel ${channel.number} has invalid power value: ${channel.power}, defaulting to High`);
        power = 'High';
        break;
    }

    // Comment
    const comment = channel.source || '';

    // Digital fields
    const urcall = '';
    const rpt1call = '';
    const rpt2call = '';
    const dvcode = channel.mode === 'Digital' || channel.mode === 'Fixed Digital' 
      ? (channel.contactId > 0 ? channel.contactId.toString() : '')
      : '';

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
      '', // CrossMode
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

