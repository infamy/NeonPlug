import { describe, it, expect } from 'vitest';
import {
  encodeStatusMessage, parseStatusMessages, D890_STATUS_MESSAGES,
} from '../../src/radios/d890uv/statusMessages';
import { encodeHotKey, parseHotKeys, D890_HOT_KEYS } from '../../src/radios/d890uv/hotKeys';
import {
  encodeAnalogContact, parseAnalogContact, encodeAnalogSlotTable,
} from '../../src/radios/d890uv/analogAddressBook';
import {
  encodeMdc1200Contact, parseMdc1200Contact, encodeMdcSlotTable,
  parseMdcSlotIndices, MDC_CALL_TYPE, D890_MDC1200,
} from '../../src/radios/d890uv/mdc1200';
import {
  encodeSmsStore, parseSmsStore, D890_SMS_STORE,
} from '../../src/radios/d890uv/smsStore';
import {
  encodeDtmfSettings, parseDtmfSettings, encodeDtmfEncodeList, parseDtmfEncodeList,
} from '../../src/radios/d890uv/dtmf';
import {
  encodeTalkgroupLocator, parseTalkgroupLocator, talkgroupRecordAddress,
} from '../../src/radios/d890uv/talkgroupLocator';

/**
 * These encoders all PATCH. The tests that matter are not the round trips —
 * a patch encoder reproduces its input by construction — but the ones proving
 * that bytes NOBODY asked to change are still there afterwards.
 */
describe('DA-7X2 status message encoder', () => {
  const region = () => {
    const r = new Uint8Array(0x1530);
    // A hot key living in the same region, which a rebuild would destroy.
    r.set([0x00, 0x01, 0x01, 0x03, 0xff, 0xff, 0xff, 0xff, 0x03], 0x1030);
    r[0x1510] = 0x03;
    return r;
  };

  it('writes text and sets the presence bit together', () => {
    const out = encodeStatusMessage(region(), 2, 'On scene');
    expect(parseStatusMessages(out)).toEqual([{ slot: 2, text: 'On scene' }]);
    expect(out[0x1500] & 0b100).toBeTruthy();
  });

  it('leaves the hot keys in the same region untouched', () => {
    const before = region();
    const out = encodeStatusMessage(before, 0, 'Hello');
    expect(Array.from(out.subarray(0x1030, 0x1039)))
      .toEqual([0x00, 0x01, 0x01, 0x03, 0xff, 0xff, 0xff, 0xff, 0x03]);
    expect(out[0x1510]).toBe(0x03);
  });

  it('clears the bit when the text is emptied', () => {
    let out = encodeStatusMessage(region(), 1, 'temporary');
    expect(out[0x1500] & 0b10).toBeTruthy();
    out = encodeStatusMessage(out, 1, '');
    expect(out[0x1500] & 0b10).toBe(0);
  });

  /** An erased mask reads 0xFF; OR-ing into it would mark eight slots present. */
  it('does not treat an erased mask byte as seven other messages', () => {
    const r = region();
    r[0x1500] = 0xff;
    const out = encodeStatusMessage(r, 0, 'first');
    expect(parseStatusMessages(out)).toEqual([{ slot: 0, text: 'first' }]);
  });

  it('writes a full-length message with no terminator', () => {
    const text = 'There is also a Status Message 1';
    expect(text.length).toBe(D890_STATUS_MESSAGES.MAX_CHARS);
    const out = encodeStatusMessage(region(), 1, text);
    expect(parseStatusMessages(out)[0].text).toBe(text);
  });

  it('refuses a slot the radio does not have', () => {
    expect(() => encodeStatusMessage(region(), 32, 'x')).toThrow(/outside/);
  });
});

describe('DA-7X2 hot key encoder', () => {
  const region = () => {
    const r = new Uint8Array(0x1530);
    for (let i = 0; i < 18; i += 1) {
      r.set([0x00, 0x01, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff], 0x1000 + i * 0x30);
    }
    // Status message text in the same region.
    r.set([0x48, 0x00, 0x69, 0x00], 0x100);
    r[0x1500] = 0x01;
    return r;
  };

  it('writes one entry and leaves the other seventeen alone', () => {
    const out = encodeHotKey(region(), 1, {
      mode: 0, menu: 1, callType: 1, digiCallType: 3, callObject: null, contentSmsIndex: 3,
    });
    const keys = parseHotKeys(out);
    expect(keys[1]).toMatchObject({ callType: 1, digiCallType: 3, contentSmsIndex: 3 });
    for (const k of [0, 2, 17]) {
      expect(keys[k]).toMatchObject({ callType: 0, contentSmsIndex: null });
    }
  });

  it('does not disturb the status messages sharing the region', () => {
    const out = encodeHotKey(region(), 0, {
      mode: 1, menu: 1, callType: 0, digiCallType: 0, callObject: null, contentSmsIndex: null,
    });
    expect(parseStatusMessages(out)).toEqual([{ slot: 0, text: 'Hi' }]);
  });

  it('writes Off as the 0xFFFFFFFF the grid shows', () => {
    const out = encodeHotKey(region(), 0, {
      mode: 0, menu: 1, callType: 0, digiCallType: 0, callObject: null, contentSmsIndex: null,
    });
    expect(Array.from(out.subarray(0x1004, 0x1008))).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect(parseHotKeys(out)[0].callObject).toBeNull();
  });

  it('refuses a slot past the eighteen the grid has', () => {
    expect(() => encodeHotKey(region(), 18, {
      mode: 0, menu: 1, callType: 0, digiCallType: 0, callObject: null, contentSmsIndex: null,
    })).toThrow(/outside/);
    expect(D890_HOT_KEYS.SLOTS).toBe(18);
  });
});

