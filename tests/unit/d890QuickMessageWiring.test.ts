/**
 * Quick messages — the DA-7X2's pre-defined SMS — reaching the write plan.
 *
 * TWO TABLES, ONE LIST. The texts live in slots at 0x3180000; the list the radio
 * shows is the SMS store chain at 0x2980000, whose envelopes each name a text
 * slot. Measured from vendor CPS captures:
 *
 *   - The CPS reads ALONG THE CHAIN. On 2026-09-10 it dropped "Thank you!",
 *     whose envelope had been retired while its text still sat in slot 2.
 *   - Every predefined envelope it writes is `00 00 <next> <textSlot>` and twelve
 *     zeros; every text record is the text, a NUL, and zeros.
 *   - The radio's own delete leaves a HOLE (2026-09-08): envelope retired, text
 *     erased, survivors untouched. The CPS instead compacts on every write, and
 *     the radio reads both. We keep slots, because a hot key names a text slot.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { d890QuickMessages } from '../../src/services/d890WriteInput';
import { useQuickMessagesStore } from '../../src/store/quickMessagesStore';
import { useRadioStore } from '../../src/store/radioStore';
import {
  encodePredefinedSms,
  erasedPredefinedSms,
  quickMessagesFromChain,
} from '../../src/radios/d890uv/predefinedSms';
import {
  D890_SMS_STORE,
  encodeSmsStore,
  type D890SmsEnvelope,
} from '../../src/radios/d890uv/smsStore';
import { D890_HOT_KEYS, type D890HotKey } from '../../src/radios/d890uv/hotKeys';
import type { QuickTextMessage } from '../../src/models/QuickTextMessage';

const DIR = join(__dirname, '../fixtures/d890uv');
const fixture = (name: string) => new Uint8Array(readFileSync(join(DIR, name)));

/** What the vendor CPS sent for the five factory messages (`WriteTo7x2.txt`). */
const VENDOR_TEXTS = fixture('sms-vendor-texts.bin');
const VENDOR_ENVELOPES = fixture('sms-vendor-envelopes.bin');
const VENDOR_VALID_HEAD = fixture('sms-vendor-validhead.bin');
const FACTORY = ['Hello!', 'Welcome!', 'Thank you!', 'Good bye!', 'Happy every day!'];

describe('what the vendor CPS writes, reproduced', () => {
  it('each text record, byte for byte', () => {
    FACTORY.forEach((text, i) => {
      expect(Array.from(encodePredefinedSms(text))).toEqual(
        Array.from(VENDOR_TEXTS.subarray(i * 0x200, (i + 1) * 0x200))
      );
    });
  });

  it('the envelopes, the valid table and the head — built over erased flash', () => {
    const erased = new Uint8Array(D890_SMS_STORE.SLOTS * D890_SMS_STORE.STRIDE).fill(0xff);
    const { envelopes, valid, head } = encodeSmsStore(
      erased,
      FACTORY.map((_, slot) => ({ slot }))
    );
    expect(Array.from(envelopes.subarray(0, 0x50))).toEqual(Array.from(VENDOR_ENVELOPES));
    expect(Array.from(valid)).toEqual(
      Array.from(VENDOR_VALID_HEAD.subarray(0, D890_SMS_STORE.SLOTS))
    );
    expect(head).toBe(VENDOR_VALID_HEAD[D890_SMS_STORE.HEAD - D890_SMS_STORE.VALID]);
    // Envelopes past the chain are left as they were.
    expect([...new Set(envelopes.subarray(0x50))]).toEqual([0xff]);
  });
});

const envelope = (slot: number, textSlot = slot): D890SmsEnvelope => ({
  slot, next: null, textSlot, attr: 0, code: 0,
});

describe('reading — the chain is the list', () => {
  const radio = new Map<number, string>([
    [1, 'Welcome!'], [2, 'Thank you!'], [3, 'Good bye!'], [4, 'Happy every day!'],
  ]);
  const readText = async (slot: number) =>
    radio.has(slot) ? encodePredefinedSms(radio.get(slot)!) : erasedPredefinedSms();

  it('lists what the chain reaches, in chain order, keyed by TEXT slot', async () => {
    // The radio on 2026-09-09: message 1 deleted on the radio, then envelope 2
    // retired — so the chain ran 1→3→4 while "Thank you!" still sat in text
    // slot 2. The vendor CPS listed three messages. So must we.
    const got = await quickMessagesFromChain([envelope(1), envelope(3), envelope(4)], readText);
    expect(got.map((m) => [m.slot, m.text])).toEqual([
      [1, 'Welcome!'], [3, 'Good bye!'], [4, 'Happy every day!'],
    ]);
  });

  it('follows the envelope to its text slot rather than assuming they match', async () => {
    const got = await quickMessagesFromChain([envelope(0, 3)], readText);
    expect(got).toEqual([{ index: 3, slot: 3, text: 'Good bye!', flag: 0, checkValue: 0 }]);
  });

  it('skips an envelope naming an empty or out-of-range text slot', async () => {
    const got = await quickMessagesFromChain(
      [envelope(0, 0), envelope(1, 0xff), envelope(2, 4)],
      readText
    );
    expect(got.map((m) => m.slot)).toEqual([4]);
  });
});

const msg = (slot: number, text: string, index = 0): QuickTextMessage => ({
  index, slot, text, flag: 0, checkValue: 0,
});

const hotKeysWith = (content: Record<number, number>): D890HotKey[] =>
  Array.from({ length: D890_HOT_KEYS.SLOTS }, (_, slot) => ({
    slot, mode: 0, menu: 1, callType: 0, digiCallType: 0, callObject: null,
    contentSmsIndex: content[slot] ?? null,
  }));

