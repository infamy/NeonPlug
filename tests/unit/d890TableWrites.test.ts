/**
 * Write-plan coverage for the six tables that had encoders but no write path.
 *
 * Each test here is the bench half of one row in `HW-ROUNDTRIP-TESTS.md`, using
 * the SAME value the hardware test calls for. That pairing is deliberate: this
 * file proves the plan emits the bytes we intend, and only the radio can prove
 * it accepts them. When a hardware test fails, the first question is whether
 * the corresponding test here still passes — if it does, the encoding is right
 * and the disagreement is about what the radio does with it.
 *
 * ⚠️ Nothing here has been sent to a radio. These are encoder assertions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planCodeplugWrite } from '../../src/radios/d890uv/codeplugWrite';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import { parseChannel, parseZone } from '../../src/radios/d890uv/structures';
import { D890_STATUS_MESSAGES } from '../../src/radios/d890uv/statusMessages';
import { D890_HOT_KEYS } from '../../src/radios/d890uv/hotKeys';
import { D890_ANALOG_ADDRESS_BOOK } from '../../src/radios/d890uv/analogAddressBook';
import { D890_MDC1200, MDC_CALL_TYPE } from '../../src/radios/d890uv/mdc1200';
import { D890_SMS_STORE } from '../../src/radios/d890uv/smsStore';
import { D890_DTMF, parseDtmfSettings } from '../../src/radios/d890uv/dtmf';
import type { Channel } from '../../src/models/Channel';

const DIR = join(__dirname, '../fixtures/d890uv');
const rec = (i: number) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`)));
const REAL_MASK = new Uint8Array(readFileSync(join(DIR, 'channel-mask-512.bin')));

const COUNTS = {
  DMRTalkGroups: 6, ScanList: 2, DMRReceiveGroupCallList: 1,
  RadioIDList: 4, AESEncryptionCode: 2,
};

/** The spans these tables live in, sized exactly as the readers fetch them. */
function tableReadLog(): Map<number, Uint8Array> {
  const log = new Map<number, Uint8Array>();
  // The hot-key region: status messages at +0x100, hot keys at +0x1000, and the
  // two masks. Filled with 0xFF the way erased flash reads, so the "0xFF is not
  // eight messages" handling is exercised rather than assumed away.
  const hotKeyRegion = new Uint8Array(0x1530).fill(0xff);
  hotKeyRegion.fill(0, 0x1000, 0x1530);
  log.set(0x3700000, hotKeyRegion);

  log.set(D890_ANALOG_ADDRESS_BOOK.SLOT_TABLE, new Uint8Array(128).fill(0xff));
  log.set(D890_ANALOG_ADDRESS_BOOK.SECOND_TABLE, new Uint8Array(128).fill(0xff));
  log.set(D890_ANALOG_ADDRESS_BOOK.BASE, new Uint8Array(0x40 * 4));

  log.set(D890_MDC1200.CONTACTS_SLOT_TABLE, new Uint8Array(128).fill(0xff));
  log.set(D890_MDC1200.CONTACTS_SLOT_TABLE + 0x100, new Uint8Array(128).fill(0xff));
  log.set(D890_MDC1200.CONTACTS, new Uint8Array(D890_MDC1200.STRIDE * 4));

  log.set(D890_SMS_STORE.ENVELOPES,
    new Uint8Array(D890_SMS_STORE.SLOTS * D890_SMS_STORE.STRIDE));
  log.set(D890_SMS_STORE.VALID, new Uint8Array(0x90).fill(0xff));

  log.set(D890_DTMF.SETTINGS, new Uint8Array(D890_DTMF.SETTINGS_BYTES));
  log.set(D890_DTMF.ENCODE,
    new Uint8Array(D890_DTMF.ENCODE_SLOTS * D890_DTMF.ENCODE_STRIDE).fill(0xff));
  return log;
}

