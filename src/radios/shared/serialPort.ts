import type { SerialLikePort } from './BaseSerialConnection';

/**
 * Request a Web Serial port and open it with the given parameters.
 * Shared by all serial radios; each radio's connection file wraps this
 * with a named function that supplies its own baud rate constant.
 *
 * `bufferSize` sets Chrome's receive buffer (default is only 255 bytes).
 * Radios that stream unsolicited data the moment the user presses a key on
 * the radio (FT-70 clone mode) need one large enough to hold everything that
 * arrives before the app starts reading.
 */
export async function requestSerialPort(
  baudRate: number,
  forceSelection = false,
  bufferSize?: number
): Promise<SerialLikePort> {
  if (!('serial' in navigator)) throw new Error('Web Serial API not supported. Use Chrome/Edge.');
  const nav = (navigator as any).serial;
  const port: SerialLikePort = forceSelection
    ? await nav.requestPort()
    : ((await nav.getPorts())[0] ?? (await nav.requestPort()));

  // The port may still be open from a previous operation — possibly at a
  // different baud rate or buffer size (e.g. an FT-65 session at 9600 before
  // an FT-70 read at 38400). Close and reopen so this radio's parameters
  // actually apply; locked streams mean another operation still owns it.
  if (port.readable && port.writable) {
    if (port.readable.locked || port.writable.locked) {
      throw new Error('Serial port is busy from a previous operation. Reconnect the cable or reload the page.');
    }
    await port.close();
  }

  await port.open({ baudRate, ...(bufferSize != null && { bufferSize }) });
  return port;
}
