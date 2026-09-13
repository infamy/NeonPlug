#!/usr/bin/env node
/**
 * Diff two normalised captures — the step where decoding actually happens.
 *
 * A single capture is a STATE. A pair taken either side of one deliberate CPS
 * edit is a DELTA, and a byte that moved is carrying something the edit
 * describes. Every DA-7X2 field identified on 2026-09-07 came from a pair like
 * this: status messages and their bitmask, the analog address book, the MDC1200
 * tables, and the hot keys.
 *
 * Also reports regions present in one capture and not the other. That is not
 * noise — the CPS reads a table only when it is non-empty, so a region APPEARING
 * is itself the finding. MDC1200 was invisible until an edit populated it.
 *
 * Usage:
 *   node tools/diff-captures.mjs <captures> <before-id> <after-id>
 *        [--direction read|write] [--context 16] [--only 0xADDR]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , root, beforeId, afterId, ...rest] = process.argv;
if (!root || !beforeId || !afterId) {
  console.error('usage: diff-captures.mjs <captures-dir> <before-id> <after-id> ' +
                '[--direction read|write] [--context N] [--only 0xADDR]');
  process.exit(1);
}
const flag = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const direction = flag('--direction', 'read');
const context = Number(flag('--context', 16));
const only = flag('--only', null);

const load = (id) => {
  const p = join(root, id, 'manifest.json');
  if (!existsSync(p)) { console.error(`no manifest for ${id}`); process.exit(1); }
  const m = JSON.parse(readFileSync(p, 'utf8'));
  const d = m.directions?.[direction];
  if (!d) { console.error(`${id} has no ${direction} direction`); process.exit(1); }
  return new Map(d.regions.map((r) => [r.address, r]));
};

const before = load(beforeId);
const after = load(afterId);
const bytes = (id, r) => (r.file ? readFileSync(join(root, id, r.file)) : null);

const all = [...new Set([...before.keys(), ...after.keys()])].sort();
let moved = 0;
const appeared = [];
const vanished = [];

for (const addr of all) {
  if (only && addr !== only) continue;
  const b = before.get(addr);
  const a = after.get(addr);
  if (!b) { appeared.push(`${addr}  ${a.bytes} B`); continue; }
  if (!a) { vanished.push(`${addr}  ${b.bytes} B`); continue; }

  const bb = bytes(beforeId, b);
  const ab = bytes(afterId, a);
  if (!bb || !ab) continue;            // redacted
  const n = Math.min(bb.length, ab.length);
  const diffs = [];
  for (let i = 0; i < n; i += 1) if (bb[i] !== ab[i]) diffs.push(i);
  if (!diffs.length && bb.length === ab.length) continue;

  const base = parseInt(addr, 16);
  console.log(`\n${addr}  ${b.bytes} -> ${a.bytes} B   ${diffs.length} byte(s) changed`);
  moved += diffs.length;

  // Group changed offsets into runs and print each with its neighbours, in hex
  // and as UTF-16LE — this radio stores most text that way.
  const groups = [];
  for (const i of diffs) {
    const last = groups[groups.length - 1];
    if (last && i - last[1] <= context) last[1] = i;
    else groups.push([i, i]);
  }
  for (const [lo, hi] of groups.slice(0, 12)) {
    const s = Math.max(0, lo - (lo % 16));
    const e = Math.min(n, hi + 16 - (hi % 16) + 16);
    for (let off = s; off < e; off += 16) {
      const rb = bb.subarray(off, off + 16);
      const ra = ab.subarray(off, off + 16);
      if (rb.equals(ra)) continue;
      const txt = (r) => Array.from({ length: Math.floor(r.length / 2) }, (_, k) => {
        const u = r[k * 2] | (r[k * 2 + 1] << 8);
        return u >= 32 && u < 0x250 ? String.fromCharCode(u) : '.';
      }).join('');
      const hex = (r) => [...r].map((x) => x.toString(16).padStart(2, '0')).join(' ');
      console.log(`   -${(base + off).toString(16)}  ${hex(rb).padEnd(47)}  ${txt(rb)}`);
      console.log(`   +${(base + off).toString(16)}  ${hex(ra).padEnd(47)}  ${txt(ra)}`);
    }
  }
  if (groups.length > 12) console.log(`   … ${groups.length - 12} more changed runs`);
}

// A region the CPS did not fetch before and does now is a finding in itself.
if (appeared.length) console.log(`\nREGIONS THAT APPEARED (${appeared.length}) — the edit populated something:\n   ${appeared.join('\n   ')}`);
if (vanished.length) console.log(`\nregions that vanished (${vanished.length}):\n   ${vanished.join('\n   ')}`);
console.log(`\n${moved} bytes changed across ${all.length} regions.`);