describe('DA-7X2 analog address book encoder', () => {
  it('round-trips digits and name, and writes the count', () => {
    const rec = new Uint8Array(0x40).fill(0xff);
    const out = encodeAnalogContact(rec, 0, { digits: '654321', name: 'ANA Contact' });
    expect(out[0x07]).toBe(6);
    expect(parseAnalogContact(out, 0, 0)).toEqual({ slot: 0, digits: '654321', name: 'ANA Contact' });
  });

  /** The count is what makes an odd digit run readable at all. */
  it('writes an odd-length number so it reads back exactly', () => {
    const out = encodeAnalogContact(new Uint8Array(0x40), 0, { digits: '12345', name: 'X' });
    expect(out[0x07]).toBe(5);
    expect(Array.from(out.subarray(0, 4))).toEqual([0x12, 0x34, 0x50, 0x00]);
    expect(parseAnalogContact(out, 0, 0)?.digits).toBe('12345');
  });

  it('builds both halves of the slot table, absent as 0xFFFF', () => {
    const [low, high] = encodeAnalogSlotTable([0, 1, 2]);
    expect(Array.from(low.subarray(0, 4))).toEqual([0, 1, 2, 0xff]);
    expect(Array.from(high.subarray(0, 4))).toEqual([0, 0, 0, 0xff]);
  });
});

describe('DA-7X2 MDC1200 encoder', () => {
  it('writes the ID into the field the call type selects', () => {
    const base = new Uint8Array(0x40).fill(0xff);
    const group = encodeMdc1200Contact(base, 0, {
      callType: MDC_CALL_TYPE.GROUP, type: 0, ack: 0, id: 546, name: '',
    });
    expect(Array.from(group.subarray(0x04, 0x08))).toEqual([0x22, 0x02, 0x00, 0x00]);
    const priv = encodeMdc1200Contact(base, 0, {
      callType: MDC_CALL_TYPE.PRIVATE, type: 5, ack: 1, id: 1234, name: 'MDCNAME',
    });
    expect(Array.from(priv.subarray(0x04, 0x08))).toEqual([0x00, 0x00, 0xd2, 0x04]);
    expect(parseMdc1200Contact(priv, 0, 0)).toMatchObject({ id: 1234, type: 5, ack: 1, name: 'MDCNAME' });
  });

  it('reproduces the captured record byte for byte', () => {
    const out = encodeMdc1200Contact(new Uint8Array(0x40), 0, {
      callType: MDC_CALL_TYPE.PRIVATE, type: 5, ack: 1, id: 1234, name: 'MDCNAME',
    });
    expect(Array.from(out.subarray(0, 8))).toEqual([0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0xd2, 0x04]);
  });

  it('slot table round-trips through the u16 reading', () => {
    const [low, high] = encodeMdcSlotTable([0, 1, 2, 3]);
    const idx = parseMdcSlotIndices(low, high);
    expect(idx.slice(0, 5)).toEqual([0, 1, 2, 3, null]);
    expect(D890_MDC1200.SLOTS).toBe(128);
  });
});

describe('DA-7X2 SMS store encoder', () => {
  it('chains the occupied slots and points the head at the first', () => {
    const { envelopes, valid, head } = encodeSmsStore(
      new Uint8Array(D890_SMS_STORE.SLOTS * D890_SMS_STORE.STRIDE),
      [{ slot: 0 }, { slot: 1 }, { slot: 2 }]
    );
    expect(head).toBe(0);
    expect(parseSmsStore(envelopes, valid, head).map((e) => e.slot)).toEqual([0, 1, 2]);
    expect(envelopes[2 * D890_SMS_STORE.STRIDE + 0x02]).toBe(D890_SMS_STORE.END);
  });

  /**
   * The hardware-confirmed delete: slot 0 retires, the survivors do NOT move.
   * This is the opposite of the analog address book and the reason both
   * behaviours are spelled out rather than shared.
   */
  it('retires a slot without renumbering the survivors', () => {
    const { envelopes, valid, head } = encodeSmsStore(
      new Uint8Array(D890_SMS_STORE.SLOTS * D890_SMS_STORE.STRIDE),
      [{ slot: 1 }, { slot: 2 }, { slot: 3 }, { slot: 4 }]
    );
    expect(head).toBe(1);
    expect(valid[0]).toBe(0xff);
    expect(Array.from(valid.subarray(1, 5))).toEqual([0, 0, 0, 0]);
    expect(parseSmsStore(envelopes, valid, head).map((e) => e.slot)).toEqual([1, 2, 3, 4]);
  });

  it('reports an empty store as a head of 0xFF', () => {
    const { valid, head } = encodeSmsStore(new Uint8Array(1600), []);
    expect(head).toBe(D890_SMS_STORE.END);
    expect(valid.every((b) => b === 0xff)).toBe(true);
  });
});

