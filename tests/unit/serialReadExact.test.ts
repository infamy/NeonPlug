/**
 * `readExact` must return as soon as the bytes are there. It may WAIT ON THE
 * RADIO — never on a clock.
 *
 * It used to sleep 10 ms after every partial chunk (`await this.delay(10)`).
 * `reader.read()` already blocks until data arrives, so the sleep bought
 * nothing and cost twice: at least 10 ms per partial chunk in the foreground,
 * and about a second or more per chunk in a background tab, where Chrome
 * throttles timers. On 2026-09-11 a DA-7X2 read session of ~335 requests took
 * 208 s with the tab behind the vendor CPS; the same radio wrote 2,370 frames/s
 * with the tab in front.
 *
 * Two tests run with the clock FROZEN: a read that needs a timer to finish
 * cannot finish at all, which makes "no timer on the data path" an assertion
 * rather than a benchmark. The timeout race against `reader.read()` still has to
 * work — a silent radio must fail, not hang — so that is pinned too.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  BaseSerialConnection,
  type SerialLikePort,
} from '../../src/radios/shared/BaseSerialConnection';

/** A port whose incoming bytes the test hands over by hand, in pieces. */
function fakePort() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
  });
  const writable = new WritableStream<Uint8Array>({ write: () => {} });
  const port: SerialLikePort = { readable, writable, open: async () => {}, close: async () => {} };
  return { port, send: (bytes: number[] | Uint8Array) => controller.enqueue(Uint8Array.from(bytes)) };
}

/** Records every timer-based wait the base class makes. */
class Probe extends BaseSerialConnection {
  readonly delays: number[] = [];
  protected override delay(ms: number): Promise<void> {
    this.delays.push(ms);
    return super.delay(ms);
  }
  attach(port: SerialLikePort) {
    return this.openPort(port);
  }
  read(n: number, timeoutMs = 5000) {
    return this.readExact(n, timeoutMs);
  }
}

const bytes = (n: number, from = 0) => Array.from({ length: n }, (_, i) => (from + i) & 0xff);

/** A 248-byte DA-7X2 read reply, arriving the way USB serial hands it over. */
function sendInPieces(send: (b: number[]) => void) {
  send(bytes(64, 0));
  send(bytes(64, 64));
  send(bytes(64, 128));
  send(bytes(56, 192));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('readExact waits on the radio, not on a clock', () => {
  it('assembles a response from several partial chunks without sleeping between them', async () => {
    const { port, send } = fakePort();
    const c = new Probe();
    await c.attach(port);
    sendInPieces(send);
    expect(Array.from(await c.read(248))).toEqual(bytes(248));
    // The old loop slept 10 ms after each of the first three pieces.
    expect(c.delays).toEqual([]);
  });

  it('finishes with the clock frozen — no timer stands between the bytes and the caller', async () => {
    vi.useFakeTimers();
    const { port, send } = fakePort();
    const c = new Probe();
    await c.attach(port);
    const pending = c.read(248);
    sendInPieces(send);
    expect(Array.from(await pending)).toEqual(bytes(248));
  }, 2000);

  it('keeps what arrived past the request for the next one', async () => {
    const { port, send } = fakePort();
    const c = new Probe();
    await c.attach(port);
    send(bytes(20));
    expect(Array.from(await c.read(8))).toEqual(bytes(8));
    expect(Array.from(await c.read(12))).toEqual(bytes(12, 8));
    expect(c.delays).toEqual([]);
  });

  it('pauses only for an EMPTY chunk, so a source that yields nothing cannot spin', async () => {
    const { port, send } = fakePort();
    const c = new Probe();
    await c.attach(port);
    send([]);
    send(bytes(16));
    expect(Array.from(await c.read(16))).toEqual(bytes(16));
    expect(c.delays).toEqual([10]);
  });
});

describe('the timeout race is kept', () => {
  it('fails a silent radio after the timeout rather than hanging', async () => {
    vi.useFakeTimers();
    const { port } = fakePort();
    const c = new Probe();
    await c.attach(port);
    const outcome = expect(c.read(16, 3000)).rejects.toThrow('Timeout: needed 16 bytes, have 0');
    await vi.advanceTimersByTimeAsync(3000);
    await outcome;
  });

  it('reports how far a response got when the radio stops mid-way', async () => {
    vi.useFakeTimers();
    const { port, send } = fakePort();
    const c = new Probe();
    await c.attach(port);
    const outcome = expect(c.read(248, 3000)).rejects.toThrow('Timeout: needed 248 bytes, have 100');
    send(bytes(100));
    await vi.advanceTimersByTimeAsync(3000);
    await outcome;
  });
});
