#!/usr/bin/env node
/**
 * DA-7X2 read/write coverage, split into what a radio NEEDS and what is extra.
 *
 * Parsed out of `recordLayout.ts` rather than counted by hand, because the
 * hand-kept numbers in this project have gone stale twice — and because a
 * `grep -c` for the flag counts any comment that mentions it, which is how the
 * read tally was off by one.
 *
 * Usage: node tools/d890-coverage.mjs [--md]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../src/radios/d890uv/recordLayout.ts', import.meta.url);
const text = readFileSync(SRC, 'utf8');

// Split on the start of each region literal. Frame formats are not memory.
const NOT_MEMORY = new Set(['Read request', 'Read reply', 'Write request']);

const regions = text
  .split(/\{\s*name: '/)
  .slice(1)
  .map((chunk) => {
    const name = chunk.slice(0, chunk.indexOf("'"));
    // Only look at the flags before the note, so prose mentioning a flag by
    // name cannot be mistaken for the flag itself.
    const head = chunk.split('note:')[0];
    return {
      name,
      read: /\bread: true\b/.test(head),
      write: /\bwrite: true\b/.test(head),
      optional: /\boptional: true\b/.test(head),
      neverWrite: /\bneverWrite: true\b/.test(head),
      hardwareRoundTrip: /\bhardwareRoundTrip: true\b/.test(head),
      address: (() => {
        const m = head.match(/address:\s*(0x[0-9a-f]+)/i);
        return m ? parseInt(m[1], 16) : null;
      })(),
    };
  })
  .filter((r) => !NOT_MEMORY.has(r.name));

const core = regions.filter((r) => !r.optional);
const extra = regions.filter((r) => r.optional);

const bar = (n, total, width = 20) => {
  const filled = total === 0 ? 0 : Math.round((n / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};
const pct = (n, total) => (total === 0 ? 0 : Math.round((n / total) * 100));

// A region flagged neverWrite is excluded from the WRITE and ROUND-TRIP
// denominators. Counting one as a miss means the row can never reach 100% and
// reports a permanent shortfall that is really a correct decision — `Local info`
// is the radio identifying itself, and writing it would change what the radio
// claims to be. Read coverage still counts it, because it IS read.
function line(label, set, key) {
  const scope = key === 'read' ? set : set.filter((r) => !r.neverWrite);
  const n = scope.filter((r) => r[key]).length;
  return { label, n, total: scope.length, pct: pct(n, scope.length), bar: bar(n, scope.length) };
}

const rows = [
  line('Core read', core, 'read'),
  line('Core write', core, 'write'),
  // Separate on purpose. `write` is the OFFLINE round trip — parse -> encode
  // reproducing captured vendor bytes. This is the HARDWARE one: written to a
  // radio and read back in another session. The radio ACKs a write without
  // echoing it, so only the second proves the address was right too.
  line('Core HW round-trip', core, 'hardwareRoundTrip'),
  line('Extra read', extra, 'read'),
  line('Extra write', extra, 'write'),
  line('Extra HW round-trip', extra, 'hardwareRoundTrip'),
];

/**
 * `--write` regenerates DA7X2-COVERAGE.md.
 *
 * The coverage table lived inside TODO-DA7X2.md until 2026-09-09 and went stale
 * twice by being hand-kept. Generating a whole file instead of a fragment means
 * there is nothing to hand-keep: the numbers cannot drift from `recordLayout.ts`
 * because nobody types them.
 *
 * Deliberately carries NO timestamp — a generated file that changes on every run
 * makes every regeneration a diff, which hides the runs that actually moved a
 * number.
 */
