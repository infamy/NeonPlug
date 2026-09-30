/**
 * One RT-950 Pro programming session, over whichever link carries it — the USB
 * cable or Bluetooth. The protocol is the same on both: handshake, one request
 * per 0x80-byte block, then 'E'. Every block is scrambled with the key the
 * handshake picked, and a write gets an acknowledgement per block and goes no
 * further without one.
 */

import {
  RT950PRO_ACK,
  RT950PRO_BLOCK_SIZE,
  RT950PRO_END,
  RT950PRO_HEADER_LEN,
  RT950PRO_IDENT,
  RT950PRO_KEY_FRAME,
  RT950PRO_MODEL_PREFIX,
  RT950PRO_MODEL_QUERY,
  RT950PRO_MODEL_REPLY_LEN,
  RT950PRO_PROBE,
  RT950PRO_PROBE_REPLY_LEN,
  RT950PRO_SEGMENTS,
} from './constants';
import { negotiatedKeyIndex, uv17proCrypt } from '../shared/uv17proCrypt';

/** How a session reaches the radio: bytes out, bytes back. */
export interface Rt950Link {
  send(bytes: Uint8Array): Promise<void>;
  /** Exactly `n` bytes, or throw after `timeoutMs`. */
  receive(n: number, timeoutMs: number): Promise<Uint8Array>;
  /** Drop what has arrived, once nothing more has come for `quietMs`. */
  drain(quietMs: number): Promise<void>;
  close(): Promise<void>;
  /** How long a reply may take. Bluetooth trickles a block in over several notifications. */
  readonly replyTimeoutMs: number;
}

/** How long the line has to stay quiet before the handshake starts. */
const QUIET_MS = 50;

const KEY_INDEX = negotiatedKeyIndex(RT950PRO_KEY_FRAME);

const hex = (n: number, width = 2) => `0x${n.toString(16).padStart(width, '0')}`;

function blockHeader(command: number, address: number): Uint8Array {
  return Uint8Array.of(command, (address >> 8) & 0xff, address & 0xff, RT950PRO_BLOCK_SIZE);
}

/**
 * Refuse any block that isn't inside a region the vendor CPS writes, with that
 * region's write command. Checked on every block, before a byte is sent: the
 * 2 KB at 0x7800 and everything from 0xE000 up hold what looks like
 * calibration, and no path through this driver may reach them.
 */
export function assertWritableBlock(command: number, address: number): void {
  const inside = RT950PRO_SEGMENTS.some(
    (s) =>
      s.writeCommand === command &&
      address >= s.address &&
      address + RT950PRO_BLOCK_SIZE <= s.address + s.length &&
      (address - s.address) % RT950PRO_BLOCK_SIZE === 0
  );
  if (!inside) {
    throw new Error(
      `Refusing to write ${hex(command)} at ${hex(address, 4)}: it is outside every region the RT-950 Pro's own software writes.`
    );
  }
}

export class RT950ProSession {
  constructor(private readonly link: Rt950Link) {}

  /**
   * Run the handshake and return what the radio calls itself. Refuses a radio
   * whose model reply doesn't start with "RT-950".
   */
  async handshake(): Promise<string> {
    // A link can hand over bytes from before the session — a USB adapter's
    // leftovers, the Bluetooth unlock's reply. The CHIRP driver clears the
    // input the same way before it starts.
    await this.link.drain(QUIET_MS);

    await this.link.send(RT950PRO_IDENT);
    await this.expectAck('the handshake', this.link.replyTimeoutMs);

    await this.link.send(Uint8Array.of(RT950PRO_PROBE));
    await this.link.receive(RT950PRO_PROBE_REPLY_LEN, this.link.replyTimeoutMs);

    await this.link.send(Uint8Array.of(RT950PRO_MODEL_QUERY));
    const reply = await this.link.receive(RT950PRO_MODEL_REPLY_LEN, this.link.replyTimeoutMs);
    const model = String.fromCharCode(...reply.filter((b) => b >= 0x20 && b < 0x7f)).trim();
    if (!model.startsWith(RT950PRO_MODEL_PREFIX)) {
      throw new Error(
        `The radio says it is ${model ? `"${model}"` : 'nothing at all'}, not an RT-950 Pro. Check the radio picked.`
      );
    }

    await this.link.send(RT950PRO_KEY_FRAME);
    await this.expectAck('the key frame', this.link.replyTimeoutMs);
    return model;
  }

  /** Read one block and unscramble it. The reply repeats the request's header first. */
  async readBlock(command: number, address: number): Promise<Uint8Array> {
    const header = blockHeader(command, address);
    await this.link.send(header);
    const reply = await this.link.receive(RT950PRO_HEADER_LEN + RT950PRO_BLOCK_SIZE, this.link.replyTimeoutMs);
    for (let i = 0; i < RT950PRO_HEADER_LEN; i++) {
      if (reply[i] !== header[i]) {
        throw new Error(
          `The reply to block ${hex(address, 4)} starts ${Array.from(reply.subarray(0, 4), (b) => hex(b)).join(' ')}, not the request's header — the radio and this app are out of step.`
        );
      }
    }
    return uv17proCrypt(KEY_INDEX, reply.subarray(RT950PRO_HEADER_LEN));
  }

  /** Scramble and write one block, and wait up to `ackTimeoutMs` for the radio to accept it. */
  async writeBlock(command: number, address: number, block: Uint8Array, ackTimeoutMs: number): Promise<void> {
    if (block.length !== RT950PRO_BLOCK_SIZE) {
      throw new Error(`A block is ${RT950PRO_BLOCK_SIZE} bytes, not ${block.length}`);
    }
    assertWritableBlock(command, address);
    const frame = new Uint8Array(RT950PRO_HEADER_LEN + RT950PRO_BLOCK_SIZE);
    frame.set(blockHeader(command, address));
    frame.set(uv17proCrypt(KEY_INDEX, block), RT950PRO_HEADER_LEN);
    await this.link.send(frame);
    await this.expectAck(`block ${hex(address, 4)}`, ackTimeoutMs);
  }

  /**
   * End the session. After a write that committed to flash the radio may
   * already have dropped a Bluetooth link, so `bestEffort` lets that go.
   */
  async end({ bestEffort = false }: { bestEffort?: boolean } = {}): Promise<void> {
    try {
      await this.link.send(Uint8Array.of(RT950PRO_END));
    } catch (err) {
      if (!bestEffort) throw err;
    }
  }

  async close(): Promise<void> {
    await this.link.close();
  }

  private async expectAck(what: string, timeoutMs: number): Promise<void> {
    let reply: Uint8Array;
    try {
      reply = await this.link.receive(1, timeoutMs);
    } catch {
      throw new Error(`The radio didn't answer ${what}. Check it is on and the cable or Bluetooth link is connected.`);
    }
    if (reply[0] !== RT950PRO_ACK) {
      throw new Error(`The radio answered ${what} with ${hex(reply[0])} instead of an acknowledgement.`);
    }
  }
}
