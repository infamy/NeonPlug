/**
 * Web Serial connection for the Yaesu SCU-35 cable (FT-65/FT-4/FT-25).
 *
 * Protocol: "two-wire" — TX and RX are OR'd on the cable, so every byte
 * sent is echoed back before the radio's own response arrives. Every
 * command exchange follows: send → read echo → read response → read ACK (0x06).
 *
 * Clone mode lifecycle (mirrors CHIRP do_download / do_upload):
 *   open()           — open port, set up reader/writer
 *   enterCloneMode() — PROGRAM → QX, read ID  (call before each read/write)
 *   readBlock() / writeBlock() ...
 *   sendEnd()        — END → ACK              (call after each read/write)
 *   close()          — release port
 */

import { FT65_BAUD_RATE, FT65_BLOCK_SIZE } from './constants';
import { BaseSerialConnection, type SerialLikePort } from '../shared/BaseSerialConnection';

const PROGRAM_CMD = new TextEncoder().encode('PROGRAM');
const END_CMD     = new TextEncoder().encode('END');
const ACK = 0x06;
const TIMEOUT_MS = 8000;
const BLOCK_TIMEOUT_MS = 5000;

export type FT65SerialPort = SerialLikePort;

/** Request / reuse a Web Serial port and open it at 9600 baud. */
export async function openFT65Port(forceSelection = false): Promise<FT65SerialPort> {
  if (!('serial' in navigator)) throw new Error('Web Serial API not supported. Use Chrome/Edge.');
  const nav = (navigator as any).serial;
  let port: FT65SerialPort;
  if (forceSelection) {
    port = await nav.requestPort();
  } else {
    const ports: FT65SerialPort[] = await nav.getPorts();
    port = ports.length > 0 ? ports[0] : await nav.requestPort();
  }
  await port.open({ baudRate: FT65_BAUD_RATE });
  return port;
}

export class FT65Connection extends BaseSerialConnection {
  /** Valid radio ID prefixes — any match accepted. */
  validIdPrefixes: string[] = [];

  /** Open the port and set up reader/writer. Does NOT enter clone mode. */
  async open(port: FT65SerialPort): Promise<void> {
    await super.openPort(port);
    await this.delay(300);
    this.buf = new Uint8Array(0);
  }

  /** Close reader/writer and port. Does NOT send END — call sendEnd() first. */
  async close(): Promise<void> {
    await super.closeStreams();
  }

  /**
   * Enter clone mode and read + validate the radio's ID string.
   * Must be called before each readBlock / writeBlock session.
   * Returns the raw ID string reported by the radio.
   */
  async enterCloneMode(): Promise<string> {
    // Send PROGRAM, expect "QX" response. Retry with END recovery if needed.
    let entered = false;
    for (let endTry = 0; endTry < 3 && !entered; endTry++) {
      for (let i = 0; i < 3 && !entered; i++) {
        try {
          const resp = await this.sendcmd(PROGRAM_CMD, 2);
          if (resp[0] === 0x51 && resp[1] === 0x58) { // 'Q','X'
            entered = true;
          }
        } catch { /* retry */ }
      }
      if (!entered) {
        try { await this.sendcmd(END_CMD, 0); } catch { /* ignore */ }
      }
    }
    if (!entered) throw new Error('Could not enter clone mode. Check cable and radio power.');

    // Read radio ID (variable length, terminated by ACK)
    const idBytes = await this.sendcmd(new Uint8Array([0x02]), null);
    const idStr = String.fromCharCode(...idBytes).replace(/\x00.*/, '').trim();

    if (
      this.validIdPrefixes.length > 0 &&
      !this.validIdPrefixes.some((p) => idStr.startsWith(p))
    ) {
      throw new Error(
        `Radio ID mismatch. Expected one of [${this.validIdPrefixes.join(', ')}], got "${idStr}". Wrong model selected?`
      );
    }
    return idStr;
  }

  /** Send END to release the radio from clone mode. Call after every read/write session. */
  async sendEnd(): Promise<void> {
    await this.sendcmd(END_CMD, 0);
  }

  /** Read one 16-byte block at byte address `addr`. */
  async readBlock(addr: number): Promise<Uint8Array> {
    const cmd = new Uint8Array(4);
    cmd[0] = 0x52; // 'R'
    cmd[1] = (addr >> 8) & 0xff;
    cmd[2] = addr & 0xff;
    cmd[3] = FT65_BLOCK_SIZE;

    const response = await this.sendcmd(cmd, 21, BLOCK_TIMEOUT_MS);
    if (response[0] !== 0x57) throw new Error(`Bad block response header at addr 0x${addr.toString(16)}`);
    const checksum = (response.slice(1, 20).reduce((a, b) => a + b, 0)) & 0xff;
    if (checksum !== response[20]) throw new Error(`Block checksum mismatch at 0x${addr.toString(16)}`);
    return response.slice(4, 20);
  }

  /** Write one 16-byte block at byte address `addr`. */
  async writeBlock(addr: number, data: Uint8Array): Promise<void> {
    if (data.length !== FT65_BLOCK_SIZE) throw new Error('Block must be 16 bytes');
    const chkstr = new Uint8Array(19);
    chkstr[0] = (addr >> 8) & 0xff;
    chkstr[1] = addr & 0xff;
    chkstr[2] = FT65_BLOCK_SIZE;
    chkstr.set(data, 3);
    const checksum = chkstr.reduce((a, b) => a + b, 0) & 0xff;
    const msg = new Uint8Array(22);
    msg[0] = 0x57; // 'W'
    msg.set(chkstr, 1);
    msg[20] = checksum;
    msg[21] = ACK;
    await this.sendcmd(msg, 0, BLOCK_TIMEOUT_MS);
  }

  // -------------------------------------------------------------------------

  private async sendcmd(
    cmd: Uint8Array,
    responseLen: number | null,
    timeoutMs = TIMEOUT_MS
  ): Promise<Uint8Array<ArrayBuffer>> {
    this.buf = new Uint8Array(0);
    await this.write(cmd);

    // Strip echo
    await this.readExact(cmd.length, timeoutMs);

    if (responseLen === null) {
      // Variable: read until ACK
      const parts: number[] = [];
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const b = await this.readExact(1, timeoutMs);
        if (b[0] === ACK) return new Uint8Array(parts);
        parts.push(b[0]);
      }
      throw new Error('Timeout reading variable response');
    }

    let response: Uint8Array<ArrayBuffer> = new Uint8Array(0);
    if (responseLen > 0) {
      response = await this.readExact(responseLen, timeoutMs);
    }
    const ack = await this.readExact(1, timeoutMs);
    if (ack[0] !== ACK) throw new Error(`Expected ACK 0x06, got 0x${ack[0].toString(16)}`);
    return response;
  }
}
