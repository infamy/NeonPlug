import { describe, it, expect } from 'vitest';
import { D890Connection } from '../../src/radios/d890uv/connection';
import type { SerialLikePort } from '../../src/radios/shared/BaseSerialConnection';

/**
 * The DA-7X2 session, tested against a radio that answers exactly as the real
 * one does in the vendor CPS's captures.
 *
 * Both captures — a full read (`7x2_read_new.txt`) and a full programming
 * session (`WriteTo7x2.txt`) — open with the SAME envelope:
 *
 *     HOST   50 52 4f 47 52 41 4d              "PROGRAM"
 *     RADIO  51 58 06                          "QX" + ACK
 *     HOST   02
 *     RADIO  49 44 4d 52 2d 37 58 32 00 56 31 30 30 00 00 06
 *                                              'I' "DMR-7X2\0" "V100\0\0" ACK
 *     ...    frames, each acknowledged ...
 *     HOST   45 4e 44                          "END"
 *     RADIO  06
 *
 * A write frame is answered with a bare ACK — no echo — so there is nothing in
 * the reply to verify the write against. That is exactly why the bytes the host
 * puts on the wire are what this asserts.
 */

const ID_REPLY = [
  0x49, 0x44, 0x4d, 0x52, 0x2d, 0x37, 0x58, 0x32,
  0x00, 0x56, 0x31, 0x30, 0x30, 0x00, 0x00, 0x06,
];

/** A radio that speaks the captured protocol and records what it was sent. */
class FakeRadio {
  readonly sent: number[] = [];
  /** Set to fail the Nth write frame (1-based) with a NAK instead of an ACK. */
  failWriteNumber: number | null = null;
  private writeCount = 0;
  private controller!: ReadableStreamDefaultController<Uint8Array>;

  readonly port: SerialLikePort;

  constructor() {
    const readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
    });
    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.handle(chunk);
      },
    });
    this.port = {
      readable,
      writable,
      open: async () => {},
      close: async () => {},
    };
  }

  private reply(bytes: number[]) {
    this.controller.enqueue(new Uint8Array(bytes));
  }

  private handle(chunk: Uint8Array) {
    this.sent.push(...chunk);
    const text = new TextDecoder().decode(chunk);
    if (text === 'PROGRAM') return this.reply([0x51, 0x58, 0x06]);
    if (text === 'END') return this.reply([0x06]);
    if (chunk.length === 1 && chunk[0] === 0x02) return this.reply(ID_REPLY);
    if (chunk[0] === 0x57) {
      this.writeCount += 1;
      // 0x15 is not an ACK; any non-ACK must abort the session.
      const ok = this.failWriteNumber === null || this.writeCount !== this.failWriteNumber;
      return this.reply([ok ? 0x06 : 0x15]);
    }
  }
}

const hex = (bytes: readonly number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');

async function connected(radio: FakeRadio) {
  const conn = new D890Connection();
  await conn.open(radio.port);
  await conn.enterProgramMode();
  const identity = await conn.identify();
  return { conn, identity };
}

describe('D890 session layer', () => {
  it('opens with the exact handshake bytes from the capture', async () => {
    const radio = new FakeRadio();
    const { identity } = await connected(radio);

    expect(hex(radio.sent)).toBe('50 52 4f 47 52 41 4d 02');
    // The leading 0x49 ('I') is the response opcode and is KEPT as part of the
    // model string — D890_ID_PREFIXES matches on 'IDMR-7X2' and 'ID890UV'.
    expect(identity.model).toBe('IDMR-7X2');
    expect(identity.version).toBe('V100');
  });

  it('accepts the model string the captured radio actually reports', async () => {
    const radio = new FakeRadio();
    const { conn, identity } = await connected(radio);
    // The capture's exact ID reply must not be rejected by the model guard —
    // a driver that refuses the radio in front of it is worse than useless.
    expect(() => conn.assertKnownModel(identity)).not.toThrow();
  });

  it('writes 16-byte frames that match the vendor wire bytes', async () => {
    const radio = new FakeRadio();
    const { conn } = await connected(radio);
    radio.sent.length = 0;

    // The first two payloads of the real programming session.
    await conn.writeMemory(
      0x01000000,
      new Uint8Array([
        0x14, 0x50, 0x12, 0x50, 0x14, 0x50, 0x12, 0x50,
        0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x26, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ])
    );

    expect(hex(radio.sent)).toBe(
      '57 01 00 00 00 10 14 50 12 50 14 50 12 50 10 00 00 00 00 00 00 00 ad 06 ' +
      '57 01 00 00 10 10 26 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 4c 06'
    );
  });

  it('closes a successful session with END', async () => {
    const radio = new FakeRadio();
    const { conn } = await connected(radio);
    radio.sent.length = 0;
    await conn.sendEnd();
    expect(hex(radio.sent)).toBe('45 4e 44');
  });

  it('reports bytes written, not frames — the link is byte-limited', async () => {
    const radio = new FakeRadio();
    const { conn } = await connected(radio);
    const seen: number[] = [];
    await conn.writeMemory(0x01000000, new Uint8Array(64), (written) => seen.push(written));
    expect(seen).toEqual([16, 32, 48, 64]);
  });
});

describe('a failed write can never be committed', () => {
  it('stops at the failing frame and does not send the rest', async () => {
    const radio = new FakeRadio();
    const { conn } = await connected(radio);
    radio.failWriteNumber = 2;
    radio.sent.length = 0;

    await expect(conn.writeMemory(0x01000000, new Uint8Array(64))).rejects.toThrow(
      /rejected the write at 0x1000010/
    );
    // Two frames attempted, not four: it must not carry on past a refusal.
    expect(radio.sent.filter((b, i) => b === 0x57 && i % 24 === 0)).toHaveLength(2);
  });

  it('refuses to send END afterwards, whoever asks', async () => {
    const radio = new FakeRadio();
    const { conn } = await connected(radio);
    radio.failWriteNumber = 1;

    await expect(conn.writeMemory(0x01000000, new Uint8Array(16))).rejects.toThrow();
    expect(conn.isAborted()).toBe(true);

    radio.sent.length = 0;
    // END is what makes the radio COMMIT. `disconnect()` sends it
    // unconditionally, so any caller cleaning up in a finally would otherwise
    // commit exactly the partial write the rule exists to prevent.
    await conn.sendEnd();
    expect(radio.sent).toHaveLength(0);
  });

  it('stays aborted for the rest of the session', async () => {
    const radio = new FakeRadio();
    const { conn } = await connected(radio);
    radio.failWriteNumber = 1;
    await expect(conn.writeMemory(0x01000000, new Uint8Array(16))).rejects.toThrow();

    // A later write that the radio would ACK does not un-poison the session.
    radio.failWriteNumber = null;
    await conn.writeMemory(0x02000000, new Uint8Array(16));
    expect(conn.isAborted()).toBe(true);

    radio.sent.length = 0;
    await conn.sendEnd();
    expect(radio.sent).toHaveLength(0);
  });
});
