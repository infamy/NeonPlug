/**
 * Shared Web Serial boilerplate: port open/close, reader/writer lifecycle,
 * buffered readExact, write helper, and delay. Extended by each radio's
 * connection class, which only needs to implement its framing protocol.
 */

export interface SerialLikePort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void>;
}

export abstract class BaseSerialConnection {
  protected reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  protected writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  protected buf = new Uint8Array(0);
  protected port: SerialLikePort | null = null;

  /**
   * The read the radio's next bytes will arrive on — only ever one.
   *
   * Web Serial cannot take back a `read()` once it has been asked for, so a
   * wait that timed out used to leave its read behind and start another. The
   * next bytes the radio sent went to the abandoned read and were lost: after
   * any timeout, the first chunk of the next reply simply vanished, which on
   * the FT-65 made every retry after a first timeout fail the same way (the
   * July 2026 review's "lost reply"). Now whatever arrives is added to `buf` by
   * the read itself, whoever is waiting, and the next wait takes over the same
   * read instead of starting a second one.
   */
  private inFlight: Promise<number> | null = null;

  protected async openPort(port: SerialLikePort): Promise<void> {
    this.port = port;
    this.buf = new Uint8Array(0);
    if (!port.readable || !port.writable) throw new Error('Port streams unavailable');
    if (port.readable.locked || port.writable.locked) throw new Error('Port already in use');
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
  }

  protected async closeStreams(): Promise<void> {
    // Cancel, then let go of each stream: a port can't be closed while a reader
    // or writer still holds one, and closing it is what frees it for the next
    // operation.
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { this.reader?.releaseLock(); } catch { /* ignore */ }
    try { await this.writer?.close(); } catch { /* ignore */ }
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    if (this.port) {
      try { await this.port.close(); } catch { /* ignore */ }
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.inFlight = null;
  }

  protected async write(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    await this.writer.write(data);
  }

  protected async readExact(n: number, timeoutMs: number): Promise<Uint8Array<ArrayBuffer>> {
    const deadline = Date.now() + timeoutMs;
    while (this.buf.length < n) {
      const got = await this.waitForChunk(deadline - Date.now());
      if (got === null) {
        throw new Error(`Timeout: needed ${n} bytes, have ${this.buf.length}`);
      }
      if (got === 0) {
        // An EMPTY chunk is the only time to pause: `read()` came back with
        // nothing, so going straight round could spin. Every real chunk goes
        // straight back to `read()`, which itself blocks until the radio sends
        // more — the only wait this loop needs.
        //
        // This used to sleep 10 ms after EVERY partial chunk. That cost at least
        // 10 ms per piece of a multi-packet reply in the foreground, and far more
        // in a background tab, where Chrome throttles timers to about one a
        // second: a DA-7X2 read session of ~335 requests took 208 s behind the
        // vendor CPS on 2026-09-11. tests/unit/serialReadExact.test.ts runs a
        // reply with the clock frozen, so a timer back on this path fails it.
        await this.delay(10);
      }
    }
    const result = new Uint8Array(this.buf.slice(0, n));
    this.buf = this.buf.length > n ? this.buf.slice(n) : new Uint8Array(0);
    return result;
  }

  /**
   * Wait up to `timeoutMs` for the radio's next chunk, which lands in `buf`.
   * Resolves to its length — 0 for an empty chunk — or to null when the time
   * runs out first. On a timeout the read carries on, and the next wait picks
   * it up rather than asking for another.
   *
   * The race is what turns a silent radio into "Timeout: needed 3 bytes, have
   * 0" instead of a hang: `read()` never resolves while nothing arrives.
   */
  protected async waitForChunk(timeoutMs: number): Promise<number | null> {
    if (timeoutMs <= 0) return null;
    const TIMED_OUT = Symbol('timeout');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      this.nextChunk(),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    return result === TIMED_OUT ? null : result;
  }

  /** The read in flight, started if there is none. Resolves to the chunk's length. */
  private nextChunk(): Promise<number> {
    if (this.inFlight) return this.inFlight;
    if (!this.reader) throw new Error('Not connected');
    const read: Promise<number> = this.reader.read().then(
      ({ value, done }) => {
        if (this.inFlight === read) this.inFlight = null;
        if (done) throw new Error('Serial port closed unexpectedly');
        if (!value || value.length === 0) return 0;
        const next = new Uint8Array(this.buf.length + value.length);
        next.set(this.buf);
        next.set(value, this.buf.length);
        this.buf = next;
        return value.length;
      },
      (err: unknown) => {
        if (this.inFlight === read) this.inFlight = null;
        throw err;
      }
    );
    // A read nobody is waiting on any more can still fail — the port closing
    // under it, say. The waiter, if there is one, sees the error; this only
    // stops it being reported as unhandled when there is none.
    read.catch(() => {});
    this.inFlight = read;
    return read;
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
