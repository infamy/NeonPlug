import { describe, it, expect } from 'vitest';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import {
  parseStatusMessages,
  occupiedStatusSlots,
  parseStatusMessage,
  D890_STATUS_MESSAGES,
} from '../../src/radios/d890uv/statusMessages';
import {
  parseAnalogContact,
  parseAnalogAddressBook,
  D890_ANALOG_ADDRESS_BOOK,
} from '../../src/radios/d890uv/analogAddressBook';
import {
  parseHotKeys,
  D890_HOT_KEYS,
  HOT_KEY_MODE,
  HOT_KEY_CALL_TYPE,
  HOT_KEY_DIGI_CALL,
} from '../../src/radios/d890uv/hotKeys';

/** Build the 0x1530 hot-key region with the given slot texts and mask. */
function hotKeyRegion(texts: Record<number, string>, mask: number): Uint8Array {
  const r = new Uint8Array(0x1530);
  for (const [slot, text] of Object.entries(texts)) {
    const at = 0x100 + Number(slot) * 0x40;
    [...text].forEach((ch, i) => {
      r[at + i * 2] = ch.charCodeAt(0) & 0xff;
      r[at + i * 2 + 1] = ch.charCodeAt(0) >> 8;
    });
  }
  r[0x1500] = mask;
  return r;
}

describe('DA-7X2 hot-key status messages', () => {
  /**
   * The two states captured either side of a real CPS edit. The mask moving
   * 0x01 -> 0x07 in lockstep with slots 1 and 2 gaining text is the evidence
   * this decode rests on, so both states are pinned.
   */
  const BEFORE = hotKeyRegion({ 0: 'Status Message 1' }, 0x01);
  const AFTER = hotKeyRegion(
    { 0: 'Status Message 1', 1: 'New Status is here!', 2: 'There is also a Status Message 1' },
    0x07
  );

  it('reads the captured before state', () => {
    expect(occupiedStatusSlots(BEFORE)).toEqual([0]);
    expect(parseStatusMessages(BEFORE)).toEqual([{ slot: 0, text: 'Status Message 1' }]);
  });

  it('reads the captured after state', () => {
    expect(occupiedStatusSlots(AFTER)).toEqual([0, 1, 2]);
    expect(parseStatusMessages(AFTER).map((m) => m.text)).toEqual([
      'Status Message 1',
      'New Status is here!',
      'There is also a Status Message 1',
    ]);
  });

  /**
   * A full slot has no terminator — the captured message is exactly 32 chars
   * and fills 0x180..0x1bf to the last byte. Reading must stop at the slide
   * boundary rather than waiting for a NUL, or it runs into the next slot.
   */
  it('reads a full-length message without running into the next slot', () => {
    const text = 'There is also a Status Message 1';
    expect(text.length).toBe(D890_STATUS_MESSAGES.MAX_CHARS);
    const r = hotKeyRegion({ 1: text, 2: 'NEXT' }, 0x06);
    expect(parseStatusMessage(r, 1)).toBe(text);
    expect(parseStatusMessage(r, 2)).toBe('NEXT');
  });

  it('trusts the mask over stray text, and ignores erased flash', () => {
    // A slot with text but no bit is not a message the radio will send.
    const stale = hotKeyRegion({ 0: 'Status Message 1', 5: 'orphan' }, 0x01);
    expect(parseStatusMessages(stale)).toEqual([{ slot: 0, text: 'Status Message 1' }]);

    const erased = hotKeyRegion({}, 0xff);
    expect(occupiedStatusSlots(erased)).toEqual([]);
  });
});

