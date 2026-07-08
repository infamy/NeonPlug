import type { SerialLikePort } from './BaseSerialConnection';

/**
 * Request or reuse a Web Serial port and open it at the given baud rate.
 * Shared by all serial radios; each radio's connection file wraps this
 * with a named function that supplies its own baud rate constant.
 */
export async function requestSerialPort(
  baudRate: number,
  forceSelection = false
): Promise<SerialLikePort> {
  if (!('serial' in navigator)) throw new Error('Web Serial API not supported. Use Chrome/Edge.');
  const nav = (navigator as any).serial;
  const port: SerialLikePort = forceSelection
    ? await nav.requestPort()
    : ((await nav.getPorts())[0] ?? (await nav.requestPort()));

  // The port may still be open from a previous operation (e.g. a read that
  // errored mid-transfer). Reuse it if its streams are free; calling open()
  // on an already-open port throws InvalidStateError.
  if (port.readable && port.writable) {
    if (port.readable.locked || port.writable.locked) {
      throw new Error('Serial port is busy from a previous operation. Reconnect the cable or reload the page.');
    }
    return port;
  }

  await port.open({ baudRate });
  return port;
}
