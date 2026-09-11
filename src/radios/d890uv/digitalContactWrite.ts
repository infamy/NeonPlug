/**
 * Writing the DMR contact database.
 *
 * MEASURED END TO END on 2026-09-10 from a vendor CPS capture uploading 1,005
 * contacts (`7x2_dmrcontactlist.txt`), and every claim here comes from those
 * bytes rather than from inference. The whole session is:
 *
 *   PROGRAM -> ack -> identify -> read 0x04f80020 (16 bytes, a probe)
 *   write 0x07000000  header    1 frame
 *   write 0x07080000  index     503 frames
 *   write 0x07900000  records   5,925 frames
 *   read 0x079171d0   (the final frame, read back)
 *   END
 *
 * **THERE IS NO ERASE.** The CPS sends ordinary 16-byte `57` frames — the same
 * machinery a codeplug write uses — in that order and nothing else. This was
 * the open question that made a contact writer risky, and the capture closes
 * it.
 *
 * Three regions, and MISSING ANY ONE OF THEM LEAVES THE RADIO UNABLE TO FIND
 * CONTACTS:
 *
 *   1. **Header** at 0x07000000 — `count` and `endAddress`, then 8 bytes of
 *      padding. The padding reading is now settled: it stayed zero across
 *      databases of 1,005 and 163,467 contacts, which is the test
 *      `digitalContacts.ts` set for itself.
 *   2. **Index** at 0x07080000 — `(count + 1) * 8` bytes. Each entry is a u32
 *      key and a u32 byte offset of that record in the stream, ascending by
 *      key, terminated by eight 0xFF. The key is
 *      `bcdAsHex(dmrId) << 1`: ID 3340001 gives 0x03340001, doubled to
 *      0x06680002. Verified on all 1,005 entries.
 *   3. **Records** at 0x07900000 — one contiguous stream, chopped into
 *      200,000-byte pieces written at `BASE + n * 0x80000`.
 *
 * CONTACTS MUST BE SORTED BY DMR ID. Every one of the 163,467 records on the
 * reference radio is in ascending order with no duplicates, and the index is
 * ordered by a key that is monotonic in the ID — which is what a binary search
 * needs. Writing them unsorted would produce a database the radio cannot search.
 *
 * ⚠️ FIELDS HAVE HARD LENGTH LIMITS — see `D890_CONTACT_FIELD_MAX`. This module
 * originally did NOT truncate, on the reasoning that the vendor's truncation
 * was a CSV-import quirk. It is not. Writing a 16-character city to a radio
 * produced a database the CPS read as 137 contacts of 200, fields sliding one
 * column right from the first overlong record on. The reader stops at the limit
 * and continues from there rather than from the NUL, so an overrun field
 * desynchronises every field after it.
 *
 * ⚠️ The BANK CHOPPING is the one part not proven by a write capture: 1,005
 * contacts are 94,686 bytes and fit in the first bank, so that upload never
 * crossed a boundary. It is proven by the READ side instead — bank 1 of the
 * reference radio begins `ames E\0Loveland\0…`, the middle of a record whose
 * name started in bank 0. Records span banks; the stream is not padded per
 * bank.
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
  /** Contacts written, in the order they were written. */
  contacts: readonly D890DigitalContact[];
  count: number;
  /** One past the last record, in radio address space — NOT a length. */
  endAddress: number;
  /** Byte length of the record stream, before bank chopping. */
  streamBytes: number;
}

/** Pad to a whole number of 16-byte frames, the only size this radio writes. */
function framesFor(address: number, data: Uint8Array, what: string): D890WriteFrame[] {
  const out: D890WriteFrame[] = [];
  for (let off = 0; off < data.length; off += 0x10) {
    const chunk = new Uint8Array(0x10);
    chunk.set(data.subarray(off, Math.min(off + 0x10, data.length)));
    out.push({ address: address + off, data: chunk, what });
  }
  return out;
}

/**
 * The address one past the last record.
 *
 * Not `BASE + length`: the stream is chopped across banks that are 0x80000
 * apart while only 200,000 bytes of each hold records, so the address runs
 * ahead of the offset. Verified against the reference radio, whose 16,407,708
 * bytes over 82 full banks give 0x0a201e1c — the exact value in its header.
 */
