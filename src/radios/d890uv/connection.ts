/**
 * Web Serial connection for the AT-D890UV family (BTECH DA-7X2 / DA-7XR).
 *
 * ⚠️ Transcribed from documentation, not verified on hardware.
 *
 * Unlike the Yaesu SCU-35 cable, this is a full-duplex USB serial bridge — there
 * is no TX/RX echo to strip, so a command's reply is the radio's own response.
 *
 * Session lifecycle:
 *   open()                 — open port at 921600
 *   enterProgramMode()     — PROGRAM -> "QX" + ACK
 *   identify()             — 0x02 -> model/version, rejects the wrong radio
 *   negotiateReadLength()  — probe the largest consistent read size
 *   readMemory(...)        — sparse, addressed reads
 *   sendEnd()              — END, ONLY after a fully successful session
 *   close()                — release the port
 *
 * `sendEnd()` is deliberately not called on failure: the reference states a
 * failed upload must omit END so the radio does not commit a partial write.
 */

import {
  D890_BAUD_RATE,
  D890_CMD,
  D890_HANDSHAKE,
  D890_ID_PREFIXES,
  D890_ID_RESPONSE,
  D890_BLOCK,
  D890_ADDR,
} from './constants';
import {
  buildReadCommand,
  parseReadResponse,
  readResponseSize,
} from './framing';
import { BaseSerialConnection, type SerialLikePort } from '../shared/BaseSerialConnection';
import { requestSerialPort } from '../shared/serialPort';
import { log, logger, LogLevel } from '../../utils/protocolLogger';

const PROGRAM_CMD = new TextEncoder().encode(D890_HANDSHAKE.ENTER);
const END_CMD = new TextEncoder().encode(D890_HANDSHAKE.EXIT);

const HANDSHAKE_TIMEOUT_MS = 8000;
const READ_TIMEOUT_MS = 5000;

export type D890SerialPort = SerialLikePort;

/** Request / reuse a Web Serial port and open it at 921600 baud. */
export async function openD890Port(forceSelection = false): Promise<D890SerialPort> {
  return requestSerialPort(D890_BAUD_RATE, forceSelection);
}

export interface D890Identity {
  /** Model string from bytes 0-7 of the identify response, NULs stripped. */
  model: string;
  /** Version string from bytes 9-12. */
  version: string;
  /** Raw response, kept for the hardware-verification capture. */
  raw: Uint8Array;
}

export class D890Connection extends BaseSerialConnection {
  /**
   * Largest read size confirmed to return consistent data. Starts at the
   * conservative minimum and is raised by negotiateReadLength().
   */
  private readLength: number = D890_BLOCK.MIN_READ_LEN;

  async open(port: D890SerialPort): Promise<void> {
    await super.openPort(port);
    await this.delay(300);
    this.buf = new Uint8Array(0);
    this.readLength = D890_BLOCK.MIN_READ_LEN;
  }

  /** Close streams. Does NOT send END — call sendEnd() first on success. */
  async close(): Promise<void> {
    await super.closeStreams();
  }

  /** The negotiated read chunk size. */
  getReadLength(): number {
    return this.readLength;
  }

  /**
   * Force a read size, bypassing negotiation.
   *
   * For benchmarking. Whether 240-byte reads are actually faster than the
   * vendor's 16 is a measurable question, not an obvious one — a longer reply
   * may cost the radio more per byte than it saves in round trips, and the CPS
   * uses 16 exclusively across a million requests. Rejects anything the frame
   * format cannot express: the length is a single byte and reads are 16-aligned.
   */
  forceReadLength(length: number): void {
    if (length < D890_BLOCK.MIN_READ_LEN || length > D890_BLOCK.MAX_READ_LEN
        || length % D890_BLOCK.ALIGNMENT !== 0) {
      throw new Error(
        `Read length must be a multiple of ${D890_BLOCK.ALIGNMENT} between `
        + `${D890_BLOCK.MIN_READ_LEN} and ${D890_BLOCK.MAX_READ_LEN}`
      );
    }
    this.readLength = length;
  }