function setup(tables: Parameters<typeof planCodeplugWrite>[0]['tables'] = {}) {
  const channels: Channel[] = [];
  const originals = new Map<number, Uint8Array>();
  for (let i = 0; i < 4; i += 1) {
    const bytes = rec(i);
    channels.push(parseChannel(bytes, i).channel);
    originals.set(i + 1, bytes);
  }

  const readLog = tableReadLog();
  const zoneMask = new Uint8Array(D890_ADDR.ZONE_SET_SIZE);
  zoneMask[0] |= 1;
  readLog.set(D890_ADDR.ZONE_SET, zoneMask);
  const members = new Uint8Array(D890_ADDR.ZONE_CHANNELS_STRIDE);
  members[2] = 0xff; members[3] = 0xff;
  const name = new Uint8Array(D890_ADDR.ZONE_NAME_STRIDE);
  name[0] = 0x5a; name[2] = 0x31;
  readLog.set(D890_ADDR.ZONE_CHANNELS, members);
  readLog.set(D890_ADDR.ZONE_NAMES, name);

  return {
    channels,
    zones: [parseZone(name, members, 0)],
    zoneSlots: [0],
    readLog,
    // Off, so every assertion below is about the ENCODERS. With it on the same
    // spans would also be written verbatim, and a passing test could mean the
    // preserve pass happened to carry the right bytes.
    writeUnmodelledVerbatim: false as const,
    channelInput: { originals, originalMask: REAL_MASK, counts: COUNTS, referencingTables: [] },
    tables,
  };
}

/** The frame covering `address`, and the byte at that address within it. */
function byteAt(plan: ReturnType<typeof planCodeplugWrite>, address: number): number | undefined {
  const frameAt = address - (address % 0x10);
  const frame = plan.frames.find((f) => f.address === frameAt);
  return frame?.data[address - frameAt];
}

function bytesAt(
  plan: ReturnType<typeof planCodeplugWrite>, address: number, length: number
): number[] {
  return Array.from({ length }, (_, i) => byteAt(plan, address + i) ?? -1);
}

describe('status messages', () => {
  it('writes slot 2 text and sets its mask bit', () => {
    // HW test: "Set slot 2 to RT test 2026". The mask is the real assertion —
    // a slot with text and a clear bit is not a message.
    const plan = planCodeplugWrite(setup({
      statusMessages: [{ slot: 2, text: 'RT test 2026' }],
    }));
    const at = D890_STATUS_MESSAGES.BASE + 2 * D890_STATUS_MESSAGES.STRIDE;
    expect(bytesAt(plan, at, 6)).toEqual([0x52, 0x00, 0x54, 0x00, 0x20, 0x00]);
    expect(byteAt(plan, D890_STATUS_MESSAGES.MASK)).toBe(0b100);
  });

  it('deleting a message clears its bit and leaves the text alone', () => {
    // The two halves are separable on purpose: the radio consults the mask, so
    // clearing the bit IS the delete, and wiping the text would be a change to
    // bytes the user never touched — noise in a round-trip diff.
    const log = tableReadLog();
    const region = log.get(0x3700000)!;
    const at = D890_STATUS_MESSAGES.BASE - 0x3700000 + D890_STATUS_MESSAGES.STRIDE;
    region.fill(0, at, at + D890_STATUS_MESSAGES.STRIDE);
    region[at] = 0x41; region[at + 1] = 0x00;
    region[D890_STATUS_MESSAGES.MASK - 0x3700000] = 0b10;

    const base = setup({ statusMessages: [] });
    const plan = planCodeplugWrite({ ...base, readLog: log });
    expect(byteAt(plan, D890_STATUS_MESSAGES.MASK)).toBe(0);
    expect(byteAt(plan, D890_STATUS_MESSAGES.BASE + D890_STATUS_MESSAGES.STRIDE)).toBe(0x41);
  });

  it('an erased 0xFF mask byte does not read as eight messages', () => {
    const plan = planCodeplugWrite(setup({ statusMessages: [{ slot: 0, text: 'A' }] }));
    expect(byteAt(plan, D890_STATUS_MESSAGES.MASK)).toBe(0b1);
  });
});

