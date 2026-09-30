/**
 * Web Serial connection for the Radtel RT-950 Pro.
 *
 * One session per read or write, as the vendor CPS runs it: handshake, then
 * one request per 0x80-byte block, then 'E'. Every block is scrambled with the
 * key the handshake picked. A write gets one acknowledgement per block and goes
 * no further without it.
 */

import {
  RT950PRO_ACK,
  RT950PRO_BAUD_RATE,
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
import { BaseSerialConnection, type SerialLikePort } from '../shared/BaseSerialConnection';
import { requestSerialPort } from '../shared/serialPort';
import { negotiatedKeyIndex, uv17proCrypt } from '../shared/uv17proCrypt';

/** The vendor CPS waits a second and retries; the CHIRP driver found 3 s safe. */
const REPLY_TIMEOUT_MS = 3000;
/** How long the line has to stay quiet before the handshake starts. */
const QUIET_MS = 50;

const KEY_INDEX = negotiatedKeyIndex(RT950PRO_KEY_FRAME);

export type RT950ProSerialPort = SerialLikePort;

export async function openRT950ProPort(forceSelection = false): Promise<RT950ProSerialPort> {
  return requestSerialPort(RT950PRO_BAUD_RATE, forceSelection);
}

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

export class RT950ProConnection extends BaseSerialConnection {
  async open(port: RT950ProSerialPort): Promise<void> {
    await super.openPort(port);
    // pyserial raises DTR and RTS on open, and so does every CHIRP session;
    // Web Serial leaves them low unless asked.
    await port.setSignals?.({ dataTerminalReady: true, requestToSend: true });
  }

  async close(): Promise<void> {
    await super.closeStreams();
  }

  /**
   * Run the handshake and return what the radio calls itself. Refuses a radio
   * whose model reply doesn't start with "RT-950".
   */
  async handshake(): Promise<string> {
    await this.discardInput();

    await this.write(RT950PRO_IDENT);
    await this.expectAck('the handshake');

    await this.write(Uint8Array.of(RT950PRO_PROBE));
    await this.readExact(RT950PRO_PROBE_REPLY_LEN, REPLY_TIMEOUT_MS);

    await this.write(Uint8Array.of(RT950PRO_MODEL_QUERY));
    const reply = await this.readExact(RT950PRO_MODEL_REPLY_LEN, REPLY_TIMEOUT_MS);
    const model = String.fromCharCode(...reply.filter((b) => b >= 0x20 && b < 0x7f)).trim();
    if (!model.startsWith(RT950PRO_MODEL_PREFIX)) {
      throw new Error(
        `The radio says it is ${model ? `"${model}"` : 'nothing at all'}, not an RT-950 Pro. Check the radio picked.`
      );
    }

    await this.write(RT950PRO_KEY_FRAME);
    await this.expectAck('the key frame');
    return model;
  }

  /** Read one block and unscramble it. The reply repeats the request's header first. */
  async readBlock(command: number, address: number): Promise<Uint8Array> {
    const header = blockHeader(command, address);
    await this.write(header);
    const reply = await this.readExact(RT950PRO_HEADER_LEN + RT950PRO_BLOCK_SIZE, REPLY_TIMEOUT_MS);
    for (let i = 0; i < RT950PRO_HEADER_LEN; i++) {
      if (reply[i] !== header[i]) {
        throw new Error(
          `The reply to block ${hex(address, 4)} starts ${Array.from(reply.subarray(0, 4), (b) => hex(b)).join(' ')}, not the request's header — the radio and this app are out of step.`
        );
      }
    }
    return uv17proCrypt(KEY_INDEX, reply.subarray(RT950PRO_HEADER_LEN));
  }

  /** Scramble and write one block, and wait for the radio to accept it. */
  async writeBlock(command: number, address: number, block: Uint8Array): Promise<void> {
    if (block.length !== RT950PRO_BLOCK_SIZE) {
      throw new Error(`A block is ${RT950PRO_BLOCK_SIZE} bytes, not ${block.length}`);
    }
    assertWritableBlock(command, address);
    const frame = new Uint8Array(RT950PRO_HEADER_LEN + RT950PRO_BLOCK_SIZE);
    frame.set(blockHeader(command, address));
    frame.set(uv17proCrypt(KEY_INDEX, block), RT950PRO_HEADER_LEN);
    await this.write(frame);
    await this.expectAck(`block ${hex(address, 4)}`);
  }

  /** End the session. */
  async end(): Promise<void> {
    await this.write(Uint8Array.of(RT950PRO_END));
  }

  private async expectAck(what: string): Promise<void> {
    let reply: Uint8Array;
    try {
      reply = await this.readExact(1, REPLY_TIMEOUT_MS);
    } catch {
      throw new Error(`The radio didn't answer ${what}. Check it is on and the cable is fully seated.`);
    }
    if (reply[0] !== RT950PRO_ACK) {
      throw new Error(`The radio answered ${what} with ${hex(reply[0])} instead of an acknowledgement.`);
    }
  }

  /**
   * Drop anything that arrived before the handshake — a USB serial adapter can
   * hand over bytes from before the port was opened, and the CHIRP driver
   * clears the input the same way before it starts.
   */
  private async discardInput(): Promise<void> {
    while ((await this.waitForChunk(QUIET_MS)) !== null) {
      // keep reading until the line has been quiet for QUIET_MS
    }
    this.buf = new Uint8Array(0);
  }
}
