import { describe, it, expect } from 'vitest';
import { createDefaultChannel, validateChannelForEncoding } from '../../src/utils/channelHelpers';

describe('createDefaultChannel', () => {
  it('returns a complete channel with sensible defaults', () => {
    const ch = createDefaultChannel();
    expect(ch.number).toBe(1);
    expect(ch.name).toBe('');
    expect(ch.rxFrequency).toBeCloseTo(146.52, 2);
    expect(ch.txFrequency).toBeCloseTo(146.52, 2);
    expect(ch.mode).toBe('Analog');
    expect(ch.bandwidth).toBe('25kHz');
    expect(ch.power).toBe('High');
    expect(ch.squelchLevel).toBe(3);
    expect(ch.forbidTx).toBe(false);
    expect(ch.colorCode).toBe(0);
    expect(ch.contactId).toBe(0);
  });

  it('applies overrides over defaults', () => {
    const ch = createDefaultChannel({ number: 42, name: 'Repeater', rxFrequency: 440.5 });
    expect(ch.number).toBe(42);
    expect(ch.name).toBe('Repeater');
    expect(ch.rxFrequency).toBeCloseTo(440.5, 1);
    expect(ch.mode).toBe('Analog'); // default still applied
  });

  it('defaults rxCtcssDcs and txCtcssDcs to None', () => {
    const ch = createDefaultChannel();
    expect(ch.rxCtcssDcs.type).toBe('None');
    expect(ch.txCtcssDcs.type).toBe('None');
  });

  it('override can set tone type', () => {
    const ch = createDefaultChannel({
      rxCtcssDcs: { type: 'CTCSS', value: 100 },
      txCtcssDcs: { type: 'CTCSS', value: 100 },
    });
    expect(ch.rxCtcssDcs.type).toBe('CTCSS');
    expect(ch.rxCtcssDcs.value).toBe(100);
  });

  it('returns a new object each call', () => {
    const a = createDefaultChannel();
    const b = createDefaultChannel();
    expect(a).not.toBe(b);
  });

  it('all unknown fields default to 0 or false', () => {
    const ch = createDefaultChannel();
    expect(ch.unknown1A_6_4).toBe(0);
    expect(ch.unknown1A_3).toBe(false);
    expect(ch.unknown1C_1_0).toBe(0);
    expect(ch.unknown1D_3_0).toBe(0);
    expect(ch.unknown2A).toBe(0);
  });
});

describe('validateChannelForEncoding', () => {
  it('returns true for a fully-specified channel', () => {
    const ch = createDefaultChannel({ name: 'Test' });
    expect(validateChannelForEncoding(ch)).toBe(true);
  });

  it('throws when name is missing', () => {
    const ch = createDefaultChannel() as any;
    delete ch.name;
    expect(() => validateChannelForEncoding(ch)).toThrow('name');
  });

  it('throws when rxFrequency is missing', () => {
    const ch = createDefaultChannel() as any;
    delete ch.rxFrequency;
    expect(() => validateChannelForEncoding(ch)).toThrow('rxFrequency');
  });

  it('throws when txFrequency is missing', () => {
    const ch = createDefaultChannel() as any;
    delete ch.txFrequency;
    expect(() => validateChannelForEncoding(ch)).toThrow('txFrequency');
  });

  it('throws when mode is missing', () => {
    const ch = createDefaultChannel() as any;
    delete ch.mode;
    expect(() => validateChannelForEncoding(ch)).toThrow('mode');
  });

  it('throws when rxCtcssDcs is missing', () => {
    const ch = createDefaultChannel() as any;
    delete ch.rxCtcssDcs;
    expect(() => validateChannelForEncoding(ch)).toThrow('rxCtcssDcs');
  });

  it('throws when txCtcssDcs is missing', () => {
    const ch = createDefaultChannel() as any;
    delete ch.txCtcssDcs;
    expect(() => validateChannelForEncoding(ch)).toThrow('txCtcssDcs');
  });
});