describe('hot keys', () => {
  it("writes one entry's SMS index without disturbing the other 17", () => {
    // HW test: "Set Hot Key 3's Content to a different predefined SMS". Hot Key
    // 3 is slot 2. The neighbours matter — they share the region with the
    // status messages, so a build-not-patch bug destroys all of them.
    const keys = Array.from({ length: D890_HOT_KEYS.SLOTS }, (_, slot) => ({
      slot, mode: 0, menu: 1, callType: 0, digiCallType: 0,
      callObject: null, contentSmsIndex: slot === 2 ? 5 : null,
    }));
    const plan = planCodeplugWrite(setup({ hotKeys: keys }));
    const entry = (slot: number) => D890_HOT_KEYS.BASE + slot * D890_HOT_KEYS.STRIDE;
    expect(byteAt(plan, entry(2) + 0x08)).toBe(5);
    expect(byteAt(plan, entry(1) + 0x08)).toBe(D890_HOT_KEYS.NONE_BYTE);
    expect(byteAt(plan, entry(3) + 0x08)).toBe(D890_HOT_KEYS.NONE_BYTE);
  });

  it('shares one span with the status messages instead of colliding', () => {
    // Two plans over 0x3700000 would trip the duplicate-address guard. This is
    // the test that the two encoders are chained over ONE buffer.
    const plan = planCodeplugWrite(setup({
      statusMessages: [{ slot: 0, text: 'Hi' }],
      hotKeys: [{ slot: 0, mode: 1, menu: 1, callType: 0, digiCallType: 0,
        callObject: null, contentSmsIndex: 3 }],
    }));
    expect(byteAt(plan, D890_STATUS_MESSAGES.BASE)).toBe(0x48);
    expect(byteAt(plan, D890_HOT_KEYS.BASE + 0x08)).toBe(3);
    expect(byteAt(plan, D890_HOT_KEYS.BASE)).toBe(1);
  });
});

describe('analog address book', () => {
  const contact = { slot: 0, digits: '7654321', name: 'RT Analog' };

  it('writes the record, the digit count and both slot-table halves', () => {
    const plan = planCodeplugWrite(setup({ analogContacts: [contact] }));
    const B = D890_ANALOG_ADDRESS_BOOK;
    // 7654321 packs high-nibble-first: 76 54 32 1_
    expect(bytesAt(plan, B.BASE, 4)).toEqual([0x76, 0x54, 0x32, 0x10]);
    expect(byteAt(plan, B.BASE + 0x07)).toBe(7);
    expect(byteAt(plan, B.SLOT_TABLE)).toBe(0);
    expect(byteAt(plan, B.SLOT_TABLE + 1)).toBe(0xff);
    // The high half is zero for a present slot, not 0xFF — 0xFF there would
    // make it index 0xFF00 + n, which is not a slot that exists.
    expect(byteAt(plan, B.SECOND_TABLE)).toBe(0);
  });

  it('COMPACTS on delete — the survivor moves down a slot', () => {
    // This book compacts and the SMS store does not. Having the two backwards
    // is the bug this pair of tests exists to catch.
    const plan = planCodeplugWrite(setup({
      analogContacts: [{ slot: 1, digits: '5551234', name: 'Second' }],
    }));
    const B = D890_ANALOG_ADDRESS_BOOK;
    // Written to slot 0 despite having been READ from slot 1.
    expect(bytesAt(plan, B.BASE, 4)).toEqual([0x55, 0x51, 0x23, 0x40]);
    expect(byteAt(plan, B.SLOT_TABLE)).toBe(0);
    expect(byteAt(plan, B.SLOT_TABLE + 1)).toBe(0xff);
  });

  it('builds a record for a slot the read never covered', () => {
    // Adding an entry puts it past the end of what was read. Safe for this
    // encoder alone: it writes every byte of the 0x40 it models.
    const plan = planCodeplugWrite(setup({
      analogContacts: [contact, { slot: 1, digits: '12345678', name: 'New' }],
    }));
    const B = D890_ANALOG_ADDRESS_BOOK;
    expect(byteAt(plan, B.BASE + B.STRIDE + 0x07)).toBe(8);
    expect(byteAt(plan, B.SLOT_TABLE + 1)).toBe(1);
  });
});

