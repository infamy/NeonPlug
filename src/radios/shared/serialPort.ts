import type { SerialLikePort } from './BaseSerialConnection';

/**
 * Request a Web Serial port and open it at the given baud rate.
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

  // The port may still be open from a previous operation — an error part-way
  // through leaves it that way — at whatever speed that operation used. It was
  // reused as it stood, so a port an FT-65 left open at 9600 went on to talk to
  // a UV5R-Mini or a DM-32 at 9600 instead of 115200, and the radio heard
  // noise. Close it and open it again at this radio's rate. Locked streams
  // mean another operation still owns it.
  if (port.readable && port.writable) {
    if (port.readable.locked || port.writable.locked) {
      throw new Error('Serial port is busy from a previous operation. Reconnect the cable or reload the page.');
    }
    await port.close();
  }

  await port.open({ baudRate });
  return port;
}
