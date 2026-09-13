/**
 * Writing the DMR contact database.
 *
 * MEASURED END TO END from two vendor CPS uploads captured on 2026-09-10 —
 * 1,005 contacts (`7x2_dmrcontactlist.txt`) and 500,000 (`7x2_500k.txt`) — and
 * this module reproduces both byte for byte: the 1,005 in full, and every byte
 * of the 500,000 the capture holds. That is the header, all 4,000,000 bytes of
 * index across 16 banks, and 4,104,944 bytes of records across 20 bank
 * boundaries, where the capture's logger stopped. The session is:
 *
 *   PROGRAM -> ack -> identify -> read 0x04f80020 (16 bytes, a probe)
 *   write 0x07000000   header
 *   write 0x07080000+  index, banked
 *   write 0x07900000+  records, banked
 *   END
 *
 * **THERE IS NO ERASE.** Ordinary 16-byte `57` frames — the machinery a
 * codeplug write uses — and nothing else.
 *
 * Three regions, and MISSING ANY ONE LEAVES THE RADIO UNABLE TO FIND CONTACTS:
 *
 *   1. **Header** at 0x07000000 — count, end address, 8 bytes of zero padding
 *      (zero across databases of 1,005 and 500,000).
 *   2. **Index** from 0x07080000 — one 8-byte entry per contact, `(key, offset)`,
 *      ascending by key. `key = bcdAsHex(dmrId) << 1`; `offset` is the record's
 *      position in the WHOLE record stream, not within its bank. Banked: 256,000
 *      bytes — 32,000 entries — at the start of every 0x80000.
 *   3. **Records** from 0x07900000 — one stream in INPUT order, banked 200,000
 *      bytes to every 0x80000, records spanning the boundaries.
 *
 * Both banked layouts keep clear of the flash-management markers at 0x3fbf0 of
 * every 0x40000 unit; that is what the banking is for. A small index never
 * reaches one, which is why the 1,005-contact upload could not show it — and
 * why this module briefly refused anything over 32,637 contacts, the point
 * where an unbanked index runs into the first marker.
 *
 * ⚠️ ORDER. The INDEX is sorted. The RECORDS are not, and never needed to be.
 * Every database seen before the 500,000 upload had records in ID order only
 * because its source did — RadioID's list, a 1,005-row CSV already in order —
 * and this module sorted records on that inference. The 500,000 upload used a
 * shuffled CSV: the CPS wrote the records in file order and the sorted index
 * pointed at each. Records now go in input order, which makes our bytes the
 * vendor's for the same list.
 *
 * ⚠️ FIELDS HAVE HARD LENGTH LIMITS — see `D890_CONTACT_FIELD_MAX`. This module
 * originally did NOT truncate, on the reasoning that the vendor's truncation
 * was a CSV-import quirk. It is not. Writing a 16-character city to a radio
 * produced a database the CPS read as 137 contacts of 200, fields sliding one
 * column right from the first overlong record on. The reader stops at the limit
 * and continues from there rather than from the NUL, so an overrun field
 * desynchronises every field after it.
 */

import { encodeBcdAsHexU32 } from './channelWrite';
import {
  D890_DIGITAL_CONTACTS,
  encodeDigitalContact,
  type D890DigitalContact,
} from './digitalContacts';
import type { D890WriteFrame } from './writePlan';

export interface D890ContactWritePlan {
  frames: D890WriteFrame[];
  /** Contacts in the order their records were written: the order given. */
  contacts: readonly D890DigitalContact[];
  count: number;
  /** One past the last record, in radio address space — NOT a length. */
  endAddress: number;
  /** Byte length of the record stream, before bank chopping. */
  streamBytes: number;
}

/**
 * Whole 16-byte frames, the only size this radio writes.
 *
 * Full frames are VIEWS into `data` rather than copies: a 133,699-contact write
 * is 914,862 frames, and a separate buffer for each was the difference between
 * a plan that fits in a browser tab and one that might not. Only a partial last
 * frame is allocated, its tail filled with `fill` — zero for records, as the
 * vendor pads them, and 0xFF for the index, as the vendor's 1,005-entry index
 * ends.
 */
function framesFor(address: number, data: Uint8Array, what: string, fill = 0x00): D890WriteFrame[] {
  const out: D890WriteFrame[] = [];
  for (let off = 0; off < data.length; off += 0x10) {
    let frame = data.subarray(off, off + 0x10);
    if (frame.length < 0x10) {
      const padded = new Uint8Array(0x10).fill(fill);
      padded.set(frame);
      frame = padded;
    }
    out.push({ address: address + off, data: frame, what });
  }
  return out;
}

/**
 * Radio address of a byte of the record stream.
 *
 * The stream is chopped into 200,000-byte pieces laid 0x80000 apart, so the
 * address runs ahead of the offset by the unused tail of every bank passed.
 * Proven against the vendor's 500,000 upload across 20 boundaries.
 */
export function contactStreamAddress(offset: number): number {
  const { BASE, BANK_STRIDE, BANK_BYTES } = D890_DIGITAL_CONTACTS;
  return BASE + Math.floor(offset / BANK_BYTES) * BANK_STRIDE + (offset % BANK_BYTES);
}

/**
 * The header's end address: one past the last record, as an ADDRESS.
 *
 * Reproduces every header on record: the vendor's 0x079171de for 94,686 bytes
 * and 0x1039d304 for 55,519,556, and the reference radio's 0x0a201e1c for its
 * 163,467 contacts.
 */
export function contactEndAddress(streamBytes: number): number {
  return contactStreamAddress(streamBytes);
}

/**
 * Record-stream length from a header's end address — the inverse of
 * `contactEndAddress`, and how a read knows how much to fetch. Null for an
 * address that cannot end a stream: below the records, or in a bank's unused
 * tail.
 */
