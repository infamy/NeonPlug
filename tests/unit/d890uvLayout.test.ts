import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  D890_CHANNEL_LAYOUT,
  D890_SCAN_LIST_LAYOUT,
  D890_MEMORY_MAP,
} from '../../src/radios/d890uv/recordLayout';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import { EXTRA_CHANNEL_COLUMNS } from '../../src/components/channels/extraChannelColumns';

const SRC = readFileSync(
  join(__dirname, '../../src/radios/d890uv/structures.ts'),
  'utf8',
);

/**
 * Byte offsets a function body reads, however it reaches them.
 *
 * The parser gets at bytes four ways — `bytes[0x21]`, `readU16LE(bytes, 0x10)`,
 * `readU32LE(bytes, 0x14)` and `bytes.subarray(0x44, 0x66)` — and a field added
 * through any of them without a documentation row is exactly the drift this
 * guards against.
 */
function offsetsRead(body: string): Set<number> {
  const out = new Set<number>();
  for (const m of body.matchAll(/bytes\[(0x[0-9a-f]+)\]/g)) out.add(parseInt(m[1], 16));
  for (const m of body.matchAll(/read(?:U16LE|U32LE)\(bytes,\s*(0x[0-9a-f]+)\)/g)) {
    out.add(parseInt(m[1], 16));
  }
  for (const m of body.matchAll(/bytes\.subarray\((0x[0-9a-f]+)/g)) out.add(parseInt(m[1], 16));
  return out;
}

/** The body of one exported function, up to the next top-level `export`. */
function functionBody(name: string): string {
  const start = SRC.indexOf(`export function ${name}(`);
  expect(start, `${name} not found in structures.ts`).toBeGreaterThan(-1);
  const rest = SRC.slice(start + 1);
  const end = rest.indexOf('\nexport ');
  return end === -1 ? rest : rest.slice(0, end);
}

/** Offsets a layout row accounts for, including every byte of a multi-byte span. */
function covered(rows: readonly { offset: number; length: number }[]): Set<number> {
  const out = new Set<number>();
  for (const r of rows) for (let i = 0; i < r.length; i++) out.add(r.offset + i);
  return out;
}

describe('the confirmation list stays in step with what the UI shows', () => {
  const DOC = readFileSync(join(__dirname, '../../DA7X2-NEEDS-CONFIRMING.md'), 'utf8');

  it('names every channel column the UI marks as unconfirmed', () => {
    // The marker in the grid is a promise that the list says what would settle
    // it. A field marked '*' and absent from the list leaves a user with a
    // caveat and nowhere to go with it.
    const unconfirmed = EXTRA_CHANNEL_COLUMNS.filter((c) => c.provenance !== 'hardware');
    // `offset` reads like "0x34 bit 5" or "0x1d, stored zero-based", so take the
    // hex token rather than splitting on whitespace and keeping the comma.
    const byteOf = (c: (typeof unconfirmed)[number]) => /0x[0-9a-f]+/.exec(c.offset)![0];
    const missing = unconfirmed.filter((c) => !DOC.includes(byteOf(c)));
    expect(
      missing.map((c) => `${c.field} (${c.offset})`),
      'marked unconfirmed in the UI but not in DA7X2-NEEDS-CONFIRMING.md',
    ).toEqual([]);
  });

  it('does not promise confirmation work for fields already confirmed', () => {
    // The inverse mistake: leaving a resolved item on the list sends someone to
    // re-derive something hardware already settled.
    for (const c of EXTRA_CHANNEL_COLUMNS.filter((x) => x.provenance === 'hardware')) {
      const listed = DOC.includes(`| ${c.label} |`);
      expect(listed, `${c.label} is hardware-confirmed but still on the list`).toBe(false);
    }
  });
});

describe('every read span the protocol asks for is 16-byte aligned', () => {
  // The radio rejects a read whose length is not a multiple of 16, and
  // `readMemory` throws before the wire ever sees it. That failure looks like a
  // radio fault rather than a constant being wrong: the codeplug read gets part
  // way through and folds at whichever record type hits the bad span first.
  //
  // Three constants were wrong at once when this was written — a zone name
  // (0x22), the talkgroup bitmap (0x4e2) and a talkgroup record (0xc8) — and the
  // last two had been wrong since the driver was first built, hidden because the
  // read folded at zones before it ever reached contacts.
  const PROTOCOL = readFileSync(
    join(__dirname, '../../src/radios/d890uv/protocol.ts'),
    'utf8',
  );

  it('passes only aligned lengths to readMemory', () => {
    // Every `D890_ADDR.X` the protocol uses as a read length, taken from the
    // source rather than listed by hand — a new call site is covered the moment
    // it is written.
    const names = [
      ...PROTOCOL.matchAll(/readMemory\(\s*[^,]+,\s*D890_ADDR\.([A-Z_0-9]+)/gs),
    ].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(4);
    const addr = D890_ADDR as unknown as Record<string, number>;
    for (const name of new Set(names)) {
      const value = addr[name];
      expect(value, `D890_ADDR.${name} is not a number`).toBeTypeOf('number');
      expect(value % 0x10, `D890_ADDR.${name} = 0x${value.toString(16)} is not 16-byte aligned`).toBe(0);
    }
  });

  it('keeps the read span at least as large as the structure it covers', () => {
    // Rounding up is only safe while it still covers the record. A read span
    // SMALLER than the structure would truncate silently, which is worse than
    // the crash it replaced.
    for (const [size, read] of [
      ['ZONE_NAME_LEN', 'ZONE_NAME_READ'],
      ['TALKGROUP_SET_SIZE', 'TALKGROUP_SET_READ'],
      ['TALKGROUP_STRIDE', 'TALKGROUP_READ'],
    ] as const) {
      const addr = D890_ADDR as unknown as Record<string, number>;
      expect(addr[read], `${read} < ${size}`).toBeGreaterThanOrEqual(addr[size]);
      expect(addr[read] - addr[size], `${read} rounds up by a whole block`).toBeLessThan(0x10);
    }
  });
});

describe('DA-7X2 record layout documentation', () => {
  it('documents every channel offset the parser reads', () => {
    // The Diagnostics tab renders this table as the authoritative byte map for
    // the radio. A field decoded but undocumented makes that map quietly wrong,
    // and it is the map a user checks NeonPlug against the OEM CPS with.
    const read = offsetsRead(functionBody('parseChannel'));
    const documented = covered(D890_CHANNEL_LAYOUT);
    const missing = [...read].filter((o) => !documented.has(o)).sort((a, b) => a - b);
    expect(missing.map((o) => `0x${o.toString(16)}`)).toEqual([]);
  });

  it('documents every scan-list offset the parser reads', () => {
    const read = offsetsRead(functionBody('parseScanList'));
    const documented = covered(D890_SCAN_LIST_LAYOUT);
    const missing = [...read].filter((o) => !documented.has(o)).sort((a, b) => a - b);
    expect(missing.map((o) => `0x${o.toString(16)}`)).toEqual([]);
  });

  it('covers the whole 0x80 channel record with no overlaps', () => {
    // Overlap would mean two rows claiming the same byte, which is how a byte
    // map starts lying. Bit-level rows share a byte legitimately, so they are
    // collapsed to one entry per byte first.
    const byteOwners = new Map<number, string[]>();
    for (const r of D890_CHANNEL_LAYOUT) {
      for (let i = 0; i < r.length; i++) {
        const key = r.bits ? `${r.offset}` : `${r.offset + i}`;
        const owners = byteOwners.get(Number(key)) ?? [];
        if (!r.bits) owners.push(r.vendorName);
        byteOwners.set(Number(key), owners);
      }
    }
    for (const [offset, owners] of byteOwners) {
      expect(owners.length, `0x${offset.toString(16)} claimed by ${owners.join(', ')}`).toBeLessThan(2);
    }
    const documented = covered(D890_CHANNEL_LAYOUT);
    for (let o = 0; o < 0x80; o++) {
      expect(documented.has(o), `0x${o.toString(16)} is undocumented`).toBe(true);
    }
  });

  it('keeps the memory map in step with the addresses the driver uses', () => {
    const byAddress = new Map(D890_MEMORY_MAP.map((r) => [r.address, r]));
    for (const [name, address] of [
      ['channels', D890_ADDR.CHANNEL_DATA],
      ['channel bitmap', D890_ADDR.CHANNEL_SET],
      ['zone membership', D890_ADDR.ZONE_CHANNELS],
      ['zone names', D890_ADDR.ZONE_NAMES],
      ['scan lists', D890_ADDR.SCAN_LIST_DATA],
      ['settings', D890_ADDR.SETTINGS],
      ['talkgroups', D890_ADDR.TALKGROUP_DATA],
      ['RX groups', D890_ADDR.RX_GROUP_DATA],
      ['radio IDs', D890_ADDR.RADIO_ID_DATA],
    ] as const) {
      expect(byAddress.has(address), `${name} (0x${address.toString(16)}) is not in the map`).toBe(
        true,
      );
    }
  });

  it('marks the fields hardware has never seen vary', () => {
    // The distinction the panel exists to show. If everything claimed to be
    // hardware-confirmed, the badge would be decoration.
    const kinds = new Set(D890_CHANNEL_LAYOUT.map((r) => r.provenance));
    expect(kinds.has('hardware')).toBe(true);
    expect(kinds.has('marshaller')).toBe(true);
    // The contact reference is the one place hardware contradicted the vendor
    // binary, so it must not be presented as coming from the binary.
    const callId = D890_CHANNEL_LAYOUT.find((r) => r.vendorName === 'Call_ID')!;
    expect(callId.provenance).toBe('hardware');
    expect(callId.note).toMatch(/index/i);
  });
});