describe('DA-7X2 DTMF encoder', () => {
  const settings = {
    interCode: 0x0e, groupCode: 0x0a, decodingResponse: 0,
    pretimeMs: 420, firstDigitMs: 310, timeLapseAfterEncodeMs: 530,
    selfId: '001', sideTone: 1, strings: ['', '', '', ''],
  };

  it('writes the hardware-assigned timings as milliseconds over ten', () => {
    const out = encodeDtmfSettings(new Uint8Array(0x50), settings);
    expect(out[0x03]).toBe(0x2a);   // 420 ms
    expect(out[0x04]).toBe(0x1f);   // 310 ms
    expect(out[0x0a]).toBe(0x35);   // 530 ms
    expect(parseDtmfSettings(out)).toMatchObject({
      pretimeMs: 420, firstDigitMs: 310, timeLapseAfterEncodeMs: 530,
    });
  });

  /**
   * The unassigned bytes must survive a write untouched.
   *
   * 0x05 and 0x0b are the two timings the hardware write could not vary (Auto
   * Reset Time and PTT ID Pause are consistent with them but not pinned), and
   * 0x0c / 0x0d / 0x0e / 0x0f are unmodelled. Writing a byte whose meaning is
   * unknown is the change that breaks a radio.
   *
   * Note 0x4f is NOT in this set: the block is fully accounted for — 0x00-0x0f
   * settings then four 16-byte digit strings at 0x10/0x20/0x30/0x40 — so 0x4f is
   * the last byte of the stun string and the encoder is right to write it.
   */
  it('does not write the bytes whose meaning is unknown', () => {
    const original = new Uint8Array(0x50).fill(0);
    original[0x05] = 0xa5;
    original[0x0b] = 0x5a;
    original[0x0c] = 0x3c;
    original[0x0d] = 0xc3;
    original[0x0e] = 0x11;
    original[0x0f] = 0x22;
    const out = encodeDtmfSettings(original, settings);
    expect([out[0x05], out[0x0b], out[0x0c], out[0x0d], out[0x0e], out[0x0f]])
      .toEqual([0xa5, 0x5a, 0x3c, 0xc3, 0x11, 0x22]);
  });

  it('keeps encode-list entries at their index, empty ones padded', () => {
    const out = encodeDtmfEncodeList(['', '123123123', '', '#0*']);
    expect(Array.from(out.subarray(0x10, 0x19))).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
    expect(parseDtmfEncodeList(out)[1]).toBe('123123123');
    expect(parseDtmfEncodeList(out)[3]).toBe('#0*');
    expect(parseDtmfEncodeList(out)[0]).toBe('');
  });

  it('refuses a character that is not a DTMF digit', () => {
    expect(() => encodeDtmfEncodeList(['12G'])).toThrow(/not a DTMF digit/);
  });
});

describe('DA-7X2 talk group locator', () => {
  /**
   * The rule that a packed 0..N-1 would break. With contiguous slots the two
   * readings coincide, which is exactly why every capture looked like an
   * identity table and the region went unexplained for so long.
   */
  it('stores the SLOT INDEX, not a packed sequence', () => {
    const out = encodeTalkgroupLocator([0, 1, 5, 9]);
    expect(parseTalkgroupLocator(out)).toEqual([0, 1, 5, 9]);
    // Slot 5 holds 5, not 2 — a packed list would have written 2 there.
    expect(Array.from(out.subarray(5 * 4, 5 * 4 + 4))).toEqual([5, 0, 0, 0]);
    // And the holes are absent, not zero.
    expect(Array.from(out.subarray(2 * 4, 2 * 4 + 4))).toEqual([0xff, 0xff, 0xff, 0xff]);
  });

  it('agrees with the hardware-measured banking rule', () => {
    expect(talkgroupRecordAddress(0)).toBe(0x3a00000);
    expect(talkgroupRecordAddress(999)).toBe(0x3a00000 + 999 * 0xc8);
    // The measurement that settled it: record 1000 is at 0x3A80000, and
    // 0x3A30D40 — where a flat array puts it — reads back 0xFF on the radio.
    expect(talkgroupRecordAddress(1000)).toBe(0x3a80000);
    expect(talkgroupRecordAddress(1000)).not.toBe(0x3a30d40);
    expect(talkgroupRecordAddress(1009)).toBe(0x3a80000 + 9 * 0xc8);
  });

  it('marks absence by the high byte, as the CPS does', () => {
    const bytes = new Uint8Array(16).fill(0);
    bytes[3] = 0x80;          // bit 31 set on slot 0
    expect(parseTalkgroupLocator(bytes)).toEqual([0, 0, 0]);
  });

  it('writes the whole table the CPS writes', () => {
    expect(encodeTalkgroupLocator([]).length).toBe(40000);
  });
});