  /** PROGRAM -> "QX" + ACK. */
  async enterProgramMode(): Promise<void> {
    await this.write(PROGRAM_CMD);
    const reply = await this.readExact(3, HANDSHAKE_TIMEOUT_MS);
    const text = new TextDecoder().decode(reply.slice(0, 2));
    if (text !== D890_HANDSHAKE.ENTER_REPLY || reply[2] !== D890_CMD.ACK) {
      throw new Error(
        'Could not enter programming mode. Check the cable, that the radio is on, ' +
          'and that no other CPS has the port open.'
      );
    }
  }

  /**
   * Identify the radio. Returns the parsed identity *and* the raw bytes — the
   * raw response is what the hardware checklist needs captured, because the
   * BTECH-branded variants may not report the Anytone string.
   */
  async identify(): Promise<D890Identity> {
    await this.write(new Uint8Array([D890_CMD.IDENTIFY]));
    const raw = await this.readExact(16, HANDSHAKE_TIMEOUT_MS);
    // The whole 16-byte reply at debug level.
    //
    // Captured 2026-08-30 from a real radio:
    //   49 44 4d 52 2d 37 58 32 00 56 31 30 30 00 00 06   "IDMR-7X2.V100.."
    //   'I' opcode | model 1-7 | NUL | version 9-12 | pad | ACK
    //
    // Every byte is accounted for, so the parse below is complete — there is no
    // longer firmware string hiding in the unused bytes. `V100` is genuinely all
    // this radio reports, and it does NOT match the firmware version shown in
    // the radio's own menu (1.05). That version is not exposed by identify, by
    // LocalInfo (0x4f80000 — model and serial only), or by the device identity
    // block (0x7000000 — blank). Do not go looking for it here again.
    log.debug(
      `identify raw: ${Array.from(raw, (b) => b.toString(16).padStart(2, '0')).join(' ')}  ` +
        `ascii "${Array.from(raw, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')}"`,
      'D890'
    );
    const strip = (bytes: Uint8Array) =>
      new TextDecoder().decode(bytes.filter((b) => b !== 0)).trim();
    return {
      model: strip(raw.slice(D890_ID_RESPONSE.MODEL_START, D890_ID_RESPONSE.MODEL_END)),
      version: strip(raw.slice(D890_ID_RESPONSE.VERSION_START, D890_ID_RESPONSE.VERSION_END)),
      raw,
    };
  }

  /**
   * Reject a radio this driver does not understand.
   *
   * Prefix matching, per ADDING_A_RADIO.md — ID strings routinely carry region
   * or variant suffixes, and an exact match locks out valid hardware.
   */
  assertKnownModel(identity: D890Identity): void {
    const matches = D890_ID_PREFIXES.some((prefix) => identity.model.startsWith(prefix));
    if (!matches) {
      throw new Error(
        `Connected radio reports "${identity.model}" (version "${identity.version}"), ` +
          `which this driver does not recognise. Expected one of: ` +
          `${D890_ID_PREFIXES.join(', ')}. If this is a DA-7X2 or DA-7XR, please ` +
          `report the reported string — the BTECH variants' IDs are not yet known.`
      );
    }
  }

