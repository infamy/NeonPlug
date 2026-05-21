/**
 * DM-32UV Connection and Handshake
 * Implements the connection sequence as documented in DM32-Protocol-Spec
 */

import type { WebSerialPort } from './types';
import { CONNECTION } from './constants';
import { log } from '../../utils/protocolLogger';

// Re-export for backward compatibility
export type SerialPort = WebSerialPort;

/**
 * Wraps a promise with a timeout.
 * Used by connection and protocol for timed operations.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]);
}

/**
 * Get error message from unknown error type.
 */
export function getErrorMessage(error: unknown, defaultMessage: string = 'Unknown error'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return defaultMessage;
}

export class DM32Connection {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private port: WebSerialPort | null = null;
  private readBuffer: Uint8Array = new Uint8Array(0); // Persistent read buffer
  private isReading: boolean = false; // Prevent concurrent reads

  async connect(port: WebSerialPort): Promise<void> {
    // Clear any leftover state from previous connections
    this.readBuffer = new Uint8Array(0);
    this.isReading = false;
    this.port = port;

    // Check if port already has active readers/writers (locked streams)
    // If so, we can't get new ones - the port is in use
    if (!port.readable || !port.writable) {
      throw new Error('Port streams are not available. Port may not be open.');
    }

    if (port.readable.locked || port.writable.locked) {
      throw new Error('Port has locked streams from a previous connection. Please close other connections first.');
    }

    // Get reader and writer - these lock the streams
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();

    // Wait for radio to be ready after port is opened
    // Radio needs time to initialize after port open (CONNECTION.INIT_DELAY for DM32.01.01.049 and similar)
    await this.delay(CONNECTION.INIT_DELAY);

    // Clear any initialization data from the radio.
    // clearBuffer() cancels and reacquires the reader, which flushes any in-flight
    // reads and discards buffered init bytes. The CLEAR_BUFFER_DELAY is applied inside.
    log.debug('Clearing initialization data...', 'Connection');
    await this.clearBuffer();

    log.info('Ready to communicate.', 'Connection');
    
    // Step 1: PSEARCH
    // Send once and wait — the radio has a timing window and may be slow to reply.
    // Use a longer timeout than other commands to avoid cutting off a late response.
    await this.sendCommand('PSEARCH');
    await this.delay(CONNECTION.PSEARCH_READ_DELAY);

    let psearchResponse: Uint8Array;
    try {
      psearchResponse = await this.readBytes(8, undefined, 'PSEARCH');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
        // Partial response (e.g. 6 bytes): surface the full error so user sees "Received (hex): ..."
        if (errorMsg.includes('Received (hex):') && !errorMsg.includes('(got 0 bytes)')) {
          throw new Error(`PSEARCH handshake failed: ${errorMsg}`);
        }
        throw new Error('No reply from the radio. Is the radio connected and turned on?');
      }
      throw error;
    }

    const psearchHex = this.formatBytesHex(psearchResponse);
    log.info(`PSEARCH response (${psearchResponse.length} bytes): ${psearchHex}`, 'Connection');
    const psearchAscii = new TextDecoder('ascii', { fatal: false }).decode(psearchResponse.slice(1)).replace(/\0/g, '').trim();
    if (psearchAscii) {
      log.debug(`PSEARCH model string: "${psearchAscii}"`, 'Connection');
    }

    // Validate: first byte should be 0x06 (ACK)
    if (psearchResponse[0] !== 0x06) {
      throw new Error(`Radio not found: Expected ACK (0x06), got 0x${psearchResponse[0].toString(16).padStart(2, '0')}. Response: ${psearchHex}`);
    }

    // Decode model string
    const modelString = psearchAscii;

    if (!modelString.includes('DP570') && !modelString.includes('DM32') && !modelString.includes('DM-32')) {
      throw new Error(`Unsupported radio model: "${modelString}". Expected DP570UV or DM-32UV. Response: ${psearchHex}`);
    }

    await this.delay(50);

    // Step 2: PASSSTA
    await this.sendCommand('PASSSTA');
    await this.delay(50);

