import { describe, it, expect } from 'vitest';
import {
  isNoTxFrequency,
  isRxInNoTxBand,
  isValidFrequencyRange,
  isValidChannelFrequency,
  isValidFrequency,
  getFrequencyBand,
  NO_TX_FREQUENCY,
} from '../../src/services/validation/frequencyValidator';
import { validateChannel } from '../../src/services/validation/channelValidator';
import { DEFAULT_BAND_LIMITS } from '../../src/types/radioCapabilities';
import type { Channel } from '../../src/models/Channel';

// ─── frequencyValidator ──────────────────────────────────────────────────────

describe('isNoTxFrequency', () => {
  it('recognises the sentinel value', () => {
    expect(isNoTxFrequency(NO_TX_FREQUENCY)).toBe(true);
    expect(isNoTxFrequency(1666.0)).toBe(true);
  });

  it('rejects normal frequencies', () => {
    expect(isNoTxFrequency(146.52)).toBe(false);
    expect(isNoTxFrequency(440.0)).toBe(false);
    expect(isNoTxFrequency(1667.0)).toBe(false);
  });
});

describe('isRxInNoTxBand', () => {
  it('identifies aviation/FM receive-only band', () => {
    expect(isRxInNoTxBand(87)).toBe(true);
    expect(isRxInNoTxBand(120)).toBe(true);
    expect(isRxInNoTxBand(135.9)).toBe(true);
  });

  it('rejects frequencies outside the band', () => {
    expect(isRxInNoTxBand(86.9)).toBe(false);
    expect(isRxInNoTxBand(136)).toBe(false); // upper bound is exclusive
    expect(isRxInNoTxBand(146.52)).toBe(false);
  });
});

describe('isValidFrequencyRange', () => {
  it('accepts VHF frequencies within default limits', () => {
    expect(isValidFrequencyRange(87)).toBe(true);  // bottom of VHF
    expect(isValidFrequencyRange(146.52)).toBe(true);
    expect(isValidFrequencyRange(174)).toBe(true);  // top of VHF
  });

  it('accepts UHF frequencies within default limits', () => {
    expect(isValidFrequencyRange(400)).toBe(true);
    expect(isValidFrequencyRange(440)).toBe(true);
    expect(isValidFrequencyRange(470)).toBe(true);
  });

  it('rejects out-of-band frequencies', () => {
    expect(isValidFrequencyRange(300)).toBe(false); // between VHF and UHF
    expect(isValidFrequencyRange(50)).toBe(false);
    expect(isValidFrequencyRange(500)).toBe(false);
  });

  it('uses custom band limits when provided', () => {
    const limits = { vhfMin: 136, vhfMax: 174, uhfMin: 400, uhfMax: 480 };
    expect(isValidFrequencyRange(136, limits)).toBe(true);
    expect(isValidFrequencyRange(87, limits)).toBe(false); // outside custom VHF min
    expect(isValidFrequencyRange(475, limits)).toBe(true); // inside custom UHF max
  });
});

describe('isValidChannelFrequency', () => {
  function ch(rx: number, tx: number, forbidTx = false): Channel {
    return { rxFrequency: rx, txFrequency: tx, forbidTx } as unknown as Channel;
  }

  it('accepts a valid VHF simplex channel', () => {
    expect(isValidChannelFrequency(ch(146.52, 146.52))).toBe(true);
  });

  it('accepts a valid UHF channel', () => {
    expect(isValidChannelFrequency(ch(440.0, 445.0))).toBe(true);
  });

  it('rejects a channel with zero RX', () => {
    expect(isValidChannelFrequency(ch(0, 146.52))).toBe(false);
  });

  it('rejects a channel with zero TX (non no-TX band)', () => {
    expect(isValidChannelFrequency(ch(146.52, 0))).toBe(false);
  });

  it('accepts a no-TX aviation channel (RX in 87-136, forbidTx, sentinel TX)', () => {
    expect(isValidChannelFrequency(ch(120.0, NO_TX_FREQUENCY, true))).toBe(true);
  });

  it('rejects a no-TX aviation channel when forbidTx is false', () => {
    // TX sentinel but forbidTx not set — not a valid no-TX channel
    expect(isValidChannelFrequency(ch(120.0, NO_TX_FREQUENCY, false))).toBe(false);
  });
});

describe('isValidFrequency', () => {
  it('returns false for zero or negative', () => {
    expect(isValidFrequency(0)).toBe(false);
    expect(isValidFrequency(-1)).toBe(false);
  });

  it('returns true for any positive frequency when no band limits given', () => {
    expect(isValidFrequency(300)).toBe(true); // no limits = anything goes
  });

  it('applies band limits when provided', () => {
    expect(isValidFrequency(146.52, DEFAULT_BAND_LIMITS)).toBe(true);
    expect(isValidFrequency(300, DEFAULT_BAND_LIMITS)).toBe(false);
  });
});

