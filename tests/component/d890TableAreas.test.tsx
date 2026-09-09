// @vitest-environment jsdom
/**
 * The five settings areas that make the newly-written tables reachable.
 *
 * These tables have had parsers and encoders for days and 0 hardware round
 * trips, for one reason: nothing in the app could edit them, so the round-trip
 * protocol ("change exactly one thing, write, read back next session") had no
 * first step. These tests drive the same path a person will — render the area,
 * change one control, assert what landed in the store — because that store
 * value is precisely what `buildD890CodeplugTables` hands to the write plan.
 *
 * The sharpest assertions here are the two about DELETION, and they are
 * deliberately adjacent: the address books COMPACT and the SMS store does NOT.
 * Having those backwards is the single most likely bug in this area, and it is
 * invisible to a write-back test because a patch encoder reproduces its input.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useRadioStore } from '../../src/store/radioStore';
import { useQuickMessagesStore } from '../../src/store/quickMessagesStore';
import { D890StatusMessagesArea } from '../../src/components/settings/D890StatusMessagesArea';
import { D890HotKeysArea } from '../../src/components/settings/D890HotKeysArea';
import { D890AddressBooksArea } from '../../src/components/settings/D890AddressBooksArea';
import { D890SmsStoreArea } from '../../src/components/settings/D890SmsStoreArea';
import { D890DtmfArea } from '../../src/components/settings/D890DtmfArea';
import { D890_HOT_KEYS } from '../../src/radios/d890uv/hotKeys';
import { MDC_CALL_TYPE } from '../../src/radios/d890uv/mdc1200';
import { parseDtmfSettings, D890_DTMF } from '../../src/radios/d890uv/dtmf';

/** Slot-accurate pre-defined SMS, as `tables.predefinedSms` carries them. */
let PREDEFINED_SMS: { slot: number; text: string }[] = [];

const hotKeys = Array.from({ length: D890_HOT_KEYS.SLOTS }, (_, slot) => ({
  slot, mode: 0, menu: 1, callType: 0, digiCallType: 0,
  callObject: null, contentSmsIndex: null,
}));

beforeEach(() => {
  useRadioStore.setState({ selectedRadioModel: 'DA-7X2', tables: {} });
  // Slot 0 deliberately EMPTY and the messages in slots 1-3, which is the shape
  // the first real radio had. A fixture starting at slot 0 makes slot and
  // position coincide and would pass with the off-by-one bug still in place.
  useQuickMessagesStore.setState({
    messages: [
      { index: 0, text: 'Welcome!', flag: 0, checkValue: 0 },
      { index: 1, text: 'On my way', flag: 0, checkValue: 0 },
      { index: 2, text: 'Good bye!', flag: 0, checkValue: 0 },
    ],
  });
  PREDEFINED_SMS = [
    { slot: 1, text: 'Welcome!' },
    { slot: 2, text: 'On my way' },
    { slot: 3, text: 'Good bye!' },
  ];
});

afterEach(() => {
  cleanup();
  useRadioStore.setState({ selectedRadioModel: null, tables: {} });
});

const tables = () => useRadioStore.getState().tables;
/** Set an uncontrolled input and fire the blur its handler listens for. */
const type = (el: HTMLElement, value: string) => {
  (el as HTMLInputElement).value = value;
  fireEvent.blur(el);
};

