import { describe, it, expect } from 'vitest';
import {
  parseEmergencySettings,
  parseEmergencyContact,
  D890_EMERGENCY,
} from '../../src/radios/d890uv/emergency';

describe('DA-7X2 emergency / alarm', () => {
  it('decodes the contact bytes a real radio returned', () => {
    // Dumped from 0x3482e00: 01 00 12 34 56 78, then 0xFF.
    const b = new Uint8Array(0x30).fill(0xff);
    b.set([0x01, 0x00, 0x12, 0x34, 0x56, 0x78]);
    const c = parseEmergencyContact(b)!;
    expect(c.callType).toBe(1);
    expect(c.ring).toBe(0);
    // BCD, the same ID encoding used by the analog address book.
    expect(c.code).toBe(12345678);
  });

  it('masks Ring to the low nibble, as the vendor does', () => {
    const b = new Uint8Array(0x30);
    b.set([0x01, 0xa3, 0x00, 0x00, 0x00, 0x00]);
    expect(parseEmergencyContact(b)!.ring).toBe(3);
  });

  it('returns a null code rather than a number when the field is not BCD', () => {
    // An erased contact must not decode as a plausible-looking ID.
    const erased = new Uint8Array(0x30).fill(0xff);
    expect(parseEmergencyContact(erased)!.code).toBeNull();
  });

  it('mirrors the analog block into a digital one, which the hardware dump shows', () => {
    // A radio dump of 0x3483000 showed `0a 0a 3c` twice at matching relative
    // offsets. That is Time/Tx_Time/Rx_Time at +0x03 and the digital twins at
    // +0x0B — 10 s, 10 s, 60 s, twice. This asserts that reading.
    const b = new Uint8Array(0x30);
    b.set([0x00, 0x02, 0x00, 0x0a, 0x0a, 0x3c, 0x00, 0x00,
           0x01, 0x01, 0x00, 0x0a, 0x0a, 0x3c, 0x37, 0x00,
           0x01, 0x01, 0x09, 0x09, 0x00, 0x01]);
    const s = parseEmergencySettings(b)!;
    expect([s.alarmTime, s.txDuration, s.rxDuration]).toEqual([10, 10, 60]);
    expect([s.digitalAlarmTime, s.digitalTxDuration, s.digitalRxDuration]).toEqual([10, 10, 60]);
  });

  it('treats a high channel byte above 0x80 as "no channel"', () => {
    // The vendor's reader clamps this. Without it a byte pair like FF FF reads
    // as channel 65535 rather than as unset.
    const b = new Uint8Array(0x30);
    b[0x06] = 0xff; b[0x07] = 0xff;
    expect(parseEmergencySettings(b)!.analogChannel).toBeNull();
    const c = new Uint8Array(0x30);
    c[0x06] = 0x2a; c[0x07] = 0x00;
    expect(parseEmergencySettings(c)!.analogChannel).toBe(42);
  });

  it('is two single records, not arrays', () => {
    expect(D890_EMERGENCY.SETTINGS).toBe(0x3483000);
    expect(D890_EMERGENCY.CONTACT).toBe(0x3482e00);
    expect(D890_EMERGENCY.SIZE).toBe(0x30);
  });

  it('returns null on a short buffer rather than a zeroed record', () => {
    expect(parseEmergencySettings(new Uint8Array(4))).toBeNull();
    expect(parseEmergencyContact(new Uint8Array(2))).toBeNull();
  });
});