export function contactEndAddress(streamBytes: number): number {
  const { BASE, BANK_STRIDE, BANK_BYTES } = D890_DIGITAL_CONTACTS;
  const fullBanks = Math.floor(streamBytes / BANK_BYTES);
  return BASE + fullBanks * BANK_STRIDE + (streamBytes % BANK_BYTES);
}

export function planDigitalContactWrite(
  contacts: readonly D890DigitalContact[]
): D890ContactWritePlan {
  const { BASE, BANK_STRIDE, BANK_BYTES, BANKS, HEADER, HEADER_SIZE } = D890_DIGITAL_CONTACTS;

  // Sorted, because the radio searches this by key and an unsorted database is
  // one it cannot find anything in.
  const sorted = [...contacts].sort((a, b) => a.dmrId - b.dmrId);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.dmrId === sorted[i - 1]!.dmrId) {
      throw new Error(
        `Refusing to write contacts: DMR ID ${sorted[i]!.dmrId} appears twice. ` +
          `The index is keyed by ID, so duplicates would make one of them unreachable.`
      );
    }
  }

  // Records first, because the index needs each one's offset.
  const encoded = sorted.map(encodeDigitalContact);
  const streamBytes = encoded.reduce((n, r) => n + r.length, 0);
  if (streamBytes > BANKS * BANK_BYTES) {
    throw new Error(
      `Refusing to write contacts: ${sorted.length} contacts need ` +
        `${streamBytes.toLocaleString()} bytes, past bank ${BANKS - 1}.\n\n` +
        `That is NOT the radio's limit — it is rated for ` +
        `${D890_DIGITAL_CONTACTS.MAX_CONTACTS.toLocaleString()} contacts and the ` +
        `region plainly continues. It is the furthest anything has ever read or ` +
        `written: the vendor CPS walked ${BANKS} banks because that is where the ` +
        `reference database ended, so where the region STOPS is unknown.\n\n` +
        `Writing past it would be guessing at an address, which is how a ` +
        `neighbouring table gets destroyed. Confirm the region's end first.`
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

  // Index: key, offset, then the 0xFF terminator the CPS writes.
  const index = new Uint8Array((sorted.length + 1) * 8);
  const putU32 = (buf: Uint8Array, pos: number, value: number) => {
    buf[pos] = value & 0xff;
    buf[pos + 1] = (value >>> 8) & 0xff;
    buf[pos + 2] = (value >>> 16) & 0xff;
    buf[pos + 3] = (value >>> 24) & 0xff;
  };
  sorted.forEach((contact, i) => {
    const bcd = encodeBcdAsHexU32(contact.dmrId);
    const key = (((bcd[0]! << 24) | (bcd[1]! << 16) | (bcd[2]! << 8) | bcd[3]!) >>> 0) * 2;
    putU32(index, i * 8, key >>> 0);
    putU32(index, i * 8 + 4, offsets[i]!);
  });
  index.fill(0xff, sorted.length * 8);

  const endAddress = contactEndAddress(streamBytes);

  const header = new Uint8Array(HEADER_SIZE);
  putU32(header, 0, sorted.length);
  putU32(header, 4, endAddress);
  // +0x08..0x0f stay zero: see the padding note in digitalContacts.ts.

  // Header, then index, then records — the order the CPS uses.
  const frames: D890WriteFrame[] = [
    ...framesFor(HEADER, header, 'contact header'),
    ...framesFor(D890_DIGITAL_CONTACTS.INDEX, index, 'contact index'),
  ];
  for (let bank = 0; bank * BANK_BYTES < streamBytes || bank === 0; bank += 1) {
    const start = bank * BANK_BYTES;
    if (start >= streamBytes && bank > 0) break;
    const chunk = stream.subarray(start, Math.min(start + BANK_BYTES, streamBytes));
    frames.push(...framesFor(BASE + bank * BANK_STRIDE, chunk, `contact records bank ${bank}`));
  }

  return { frames, contacts: sorted, count: sorted.length, endAddress, streamBytes };
}