  /**
   * Find the largest read size the radio answers consistently.
   *
   * The vendor CPS only ever issues 16-byte reads — all 1,025,484 of them in a
   * captured contact download — so anything larger is our own finding. The
   * length field is a single byte, so 0xf0 is the largest 16-aligned size the
   * frame format can express; there is nothing above it to try.
   *
   * MEASURED 2026-08-31, 16 KB from 0x3480000 on real hardware:
   *
   *     16 B/frame   1.62 s   9.9 KB/s   1,024 frames    1.59 ms/frame
   *    240 B/frame   1.51 s  10.6 KB/s      69 frames   21.84 ms/frame
   *
   * Fifteen times fewer round trips bought SEVEN PERCENT. Time per frame scaled
   * with size (13.7x for a 15x payload), so this radio is byte-limited, not
   * round-trip-limited — and ~10 KB/s is only 11% of the 921600 baud line rate,
   * which puts the ceiling in the radio's own flash reads rather than the wire
   * or our framing. Do not expect a large read size to rescue a slow transfer;
   * it will not. 0xf0 is kept because 7% is free, not because it is decisive.
   *
   * BOTH ENDS of a candidate are checked against independent 16-byte reads.
   * Verifying only the head — as this did until 2026-08-31 — would accept a
   * radio that answers the first 16 bytes correctly and returns rubbish for the
   * remaining 224, and every read afterwards would be quietly corrupt with no
   * symptom but bad data. Any mismatch falls back to 0x10, which is always safe.
   */
  async negotiateReadLength(): Promise<number> {
    const min = D890_BLOCK.MIN_READ_LEN;
    const head = await this.readChunk(D890_ADDR.LOCAL_INFO, min);

    for (const candidate of D890_BLOCK.READ_LEN_CANDIDATES) {
      if (candidate === min) break;
      try {
        // The last aligned window inside the candidate span, read on its own.
        const tailAt = D890_ADDR.LOCAL_INFO + candidate - min;
        const tail = await this.readChunk(tailAt, min);
        const probe = await this.readChunk(D890_ADDR.LOCAL_INFO, candidate);

        const headOk = head.every((byte, i) => probe[i] === byte);
        const tailOk = tail.every((byte, i) => probe[candidate - min + i] === byte);
        if (headOk && tailOk) {
          this.readLength = candidate;
          return candidate;
        }
      } catch {
        // A candidate the radio refuses is simply not usable; try a smaller one.
      }
    }

    this.readLength = min;
    return this.readLength;
  }

  /** One framed read at exactly `length` bytes. */
  private async readChunk(address: number, length: number): Promise<Uint8Array> {
    // Drop anything stale so a previous timeout can't shift this frame.
    this.buf = new Uint8Array(0);
    await this.write(buildReadCommand(address, length));
    const frame = await this.readExact(readResponseSize(length), READ_TIMEOUT_MS);
    // Raw frame at verbose level. The read reply and the write request are the
    // same frame shape, so a captured reply is the only zero-risk way to check
    // the write checksum against the radio's own arithmetic.
    //
    // The level is checked BEFORE building the string. A full codeplug read is
    // thousands of frames, and formatting up to 248 bytes of hex for every one
    // of them costs real time even when the log line is then discarded — it
    // slowed a read to a crawl before this guard was added.
    if (logger.getLevel() >= LogLevel.VERBOSE) {
      log.verbose(
        `RX ${Array.from(frame, (b) => b.toString(16).padStart(2, '0')).join(' ')}`,
        'D890 frame'
      );
    }
    return parseReadResponse(frame, address, length);
  }

  /**
   * Read an arbitrary span, chunked at the negotiated size.
   *
   * `length` must be 16-byte aligned — the reference requires it for both
   * directions, and silently rounding would mean returning bytes the caller did
   * not ask for.
   */
  async readMemory(
    address: number,
    length: number,
    onProgress?: (bytesRead: number, total: number) => void
  ): Promise<Uint8Array> {
    if (length % D890_BLOCK.ALIGNMENT !== 0) {
      throw new Error(
        `D890 read span ${length} must be a multiple of ${D890_BLOCK.ALIGNMENT} bytes`
      );
    }
    const out = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const chunk = Math.min(this.readLength, length - offset);
      // The tail of a span may be shorter than the negotiated size; it still has
      // to be a legal, aligned read length.
      const aligned = Math.max(
        D890_BLOCK.MIN_READ_LEN,
        chunk - (chunk % D890_BLOCK.ALIGNMENT)
      );
      const data = await this.readChunk(address + offset, aligned);
      out.set(data.subarray(0, Math.min(aligned, length - offset)), offset);
      offset += aligned;
      onProgress?.(Math.min(offset, length), length);
    }
    return out;
  }

  /**
   * END + ACK. Call ONLY after a fully successful session — omitting it after a
   * failure is what stops the radio committing a partial write.
   */
  async sendEnd(): Promise<void> {
    await this.write(END_CMD);
    const ack = await this.readExact(1, HANDSHAKE_TIMEOUT_MS);
    if (ack[0] !== D890_CMD.ACK) {
      throw new Error(`Radio did not acknowledge END (got 0x${(ack[0] ?? 0).toString(16)})`);
    }
  }
}
