#!/usr/bin/env node
/**
 * Turn a vendor-CPS serial capture into a memory map.
 *
 * The CPS logs look like this — a timestamped header, then a hex+ASCII dump:
 *
 *   [31/08/2026 15:24:57] Written data (COM3)
 *       52 07 90 0f a0 10                    R......
 *   [31/08/2026 15:24:57] Read data (COM3)
 *       57 07 90 0f a0 10 00 00 56 00 41 00  W.......V.A.
 *       37 00 58 00 4a 00 43 00 00 00 09 06  7.X.J.C.....
 *
 * A read reply is `57 <addr:4 BE> <len> <data…> <checksum> 06`.
 *
 * TWO TRAPS THIS EXISTS TO AVOID, both of which cost real time:
 *
 *  1. `grep` is useless on these files. They run to hundreds of megabytes with
 *     high bytes in the ASCII column, so grep treats them as binary and reports
 *     nothing — including for strings that are demonstrably present.
 *  2. Frame bytes are NOT line-aligned. A record's text routinely spans two
 *     dump lines, and a continuation line can begin with `52`, which looks
 *     exactly like a read request. Matching per line invents regions that do
 *     not exist. Only bytes reassembled per Read/Written block are real.
 *
 * Usage:
 *   node tools/parse-serial-capture.mjs <capture.txt> [--map out.json]
 *                                       [--extract 0x7900000:0x1000 out.bin]
 *                                       [--find "VA7IF"]
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const HEX_LINE = /^\s+((?:[0-9a-f]{2} )+)/i;

/** Reassemble every read reply into an address → bytes map. */
async function parse(path, which = 'r') {
  const frames = new Map();
  let mode = null;
  let buf = [];

  const flush = () => {
    if (buf.length) {
      const bytes = Buffer.from(buf.join(''), 'hex');
      // 0x57 'W' is the radio's reply; anything else is a request or handshake.
      // 0x57 'W' is a read REPLY from the radio in a "Read data" block, and a
      // write COMMAND from the host in a "Written data" one — same shape, so
      // the block type is what distinguishes them, not the opcode.
      //
      // The trap when reading Written blocks: read REQUESTS live there too and
      // begin 0x52 'R'. They carry an address and a length but no data, so
      // counting them as writes invents writes the CPS never made.
      if (bytes.length >= 7 && bytes[0] === 0x57) {
        const address = bytes.readUInt32BE(1);
        frames.set(address, bytes.subarray(6, 6 + bytes[5]));
      }
    }
    buf = [];
  };

  const rl = createInterface({
    input: createReadStream(path, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.includes('Read data')) { flush(); mode = 'r'; continue; }
    if (line.includes('Written data') || line.includes('Open port') || line.includes('Close')) {
      flush(); mode = 'w'; continue;
    }
    const m = mode === which ? HEX_LINE.exec(line) : null;
    if (m) buf.push(m[1].replaceAll(' ', ''));
  }
  flush();
  return frames;
}

/** Collapse the frames into contiguous runs — the actual memory map. */
function toRuns(frames) {
  const runs = [];
  let current = null;
  for (const address of [...frames.keys()].sort((a, b) => a - b)) {
    const size = frames.get(address).length;
    if (current && address === current.address + current.size) current.size += size;
    else { current = { address, size }; runs.push(current); }
  }
  return runs;
}

const [, , file, ...rest] = process.argv;
if (!file) {
  console.error('usage: parse-serial-capture.mjs <capture.txt> [--map out.json] ' +
                '[--extract 0xADDR:0xLEN out.bin] [--find "TEXT"] [--writes]');
  process.exit(1);
}

// --writes maps what the CPS SENT rather than what the radio returned.
const wantWrites = rest.includes('--writes');
const frames = await parse(file, wantWrites ? 'w' : 'r');
if (wantWrites) console.log('(write frames — what the CPS sent to the radio)');
const runs = toRuns(frames);
console.log(`${frames.size} frames, ${runs.length} contiguous runs`);
for (const r of runs.slice(0, 40)) {
  console.log(`  0x${r.address.toString(16).padStart(8, '0')}  ${r.size} bytes`);
}
if (runs.length > 40) console.log(`  … ${runs.length - 40} more`);

const arg = (name) => { const i = rest.indexOf(name); return i < 0 ? null : rest[i + 1]; };

const mapOut = arg('--map');
if (mapOut) {
  writeFileSync(mapOut, JSON.stringify({
    source: file,
    frames: frames.size,
    runs: runs.map((r) => [`0x${r.address.toString(16)}`, r.size]),
  }, null, 1));
  console.log(`\nwrote ${mapOut}`);
}

const extract = arg('--extract');
if (extract) {
  const [spec, out] = [extract, rest[rest.indexOf('--extract') + 2]];
  const [addrStr, lenStr] = spec.split(':');
  const start = Number(addrStr), length = Number(lenStr);
  const bin = Buffer.alloc(length, 0xff);
  for (const [address, bytes] of frames) {
    if (address >= start && address < start + length) {
      bytes.copy(bin, address - start);
    }
  }
  writeFileSync(out, bin);
  console.log(`\nwrote ${out} (0x${start.toString(16)} + ${length})`);
}

const find = arg('--find');
if (find) {
  // Searched over reassembled bytes, never the log text — see trap 2 above.
  const needle = Buffer.from(find, 'utf16le');
  const sorted = [...frames.keys()].sort((a, b) => a - b);
  const blob = Buffer.concat(sorted.map((a) => frames.get(a)));
  const offsets = [];
  for (let i = blob.indexOf(needle); i >= 0 && offsets.length < 10; i = blob.indexOf(needle, i + 1)) {
    offsets.push(i);
  }
  // map blob offset back to a radio address
  const locate = (off) => {
    let seen = 0;
    for (const a of sorted) {
      const n = frames.get(a).length;
      if (off < seen + n) return a + (off - seen);
      seen += n;
    }
    return null;
  };
  console.log(`\n"${find}": ${offsets.length ? offsets.map((o) => `0x${locate(o).toString(16)}`).join(', ') : 'not found'}`);
}