describe('MDC1200 address book', () => {
  it('writes a private ID as a little-endian u16 at +0x06', () => {
    // HW test uses 4321 — NOT a palindrome. 1111 was consistent with four
    // different encodings at once; the first non-palindrome settled it.
    const plan = planCodeplugWrite(setup({
      mdc1200Contacts: [{
        slot: 0, callType: MDC_CALL_TYPE.PRIVATE, type: 0, ack: 0,
        id: 4321, name: 'RTMDC',
      }],
    }));
    expect(bytesAt(plan, D890_MDC1200.CONTACTS + 0x06, 2)).toEqual([0xe1, 0x10]);
    // A private call leaves the group pair zeroed — that is how the parser
    // picks the live one.
    expect(bytesAt(plan, D890_MDC1200.CONTACTS + 0x04, 2)).toEqual([0, 0]);
    expect(byteAt(plan, D890_MDC1200.CONTACTS_SLOT_TABLE)).toBe(0);
    expect(byteAt(plan, D890_MDC1200.CONTACTS_SLOT_TABLE + 0x100)).toBe(0);
  });

  it('puts a group ID in the other pair', () => {
    const plan = planCodeplugWrite(setup({
      mdc1200Contacts: [{
        slot: 0, callType: MDC_CALL_TYPE.GROUP, type: 0, ack: 0, id: 4321, name: 'G',
      }],
    }));
    expect(bytesAt(plan, D890_MDC1200.CONTACTS + 0x04, 2)).toEqual([0xe1, 0x10]);
    expect(bytesAt(plan, D890_MDC1200.CONTACTS + 0x06, 2)).toEqual([0, 0]);
  });
});

describe('SMS store', () => {
  it('deleting a MIDDLE message repoints the chain and does not compact', () => {
    // HW test: delete message 2 of 3. Deleting the FIRST one cannot tell a
    // chain from a sequence; deleting a middle one can.
    const plan = planCodeplugWrite(setup({
      smsStore: [
        { slot: 0, next: 2, textSlot: 0, attr: 0, code: null },
        { slot: 2, next: null, textSlot: 2, attr: 0, code: null },
      ],
    }));
    const S = D890_SMS_STORE;
    // Slot 0's `next` now points past the hole to 2 — the survivor STAYED at
    // slot 2 rather than moving down, which is where this differs from the two
    // address books.
    expect(byteAt(plan, S.ENVELOPES + 0x02)).toBe(2);
    expect(byteAt(plan, S.ENVELOPES + 2 * S.STRIDE + 0x02)).toBe(S.END);
    expect(byteAt(plan, S.VALID + 0)).toBe(0x00);
    expect(byteAt(plan, S.VALID + 1)).toBe(S.END);
    expect(byteAt(plan, S.VALID + 2)).toBe(0x00);
    expect(byteAt(plan, S.HEAD)).toBe(0);
  });

  it('an empty store retires the head', () => {
    const plan = planCodeplugWrite(setup({ smsStore: [] }));
    expect(byteAt(plan, D890_SMS_STORE.HEAD)).toBe(D890_SMS_STORE.END);
  });
});