describe('getFrequencyBand', () => {
  it('returns Unknown when no band limits provided', () => {
    expect(getFrequencyBand(146.52)).toBe('Unknown');
  });

  it('identifies VHF', () => {
    expect(getFrequencyBand(146.52, DEFAULT_BAND_LIMITS)).toBe('VHF');
  });

  it('identifies UHF', () => {
    expect(getFrequencyBand(440.0, DEFAULT_BAND_LIMITS)).toBe('UHF');
  });

  it('returns Unknown for out-of-band', () => {
    expect(getFrequencyBand(300, DEFAULT_BAND_LIMITS)).toBe('Unknown');
  });
});

// ─── channelValidator ────────────────────────────────────────────────────────

function validChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    number: 1,
    name: 'Test Channel',
    rxFrequency: 146.52,
    txFrequency: 146.52,
    mode: 'Analog',
    forbidTx: false,
    colorCode: 1,
    contactId: 1,
    ...overrides,
  } as unknown as Channel;
}

describe('validateChannel', () => {
  it('returns no errors for a valid analog channel', () => {
    expect(validateChannel(validChannel())).toHaveLength(0);
  });

  it('requires a non-empty name', () => {
    const errors = validateChannel(validChannel({ name: '' }));
    expect(errors.some(e => e.field === 'name')).toBe(true);
  });

  it('requires name 16 chars or fewer', () => {
    const errors = validateChannel(validChannel({ name: 'A'.repeat(17) }));
    expect(errors.some(e => e.field === 'name')).toBe(true);
  });

  it('accepts name of exactly 16 chars', () => {
    const errors = validateChannel(validChannel({ name: 'A'.repeat(16) }));
    expect(errors.some(e => e.field === 'name')).toBe(false);
  });

  it('requires positive RX frequency', () => {
    const errors = validateChannel(validChannel({ rxFrequency: 0 }));
    expect(errors.some(e => e.field === 'rxFrequency')).toBe(true);
  });

  it('requires positive TX frequency for non no-TX channels', () => {
    const errors = validateChannel(validChannel({ txFrequency: 0 }));
    expect(errors.some(e => e.field === 'txFrequency')).toBe(true);
  });

  it('accepts no-TX sentinel when RX is in 87-136 and forbidTx is set', () => {
    const ch = validChannel({ rxFrequency: 120.0, txFrequency: NO_TX_FREQUENCY, forbidTx: true });
    const errors = validateChannel(ch);
    expect(errors.some(e => e.field === 'txFrequency')).toBe(false);
  });

  it('rejects channel number below 1', () => {
    const errors = validateChannel(validChannel({ number: 0 }));
    expect(errors.some(e => e.field === 'number')).toBe(true);
  });

  it('rejects channel number above maxChannels', () => {
    const errors = validateChannel(validChannel({ number: 4001 }), null, 4000);
    expect(errors.some(e => e.field === 'number')).toBe(true);
  });

  it('accepts channel number at the maxChannels limit', () => {
    const errors = validateChannel(validChannel({ number: 4000 }), null, 4000);
    expect(errors.some(e => e.field === 'number')).toBe(false);
  });

  it('flags RX frequency outside band limits', () => {
    const errors = validateChannel(validChannel({ rxFrequency: 300, txFrequency: 300 }), DEFAULT_BAND_LIMITS);
    expect(errors.some(e => e.field === 'rxFrequency')).toBe(true);
  });

  it('accepts RX frequency within band limits', () => {
    const errors = validateChannel(validChannel(), DEFAULT_BAND_LIMITS);
    expect(errors.some(e => e.field === 'rxFrequency')).toBe(false);
  });

  it('validates color code for digital channels', () => {
    const ch = validChannel({ mode: 'Digital', colorCode: 16 }); // 16 is out of 0-15
    const errors = validateChannel(ch);
    expect(errors.some(e => e.field === 'colorCode')).toBe(true);
  });

  it('accepts valid color code 0-15 for digital channels', () => {
    const ch = validChannel({ mode: 'Digital', colorCode: 15, contactId: 1 });
    const errors = validateChannel(ch);
    expect(errors.some(e => e.field === 'colorCode')).toBe(false);
  });

  it('does not validate color code for analog channels', () => {
    const ch = validChannel({ mode: 'Analog', colorCode: 16 });
    const errors = validateChannel(ch);
    expect(errors.some(e => e.field === 'colorCode')).toBe(false);
  });

  it('flags contactId out of range for digital channels', () => {
    const ch = validChannel({ mode: 'Digital', colorCode: 1, contactId: 251 });
    const errors = validateChannel(ch);
    expect(errors.some(e => e.field === 'contactId')).toBe(true);
  });

  it('accepts contactId 0-250 for digital channels', () => {
    const ch = validChannel({ mode: 'Digital', colorCode: 1, contactId: 250 });
    const errors = validateChannel(ch);
    expect(errors.some(e => e.field === 'contactId')).toBe(false);
  });
});
