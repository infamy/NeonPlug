#!/usr/bin/env node
/**
 * Turn a raw vendor-CPS serial capture into a normalised capture directory.
 *
 * WHY THIS EXISTS. A raw capture is 1.6 MB to 312 MB of hex-plus-ASCII text that
 * grep cannot search — high bytes in the ASCII column make it "binary", so grep
 * silently reports nothing, including for strings that are demonstrably present.
 * Every question we actually ask ("what changed between these two reads?",
 * "what does the CPS write at 0x3701000?") needs the frames reassembled first.
 * Doing that once, up front, turns a day of re-parsing into a directory listing.
 *
 * OUTPUT
 *
 *   <out>/<id>/manifest.json      what this capture is, and every run in it
 *   <out>/<id>/regions/0x....bin  one file per contiguous run, raw bytes
 *
 * A region file is directly readable by any tool. The manifest is small enough
 * to read in full, which is the point: an agent can answer "which capture
 * contains 0x3701000?" from the index without touching a byte of capture.
 *
 * Usage:
 *   node tools/normalize-capture.mjs <raw.txt> --id <name> [--kind read|write|auto]
 *        [--out <dir>] [--note "what changed"] [--redact]
 *   node tools/normalize-capture.mjs --reindex [--out <dir>]
 */
import { createReadStream, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, basename } from 'node:path';

const HEX_LINE = /^\s+((?:[0-9a-f]{2} )+)/i;

/**
 * Reassemble frames from one direction of the log.
 *
 * `which` is 'r' for what the radio returned (Read data blocks) or 'w' for what
 * the CPS sent (Written data blocks). Both carry 0x57-opcode frames of the same
 * shape, so the BLOCK TYPE is what distinguishes a read reply from a write
 * command — not the opcode. In written blocks, read REQUESTS appear too and
 * begin 0x52; they carry an address but no data, so counting them as writes
 * invents writes that never happened.
 *
 * Frame bytes are NOT line-aligned: a record's text routinely spans two dump
 * lines and a continuation line can begin with 0x52. Only bytes reassembled per
 * block are real.
 */
async function parse(path, which) {
  const frames = new Map();
  let mode = null;
  let buf = [];
  let first = null;
  let last = null;

  const flush = () => {
    if (buf.length) {
      const bytes = Buffer.from(buf.join(''), 'hex');
      if (bytes.length >= 7 && bytes[0] === 0x57) {
        frames.set(bytes.readUInt32BE(1), bytes.subarray(6, 6 + bytes[5]));
      }
    }
    buf = [];
  };

  const rl = createInterface({ input: createReadStream(path, { encoding: 'latin1' }), crlfDelay: Infinity });
  for await (const line of rl) {
    const stamp = /^\[([^\]]+)\]/.exec(line);
    if (stamp) { first ??= stamp[1]; last = stamp[1]; }
    if (line.includes('Read data')) { flush(); mode = 'r'; continue; }
    if (line.includes('Written data') || line.includes('Open port') || line.includes('Close')) {
      flush(); mode = 'w'; continue;
    }
    const m = mode === which ? HEX_LINE.exec(line) : null;
    if (m) buf.push(m[1].replaceAll(' ', ''));
  }
  flush();
  return { frames, first, last };
}

/** Collapse frames into contiguous runs — the actual memory map. */
function toRuns(frames) {
  const runs = [];
  let cur = null;
  for (const address of [...frames.keys()].sort((a, b) => a - b)) {
    const size = frames.get(address).length;
    if (cur && address === cur.address + cur.size) cur.size += size;
    else { cur = { address, size, parts: [] }; runs.push(cur); }
    cur.parts.push(address);
  }
  return runs;
}

/**
 * Regions holding personal data, blanked when --redact is passed.
 *
 * These captures are a person's actual radio. The contact database alone is
 * 163,000 real names, callsigns and towns; the settings block carries their DMR
 * ID and callsign, and GPS roaming carries their home coordinates. None of that
 * is needed to decode a byte layout, and a redacted capture is one that can be
 * attached to an issue or committed without thinking twice.
 */
