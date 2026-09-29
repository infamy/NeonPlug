/**
 * A port an earlier operation left open is closed and opened again at the
 * speed this radio needs, never reused at whatever speed it was left at.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestSerialPort } from '../../src/radios/shared/serialPort';

function fakePort({ open, locked = false }: { open: boolean; locked?: boolean }) {
  const calls: string[] = [];
  const port = {
    readable: open ? ({ locked } as unknown as ReadableStream<Uint8Array>) : null,
    writable: open ? ({ locked: false } as unknown as WritableStream<Uint8Array>) : null,
    open: async ({ baudRate }: { baudRate: number }) => {
      calls.push(`open ${baudRate}`);
    },
    close: async () => {
      calls.push('close');
    },
  };
  vi.stubGlobal('navigator', {
    serial: { getPorts: async () => [port], requestPort: async () => port },
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestSerialPort', () => {
  it('opens a closed port at the rate asked for', async () => {
    const calls = fakePort({ open: false });
    await requestSerialPort(9600);
    expect(calls).toEqual(['open 9600']);
  });

  it("reopens a port left open, at this radio's rate", async () => {
    // Left open at 9600 by an FT-65 that failed part-way, say.
    const calls = fakePort({ open: true });
    await requestSerialPort(115200);
    expect(calls).toEqual(['close', 'open 115200']);
  });

  it('refuses a port another operation still holds', async () => {
    const calls = fakePort({ open: true, locked: true });
    await expect(requestSerialPort(115200)).rejects.toThrow('busy');
    expect(calls).toEqual([]);
  });
});
