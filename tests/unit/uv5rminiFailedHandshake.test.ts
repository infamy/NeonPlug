/**
 * A UV5R-Mini that doesn't answer over serial must fail the read and leave the
 * port free, so the next Read can open it without reloading the page.
 *
 * Before: the handshake waited on `reader.read()` with no timeout and hung at
 * 5%. Once it timed out properly, the half-open connection was dropped with
 * its streams still locked; closing the port then failed, and every later
 * attempt — including the automatic retry — reported the port "busy".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { UV5RMiniProtocol } from '../../src/radios/uv5rmini/protocol';
import { requestSerialPort } from '../../src/radios/shared/serialPort';

/** A port with a radio on it that never says anything, closing the way Chrome does. */
function silentRadioPort() {
  const port = {
    readable: null as ReadableStream<Uint8Array> | null,
    writable: null as WritableStream<Uint8Array> | null,
    setSignals: async () => {},
    open: async () => {
      port.readable = new ReadableStream<Uint8Array>();
      port.writable = new WritableStream<Uint8Array>();
    },
    close: async () => {
      if (port.readable?.locked || port.writable?.locked) {
        throw new TypeError('Cannot cancel a locked stream');
      }
      port.readable = null;
      port.writable = null;
    },
  };
  vi.stubGlobal('navigator', {
    serial: { getPorts: async () => [port], requestPort: async () => port },
  });
  return port;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a UV5R-Mini that does not answer over serial', () => {
  it('fails the connect and leaves the port free for the next attempt', async () => {
    vi.useFakeTimers();
    const port = silentRadioPort();
    const protocol = new UV5RMiniProtocol();

    const failed = expect(protocol.connect({ transport: 'serial' })).rejects.toThrow('Timeout waiting for byte 0x6');
    await vi.advanceTimersByTimeAsync(10_000);
    await failed;

    expect(port.readable).toBeNull();
    await expect(requestSerialPort(115200)).resolves.toBe(port);
  });
});
