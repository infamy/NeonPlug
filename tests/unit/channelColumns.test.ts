import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DM32UV_CAPABILITIES } from '../../src/radios/dm32uv/capabilities';
import { D890UV_CAPABILITIES } from '../../src/radios/d890uv/capabilities';
import { RADIO_DESCRIPTORS } from '../../src/radios';
import {
  EXTRA_CHANNEL_COLUMNS,
  extraColumnMarker,
  extraColumnTitle,
} from '../../src/components/channels/extraChannelColumns';

const SRC = join(__dirname, '../../src/components/channels');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');

/** Every `hasColumn('x')` guard in a file, as a sorted multiset. */
function guards(src: string): string[] {
  return [...src.matchAll(/hasColumn\('([a-zA-Z]+)'\)/g)].map((m) => m[1]).sort();
}

describe('channel column gating', () => {
  it('gates exactly the same columns in the header row and the cell row', () => {
    // The hazard this guards is specific and silent: a header gated differently
    // from its cell shifts every column after it, so channel data renders under
    // the wrong heading with no error anywhere.
    const headers = guards(read('ChannelsTable.tsx'));
    const cells = guards(read('ChannelRow.tsx'));
    expect(cells).toEqual(headers);
    expect(headers.length).toBeGreaterThan(0);
  });

  it('keeps the DM-32 showing everything it showed before', () => {
    // The DM-32 is the radio this grid was built around. Any group missing from
    // its declaration is a column that silently disappeared from its UI.
    const declared = new Set(DM32UV_CAPABILITIES.channelColumns ?? []);
    for (const g of new Set(guards(read('ChannelsTable.tsx')))) {
      expect(declared.has(g as never), `DM-32 lost the '${g}' column`).toBe(true);
    }
  });

  it('declares what the DA-7X2 hardware has, not what the driver decodes', () => {
    // From the vendor CPS's own 77-column channel export. Declaring only the
    // decoded subset would hide NeonPlug's gaps behind an empty grid.
    const declared = D890UV_CAPABILITIES.channelColumns ?? [];
    for (const g of ['pttId', 'aprs', 'squelch', 'encryption', 'loneWorker'] as const) {
      expect(declared, `the vendor schema has ${g}`).toContain(g);
    }
    // No equivalent anywhere in the vendor schema.
    for (const g of ['emergency', 'stepFrequency', 'signalType'] as const) {
      expect(declared, `the vendor schema has no ${g}`).not.toContain(g);
    }
  });

  it('keeps the DMR block to what is universal to DMR', () => {
    // Colour code, RX group, slot, TX DMR ID and TX contact are inherent to DMR
    // and stay ungated behind analogOnly. Anything else that was in that block
    // has moved into a declarable group.
    const table = read('ChannelsTable.tsx');
    for (const t of ['Encryption', 'TDMA Direct Mode', 'Short Data Confirm', 'Private Confirm']) {
      const line = table.split('\n').find((l) => l.includes(`title="${t}"`))!;
      expect(line, `${t} is not gated`).toContain('hasColumn(');
    }
  });

  it('renders the declarative extras from one array on both sides', () => {
    // The longhand columns are kept in step by the multiset check above, which
    // is discipline. These are kept in step structurally: header and cell both
    // map extraColumnsFor(...), so a column cannot exist on one side only.
    for (const f of ['ChannelsTable.tsx', 'ChannelRow.tsx']) {
      expect(read(f), `${f} renders the declarative extras`).toContain('extraColumnsFor(');
    }
  });

  it('gives every declarative extra a unique field and a group the DA-7X2 declares', () => {
    const declared = new Set(D890UV_CAPABILITIES.channelColumns ?? []);
    const fields = EXTRA_CHANNEL_COLUMNS.map((c) => c.field);
    // The field doubles as the React key on both sides.
    expect(new Set(fields).size, 'duplicate field in EXTRA_CHANNEL_COLUMNS').toBe(fields.length);
    for (const c of EXTRA_CHANNEL_COLUMNS) {
      expect(declared.has(c.group), `DA-7X2 does not declare '${c.group}'`).toBe(true);
    }
  });

  it('keeps the declarative extras off every radio that has not been assessed', () => {
    // These are DA-7X2 channel-record fields. A radio that does not decode them
    // would render a grid of always-false checkboxes and state something untrue
    // about the hardware.
    const extraGroups = new Set(EXTRA_CHANNEL_COLUMNS.map((c) => c.group));
    for (const d of RADIO_DESCRIPTORS) {
      if (d.capabilities === D890UV_CAPABILITIES) continue;
      for (const g of d.capabilities.channelColumns ?? []) {
        expect(extraGroups.has(g), `${d.model} declares DA-7X2 extra '${g}'`).toBe(false);
      }
    }
  });

  it('marks every column whose value range is not hardware-confirmed', () => {
    // The marker is the honest bit: it separates "we watched this byte move on a
    // radio" from "the vendor's own writer says the byte is here". Without it a
    // user comparing NeonPlug against the OEM software has no way to tell which
    // columns to trust.
    const unconfirmed = EXTRA_CHANNEL_COLUMNS.filter((c) => c.provenance !== 'hardware');
    expect(unconfirmed.length).toBeGreaterThan(0);
    for (const c of unconfirmed) {
      expect(extraColumnMarker(c), `${c.field} is unmarked`).toBe('*');
      expect(extraColumnTitle(c), `${c.field} has no caveat in its tooltip`).toMatch(
        /not (yet )?confirmed/,
      );
    }
    for (const c of EXTRA_CHANNEL_COLUMNS.filter((x) => x.provenance === 'hardware')) {
      expect(extraColumnMarker(c), `${c.field} is marked but is hardware-confirmed`).toBe('');
      expect(extraColumnTitle(c), `${c.field} carries a caveat it does not need`).not.toMatch(
        /not (yet )?confirmed/,
      );
    }
  });

  it('gates the editor by the same groups as the grid', () => {
    // The editor is the worse half to leave ungated: the grid only omits a
    // column, but the editor writes its controls back onto the channel, so an
    // ungated control silently sets a field the radio has no equivalent for.
    const modal = read('ChannelEditModal.tsx');
    const modalGuards = new Set(guards(modal));
    expect(modalGuards.size).toBeGreaterThan(0);

    // No typos: every group the editor gates on must be one a radio can declare.
    const known = new Set([
      ...(DM32UV_CAPABILITIES.channelColumns ?? []),
      ...(D890UV_CAPABILITIES.channelColumns ?? []),
    ]);
    for (const g of modalGuards) {
      expect(known.has(g as never), `editor gates on unknown group '${g}'`).toBe(true);
    }

    // The two whole sections that are pure DM-32 wire format. Leaving these
    // ungated is what put a DM-32 emergency block on a DA-7X2 channel.
    expect(modalGuards.has('emergency')).toBe(true);
    expect(modal).toContain('extraColumns.map(');
  });

  it('offers every squelch mode the decoder can produce', () => {
    // A <select> whose value matches no <option> displays the FIRST one and
    // saves that on the next edit. The DA-7X2 decodes 'CTCSS/DCS', so a channel
    // read that way was displaying — and would have saved — 'Carrier/CTC'.
    const modal = read('ChannelEditModal.tsx');
    for (const mode of ['Carrier/CTC', 'CTCSS/DCS', 'Optional']) {
      expect(modal, `no option for squelch mode ${mode}`).toContain(`value="${mode}"`);
    }
  });

  it('defaults every other radio to no optional columns', () => {
    // Opt-in by design: a radio that has not been assessed shows the common core
    // rather than a screen of features it may not have.
    for (const d of RADIO_DESCRIPTORS) {
      if (d.capabilities === DM32UV_CAPABILITIES || d.capabilities === D890UV_CAPABILITIES) continue;
      expect(d.capabilities.channelColumns ?? []).toEqual([]);
    }
  });
});

