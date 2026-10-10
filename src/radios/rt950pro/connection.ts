/**
 * The RT-950 Pro over its USB programming cable: a Web Serial link for
 * RT950ProSession.
 */

import { RT950PRO_BAUD_RATE } from './constants';
import { BaseSerialConnection, type SerialLikePort } from '../shared/BaseSerialConnection';
import { requestSerialPort } from '../shared/serialPort';
import type { Rt950Link } from './session';

export { assertWritableBlock } from './session';

export type RT950ProSerialPort = SerialLikePort;

export async function openRT950ProPort(forceSelection = false): Promise<RT950ProSerialPort> {
  return requestSerialPort(RT950PRO_BAUD_RATE, forceSelection);
}

export class RT950ProSerialLink extends BaseSerialConnection implements Rt950Link {
  /** The vendor CPS waits a second and retries; the CHIRP driver found 3 s safe. */
  readonly replyTimeoutMs = 3000;

  async open(port: RT950ProSerialPort): Promise<void> {
    await super.openPort(port);
    // pyserial raises DTR and RTS on open, and so does every CHIRP session;
    // Web Serial leaves them low unless asked.
    await port.setSignals?.({ dataTerminalReady: true, requestToSend: true });
  }

  send(bytes: Uint8Array): Promise<void> {
    return this.write(bytes);
  }

  receive(n: number, timeoutMs: number): Promise<Uint8Array> {
    return this.readExact(n, timeoutMs);
  }

  async drain(quietMs: number): Promise<void> {
    while ((await this.waitForChunk(quietMs)) !== null) {
      // keep reading until the line has been quiet for quietMs
    }
    this.buf = new Uint8Array(0);
  }

  async close(): Promise<void> {
    await super.closeStreams();
  }
}