    const passstaResponse = await this.readBytes(3, undefined, 'PASSSTA');
    log.debug(`PASSSTA response (3 bytes): ${this.formatBytesHex(passstaResponse)}`, 'Connection');
    if (passstaResponse[0] !== 0x50) {
      throw new Error(`PASSSTA failed: Expected 0x50, got 0x${passstaResponse[0].toString(16).padStart(2, '0')}`);
    }

    await this.delay(50);

    // Step 3: SYSINFO
    await this.sendCommand('SYSINFO');
    await this.delay(50);

    const sysinfoResponse = await this.readBytes(1, undefined, 'SYSINFO');
    log.debug(`SYSINFO response (1 byte): ${this.formatBytesHex(sysinfoResponse)}`, 'Connection');
    if (sysinfoResponse[0] !== 0x06) {
      throw new Error(`SYSINFO failed: Expected 0x06, got 0x${sysinfoResponse[0].toString(16).padStart(2, '0')}`);
    }
    
    await this.delay(10);
  }

  async queryVFrames(): Promise<Map<number, Uint8Array>> {
    const results = new Map<number, Uint8Array>();

    // Query all V-frames (0x01 through 0x10) as shown in serial capture
    const vframeIds = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0D, 0x0E, 0x0F, 0x10];
    
    for (const frameId of vframeIds) {
      try {
        const data = await this.queryVFrame(frameId);
        results.set(frameId, data);
      } catch (e) {
        log.warn(`Failed to query V-frame 0x${frameId.toString(16)}`, 'Connection', e);
        // Continue with other V-frames even if one fails
      }
    }

    return results;
  }

  async queryVFrame(frameId: number): Promise<Uint8Array> {
    const command = new Uint8Array([0x56, 0x00, 0x00, 0x00, frameId]);
    const frameIdHex = `0x${frameId.toString(16).padStart(2, '0')}`;
    log.debug(`Sending V-frame query: ${frameIdHex}`, 'Connection');
    await this.write(command);
    await this.delay(50); // Give radio time to respond before read

    log.debug(`Reading V-frame ${frameIdHex} header (3 bytes)...`, 'Connection');
    const header = await this.readBytes(3);
    const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ');
    log.debug(`V-frame header: ${headerHex}`, 'Connection');
    
    if (header[0] !== 0x56 || header[1] !== frameId) {
      throw new Error(`Invalid V-frame response for frame 0x${frameId.toString(16)}: header=${headerHex}`);
    }

    const length = header[2];
    log.debug(`V-frame ${frameIdHex} data length: ${length}`, 'Connection');
    
    if (length === 0) {
      return new Uint8Array(0);
    }

    const data = await this.readBytes(length);
    const dataHex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
    log.verbose(`V-frame ${frameIdHex} data: ${dataHex}`, 'Connection');
    
    // Delay after reading V-frame before next command
    await this.delay(50);
    
    return data;
  }

  async enterProgrammingMode(): Promise<void> {
    // Step 6a: PROGRAM command
    const programCmd = new Uint8Array([
      0xFF, 0xFF, 0xFF, 0xFF, 0x0C,
      ...new TextEncoder().encode('PROGRAM')
    ]);
    await this.write(programCmd);
        const ack1 = await this.readBytes(1);
    if (ack1[0] !== 0x06) {
      throw new Error('PROGRAM command failed');
    }
    await this.delay(10);

    // Step 6b: Mode 02
    await this.write(new Uint8Array([0x02]));
        const response = await this.readBytes(8);
    // Should be 8 bytes of 0xFF
    if (!response.every(b => b === 0xFF)) {
      throw new Error('Mode 02 failed');
    }
    await this.delay(10);

    // Step 6c: ACK 06
    await this.write(new Uint8Array([0x06]));
        const ack2 = await this.readBytes(1);
    if (ack2[0] !== 0x06) {
      throw new Error('ACK 06 failed');
    }
    await this.delay(10);
  }

  async readMemory(address: number, length: number): Promise<Uint8Array> {
    const addressHex = `0x${address.toString(16).padStart(6, '0').toUpperCase()}`;
    
    try {
      // Read command: 0x52 ("R") <addr:3> <len:2>
      const addrBytes = new Uint8Array([
        address & 0xFF,
        (address >> 8) & 0xFF,
        (address >> 16) & 0xFF,
      ]);
      const lenBytes = new Uint8Array([
        length & 0xFF,
        (length >> 8) & 0xFF,
      ]);

      const command = new Uint8Array([0x52, ...addrBytes, ...lenBytes]);
      const commandHex = Array.from(command)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      log.debug(`Sending read command (0x52 "R"): ${commandHex} (address: ${addressHex}, length: ${length})`, 'Connection');
      await this.write(command);
      await this.delay(25); // Give radio time to respond before read (block reads)

      // Response: 0x57 <addr:3> <len:2> <data>
      const header = await this.readBytes(6);
      if (header[0] !== 0x57) {
        const headerHex = Array.from(header).map(b => `0x${b.toString(16).padStart(2, '0').toUpperCase()}`).join(' ');
        throw new Error(`Invalid read response header at ${addressHex}. Expected 0x57, got ${headerHex}`);
      }

      const responseLength = header[4] | (header[5] << 8);
      if (responseLength === 0 || responseLength > length) {
        throw new Error(`Invalid response length at ${addressHex}. Expected <= ${length}, got ${responseLength}`);
      }

      // Use longer timeout for large block reads (e.g. 4KB); header read above uses default 5s
      const data = await this.readBytes(responseLength, CONNECTION.TIMEOUT.READ_MEMORY);
      // Brief settling delay after receiving block so radio is ready for next command
      await this.delay(30);
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to read ${length} bytes from ${addressHex}`, 'Connection', error);
      throw new Error(`Failed to read memory at ${addressHex}: ${errorMsg}`);
    }
  }

  /**
   * Write memory block to radio
   * 
   * Format: 0x57 ("W") <addr:3> <0x00> <0x10> <data:4096> <metadata:1>
   * Total: 4103 bytes
   * 
   * Command structure (matches serial capture):
   * - Byte 0: 0x57 (write command, ASCII "W")
   * - Bytes 1-3: Address (24-bit, little-endian)
   * - Byte 4: 0x00 (reserved)
   * - Byte 5: 0x10 (size indicator for 4KB block)
   * - Bytes 6-4101: Data (4096 bytes)
   * - Byte 4102: Metadata byte
   * 
   * @param address 24-bit address (must be 4KB-aligned)
   * @param data 4096 bytes of data
   * @param metadata Metadata byte (stored at offset 0xFFF)
   * @throws {Error} If write is not acknowledged
   */
  async writeMemory(address: number, data: Uint8Array, metadata: number): Promise<void> {
    if (data.length !== 4096) {
      throw new Error(`Write data must be exactly 4096 bytes, got ${data.length}`);
    }

    // Write command format: 0x57 ("W") <addr:3> <0x00> <0x10> <data:4096>
    // The metadata byte is INSIDE the data block at offset 0xFFF, not sent separately
    const addrBytes = new Uint8Array([
      address & 0xFF,
      (address >> 8) & 0xFF,
      (address >> 16) & 0xFF,
    ]);

    // Build command: 4102 bytes total (6 header + 4096 data)
    const command = new Uint8Array(4102);
    command[0] = 0x57; // Write command ("W")
    command.set(addrBytes, 1); // Address (bytes 1-3)
    command[4] = 0x00; // Reserved
    command[5] = 0x10; // Size indicator (4KB)
    command.set(data, 6); // Data (bytes 6-4101) - includes metadata byte at data[0xFFF] which becomes command[4101]

    // Debug logging: Log write command details
    const addressHex = `0x${address.toString(16).padStart(6, '0').toUpperCase()}`;
    const metadataHex = `0x${metadata.toString(16).padStart(2, '0').toUpperCase()}`;
    const commandHeader = Array.from(command.slice(0, 6))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    
    log.debug(`Sending write command (0x57 "W"): address=${addressHex}, metadata=${metadataHex}, size=${data.length} bytes`, 'Connection');
    log.verbose(`Write command header: ${commandHeader}`, 'Connection');
    
    // Log first 64 bytes of data for debugging
    const dataPreview = Array.from(data.slice(0, 64))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    log.verbose(`Data preview (first 64 bytes): ${dataPreview}`, 'Connection');
    
    // Log metadata byte location in data (this is the ONLY place the metadata byte appears)
    const dataMetadataByte = data[0xFFF];
    log.verbose(`Data metadata byte at 0xFFF: 0x${dataMetadataByte.toString(16).padStart(2, '0').toUpperCase()}`, 'Connection');
    log.verbose(`Metadata byte in command[4101]: 0x${command[4101].toString(16).padStart(2, '0').toUpperCase()}`, 'Connection');
    
    // Verify metadata byte in data matches what we expect
    if (dataMetadataByte !== metadata) {
      log.warn(`Metadata byte mismatch: data[0xFFF] = 0x${dataMetadataByte.toString(16).padStart(2, '0').toUpperCase()}, expected ${metadataHex}`, 'Connection');
    }

    try {
      await this.write(command);
      log.debug('Command sent successfully, waiting for ACK...', 'Connection');
      
      // Response: 0x06 (ACK) or error code
      // readBytes will wait for the response - no artificial delay needed
      const response = await this.readBytes(1);
      const responseHex = `0x${response[0].toString(16).padStart(2, '0').toUpperCase()}`;
      log.debug(`Response received: ${responseHex}`, 'Connection');
      
      if (response[0] !== 0x06) {
        // Common error codes:
        // 0xC0 might indicate write error, invalid address, or radio not in programming mode
        // 0xC8 might indicate invalid block data, checksum error, or block format issue
        let errorMsg = `Write not acknowledged. Expected 0x06 (ACK), got ${responseHex}`;
        if (response[0] === 0xC0) {
          errorMsg += '. Error code 0xC0 may indicate: write rejected, invalid address, or radio not in programming mode.';
        } else if (response[0] === 0xC8) {
          errorMsg += '. Error code 0xC8 may indicate: invalid block data format, checksum error, or block structure issue.';
        } else if (response[0] === 0x48) {
          errorMsg += '. Error code 0x48 may indicate: write timeout, radio busy processing previous write, or need for longer delay between writes.';
        }
        log.error(errorMsg, 'Connection');
        throw new Error(errorMsg);
      }
      
      log.info(`Write successful for block at ${addressHex} with metadata ${metadataHex}`, 'Connection');
    } catch (error) {
      log.error(`Failed to write block at ${addressHex} with metadata ${metadataHex}`, 'Connection', error);
      throw error;
    }
  }

  /**
   * OEM read path for boot image: enter mode so 0x52 chunk reads use correct region.
   * Send 0x47 00 01 00 00 (5 bytes) → read 262 bytes (first = 0x53);
   * then FF FF FF FF 0C (5 bytes) → 0x06; PROGRAM → 0x06; 02 → 8 bytes; 06 → 0x06.
   */
  async enterBootImageReadMode(): Promise<void> {
    await this.write(new Uint8Array([0x47, 0x00, 0x01, 0x00, 0x00]));
    await this.delay(50);
    const resp262 = await this.readBytes(262);
    if (resp262[0] !== 0x53) {
      log.warn(`Boot image read mode: expected first byte 0x53, got 0x${resp262[0]?.toString(16).padStart(2, '0')}`, 'Connection');
    }
    await this.delay(10);
    await this.write(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0c]));
    await this.delay(25);
    const ack1 = await this.readBytes(1);
    if (ack1[0] !== 0x06) {
      throw new Error(`Boot image read mode: expected 0x06 after FF FF FF FF 0C, got 0x${ack1[0].toString(16).padStart(2, '0')}`);
    }
    await this.delay(10);
    const programCmd = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0c, ...new TextEncoder().encode('PROGRAM')]);
    await this.write(programCmd);
    await this.delay(25);
    const ack2 = await this.readBytes(1);
    if (ack2[0] !== 0x06) {
      throw new Error(`Boot image read mode: PROGRAM failed, got 0x${ack2[0].toString(16).padStart(2, '0')}`);
    }
    await this.delay(10);
    await this.write(new Uint8Array([0x02]));
    await this.delay(25);
    await this.readBytes(8);
    await this.delay(10);
    await this.write(new Uint8Array([0x06]));
    await this.delay(25);
    const ack3 = await this.readBytes(1);
    if (ack3[0] !== 0x06) {
      throw new Error(`Boot image read mode: ACK 06 failed, got 0x${ack3[0].toString(16).padStart(2, '0')}`);
    }
    await this.delay(10);
  }

  /**
   * Write a single block for boot image: 2048 or 4096 bytes (no metadata byte).
   * Format: 0x57 <addr:3> <size_lo> <size_hi> <data>
   */
  async writeMemoryBlock(address: number, data: Uint8Array): Promise<void> {
    if (data.length !== 2048 && data.length !== 4096) {
      throw new Error(`Boot image block must be 2048 or 4096 bytes, got ${data.length}`);
    }
    const addrBytes = new Uint8Array([
      address & 0xff,
      (address >> 8) & 0xff,
      (address >> 16) & 0xff,
    ]);
    const sizeLo = data.length & 0xff;
    const sizeHi = (data.length >> 8) & 0xff;
    const command = new Uint8Array(6 + data.length);
    command[0] = 0x57;
    command.set(addrBytes, 1);
    command[4] = sizeLo;
    command[5] = sizeHi;
    command.set(data, 6);
    const addressHex = `0x${address.toString(16).padStart(6, '0').toUpperCase()}`;
    log.debug(`Sending boot image write: address=${addressHex}, size=${data.length}`, 'Connection');
    await this.write(command);
    const response = await this.readBytes(1);
    if (response[0] !== 0x06) {
      throw new Error(`Boot image write not ACK at ${addressHex}: got 0x${response[0].toString(16).padStart(2, '0')}`);
    }
  }

  async disconnect(): Promise<void> {
    // Clear read buffer to prevent stale data from affecting next connection
    this.readBuffer = new Uint8Array(0);
    this.isReading = false;

    // Cancel reader (aborts any in-flight read) and close writer
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {
        // Reader might already be cancelled/released
      }
      this.reader = null;
    }
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (e) {
        // Writer might already be released
      }
      this.writer = null;
    }
    this.port = null;
  }

  private async sendCommand(command: string): Promise<void> {
    const bytes = new TextEncoder().encode(command);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    log.debug(`Sending command: ${command} (${hex})`, 'Connection');
    
    if (!this.writer) {
      throw new Error('Not connected');
    }
    
    // Write the command
    await this.writer.write(bytes);
    await this.delay(10); // Brief delay after send before caller reads
  }

  private async write(data: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error('Not connected');
    }
    
    // Determine command type from first byte
    const commandByte = data[0];
    let commandType = 'UNKNOWN';
    if (commandByte === 0x52) {
      commandType = 'READ (0x52 "R")';
    } else if (commandByte === 0x57) {
      commandType = 'WRITE (0x57 "W")';
    } else if (commandByte === 0x56) {
      commandType = 'V-FRAME (0x56 "V")';
    } else {
      commandType = `0x${commandByte.toString(16).padStart(2, '0').toUpperCase()}`;
    }
    
    // Log command with type and bytes
    if (data.length > 100) {
      const commandPreview = Array.from(data.slice(0, 16))
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      log.debug(`${commandType} command: ${commandPreview}... (${data.length} bytes total)`, 'Connection');
    } else {
      const commandHex = Array.from(data)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      log.debug(`${commandType} command: ${commandHex}`, 'Connection');
    }
    
    await this.writer.write(data);
  }


  /**
   * Fill the read buffer by reading from the stream.
   * This is called when we need more data than is currently in the buffer.
   * No timeout here - timeout is handled at readBytes level.
   */
  private async fillBuffer(): Promise<void> {
    if (!this.reader || this.isReading) {
      return;
    }

    this.isReading = true;
    try {
      const { value, done } = await this.reader.read();
      
      if (done) {
        throw new Error('Stream ended unexpectedly');
      }
      
      if (value.length > 0) {
        // Append new data to buffer
        const newBuffer = new Uint8Array(this.readBuffer.length + value.length);
        newBuffer.set(this.readBuffer);
        newBuffer.set(value, this.readBuffer.length);
        this.readBuffer = newBuffer;
      }
    } finally {
      this.isReading = false;
    }
  }

  /**
   * Read exactly 'count' bytes from the buffer.
   * If the buffer doesn't have enough data, we fill it by reading from the stream.
   * On timeout, logs and includes any received bytes (hex) in the error for debugging.
   *
   * @param count Number of bytes to read
   * @param timeoutMs Optional timeout in ms (default: REQUEST_RESPONSE). Use READ_MEMORY for large block reads.
   * @param context Optional label for logs/errors (e.g. 'PSEARCH', 'PASSSTA').
   */
  private async readBytes(count: number, timeoutMs?: number, context?: string): Promise<Uint8Array> {
    if (!this.reader) {
      throw new Error('Not connected');
    }

    const timeout = timeoutMs ?? CONNECTION.TIMEOUT.REQUEST_RESPONSE;
    const startTime = Date.now();
    const ctx = context ? `${context}: ` : '';

    return withTimeout(
      (async () => {
        // Keep reading from stream until we have enough data in buffer
        while (this.readBuffer.length < count) {
          const bufferLengthBefore = this.readBuffer.length;
          await this.fillBuffer();

          // If fillBuffer didn't add any data and we still don't have enough,
          // check if we've been waiting too long
          if (this.readBuffer.length === bufferLengthBefore && this.readBuffer.length < count) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= timeout) {
              const received = this.readBuffer.length;
              const hex = this.formatBytesHex(this.readBuffer);
              const msg = `Read ${count} bytes timed out after ${timeout}ms (got ${received} bytes). Received (hex): ${hex}`;
              log.warn(`${ctx}${msg}`, 'Connection');
              throw new Error(msg);
            }
          }
        }

        // Extract exactly 'count' bytes from buffer
        const result = this.readBuffer.slice(0, count);

        // Remove consumed bytes from buffer
        this.readBuffer = this.readBuffer.slice(count);

        return result;
      })(),
      timeout,
      `Read ${count} bytes`
    );
  }

  /** Format buffer (or slice) as hex string for logging. */
  private formatBytesHex(buffer: Uint8Array, maxBytes?: number): string {
    const len = maxBytes != null ? Math.min(buffer.length, maxBytes) : buffer.length;
    const hex = Array.from(buffer.slice(0, len))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    return buffer.length > len ? `${hex} ... (${buffer.length} bytes total)` : hex;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all pending data from the input buffer.
   *
   * Uses cancel + reacquire on the reader rather than a Promise.race timeout.
   * The race approach leaves a "ghost" reader.read() in flight when the timeout
   * fires before init bytes arrive; that ghost read later consumes the PSEARCH
   * response, causing a first-connection failure that looks fine on retry.
   *
   * By cancelling the reader we abort any in-flight read, release the stream
   * lock, and let incoming init bytes be received by the OS and discarded while
   * we wait (CLEAR_BUFFER_DELAY). A fresh reader is then acquired with a clean
   * slate before the handshake begins.
   */
  private async clearBuffer(): Promise<void> {
    if (!this.reader || !this.port) return;

    try {
      // Cancel aborts any pending reader.read() and releases the readable lock.
      await this.reader.cancel();
    } catch (e) {
      // Ignore — reader may already be in an error/cancelled state.
    }
    this.reader = null;
    this.isReading = false;
    this.readBuffer = new Uint8Array(0);

    // Wait for the radio to finish sending initialization bytes.
    // While the reader is cancelled the OS still receives bytes but they are
    // discarded, so after this delay the receive path should be silent.
    await this.delay(CONNECTION.CLEAR_BUFFER_DELAY);

    // Reacquire a fresh reader — no buffered stale data, no ghost reads.
    if (!this.port.readable || this.port.readable.locked) {
      throw new Error('Cannot acquire fresh reader after buffer clear');
    }
    this.reader = this.port.readable.getReader();
    log.debug('Reader refreshed — starting handshake with clean slate', 'Connection');
  }
}

