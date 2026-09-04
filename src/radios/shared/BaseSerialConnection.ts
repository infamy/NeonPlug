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
}

export abstract class BaseSerialConnection {
  protected reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  protected writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  protected buf = new Uint8Array(0);
  protected port: SerialLikePort | null = null;

  protected async openPort(port: SerialLikePort): Promise<void> {
    this.port = port;
    this.buf = new Uint8Array(0);
    if (!port.readable || !port.writable) throw new Error('Port streams unavailable');
    if (port.readable.locked || port.writable.locked) throw new Error('Port already in use');
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
  }

  protected async closeStreams(): Promise<void> {
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { await this.writer?.close(); } catch { /* ignore */ }
    if (this.port) {
      try { await this.port.close(); } catch { /* ignore */ }
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
  }

  protected async write(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    await this.writer.write(data);
  }

  protected async readExact(n: number, timeoutMs: number): Promise<Uint8Array<ArrayBuffer>> {
    const deadline = Date.now() + timeoutMs;
    while (this.buf.length < n) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Timeout: needed ${n} bytes, have ${this.buf.length}`);
      }

      // The deadline check above is not enough on its own: `reader.read()` never
      // resolves while the radio sends nothing, so a silent radio used to hang
      // the whole operation forever instead of timing out. Racing the read
      // against the remaining time is what turns "the app froze" into
      // "Timeout: needed 3 bytes, have 0" — which is the difference between a
      // debuggable failure and a mystery.
      const TIMED_OUT = Symbol('timeout');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        this.reader!.read(),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), remaining);
        }),
      ]);
      clearTimeout(timer);

      if (result === TIMED_OUT) {
        throw new Error(`Timeout: needed ${n} bytes, have ${this.buf.length}`);
      }

      const { value, done } = result;
      if (done) throw new Error('Serial port closed unexpectedly');
      if (value && value.length > 0) {
        const next = new Uint8Array(this.buf.length + value.length);
        next.set(this.buf);
        next.set(value, this.buf.length);
        this.buf = next;
      }
      if (this.buf.length < n) await this.delay(10);
    }
    const result = new Uint8Array(this.buf.slice(0, n));
    this.buf = this.buf.length > n ? this.buf.slice(n) : new Uint8Array(0);
    return result;
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
