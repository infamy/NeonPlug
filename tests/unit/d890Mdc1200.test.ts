import { describe, it, expect } from 'vitest';
import {
  decodeMdcId,
  encodeMdcId,
  parseMdc1200Contact,
  occupiedMdcSlots,
  MDC_CALL_TYPE,
  D890_MDC1200,
} from '../../src/radios/d890uv/mdc1200';

/**
 * The two records exactly as captured, paired with the CPS grid that made them:
 *
 *   No.  Call Type      Private ID  Group ID
 *   1    Private Call   1111
 *   2    Group Call                 222
 */
const REC0 = Uint8Array.from([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x11, 0x11, ...new Array(0x38).fill(0),
]);
const REC1 = Uint8Array.from([
  0x00, 0x01, 0x00, 0x00, 0x22, 0x02, 0x00, 0x00, ...new Array(0x38).fill(0),
]);

describe('DA-7X2 MDC1200 address book', () => {
  it('decodes the two captured records to what the CPS displayed', () => {
    expect(parseMdc1200Contact(REC0, 0, 0)).toEqual({
      slot: 0, callType: MDC_CALL_TYPE.PRIVATE, id: 1111, name: '',
    });
    expect(parseMdc1200Contact(REC1, 0, 1)).toEqual({
      slot: 1, callType: MDC_CALL_TYPE.GROUP, id: 222, name: '',
    });
  });

  /**
   * The whole decode turns on this. Group ID 222 stored as `22 02` is 222 under
   * exactly one reading; every rival gives a different number, and each of them
   * would have looked correct against the Private ID alone.
   */
  it('reads the byte pair swapped — the only reading that yields 222', () => {
    expect(decodeMdcId(0x22, 0x02)).toBe(222);
    // The rivals, spelled out so a future change cannot quietly pick one.
    expect(0x22 | (0x02 << 8)).toBe(546);        // u16 LE
    expect((0x22 << 8) | 0x02).toBe(8706);       // u16 BE
    expect(2202).not.toBe(222);                  // straight BCD, high byte first
  });

  it('is consistent with the palindrome that could not settle it', () => {
    expect(decodeMdcId(0x11, 0x11)).toBe(1111);
  });

  it('round-trips both captured IDs', () => {
    expect(encodeMdcId(222)).toEqual([0x22, 0x02]);
    expect(encodeMdcId(1111)).toEqual([0x11, 0x11]);
    for (const id of [0, 1, 99, 222, 1111, 1234, 9999]) {
      const [lo, hi] = encodeMdcId(id);
      expect(decodeMdcId(lo, hi)).toBe(id);
    }
  });

  /** Group and Private are separate fields; only the selected one is populated. */
  it('reads the ID from the field the call type selects', () => {
    const swapped = Uint8Array.from(REC1);
    swapped[0x01] = MDC_CALL_TYPE.PRIVATE;
    // Same bytes, read as a private call: the private field is empty.
    expect(parseMdc1200Contact(swapped, 0, 0)?.id).toBe(0);
    expect(parseMdc1200Contact(REC1, 0, 0)?.id).toBe(222);
  });

  it('treats 0xFF call type as an empty slot', () => {
    expect(parseMdc1200Contact(new Uint8Array(0x40).fill(0xff), 0, 0)).toBeNull();
  });

  /** Presence comes from "not 0xFF", never from the byte's value. */
  it('reads the slot table by occupancy, not by index value', () => {
    const table = new Uint8Array(128).fill(0xff);
    table[0] = 0x00;
    table[1] = 0x01;
    expect(occupiedMdcSlots(table)).toEqual([0, 1]);
    // A compacted-list reading would put slot 1 first; occupancy does not care.
    const other = new Uint8Array(128).fill(0xff);
    other[0] = 0x01;
    expect(occupiedMdcSlots(other)).toEqual([0]);
    expect(D890_MDC1200.SLOTS).toBe(128);
  });
});
