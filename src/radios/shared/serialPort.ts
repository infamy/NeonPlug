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
  await port.open({ baudRate });
  return port;
}