describe('analog-only columns', () => {
  it('marks Busy Lock analog-only, matching what the radio permits', () => {
    // The DA-7X2 allows Busy Lock on Analog and A-D channels only, and the radio
    // CLEARS byte 0x1a by itself when a channel becomes digital — observed on
    // hardware 2026-08-30. Offering an editable control the radio will zero is
    // worse than hiding it, and on a write path it would produce a read-back
    // mismatch that is the radio behaving correctly.
    const busyLock = EXTRA_CHANNEL_COLUMNS.find((c) => c.field === 'busyLock');
    expect(busyLock?.analogOnly).toBe(true);
    expect(busyLock?.digitalOnly).toBeUndefined();
  });

  it('never marks a column both analog-only and digital-only', () => {
    const both = EXTRA_CHANNEL_COLUMNS.filter((c) => c.analogOnly && c.digitalOnly);
    expect(both.map((c) => c.label)).toEqual([]);
  });
});

describe('Digital Emergency Systems is capability-gated', () => {
  it('is off for the DA-7X2 and on for the DM-32', async () => {
    // The DA-7X2 HAS emergency features — the vendor's Emergency Information
    // form carries 24 controls — but stores them as two 0x30 records at
    // 0x3482e00 / 0x3483000, with no metadata block 0x10 at all. The DM-32's
    // section would render an editor over data that does not exist on it.
    const { D890UV_CAPABILITIES } = await import('../../src/radios/d890uv/capabilities');
    const { DM32UV_CAPABILITIES } = await import('../../src/radios/dm32uv/capabilities');
    expect(D890UV_CAPABILITIES.supportsDigitalEmergency).toBe(false);
    expect(DM32UV_CAPABILITIES.supportsDigitalEmergency).toBe(true);
  });
});