describe('DTMF', () => {
  const settings = () => ({
    ...parseDtmfSettings(new Uint8Array(D890_DTMF.SETTINGS_BYTES)),
    pretimeMs: 360,
    firstDigitMs: 250,
    timeLapseAfterEncodeMs: 470,
  });

  it('writes the three timings at their measured offsets and scale', () => {
    // HW test values. ⚠️ +0x03/+0x04/+0x0a are ms/10 while +0x05/+0x0b are RAW
    // seconds — running a seconds field through the ms path divides it by ten.
    const plan = planCodeplugWrite(setup({
      dtmf: { settings: settings(), encodeList: [] },
    }));
    expect(byteAt(plan, D890_DTMF.SETTINGS + 0x03)).toBe(0x24);
    expect(byteAt(plan, D890_DTMF.SETTINGS + 0x04)).toBe(0x19);
    expect(byteAt(plan, D890_DTMF.SETTINGS + 0x0a)).toBe(0x2f);
  });

  it('leaves the three unassigned bytes exactly as read', () => {
    const log = tableReadLog();
    const original = log.get(D890_DTMF.SETTINGS)!;
    original[0x01] = 0x0a; original[0x0c] = 0x5a; original[0x0d] = 0xa5;
    const base = setup({ dtmf: { settings: settings(), encodeList: [] } });
    const plan = planCodeplugWrite({ ...base, readLog: log });
    // +0x01 is the group code, which IS modelled — parseDtmfSettings read 0x0a
    // back out of the original, so it round-trips rather than being preserved.
    expect(byteAt(plan, D890_DTMF.SETTINGS + 0x0c)).toBe(0x5a);
    expect(byteAt(plan, D890_DTMF.SETTINGS + 0x0d)).toBe(0xa5);
  });

  it('writes encode entry 3 by INDEX and leaves 0-2 empty rather than shifting', () => {
    // HW test: "Set entry 3 to 4567". The index is what a channel references,
    // so an empty entry writes 0xFF instead of being compacted away.
    const plan = planCodeplugWrite(setup({
      dtmf: { settings: settings(), encodeList: ['', '', '', '4567'] },
    }));
    const at = D890_DTMF.ENCODE + 3 * D890_DTMF.ENCODE_STRIDE;
    expect(bytesAt(plan, at, 5)).toEqual([0x04, 0x05, 0x06, 0x07, 0xff]);
    expect(byteAt(plan, D890_DTMF.ENCODE)).toBe(0xff);
    expect(byteAt(plan, D890_DTMF.ENCODE + 2 * D890_DTMF.ENCODE_STRIDE)).toBe(0xff);
  });
});

describe('the 0x3701510 collision', () => {
  // 0x3701510 is claimed by BOTH D890_HOT_KEYS.MASK and D890_ADDR.RX_GROUP_SET.
  // The hot-key region write must leave that frame alone, or planning a write
  // with receive groups present hits the duplicate-address guard and refuses
  // outright — which is what would happen the moment the receive-group read
  // starts returning entries.
  it('does not plan the frame at 0x3701510', () => {
    const plan = planCodeplugWrite(setup({
      statusMessages: [{ slot: 0, text: 'A' }],
      hotKeys: [{ slot: 0, mode: 0, menu: 1, callType: 0, digiCallType: 0,
        callObject: null, contentSmsIndex: null }],
    }));
    expect(plan.frames.some((f) => f.address === 0x3701510)).toBe(false);
    // The status-message mask is one frame lower and MUST still be written.
    expect(plan.frames.some((f) => f.address === 0x3701500)).toBe(true);
  });

  it('plans hot keys and receive groups together without refusing', () => {
    const base = setup({
      statusMessages: [{ slot: 0, text: 'A' }],
      hotKeys: [{ slot: 0, mode: 0, menu: 1, callType: 0, digiCallType: 0,
        callObject: null, contentSmsIndex: null }],
      rxGroups: [{ index: 0, name: 'RX 1', contacts: [] }],
    });
    // The receive-group records live at their own address; give the plan one.
    base.readLog.set(0x3780000, new Uint8Array(0x200));
    expect(() => planCodeplugWrite(base)).not.toThrow();
  });
});

describe('the plan as a whole', () => {
  it('emits nothing for a table the caller did not pass', () => {
    const plan = planCodeplugWrite(setup({}));
    const regions = plan.written.map((w) => w.region);
    expect(regions).not.toContain('hot keys / status messages');
    expect(regions).not.toContain('analog contact');
    expect(regions).not.toContain('DTMF settings');
  });

  it('skips a table whose region was never read rather than inventing it', () => {
    const base = setup({ dtmf: { settings: settings2(), encodeList: [] } });
    base.readLog.delete(D890_DTMF.SETTINGS);
    const plan = planCodeplugWrite(base);
    expect(plan.skipped.map((s) => s.region)).toContain('DTMF settings');
  });
});

function settings2() {
  return parseDtmfSettings(new Uint8Array(D890_DTMF.SETTINGS_BYTES));
}
