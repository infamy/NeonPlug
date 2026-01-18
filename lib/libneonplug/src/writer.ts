import { DM32UVProtocol } from '../../src/protocol/dm32uv/protocol';
import type { Contact } from '../../src/models/Contact';
import type { RadioProtocol } from '../../src/protocol/interface';
import type { ProgressCallback, RadioModel } from './types';

/**
 * NeonPlugWriter - Library for writing contacts to radios via Web Serial API
 * 
 * This class provides a simple API for third-party websites to write contact lists
 * directly to Baofeng DM-32UV radios.
 * 
 * @example
 * ```typescript
 * const writer = new NeonPlugWriter();
 * const contacts = [{ id: 1, name: "John", dmrId: 1234567 }];
 * await writer.writeContacts(contacts, 'dm32uv', (progress, message) => {
 *   console.log(`${progress}%: ${message}`);
 * });
 * ```
 */
export class NeonPlugWriter {
  /**
   * Write contacts directly to the radio
   * @param contacts Array of Contact objects to write
   * @param radioModel Radio model identifier ('dm32uv')
   * @param onProgress Optional progress callback (progress: 0-100, message: string)
   * @throws Error if Web Serial API not supported, connection fails, or write fails
   */
  async writeContacts(
    contacts: Contact[],
    radioModel: RadioModel,
    onProgress?: ProgressCallback
  ): Promise<void> {
    // Create protocol instance for the specified radio model
    const protocol = this.createProtocol(radioModel);
    
    // Set progress callback
    protocol.onProgress = onProgress;
    
    try {
      // Connect to radio (handles port selection)
      await protocol.connect();
      
      // Get radio info (required for writeContacts)
      await protocol.getRadioInfo();
      
      // Write contacts (each radio model may have different implementation)
      await protocol.writeContacts(contacts);
    } finally {
      // Always disconnect
      await protocol.disconnect();
    }
  }
  
  /**
   * Factory method to create appropriate protocol instance
   * @private
   */
  private createProtocol(model: RadioModel): RadioProtocol {
    switch (model) {
      case 'dm32uv':
        return new DM32UVProtocol();
      // Future: Add other radio models here
      // case 'other-radio':
      //   return new OtherRadioProtocol();
      default:
        throw new Error(
          `Unsupported radio model: ${model}. ` +
          `Supported models: ${NeonPlugWriter.getSupportedModels().join(', ')}`
        );
    }
  }
  
  /**
   * Get supported radio models
   * @returns Array of supported radio model identifiers
   */
  static getSupportedModels(): RadioModel[] {
    return ['dm32uv']; // Extend as new radios are added
  }
  
  /**
   * Check if Web Serial API is supported in the current browser
   * @returns true if Web Serial API is available, false otherwise
   */
  static isSupported(): boolean {
    return 'serial' in navigator;
  }
}