export function contactStreamLength(endAddress: number): number | null {
  const { BASE, BANK_STRIDE, BANK_BYTES } = D890_DIGITAL_CONTACTS;
  const rel = endAddress - BASE;
  if (rel < 0) return null;
  const within = rel % BANK_STRIDE;
  if (within > BANK_BYTES) return null;
  return Math.floor(rel / BANK_STRIDE) * BANK_BYTES + within;
}

/** Radio address of index entry `n` — 32,000 to a bank, banks 0x80000 apart. */
export function contactIndexAddress(n: number): number {
  const { INDEX, INDEX_BANK_ENTRIES, INDEX_BANK_STRIDE } = D890_DIGITAL_CONTACTS;
  return INDEX + Math.floor(n / INDEX_BANK_ENTRIES) * INDEX_BANK_STRIDE + (n % INDEX_BANK_ENTRIES) * 8;
}

/** The index key, `bcdAsHex(dmrId) << 1`: ID 3340001 -> 0x03340001 -> 0x06680002. */
export function contactIndexKey(dmrId: number): number {
  const bcd = encodeBcdAsHexU32(dmrId);
  return (((bcd[0]! << 24) | (bcd[1]! << 16) | (bcd[2]! << 8) | bcd[3]!) >>> 0) * 2;
}

export function planDigitalContactWrite(
  contacts: readonly D890DigitalContact[]
): D890ContactWritePlan {
  const {
    HEADER, HEADER_SIZE, BASE, BANK_STRIDE, BANK_BYTES, RECORD_BANKS_MAX,
    MAX_CONTACTS, INDEX, INDEX_BANK_BYTES, INDEX_BANK_STRIDE,
  } = D890_DIGITAL_CONTACTS;

  // The cheap refusals first, before a byte is encoded.
  if (contacts.length > MAX_CONTACTS) {
    throw new Error(
      `Refusing to write ${contacts.length.toLocaleString()} contacts: the radio is ` +
        `rated for ${MAX_CONTACTS.toLocaleString()}, the size its index region was ` +
        `shown holding.`
    );
  }
  const seen = new Set<number>();
  for (const c of contacts) {
    if (seen.has(c.dmrId)) {
      throw new Error(
        `Refusing to write contacts: DMR ID ${c.dmrId} appears twice. ` +
          `The index is keyed by ID, so duplicates would make one of them unreachable.`
      );
    }
    seen.add(c.dmrId);
  }

  // Records, in the order given.
  const encoded = contacts.map(encodeDigitalContact);
  const streamBytes = encoded.reduce((n, r) => n + r.length, 0);
  if (streamBytes > RECORD_BANKS_MAX * BANK_BYTES) {
    throw new Error(
      `Refusing to write contacts: they need ${streamBytes.toLocaleString()} bytes ` +
        `of records, past bank ${RECORD_BANKS_MAX - 1}.\n\n` +
        `That is the furthest anything has written — the vendor's own ` +
        `500,000-contact upload ended in bank 277 — and where the region stops ` +
        `beyond it is unknown. Writing past it would mean guessing an address.`
    );
  }
  const stream = new Uint8Array(streamBytes);
  const offsets: number[] = [];
  let at = 0;
  for (const record of encoded) {
    offsets.push(at);
    stream.set(record, at);
    at += record.length;
  }

  // The index, sorted by key — which is also ID order, since the key is the
  // ID's decimal digits read as hex — but the key is what the radio searches.
  // Keys are computed once: a comparator that re-derived them would be sorting
  // half a million entries by allocating on every comparison.
  const keys = contacts.map((c) => contactIndexKey(c.dmrId));
  const order = contacts.map((_, i) => i).sort((a, b) => keys[a]! - keys[b]!);
  const index = new Uint8Array(contacts.length * 8);
  const putU32 = (buf: Uint8Array, pos: number, value: number) => {
    buf[pos] = value & 0xff;
    buf[pos + 1] = (value >>> 8) & 0xff;
    buf[pos + 2] = (value >>> 16) & 0xff;
    buf[pos + 3] = (value >>> 24) & 0xff;
  };
  order.forEach((i, n) => {
    putU32(index, n * 8, keys[i]! >>> 0);
    putU32(index, n * 8 + 4, offsets[i]!);
  });

  const endAddress = contactEndAddress(streamBytes);
  const header = new Uint8Array(HEADER_SIZE);
  putU32(header, 0, contacts.length);
  putU32(header, 4, endAddress);
  // +0x08..0x0f stay zero: see the padding note in digitalContacts.ts.

  // Header, then index, then records — the order the CPS uses.
  const frames: D890WriteFrame[] = framesFor(HEADER, header, 'contact header');
  for (let start = 0, bank = 0; start < index.length; start += INDEX_BANK_BYTES, bank += 1) {
    const chunk = index.subarray(start, Math.min(start + INDEX_BANK_BYTES, index.length));
    // 0xFF finishes a partial last frame. It is PADDING, not a terminator: the
    // vendor's 1,005-entry index ends in eight 0xFF, and its frame-aligned
    // 500,000-entry index ends with nothing after it at all.
    frames.push(...framesFor(INDEX + bank * INDEX_BANK_STRIDE, chunk, 'contact index', 0xff));
  }
  for (let start = 0, bank = 0; start < streamBytes; start += BANK_BYTES, bank += 1) {
    const chunk = stream.subarray(start, Math.min(start + BANK_BYTES, streamBytes));
    frames.push(...framesFor(BASE + bank * BANK_STRIDE, chunk, `contact records bank ${bank}`));
  }

  return { frames, contacts: [...contacts], count: contacts.length, endAddress, streamBytes };
}