const PERSONAL = [
  { lo: 0x07000000, hi: 0x07000010, what: 'contact database header (count)' },
  { lo: 0x07900000, hi: 0x0a280000, what: 'DMR contact database — names, callsigns, towns' },
  { lo: 0x02580000, hi: 0x02580100, what: 'radio ID / callsign' },
  { lo: 0x03501200, hi: 0x03501400, what: 'GPS roaming — home coordinates' },
];

const args = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const has = (name) => args.includes(name);
const outRoot = flag('--out', 'captures');

if (has('--reindex')) {
  reindex(outRoot);
  process.exit(0);
}

const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
if (!file) {
  console.error('usage: normalize-capture.mjs <raw.txt> --id <name> [--kind read|write|auto]\n' +
                '                              [--out dir] [--note "..."] [--redact]\n' +
                '       normalize-capture.mjs --reindex [--out dir]');
  process.exit(1);
}

const id = flag('--id', basename(file).replace(/\.[^.]+$/, ''));
const kind = flag('--kind', 'auto');
const note = flag('--note', '');
const redact = has('--redact');

const wanted = kind === 'auto' ? ['r', 'w'] : [kind === 'write' ? 'w' : 'r'];
const dir = join(outRoot, id);
mkdirSync(join(dir, 'regions'), { recursive: true });

const manifest = {
  id,
  source: basename(file),
  note,
  redacted: redact,
  generatedBy: 'tools/normalize-capture.mjs',
  directions: {},
};

for (const which of wanted) {
  const { frames, first, last } = await parse(file, which);
  if (!frames.size) continue;
  const runs = toRuns(frames);
  const label = which === 'r' ? 'read' : 'write';
  const entries = [];

  for (const run of runs) {
    const buf = Buffer.concat(run.parts.map((a) => frames.get(a)));
    const hex = `0x${run.address.toString(16).padStart(8, '0')}`;
    const personal = PERSONAL.find((p) => run.address >= p.lo && run.address < p.hi);
    const name = `${label}_${hex}.bin`;
    if (redact && personal) {
      entries.push({ address: hex, bytes: buf.length, redacted: true, contains: personal.what });
      continue;
    }
    writeFileSync(join(dir, 'regions', name), buf);
    entries.push({
      address: hex,
      bytes: buf.length,
      file: `regions/${name}`,
      ...(personal ? { personal: personal.what } : {}),
    });
  }

  manifest.directions[label] = {
    frames: frames.size,
    runs: entries.length,
    totalBytes: entries.reduce((n, e) => n + (e.redacted ? 0 : e.bytes), 0),
    firstTimestamp: first,
    lastTimestamp: last,
    regions: entries,
  };
  console.log(`  ${label}: ${frames.size} frames, ${entries.length} runs`);
}

writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`wrote ${join(dir, 'manifest.json')}`);
reindex(outRoot);

/** Rebuild the top-level index: which capture holds which address. */
function reindex(root) {
  if (!existsSync(root)) return;
  const captures = [];
  const byAddress = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const mf = join(root, entry.name, 'manifest.json');
    if (!existsSync(mf)) continue;
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    const dirs = Object.entries(m.directions ?? {});
    captures.push({
      id: m.id,
      note: m.note,
      redacted: m.redacted,
      directions: Object.fromEntries(dirs.map(([k, v]) => [k, { runs: v.runs, bytes: v.totalBytes }])),
    });
    for (const [label, d] of dirs) {
      for (const r of d.regions) {
        (byAddress[r.address] ??= []).push(`${m.id}:${label}`);
      }
    }
  }
  writeFileSync(join(root, 'index.json'), JSON.stringify({
    _why: 'Which capture contains which address. Answer that here, not by re-parsing captures.',
    captures,
    byAddress,
  }, null, 1) + '\n');
  console.log(`indexed ${captures.length} captures, ${Object.keys(byAddress).length} distinct addresses`);
}
