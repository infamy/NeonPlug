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
  private port: WebSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
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
    
    const psearchResponse = await withTimeout(
      this.readBytes(8),
      CONNECTION.TIMEOUT.HANDSHAKE,
      'PSEARCH response'
    );
    
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
    
    const passstaResponse = await withTimeout(
      this.readBytes(3),
      CONNECTION.TIMEOUT.HANDSHAKE,
      'PASSSTA response'
    );
    if (passstaResponse[0] !== 0x50) {
      throw new Error(`PASSSTA failed: Expected 0x50, got 0x${passstaResponse[0].toString(16).padStart(2, '0')}`);
    }
    
    await this.delay(50);

    // Step 3: SYSINFO
    await this.sendCommand('SYSINFO');
    await this.delay(50);
    
    const sysinfoResponse = await withTimeout(
      this.readBytes(1),
      CONNECTION.TIMEOUT.HANDSHAKE,
      'SYSINFO response'
    );
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
    // Wrap entire V-frame query in timeout
    return withTimeout(
      (async () => {
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
      })(),
      CONNECTION.TIMEOUT.VFRAME_QUERY,
      `Query V-frame 0x${frameId.toString(16)}`
    );
  }

  async enterProgrammingMode(): Promise<void> {
    // Wrap entire programming mode entry in timeout
    await withTimeout(
      (async () => {
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
      })(),
      CONNECTION.TIMEOUT.HANDSHAKE * 2, // Programming mode takes longer
      'Enter programming mode'
    );
  }

  async readMemory(address: number, length: number): Promise<Uint8Array> {
    // Wrap entire read operation in timeout (memory reads can be slow)
    return withTimeout(
      (async () => {
        // Read command: 0x52 <addr:3> <len:2>
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
        await this.write(command);
        await this.delay(25); // Longer delay for block reads

        // Response: 0x57 <addr:3> <len:2> <data>
        const header = await this.readBytes(6);
        if (header[0] !== 0x57) {
          throw new Error('Invalid read response');
        }

        const responseLength = header[4] | (header[5] << 8);
        const data = await this.readBytes(responseLength);
        return data;
      })(),
      CONNECTION.TIMEOUT.READ_MEMORY,
      `Read memory at 0x${address.toString(16)} (${length} bytes)`
    );
  }

  /**
   * Write memory block to radio
   * 
   * Format: 0x57 <addr:3> <0x00> <0x10> <data:4096> <metadata:1>
   * Total: 4103 bytes
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

    // Write command format: 0x57 <addr:3> <0x00> <0x10> <data:4096> <metadata:1>
    const addrBytes = new Uint8Array([
      address & 0xFF,
      (address >> 8) & 0xFF,
      (address >> 16) & 0xFF,
    ]);

    // Build command: 4103 bytes total
    const command = new Uint8Array(4103);
    command[0] = 0x57; // Write command
    command.set(addrBytes, 1); // Address (bytes 1-3)
    command[4] = 0x00; // Reserved
    command[5] = 0x10; // Size indicator (4KB)
    command.set(data, 6); // Data (bytes 6-4101)
    command[4102] = metadata; // Metadata byte (byte 4102)

    await this.write(command);
    await this.delay(50); // Longer delay for writes (per spec: 10-50ms)

    // Response: 0x06 (ACK) - wrap in timeout
    const response = await withTimeout(
      this.readBytes(1),
      CONNECTION.TIMEOUT.WRITE_MEMORY,
      'Write memory ACK'
    );
    if (response[0] !== 0x06) {
      throw new Error(`Write not acknowledged. Got 0x${response[0].toString(16)} instead of 0x06`);
    }
  }

  async disconnect(): Promise<void> {
    // Clear read buffer to prevent stale data from affecting next connection
    this.readBuffer = new Uint8Array(0);
    this.isReading = false;
    
    if (this.reader) {
      try {
        this.reader.releaseLock();
      } catch (e) {
        // Reader might already be released
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
    if (this.port) {
      try {
        // Only try to close if streams are not locked
        // If streams are locked, we can't close the port anyway
        if (this.port.readable && this.port.writable) {
          if (!this.port.readable.locked && !this.port.writable.locked) {
            await this.port.close();
          } else {
            console.warn('Cannot close port: streams are locked');
          }
        } else {
          // Streams are null, try to close anyway
          await this.port.close();
        }
      } catch (e: any) {
        // Port might already be closed or have locked streams
        if (e.message && e.message.includes('locked stream')) {
          console.warn('Cannot close port: streams are locked');
        } else {
          console.warn('Port close error:', e);
        }
      }
      this.port = null;
    }
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
    await this.writer.write(data);
  }


  /**
   * Fill the read buffer by reading from the stream.
   * This is called when we need more data than is currently in the buffer.
   */
  private async fillBuffer(): Promise<void> {
    if (!this.reader || this.isReading) {
      return;
    }

    this.isReading = true;
    try {
      const readPromise = this.reader.read();
      const { value, done } = await withTimeout(
        readPromise,
        CONNECTION.TIMEOUT.FILL_BUFFER,
        'Fill buffer'
      );
      
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
   */
  private async readBytes(count: number): Promise<Uint8Array> {
    if (!this.reader) {
      throw new Error('Not connected');
    }

    // Wrap the entire read operation in a timeout
    return withTimeout(
      (async () => {
        // Keep reading from stream until we have enough data in buffer
        while (this.readBuffer.length < count) {
          await this.fillBuffer();
        }

        // Extract exactly 'count' bytes from buffer
        const result = this.readBuffer.slice(0, count);
        
        // Remove consumed bytes from buffer
        this.readBuffer = this.readBuffer.slice(count);

        return result;
      })(),
      CONNECTION.TIMEOUT.READ_BYTES,
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