const writeTo = process.argv.includes('--write');
if (writeTo) {
  const gap = core.filter((r) => r.read && !r.write && !r.neverWrite).map((r) => r.name);
  const never = core.filter((r) => r.neverWrite).map((r) => r.name);
  const out = [
    '# DA-7X2 — region coverage',
    '',
    '> **GENERATED. Do not edit.** Run `node tools/d890-coverage.mjs --write`.',
    '> The numbers come from the flags in `src/radios/d890uv/recordLayout.ts`;',
    '> editing them here changes nothing and creates a second, wrong answer.',
    '',
    '| | Coverage | |',
    '|---|---|---|',
    ...rows.map((r) => `| **${r.label}** | \`${r.bar}\` | **${r.pct}%** — ${r.n} of ${r.total} |`),
    '',
    `Core regions: ${core.length}. Extra regions: ${extra.length}.`,
    '',
    never.length
      ? `Excluded from the write and round-trip denominators (\`neverWrite\`): ${never.map((n) => `\`${n}\``).join(', ')} — the radio identifying itself.`
      : 'No regions are flagged `neverWrite`.',
    '',
    '## Readable but not encodable',
    '',
    gap.length ? gap.map((n) => `- ${n}`).join('\n') : '_None._',
    '',
    '## What each dimension means',
    '',
    '- **read** — the region is fetched and parsed.',
    '- **write** — the OFFLINE round trip: `parse` → `encode` reproduces captured',
    '  vendor bytes exactly. Provable with no radio.',
    '- **HW round-trip** — read from a radio, **one field changed**, written, read',
    '  back in a SEPARATE session, change confirmed and nothing else moved.',
    '',
    'The offline round trip cannot catch an encoder aimed at the wrong ADDRESS:',
    'this radio ACKs a write without echoing it, so perfect bytes sent to the wrong',
    'place look exactly like success. And because encoders PATCH rather than',
    'rebuild, a region whose fields are never written round-trips a no-op',
    'perfectly — which is why **write-back evidence never promotes a region.**',
    '',
    'What earned each round trip is recorded in `HW-ROUNDTRIP-TESTS.md`.',
    '',
  ].join('\n');
  writeFileSync(new URL('../DA7X2-COVERAGE.md', import.meta.url), out);
  console.log('wrote DA7X2-COVERAGE.md');
  process.exit(0);
}

const md = process.argv.includes('--md');
if (md) {
  console.log('| | Coverage | |');
  console.log('|---|---|---|');
  for (const r of rows) {
    console.log(`| **${r.label}** | \`${r.bar}\` | **${r.pct}%** — ${r.n} of ${r.total} |`);
  }
} else {
  for (const r of rows) {
    console.log(`${r.label.padEnd(20)} ${r.bar}  ${String(r.pct).padStart(3)}%  ${r.n}/${r.total}`);
  }
  const gap = core.filter((r) => r.read && !r.write && !r.neverWrite).map((r) => r.name);
  console.log(`\ncore regions readable but not encodable: ${gap.length}`);
  for (const n of gap) console.log(`   - ${n}`);
  const unread = core.filter((r) => !r.read).map((r) => r.name);
  // "Not read" was misleading and caused real confusion on 2026-09-03.
  //
  // Most undecoded regions ARE fetched — blind, by the preserve pass, which
  // reads every VENDOR_WRITE_RUN that nothing else has already read. Adding a
  // decoder does not add a read: the decoder's read lands first and the
  // preserve pass then skips that run. Same bytes on the wire either way.
  //
  // So split them. Only the second group needs new traffic; the first only
  // needs a parser, and the bytes are already in every read log we have.
  const preserved = new Set();
  try {
    const cw = readFileSync(new URL('../src/radios/d890uv/codeplugWrite.ts', import.meta.url), 'utf8');
    const runs = cw.slice(cw.indexOf('VENDOR_WRITE_RUNS'));
    for (const m of runs.matchAll(/address:\s*(0x[0-9a-f]+),\s*bytes:\s*(\d+)/gi)) {
      preserved.add([parseInt(m[1], 16), parseInt(m[2], 10)]);
    }
  } catch { /* tool still works without the split */ }

  const addrOf = (name) => {
    const r = regions.find((x) => x.name === name);
    return r ? r.address : null;
  };
  // The run's ACTUAL extent, not a guessed window — a loose window put the
  // analog address book in the wrong group, which is the sort of error that
  // makes a coverage report worse than no report.
  const inPreserve = (a) =>
    a !== null && [...preserved].some(([start, len]) => a >= start && a < start + len);

  const opaque = unread.filter((n) => inPreserve(addrOf(n)));
  const absent = unread.filter((n) => !inPreserve(addrOf(n)));

  console.log(`\ncore regions READ but not decoded: ${opaque.length}`);
  console.log('   (already fetched by the preserve pass — a parser is all that is missing)');
  for (const n of opaque) console.log(`   - ${n}`);

  console.log(`\ncore regions NOT read at all: ${absent.length}`);
  for (const n of absent) console.log(`   - ${n}`);
}
