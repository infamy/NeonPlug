/**
 * A simulated Radtel RT-950 Pro for tests, answering the way the protocol notes
 * and the Bluetooth project's hardware findings say the radio does. It takes
 * bytes in any pieces (the cable delivers whole messages, Bluetooth 20 bytes at
 * a time) and frames them itself.
 */
import { uv17proCrypt } from '../../../src/radios/shared/uv17proCrypt';
import { encodeFrequency, slotOf } from '../../../src/radios/rt950pro/structures';
import type { SerialLikePort } from '../../../src/radios/shared/BaseSerialConnection';

const KEY = 1;

/** How long each message is, from its first byte. */
function messageLength(first: number): number {
  switch (first) {
    case 0x50: return 14; // PROGRAMBT9000U
    case 0x46: case 0x4d: case 0x45: return 1; // F, M, E
    case 0x53: return 25; // SEND frame
    case 0x52: case 0x54: return 4; // read request
    case 0x57: case 0x58: case 0x55: return 4 + 0x80; // write frame
    default: throw new Error(`the simulated radio can't frame a message starting 0x${first.toString(16)}`);
  }
}

export class SimulatedRT950 {
  clone = new Uint8Array(0x10000);
  aprs = new Uint8Array(0x80);
  model = 'RT-950';
  answersIdent = true;
  wrongHeader = false;
  writes: { command: number; address: number }[] = [];
  sessionsEnded = 0;
  /** Called with every reply. */
  onReply: (bytes: Uint8Array) => void = () => {};
  /** Called after the APRS block is acknowledged — the flash commit. */
  onCommit: () => void = () => {};
  private pending = new Uint8Array(0);

  constructor() {
    // Every region gets a pattern, the ones nothing may write included, so any stray write shows.
    for (let i = 0; i < this.clone.length; i++) this.clone[i] = (i * 13 + 7) & 0xff;
    for (let i = 0; i < this.aprs.length; i++) this.aprs[i] = (i * 5 + 3) & 0xff;
    this.clone.fill(0xff, 0, 0x7800); // 960 empty channel slots
  }

  /** Put a channel in slot `number`. */
  channel(number: number, name: string, mhz: number): void {
    const slot = slotOf(this.clone, number);
    slot.fill(0xff);
    encodeFrequency(mhz, slot, 0);
    encodeFrequency(mhz, slot, 4);
    slot.set([0, 0, 0, 0, 0x03, 0x01, 0x40, 0x06], 8); // no tones, signalling 3, PTT ID 1, scrambler 4, scan + TX
    slot.set(Array.from(name, (c) => c.charCodeAt(0)), 20);
  }

  feed(bytes: Uint8Array): void {
    const next = new Uint8Array(this.pending.length + bytes.length);
    next.set(this.pending);
    next.set(bytes, this.pending.length);
    this.pending = next;
    while (this.pending.length > 0) {
      const length = messageLength(this.pending[0]);
      if (this.pending.length < length) return;
      const message = this.pending.slice(0, length);
      this.pending = this.pending.slice(length);
      this.handle(message);
    }
  }

  private reply(bytes: ArrayLike<number>): void {
    this.onReply(Uint8Array.from(bytes));
  }

  private handle(message: Uint8Array): void {
    const text = String.fromCharCode(...message);
    const [command, high, low, length] = message;
    const address = (high << 8) | low;
    if (text === 'PROGRAMBT9000U') {
      if (this.answersIdent) this.reply([0x06]);
    } else if (command === 0x46) {
      this.reply(new Array(16).fill(0x5a));
    } else if (command === 0x4d) {
      const reply = new Uint8Array(12);
      reply.set(Array.from(this.model, (c) => c.charCodeAt(0)));
      this.reply(reply);
    } else if (command === 0x53) {
      this.reply([0x06]);
    } else if (command === 0x45) {
      this.sessionsEnded++;
    } else if (command === 0x52 || command === 0x54) {
      const memory = command === 0x54 ? this.aprs : this.clone;
      const header = this.wrongHeader ? [command, high, low ^ 0x80, length] : Array.from(message.subarray(0, 4));
      this.reply([...header, ...uv17proCrypt(KEY, memory.subarray(address, address + length))]);
    } else if (command === 0x55) {
      // What the radio answers the APRS write the CHIRP driver's notes guessed.
      this.reply([0x54, 0x5a]);
    } else if (command === 0x57 || command === 0x58) {
      this.writes.push({ command, address });
      (command === 0x58 ? this.aprs : this.clone).set(uv17proCrypt(KEY, message.subarray(4, 4 + length)), address);
      this.reply([0x06]);
      if (command === 0x58) this.onCommit();
    }
  }
}

/** The radio behind a Web Serial port that opens and closes the way Chrome's does. */
export function serialPortFor(radio: SimulatedRT950): SerialLikePort {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  radio.onReply = (bytes) => controller?.enqueue(bytes);
  const port = {
    readable: null as ReadableStream<Uint8Array> | null,
    writable: null as WritableStream<Uint8Array> | null,
    setSignals: async () => {},
    open: async () => {
      port.readable = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
      port.writable = new WritableStream<Uint8Array>({ write: (chunk) => radio.feed(chunk) });
    },
    close: async () => {
      if (port.readable?.locked || port.writable?.locked) throw new TypeError('Cannot cancel a locked stream');
      port.readable = null;
      port.writable = null;
    },
  };
  return port;
}