/** The radio today: three messages in slots 0-2, chained in order, hot keys Off. */
function seed(opts: { hotKeys?: D890HotKey[]; smsStore?: D890SmsEnvelope[] | null } = {}) {
  const read = [
    { slot: 0, text: 'Welcome!' },
    { slot: 1, text: 'Good bye!' },
    { slot: 2, text: 'Happy every day!' },
  ];
  useRadioStore.setState({
    tables: {
      predefinedSms: read,
      smsStore:
        opts.smsStore === null
          ? undefined
          : opts.smsStore ?? [
              { slot: 0, next: 1, textSlot: 0, attr: 0, code: 0 },
              { slot: 1, next: 2, textSlot: 1, attr: 0, code: 0 },
              { slot: 2, next: null, textSlot: 2, attr: 0, code: 0 },
            ],
      hotKeys: opts.hotKeys ?? hotKeysWith({}),
    },
  });
  useQuickMessagesStore.getState().setMessages(read.map((r, i) => msg(r.slot, r.text, i)));
}

const store = () => useQuickMessagesStore.getState();

beforeEach(() => {
  useRadioStore.setState({ tables: {} });
  useQuickMessagesStore.setState({ messages: [], messagesLoaded: false });
});

describe('d890QuickMessages — the write input', () => {
  it('an unedited list goes back exactly as it was read', () => {
    seed();
    const q = d890QuickMessages()!;
    expect(q.quickMessages).toEqual([
      { index: 0, text: 'Welcome!' },
      { index: 1, text: 'Good bye!' },
      { index: 2, text: 'Happy every day!' },
    ]);
    expect(q.smsStore.map((e) => [e.slot, e.textSlot])).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(q.clearedQuickMessageSlots).toEqual([]);
  });

  it('an edit changes the text and nothing else', () => {
    seed();
    store().updateMessage(0, { text: 'Welcome Zulu' });
    const q = d890QuickMessages()!;
    expect(q.quickMessages[0]).toEqual({ index: 0, text: 'Welcome Zulu' });
    expect(q.smsStore.map((e) => e.slot)).toEqual([0, 1, 2]);
    expect(q.clearedQuickMessageSlots).toEqual([]);
  });

  it('DELETE leaves a hole: survivors keep their slots and the text is erased', () => {
    seed();
    store().deleteMessage(1); // "Good bye!", the middle one
    const q = d890QuickMessages()!;
    // Position 1 is now "Happy every day!", but it is still SLOT 2. Renumbering
    // would write it into slot 1 and repoint any hot key that sends it.
    expect(q.quickMessages).toEqual([
      { index: 0, text: 'Welcome!' },
      { index: 2, text: 'Happy every day!' },
    ]);
    expect(q.smsStore.map((e) => [e.slot, e.textSlot])).toEqual([[0, 0], [2, 2]]);
    expect(q.clearedQuickMessageSlots).toEqual([1]);
  });

  it('ADD reuses the hole, and its envelope takes the same number', () => {
    seed();
    store().deleteMessage(1);
    // What the Digital tab hands a new message: the lowest free slot.
    store().addMessage(msg(1, 'RT Zulu 42'));
    const q = d890QuickMessages()!;
    expect(q.quickMessages.find((m) => m.text === 'RT Zulu 42')!.index).toBe(1);
    expect(q.smsStore.map((e) => [e.slot, e.textSlot])).toContainEqual([1, 1]);
    // Slot 1 is a message again, so it must not ALSO be erased — that would be
    // two frames for one address, and the radio keeps whichever came first.
    expect(q.clearedQuickMessageSlots).toEqual([]);
  });

  it('a message with no slot takes the lowest one nothing uses — a hot key included', () => {
    // Hot Key 1 points at slot 3, which held nothing at read. Handing slot 3 to
    // a new message would silently give that key a message it was never set to.
    seed({ hotKeys: hotKeysWith({ 0: 3 }) });
    store().addMessage({ index: 3, text: 'Imported', flag: 0, checkValue: 0 });
    const q = d890QuickMessages()!;
    expect(q.quickMessages.find((m) => m.text === 'Imported')!.index).toBe(4);
  });

  it('refuses a delete that leaves a hot key pointing at nothing', () => {
    seed({ hotKeys: hotKeysWith({ 1: 1 }) }); // Hot Key 2 sends "Good bye!"
    store().deleteMessage(1);
    expect(() => d890QuickMessages()).toThrow(/Hot Key 2 → "Good bye!"/);
  });

  it('leaves alone a hot key that already pointed at nothing when read', () => {
    // This write did not strand it, and refusing would block every write until
    // the user fixed something the radio already had.
    seed({ hotKeys: hotKeysWith({ 0: 7 }) });
    expect(() => d890QuickMessages()).not.toThrow();
  });

  it('refuses an empty message — the reader cannot tell it from an empty slot', () => {
    seed();
    store().addMessage(msg(3, ''));
    expect(() => d890QuickMessages()).toThrow(/empty/);
  });

  it('refuses two messages claiming one slot', () => {
    seed();
    store().addMessage(msg(1, 'Clash'));
    expect(() => d890QuickMessages()).toThrow(/both claim slot 1/);
  });

  it('without the SMS store read: an unedited list passes, an edit is refused', () => {
    seed({ smsStore: null });
    expect(d890QuickMessages()).toBeUndefined();
    store().updateMessage(0, { text: 'Changed' });
    expect(() => d890QuickMessages()).toThrow(/SMS store/);
  });

  it('returns nothing when this radio was never read', () => {
    expect(d890QuickMessages()).toBeUndefined();
  });
});
