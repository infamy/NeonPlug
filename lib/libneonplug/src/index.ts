/**
 * NeonPlug Library - Write contacts to radios via Web Serial API
 * 
 * A thin wrapper around the NeonPlug protocol implementation that allows
 * third-party websites to write contact lists directly to Baofeng DM-32UV radios.
 * 
 * @example
 * ```typescript
 * import { NeonPlugWriter, type Contact } from 'https://neonplug.app/libneonplug/libneonplug.js';
 * 
 * const writer = new NeonPlugWriter();
 * const contacts = [{ id: 1, name: "John", dmrId: 1234567 }];
 * await writer.writeContacts(contacts, 'dm32uv');
 * ```
 */

export { NeonPlugWriter } from './writer';
export type { Contact, ProgressCallback, RadioModel } from './types';
