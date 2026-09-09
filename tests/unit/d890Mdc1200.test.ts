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
  /**
   * Records from the hardware write capture of 2026-09-08, plus the CSV the CPS
   * exported for the same codeplug:
   *
   *   slot 0  00 00 00 00 00 00 11 11              PRI_ID 4369
   *   slot 1  00 01 00 00 22 02 00 00              GROUP_ID 546
   *   slot 2  05 00 01 00 00 00 d2 04 MDCNAME      Type ALARM, ACK On, PRI_ID 1234
   */
  const rec = (...head: number[]) =>
    Uint8Array.from([...head, ...new Array(0x40 - head.length).fill(0)]);
  const NAME = [0x4d, 0x00, 0x44, 0x00, 0x43, 0x00, 0x4e, 0x00,
                0x41, 0x00, 0x4d, 0x00, 0x45, 0x00];

  it('decodes the captured records to the values the CPS exported', () => {
    expect(parseMdc1200Contact(rec(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x11, 0x11), 0, 0))
      .toMatchObject({ callType: MDC_CALL_TYPE.PRIVATE, id: 4369 });
    expect(parseMdc1200Contact(rec(0x00, 0x01, 0x00, 0x00, 0x22, 0x02, 0x00, 0x00), 0, 1))
      .toMatchObject({ callType: MDC_CALL_TYPE.GROUP, id: 546 });
    expect(parseMdc1200Contact(rec(0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0xd2, 0x04, ...NAME), 0, 2))
      .toMatchObject({ callType: MDC_CALL_TYPE.PRIVATE, type: 5, ack: 1, id: 1234, name: 'MDCNAME' });
  });

  /**
   * The discriminating value, and the regression guard.
   *
   * This was decoded as byte-swapped BCD on 2026-09-07 from two values that
   * could not tell the encodings apart: 1111 is a palindrome, and `22 02` read
   * as BCD looks like "0222" which was mistaken for a believed 222. Writing
   * 1234 on hardware settled it — `d2 04` is 0x04D2, which no BCD reading
   * produces.
   */
  it('reads a plain little-endian uint16, not BCD', () => {
    expect(decodeMdcId(0xd2, 0x04)).toBe(1234);
    expect(decodeMdcId(0x22, 0x02)).toBe(546);
    // What the wrong readings would have given, spelled out so neither creeps back.
    expect(decodeMdcId(0x22, 0x02)).not.toBe(222);   // byte-swapped BCD
    expect(decodeMdcId(0x22, 0x02)).not.toBe(2202);  // straight BCD
    // The palindrome that settled nothing: same answer under every candidate.
    expect(decodeMdcId(0x11, 0x11)).toBe(4369);
  });

  it('round-trips the full 16-bit range', () => {
    expect(encodeMdcId(1234)).toEqual([0xd2, 0x04]);
    expect(encodeMdcId(546)).toEqual([0x22, 0x02]);
    for (const id of [0, 1, 546, 1234, 4369, 9999, 65535]) {
      const [lo, hi] = encodeMdcId(id);
      expect(decodeMdcId(lo, hi)).toBe(id);
    }
  });

  /** Group and Private are separate fields; the call type selects which is live. */
  it('reads the ID from the field the call type selects', () => {
    const groupRow = rec(0x00, 0x01, 0x00, 0x00, 0x22, 0x02, 0x00, 0x00);
    expect(parseMdc1200Contact(groupRow, 0, 0)?.id).toBe(546);
    const asPrivate = Uint8Array.from(groupRow);
    asPrivate[0x01] = MDC_CALL_TYPE.PRIVATE;
    expect(parseMdc1200Contact(asPrivate, 0, 0)?.id).toBe(0);
  });

  it('treats 0xFF call type as an empty slot', () => {
    expect(parseMdc1200Contact(new Uint8Array(0x40).fill(0xff), 0, 0)).toBeNull();
  });

  /**
   * ⚠️ Occupancy, never the byte's VALUE. Hardware confirmed 2026-09-08 that
   * deleting an entry COMPACTS the records and renumbers this table, so a slot
   * index is not a stable identifier — the compacted-list reading won.
   */
  it('reads the slot table by occupancy, not by index value', () => {
    const table = new Uint8Array(128).fill(0xff);
    table.set([0x00, 0x01, 0x02, 0x03], 0);
    expect(occupiedMdcSlots(table)).toEqual([0, 1, 2, 3]);
    expect(D890_MDC1200.SLOTS).toBe(128);
  });
});