describe('DA-7X2 analog (DTMF) address book', () => {
  /** The two real records, verbatim from the captures. */
  const REC0 = Uint8Array.from([
    0x12, 0x34, 0x50, 0x00, 0x00, 0x00, 0x00, 0x05,
    0x43, 0x00, 0x6f, 0x00, 0x6e, 0x00, 0x74, 0x00,
    0x61, 0x00, 0x63, 0x00, 0x74, 0x00, 0x31, 0x00,
    ...new Array(0x40 - 24).fill(0),
  ]);
  const REC1 = Uint8Array.from([
    0x65, 0x43, 0x21, 0x00, 0x00, 0x00, 0x00, 0x06,
    0x41, 0x00, 0x4e, 0x00, 0x41, 0x00, 0x20, 0x00,
    0x43, 0x00, 0x6f, 0x00, 0x6e, 0x00, 0x74, 0x00,
    0x61, 0x00, 0x63, 0x00, 0x74, 0x00, 0x00, 0x00,
    ...new Array(0x40 - 32).fill(0),
  ]);

  it('decodes both captured records', () => {
    expect(parseAnalogContact(REC0, 0, 0)).toEqual({
      slot: 0, digits: '12345', name: 'Contact1',
    });
    expect(parseAnalogContact(REC1, 0, 1)).toEqual({
      slot: 1, digits: '654321', name: 'ANA Contact',
    });
  });

  /**
   * The count byte is load-bearing. `12 34 50 00` with count 5 is "12345";
   * reading all four bytes would give "12345000" and reading three would give
   * "123450" — both plausible, both wrong.
   */
  it('uses the digit count rather than the buffer length', () => {
    const six = Uint8Array.from(REC0);
    six[0x07] = 6;
    expect(parseAnalogContact(six, 0, 0)?.digits).toBe('123450');
    expect(parseAnalogContact(REC0, 0, 0)?.digits).toBe('12345');
  });

  it('rejects an erased record instead of inventing a contact', () => {
    expect(parseAnalogContact(new Uint8Array(0x40).fill(0xff), 0, 0)).toBeNull();
    expect(parseAnalogContact(new Uint8Array(0x40), 0, 0)).toBeNull();
  });

  it('walks a table and skips the gaps', () => {
    const table = new Uint8Array(0x40 * 4).fill(0xff);
    table.set(REC0, 0);
    table.set(REC1, 0x40 * 2);
    const found = parseAnalogAddressBook(table);
    expect(found.map((c) => [c.slot, c.digits, c.name])).toEqual([
      [0, '12345', 'Contact1'],
      [2, '654321', 'ANA Contact'],
    ]);
    expect(D890_ANALOG_ADDRESS_BOOK.MAX_NAME_CHARS).toBe(27);
  });
});

describe('DA-7X2 hot keys', () => {
  /** The region as captured after the CPS edit, entries at 0x1000 + i*0x30. */
  function region(): Uint8Array {
    const r = new Uint8Array(0x1530);
    const DEFAULT = [0x00, 0x01, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff];
    for (let i = 0; i < 18; i += 1) r.set(DEFAULT, 0x1000 + i * 0x30);
    // Hot Key 1: Mode = Menu.
    r.set([0x01, 0x01, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff], 0x1000);
    // Hot Key 2: Call / Digital / DMR Hot / Content "Good bye!" (SMS index 3).
    r.set([0x00, 0x01, 0x01, 0x03, 0xff, 0xff, 0xff, 0xff, 0x03], 0x1030);
    r[0x1510] = 0x03;
    return r;
  }

  it('reads the grid the CPS displayed', () => {
    const keys = parseHotKeys(region());
    expect(keys).toHaveLength(D890_HOT_KEYS.SLOTS);

    // Hot Key 1 — the only row whose Mode is Menu.
    expect(keys[0].mode).toBe(HOT_KEY_MODE.MENU);

    // Hot Key 2 — every column the grid showed.
    expect(keys[1]).toMatchObject({
      mode: HOT_KEY_MODE.CALL,
      callType: HOT_KEY_CALL_TYPE.DIGITAL,
      digiCallType: HOT_KEY_DIGI_CALL.DMR_HOT,
      callObject: null,          // grid: "Off"
      contentSmsIndex: 3,        // grid: "Good bye!"
    });

    // Every remaining row is the untouched default.
    for (const k of keys.slice(2)) {
      expect(k.mode).toBe(HOT_KEY_MODE.CALL);
      expect(k.callType).toBe(HOT_KEY_CALL_TYPE.ANALOG);
      expect(k.callObject).toBeNull();
      expect(k.contentSmsIndex).toBeNull();
    }
  });

  /**
   * 18 slots is the CPS grid's own row count — 6 Hot Key rows plus 12 Fun — and
   * the byte table stops there too: entry 18 onward is all zeros, not defaults.
   */
  it('stops at 18 entries, matching the CPS grid', () => {
    expect(D890_HOT_KEYS.SLOTS).toBe(18);
    // The entries must end before the receive-group presence mask, which is
    // what 0x3701510 actually is — it was misread as a hot key mask until a
    // controlled CPS write settled it on 2026-09-10.
    expect(D890_HOT_KEYS.BASE + 18 * D890_HOT_KEYS.STRIDE)
      .toBeLessThan(D890_ADDR.RX_GROUP_SET);
  });
});
