import { describe, it, expect, vi } from 'vitest';
import { FT70Connection } from '../../src/radios/ft70/connection';
import type { SerialLikePort } from '../../src/radios/shared/BaseSerialConnection';
import {
  FT70_ID_BLOCK_SIZE, FT70_DATA_BLOCK_SIZE, FT70_MEM_SIZE, FT70_MODEL_ID,
} from '../../src/radios/ft70/constants';

const ACK = 0x06;

function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

const ID_BLOCK = (() => {
  const id = new Uint8Array(FT70_ID_BLOCK_SIZE);
  id.set(new TextEncoder().encode(FT70_MODEL_ID));
  return id;
})();

const DATA_BLOCK = (() => {
  const data = new Uint8Array(FT70_DATA_BLOCK_SIZE);
  // Deterministic pattern; data[0] = 1 so it can't be mistaken for an echoed ACK.
  for (let i = 0; i < data.length; i++) data[i] = (i * 7 + 1) & 0xff;
  return data;
})();

/** Fake Web Serial port pre-loaded with everything the radio will send. */
function makePort(rxData: Uint8Array): {
  port: SerialLikePort;
  written: number[];
  chunks: number[];
  signals: { dataTerminalReady?: boolean; requestToSend?: boolean }[];
} {
  const written: number[] = [];
  const chunks: number[] = [];
  const signals: { dataTerminalReady?: boolean; requestToSend?: boolean }[] = [];
  const port: SerialLikePort = {
    setSignals: async (s) => { signals.push(s); },
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(rxData);
        controller.close();
      },
    }),
    writable: new WritableStream<Uint8Array>({
      write(chunk) { written.push(...chunk); chunks.push(chunk.length); },
    }),
    open: async () => {},
    close: async () => {},
  };
  return { port, written, chunks, signals };
}

async function readImageFrom(rxData: Uint8Array) {
  const { port, written } = makePort(rxData);
  const conn = new FT70Connection();
  await conn.open(port);
  const image = await conn.readImage();
  return { image, written };
}

describe('FT70Connection.readImage', () => {
  it('reads a clean stream from a non-echoing cable', async () => {
    const { image, written } = await readImageFrom(concat(ID_BLOCK, DATA_BLOCK));

    expect(image.length).toBe(FT70_MEM_SIZE);
    expect(image.slice(0, FT70_ID_BLOCK_SIZE)).toEqual(ID_BLOCK);
    expect(image.slice(FT70_ID_BLOCK_SIZE)).toEqual(DATA_BLOCK);
    expect(written).toEqual([ACK]); // one host ACK after the ID block
  });

  it('strips the echoed host ACK ahead of the data block (echoing cable)', async () => {
    // TX/RX OR'd cables reflect the ACK the host sends after the ID block.
    const { image } = await readImageFrom(concat(ID_BLOCK, Uint8Array.of(ACK), DATA_BLOCK));

    expect(image.slice(0, FT70_ID_BLOCK_SIZE)).toEqual(ID_BLOCK);
    expect(image.slice(FT70_ID_BLOCK_SIZE)).toEqual(DATA_BLOCK); // not shifted by one
  });

  it('tolerates a stray ACK ahead of the ID block', async () => {
    const { image } = await readImageFrom(concat(Uint8Array.of(ACK), ID_BLOCK, DATA_BLOCK));

    expect(image.slice(0, FT70_ID_BLOCK_SIZE)).toEqual(ID_BLOCK);
    expect(image.slice(FT70_ID_BLOCK_SIZE)).toEqual(DATA_BLOCK);
  });
});

describe('FT70Connection.open', () => {
  it('raises DTR and RTS, as pyserial does for CHIRP', async () => {
    const { port, signals } = makePort(new Uint8Array(0));
    const conn = new FT70Connection();
    await conn.open(port);

    expect(signals).toEqual([{ dataTerminalReady: true, requestToSend: true }]);
  });
});

describe('FT70Connection.writeImage', () => {
  it("sends the data block 32 bytes at a time, at CHIRP's pace", async () => {
    vi.useFakeTimers();
    try {
      // The radio acks the ID block and then says nothing until the end.
      const { port, chunks } = makePort(Uint8Array.of(ACK));
      const conn = new FT70Connection();
      const opening = conn.open(port);
      await vi.runAllTimersAsync();
      await opening;

      const writing = conn.writeImage(concat(ID_BLOCK, DATA_BLOCK));
      await vi.runAllTimersAsync();
      await writing;

      // One write for the ID block, then the data block in 32-byte pieces.
      const dataChunks = chunks.slice(1);
      expect(chunks[0]).toBe(FT70_ID_BLOCK_SIZE);
      expect(Math.max(...dataChunks)).toBe(32);
      expect(dataChunks.reduce((n, c) => n + c, 0)).toBe(FT70_DATA_BLOCK_SIZE);
    } finally {
      vi.useRealTimers();
    }
  });
});
