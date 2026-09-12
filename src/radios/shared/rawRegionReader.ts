/**
 * What Diagnostics → Raw region dump needs from a protocol: read memory by
 * address, and set the frame size its benchmark compares.
 *
 * The panel used to test `instanceof D890UVProtocol`. It only renders when the
 * radio's capabilities include `supportsRawRegionDump`, so a class test could
 * only ever disagree with them: another radio declaring the capability would get
 * the panel, then be told it was for the DA-7X2 alone. Asking the protocol what
 * it can do leaves the capability as the one thing that decides, and
 * tests/unit/rawRegionReader.test.ts holds every radio that declares it to
 * actually having these methods.
 */

export interface RawRegionReader {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readRawRegion(
    address: number,
    length: number,
    onProgress?: (read: number, total: number) => void
  ): Promise<Uint8Array>;
  /** Benchmarking hook: force a read size instead of the negotiated one. */
  forceReadLength(length: number): void;
  /** The read size in use, negotiated or forced. */
  getReadLength(): number;
}

const METHODS = ['connect', 'disconnect', 'readRawRegion', 'forceReadLength', 'getReadLength'] as const;

export function isRawRegionReader(protocol: unknown): protocol is RawRegionReader {
  if (typeof protocol !== 'object' || protocol === null) return false;
  const candidate = protocol as Record<string, unknown>;
  return METHODS.every((method) => typeof candidate[method] === 'function');
}