describe('status messages area', () => {
  const seed = () =>
    useRadioStore.setState({ tables: { statusMessages: [{ slot: 2, text: 'Original' }] } });

  it('renders nothing at all when the table was never read', () => {
    // Not an empty card — absent. An empty table and an unread one are
    // different states and the UI must not claim the radio holds nothing.
    const { container } = render(<D890StatusMessagesArea />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the slot the mask addresses, not the row number', () => {
    seed();
    render(<D890StatusMessagesArea />);
    expect(screen.getByText('2')).toBeTruthy();
    expect((screen.getByDisplayValue('Original') as HTMLInputElement).value).toBe('Original');
  });

  it('edits the text in place', () => {
    seed();
    render(<D890StatusMessagesArea />);
    type(screen.getByDisplayValue('Original'), 'RT test 2026');
    expect(tables().statusMessages).toEqual([{ slot: 2, text: 'RT test 2026' }]);
  });

  it('deleting drops the entry — the encoder clears the bit and keeps the text', () => {
    seed();
    render(<D890StatusMessagesArea />);
    fireEvent.click(screen.getByTitle(/presence bit/i));
    expect(tables().statusMessages).toEqual([]);
  });

  it('adding takes the lowest FREE slot, not the next row number', () => {
    useRadioStore.setState({
      tables: { statusMessages: [{ slot: 1, text: 'a' }, { slot: 3, text: 'b' }] },
    });
    render(<D890StatusMessagesArea />);
    fireEvent.click(screen.getByText('+ Add message'));
    expect(tables().statusMessages?.map((m) => m.slot)).toEqual([0, 1, 3]);
  });
});

describe('hot keys area', () => {
  it('renders every one of the 18 live entries', () => {
    // The 0x3701510 mask marks CONFIGURED rows, not existing ones — all 18 are
    // live, so an area that showed only the masked ones would hide 16 of them.
    useRadioStore.setState({ tables: { hotKeys, predefinedSms: PREDEFINED_SMS } });
    render(<D890HotKeysArea />);
    expect(screen.getByText('Hot Key 1')).toBeTruthy();
    expect(screen.getByText('Hot Key 6')).toBeTruthy();
    expect(screen.getByText('Fun 12')).toBeTruthy();
    expect(screen.queryByText('+ Add')).toBeNull();
  });

  it("sets one row's SMS index and leaves its neighbours alone", () => {
    // The Tier-1 hardware test: Hot Key 3 is slot 2.
    useRadioStore.setState({ tables: { hotKeys, predefinedSms: PREDEFINED_SMS } });
    const { container } = render(<D890HotKeysArea />);
    const row = container.querySelectorAll('tbody tr')[2] as HTMLElement;
    const selects = within(row).getAllByRole('combobox');
    fireEvent.change(selects[selects.length - 1], { target: { value: '2' } });

    const after = tables().hotKeys!;
    expect(after[2].contentSmsIndex).toBe(2);
    expect(after[1].contentSmsIndex).toBeNull();
    expect(after[3].contentSmsIndex).toBeNull();
    expect(after).toHaveLength(D890_HOT_KEYS.SLOTS);
  });

  it('resolves Content by SLOT, not by position in the message list', () => {
    // The bug this pins: a radio with slot 0 erased puts every message one
    // position below its slot, so resolving 0x03 against the position-indexed
    // store showed (and would have WRITTEN) the message one slot down.
    useRadioStore.setState({
      tables: {
        hotKeys: hotKeys.map((k, i) => (i === 1 ? { ...k, contentSmsIndex: 3 } : k)),
        predefinedSms: PREDEFINED_SMS,
      },
    });
    const { container } = render(<D890HotKeysArea />);
    const row = container.querySelectorAll('tbody tr')[1] as HTMLElement;
    const content = within(row).getAllByRole('combobox').slice(-1)[0] as HTMLSelectElement;
    // Slot 3 is "Good bye!" — the string the vendor CPS grid showed for 0x03.
    expect(content.options[content.selectedIndex].textContent).toContain('Good bye!');
    expect(content.value).toBe('3');
  });

  it('keeps an unknown Digi Call Type selectable instead of silently rewriting it', () => {
    // 1 and 2 are legal bytes nobody has enumerated. Rendering a row must not
    // quietly turn one into DMR Group.
    useRadioStore.setState({
      tables: {
        hotKeys: hotKeys.map((k, i) => (i === 0 ? { ...k, digiCallType: 2 } : k)),
        predefinedSms: PREDEFINED_SMS,
      },
    });
    render(<D890HotKeysArea />);
    expect(screen.getByText('2 (unknown)')).toBeTruthy();
    expect(tables().hotKeys![0].digiCallType).toBe(2);
  });
});

describe('address books — these COMPACT', () => {
  const seed = () =>
    useRadioStore.setState({
      tables: {
        analogAddressBook: [
          { slot: 0, digits: '1112222', name: 'First' },
          { slot: 1, digits: '7654321', name: 'Second' },
        ],
        mdc1200Contacts: [
          { slot: 0, callType: MDC_CALL_TYPE.PRIVATE, type: 0, ack: 0, id: 546, name: 'Base' },
        ],
      },
    });

  it('adds an analog contact at the end', () => {
    seed();
    render(<D890AddressBooksArea />);
    fireEvent.click(screen.getAllByText('+ Add')[0]);
    expect(tables().analogAddressBook).toHaveLength(3);
  });

  it('deleting the FIRST entry leaves the survivor to be written to slot 0', () => {
    // The whole point of the Tier-1 delete test. The store keeps the entry's
    // old `slot` field, and the write plan ignores it and places by position —
    // so what matters here is that the survivor is now at index 0.
    seed();
    render(<D890AddressBooksArea />);
    fireEvent.click(screen.getAllByTitle(/renumbers/i)[0]);
    const after = tables().analogAddressBook!;
    expect(after).toHaveLength(1);
    expect(after[0].digits).toBe('7654321');
  });

  it('rejects non-digits, which have no BCD representation', () => {
    seed();
    render(<D890AddressBooksArea />);
    type(screen.getByDisplayValue('1112222'), '12ab34');
    expect(tables().analogAddressBook![0].digits).toBe('1234');
  });

  it('takes an MDC ID as a plain number and refuses one past a u16', () => {
    seed();
    render(<D890AddressBooksArea />);
    const id = screen.getByDisplayValue('546');
    type(id, '4321');
    expect(tables().mdc1200Contacts![0].id).toBe(4321);
    type(id, '70000');
    expect(tables().mdc1200Contacts![0].id).toBe(4321);
  });
});

describe('SMS store — this does NOT compact', () => {
  it('deleting a MIDDLE message leaves every survivor on its own slot', () => {
    // The mirror of the address-book test above, and the reason they are next
    // to each other: same-looking table, opposite deletion semantics.
    useRadioStore.setState({
      tables: {
        smsStore: [
          { slot: 0, next: 1, textSlot: 1, attr: 0, code: null },
          { slot: 1, next: 2, textSlot: 2, attr: 0, code: null },
          { slot: 2, next: null, textSlot: 3, attr: 0, code: null },
        ],
        predefinedSms: PREDEFINED_SMS,
      },
    });
    render(<D890SmsStoreArea />);
    fireEvent.click(screen.getAllByTitle(/Retires this slot/i)[1]);

    const after = tables().smsStore!;
    expect(after.map((e) => e.slot)).toEqual([0, 2]);
    // Slot 2 kept its number. Had this compacted, it would now be slot 1.
    expect(after[1].slot).toBe(2);
  });

  it('shows the predefined text the envelope POINTS AT, not its own slot', () => {
    useRadioStore.setState({
      tables: {
        smsStore: [{ slot: 0, next: null, textSlot: 3, attr: 0, code: null }],
        predefinedSms: PREDEFINED_SMS,
      },
    });
    render(<D890SmsStoreArea />);
    // textSlot 3 is SLOT 3. Resolved against the position-renumbered store it
    // would read "On my way" — the off-by-one this table exists to prevent.
    expect(screen.getByText('Good bye!')).toBeTruthy();
    expect(screen.queryByText('On my way')).toBeNull();
  });

  it('offers no way to compose — allocating a slot and a text slot is unproven', () => {
    useRadioStore.setState({
      tables: { smsStore: [{ slot: 0, next: null, textSlot: 0, attr: 0, code: null }] },
    });
    render(<D890SmsStoreArea />);
    expect(screen.queryByText(/\+ Add/)).toBeNull();
  });
});

describe('DTMF area', () => {
  const seed = () =>
    useRadioStore.setState({
      tables: {
        dtmf: {
          settings: parseDtmfSettings(new Uint8Array(D890_DTMF.SETTINGS_BYTES)),
          encodeList: Array.from({ length: D890_DTMF.ENCODE_SLOTS }, () => ''),
        },
      },
    });

  it('edits the three ms timings the round-trip test uses', () => {
    seed();
    render(<D890DtmfArea />);
    type(screen.getByTitle(/\+0x04/).querySelector('input')!, '250');
    type(screen.getByTitle(/\+0x03/).querySelector('input')!, '360');
    type(screen.getByTitle(/\+0x0a/).querySelector('input')!, '470');

    const s = tables().dtmf!.settings;
    expect(s.firstDigitMs).toBe(250);
    expect(s.pretimeMs).toBe(360);
    expect(s.timeLapseAfterEncodeMs).toBe(470);
  });

  it('keeps seconds and milliseconds as separate fields', () => {
    // Adjacent bytes, different units. Auto Reset is RAW seconds — feeding it
    // through the ms path would divide it by ten.
    seed();
    render(<D890DtmfArea />);
    type(screen.getByTitle(/\+0x05/).querySelector('input')!, '9');
    expect(tables().dtmf!.settings.autoResetTimeS).toBe(9);
  });

  it('renders all 16 encode rows so an empty one keeps its index', () => {
    seed();
    render(<D890DtmfArea />);
    const rows = screen.getAllByPlaceholderText('(empty)');
    expect(rows).toHaveLength(D890_DTMF.ENCODE_SLOTS);
  });

  it('writes entry 3 by index, leaving 0-2 empty rather than shifting up', () => {
    seed();
    render(<D890DtmfArea />);
    type(screen.getAllByPlaceholderText('(empty)')[3], '4567');
    const list = tables().dtmf!.encodeList;
    expect(list[3]).toBe('4567');
    expect(list[0]).toBe('');
    expect(list).toHaveLength(D890_DTMF.ENCODE_SLOTS);
  });

  it('drops characters that are not DTMF digits', () => {
    seed();
    render(<D890DtmfArea />);
    type(screen.getAllByPlaceholderText('(empty)')[0], '12XY*3');
    expect(tables().dtmf!.encodeList[0]).toBe('12*3');
  });
});
