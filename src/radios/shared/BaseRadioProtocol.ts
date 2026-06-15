/**
 * Default no-op implementations for optional RadioProtocol methods.
 * New protocols extend this and only override what they actually support.
 * The six required methods (connect, disconnect, isConnected, getRadioInfo,
 * readChannels, writeChannels) remain abstract.
 */

import type { RadioProtocol, RadioInfo } from '../../types/radio';
import type { Channel, Zone, Contact, RadioSettings, ScanList, DMRRadioID } from '../../models';

export abstract class BaseRadioProtocol implements RadioProtocol {
  public onProgress?: (progress: number, message: string) => void;

  abstract connect(portOrOptions?: string | { forcePortSelection?: boolean; transport?: string }): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;
  abstract getRadioInfo(): Promise<RadioInfo>;
  abstract readChannels(): Promise<Channel[]>;
  abstract writeChannels(channels: Channel[]): Promise<void>;

  async readZones(): Promise<Zone[]> { return []; }
  async writeZones(_zones: Zone[]): Promise<void> {}
  async readScanLists(): Promise<ScanList[]> { return []; }
  async readDMRRadioIDs(): Promise<DMRRadioID[]> { return []; }
  async writeDMRRadioIDs(_ids: DMRRadioID[]): Promise<void> {}
  async readContacts(): Promise<Contact[]> { return []; }
  async writeContacts(_contacts: Contact[]): Promise<void> {}
  async readRadioSettings(): Promise<RadioSettings | null> { return null; }
  async writeRadioSettings(_settings: RadioSettings, _options?: { changedFields?: string[] }): Promise<void> {}
}
