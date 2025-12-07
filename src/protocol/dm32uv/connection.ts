/**
 * DM-32UV Connection and Handshake
 * Implements the connection sequence as documented in DM32-Protocol-Spec
 */

import type { WebSerialPort } from './types';
import { withTimeout } from './utils';
import { CONNECTION } from './constants';

// Re-export for backward compatibility
export type SerialPort = WebSerialPort;

export class DM32Connection {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer: Uint8Array = new Uint8Array(0); // Persistent read buffer
  private isReading: boolean = false; // Prevent concurrent reads

  async connect(port: WebSerialPort): Promise<void> {
    // Clear any leftover state from previous connections
    this.readBuffer = new Uint8Array(0);
    this.isReading = false;
    
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
    // Radio needs time to initialize after port open
    await this.delay(200);

    // Clear any initialization data from the radio
    // Read and discard any data sent immediately after port open
    console.log('Clearing initialization data...');
    await this.clearBuffer();
    
    // Additional delay after clearing buffer to ensure radio is ready
    await this.delay(100);
    
    console.log('Ready to communicate.');
    
    // Step 1: PSEARCH
    // According to serial capture: response is exactly 8 bytes: 06 44 50 35 37 30 55 56
    await this.sendCommand('PSEARCH');
    await this.delay(50); // Increased delay to give radio time to respond
    
    const psearchResponse = await this.readBytes(8);
    
    // Validate: first byte should be 0x06 (ACK)
    if (psearchResponse[0] !== 0x06) {
      const hex = Array.from(psearchResponse).map(b => b.toString(16).padStart(2, '0')).join(' ');
      throw new Error(`Radio not found: Expected ACK (0x06), got 0x${psearchResponse[0].toString(16).padStart(2, '0')}. Response: ${hex}`);
    }
    
    // Decode model string
    const modelString = new TextDecoder('ascii', { fatal: false }).decode(psearchResponse.slice(1)).replace(/\0/g, '').trim();
    
    if (!modelString.includes('DP570') && !modelString.includes('DM32') && !modelString.includes('DM-32')) {
      const hex = Array.from(psearchResponse).map(b => b.toString(16).padStart(2, '0')).join(' ');
      throw new Error(`Unsupported radio model: "${modelString}". Expected DP570UV or DM-32UV. Response: ${hex}`);
    }
    
    await this.delay(50);

    // Step 2: PASSSTA
    await this.sendCommand('PASSSTA');
    await this.delay(50);
    
    const passstaResponse = await this.readBytes(3);
    if (passstaResponse[0] !== 0x50) {
      throw new Error(`PASSSTA failed: Expected 0x50, got 0x${passstaResponse[0].toString(16).padStart(2, '0')}`);
    }
    
    await this.delay(50);

    // Step 3: SYSINFO
    await this.sendCommand('SYSINFO');
    await this.delay(50);
    
    const sysinfoResponse = await this.readBytes(1);
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
        console.warn(`Failed to query V-frame 0x${frameId.toString(16)}:`, e);
        // Continue with other V-frames even if one fails
      }
    }

    return results;
  }

  async queryVFrame(frameId: number): Promise<Uint8Array> {
    const command = new Uint8Array([0x56, 0x00, 0x00, 0x00, frameId]);
    console.log(`Sending V-frame query: 0x${frameId.toString(16).padStart(2, '0')}`);
    await this.write(command);
    
    // Wait for response - V-frames may take longer
    await this.delay(50);

    console.log(`Reading V-frame 0x${frameId.toString(16).padStart(2, '0')} header (3 bytes)...`);
    const header = await this.readBytes(3);
    const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`V-frame header: ${headerHex}`);
    
    if (header[0] !== 0x56 || header[1] !== frameId) {
      throw new Error(`Invalid V-frame response for frame 0x${frameId.toString(16)}: header=${headerHex}`);
    }

    const length = header[2];
    console.log(`V-frame 0x${frameId.toString(16).padStart(2, '0')} data length: ${length}`);
    
    if (length === 0) {
      return new Uint8Array(0);
    }

    const data = await this.readBytes(length);
    const dataHex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`V-frame 0x${frameId.toString(16).padStart(2, '0')} data: ${dataHex}`);
    
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
      console.log(`[READ] Sending read command (0x52 "R"): ${commandHex} (address: ${addressHex}, length: ${length})`);
      await this.write(command);
      await this.delay(25); // Longer delay for block reads

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
      
      const data = await this.readBytes(responseLength);
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[READ MEMORY ERROR] Failed to read ${length} bytes from ${addressHex}: ${errorMsg}`);
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
    
    console.log(`[WRITE] Sending write command (0x57 "W"):`);
    console.log(`  Command header (first 6 bytes): ${commandHeader}`);
    console.log(`  Address: ${addressHex}`);
    console.log(`  Metadata: ${metadataHex}`);
    console.log(`  Data size: ${data.length} bytes`);
    console.log(`  Command total size: ${command.length} bytes (6 header + 4096 data)`);
    
    // Log first 64 bytes of data for debugging
    const dataPreview = Array.from(data.slice(0, 64))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    console.log(`  Data preview (first 64 bytes): ${dataPreview}`);
    
    // Log metadata byte location in data (this is the ONLY place the metadata byte appears)
    const dataMetadataByte = data[0xFFF];
    console.log(`  Data metadata byte at 0xFFF: 0x${dataMetadataByte.toString(16).padStart(2, '0').toUpperCase()}`);
    console.log(`  Metadata byte in command[4101] (from data[0xFFF]): 0x${command[4101].toString(16).padStart(2, '0').toUpperCase()}`);
    
    // Verify metadata byte in data matches what we expect
    if (dataMetadataByte !== metadata) {
      console.warn(`[WRITE WARNING] Metadata byte mismatch: data[0xFFF] = 0x${dataMetadataByte.toString(16).padStart(2, '0').toUpperCase()}, expected 0x${metadataHex}`);
    }

    try {
      await this.write(command);
      console.log(`[WRITE] Command sent successfully, waiting for ACK...`);
      
      // Response: 0x06 (ACK) or error code
      // readBytes will wait for the response - no artificial delay needed
      const response = await this.readBytes(1);
      const responseHex = `0x${response[0].toString(16).padStart(2, '0').toUpperCase()}`;
      console.log(`[WRITE] Response received: ${responseHex}`);
      
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
        console.error(`[WRITE ERROR] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      console.log(`[WRITE] Write successful for block at ${addressHex} with metadata ${metadataHex}`);
    } catch (error) {
      console.error(`[WRITE ERROR] Failed to write block at ${addressHex} with metadata ${metadataHex}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // Clear read buffer to prevent stale data from affecting next connection
    this.readBuffer = new Uint8Array(0);
    this.isReading = false;
    
    // Release reader lock (but keep the port open for reuse)
    if (this.reader) {
      try {
        this.reader.releaseLock();
      } catch (e) {
        // Reader might already be released
      }
      this.reader = null;
    }
    // Release writer lock (but keep the port open for reuse)
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (e) {
        // Writer might already be released
      }
      this.writer = null;
    }
    // Don't close the port or clear the reference - let the protocol manage it
    // The port can be reused for subsequent connections
    // this.port = null; // Commented out to allow port reuse
  }

  private async sendCommand(command: string): Promise<void> {
    const bytes = new TextEncoder().encode(command);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`Sending command: ${command} (${hex})`);
    
    if (!this.writer) {
      throw new Error('Not connected');
    }
    
    // Write the command
    await this.writer.write(bytes);
    await this.delay(10);
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
      console.log(`[SEND] ${commandType} command: ${commandPreview}... (${data.length} bytes total)`);
    } else {
      const commandHex = Array.from(data)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      console.log(`[SEND] ${commandType} command: ${commandHex}`);
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
   * This matches how Go/Python serial libraries work - they maintain an internal buffer.
   * 
   * Timeout: 2s per request/response cycle. If no data arrives within 2s, timeout.
   * This is the ONLY place we apply timeout - all read operations go through here.
   */
  private async readBytes(count: number): Promise<Uint8Array> {
    if (!this.reader) {
      throw new Error('Not connected');
    }

    const startTime = Date.now();
    
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
            if (elapsed >= CONNECTION.TIMEOUT.REQUEST_RESPONSE) {
              throw new Error(`Read ${count} bytes timed out after ${CONNECTION.TIMEOUT.REQUEST_RESPONSE}ms (got ${this.readBuffer.length} bytes)`);
            }
          }
        }

        // Extract exactly 'count' bytes from buffer
        const result = this.readBuffer.slice(0, count);
        
        // Remove consumed bytes from buffer
        this.readBuffer = this.readBuffer.slice(count);

        return result;
      })(),
      CONNECTION.TIMEOUT.REQUEST_RESPONSE,
      `Read ${count} bytes`
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all pending data from the input buffer.
   * This reads any available data into the buffer, then clears it.
   * Simplified version that just reads once with a short timeout.
   */
  private async clearBuffer(): Promise<void> {
    if (!this.reader) return;

    try {
      // Try to read any immediate data (radio may send initialization bytes)
      // Use a short timeout to avoid blocking
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 50);
      });
      
      const fillPromise = this.fillBuffer();
      await Promise.race([fillPromise, timeoutPromise]);
      
      // Read one more time in case there's a second packet
      await this.delay(20);
      try {
        await Promise.race([this.fillBuffer(), timeoutPromise]);
      } catch (e) {
        // Ignore errors
      }

      if (this.readBuffer.length > 0) {
        const clearedHex = Array.from(this.readBuffer)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log(`Cleared ${this.readBuffer.length} bytes from buffer: ${clearedHex}`);
        this.readBuffer = new Uint8Array(0); // Clear the buffer
      } else {
        console.log('Buffer was already clear');
      }
    } catch (e) {
      console.log('Error clearing buffer:', e);
      this.readBuffer = new Uint8Array(0); // Clear on error too
    }
  }
}

