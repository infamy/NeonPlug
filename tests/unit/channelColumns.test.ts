import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DM32UV_CAPABILITIES } from '../../src/radios/dm32uv/capabilities';
import { D890UV_CAPABILITIES } from '../../src/radios/d890uv/capabilities';
import { RADIO_DESCRIPTORS } from '../../src/radios';

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

  it('defaults every other radio to no optional columns', () => {
    // Opt-in by design: a radio that has not been assessed shows the common core
    // rather than a screen of features it may not have.
    for (const d of RADIO_DESCRIPTORS) {
      if (d.capabilities === DM32UV_CAPABILITIES || d.capabilities === D890UV_CAPABILITIES) continue;
      expect(d.capabilities.channelColumns ?? []).toEqual([]);
    }
  });
});
