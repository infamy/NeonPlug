/**
 * Base classes for the radio protocol hierarchy.
 *
 * BaseAnalogProtocol — channels + settings only. Extend this for analog radios (FT-65, UV5R-Mini).
 * BaseDigitalProtocol — marker subclass for digital radios (DM-32UV, etc.). Extend this for any
 *   radio that supports zones, contacts, scan lists, RX groups, encryption, etc.
 *
 * useRadioConnection.ts uses `instanceof BaseDigitalProtocol` to gate DMR-specific reads
 * instead of inspecting capability flags or using `as any` casts.
 */

import type { RadioProtocol, RadioInfo } from '../../types/radio';
import type { Channel, Zone, Contact, RadioSettings, ScanList, DMRRadioID } from '../../models';

export abstract class BaseAnalogProtocol implements RadioProtocol {
  public onProgress?: (progress: number, message: string) => void;

  abstract connect(portOrOptions?: string | { forcePortSelection?: boolean; transport?: string }): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;
  abstract getRadioInfo(): Promise<RadioInfo>;
  abstract readChannels(): Promise<Channel[]>;
  abstract writeChannels(channels: Channel[]): Promise<void>;

  // No-op stubs satisfy RadioProtocol for digital features analog radios don't support.
  async readZones(): Promise<Zone[]> { return []; }
  async writeZones(_zones: Zone[]): Promise<void> {}
  async readScanLists(): Promise<ScanList[]> { return []; }
  async readDMRRadioIDs(): Promise<DMRRadioID[]> { return []; }
  async writeDMRRadioIDs(_ids: DMRRadioID[]): Promise<void> {}
  async readContacts(): Promise<Contact[]> { return []; }
  async writeContacts(_contacts: Contact[]): Promise<void> {}
  async readRadioSettings(): Promise<RadioSettings | null> { return null; }
  /**
   * Deliberately NOT a no-op.
   *
   * It was one until 2026-09-02, and that silently discarded every DA-7X2
   * settings edit: the hook called this, got a resolved promise, and then ran
   * `clearChanges()` — so the UI reported success, advanced the baseline, and
   * the radio kept its old values. That is write-path invariant #2 in CLAUDE.md,
   * and a no-op base is what made it invisible.
   *
   * A protocol that cannot write settings must say so with
   * `settingsWriteUnsupported`, which the hook checks BEFORE sending any bytes.
   * Reaching this throw means that flag is missing.
   */
  async writeRadioSettings(_settings: RadioSettings, _options?: { changedFields?: string[] }): Promise<void> {
    throw new Error(
      'This radio cannot write settings. The protocol must either implement ' +
      'writeRadioSettings or declare settingsWriteUnsupported.'
    );
  }
}

/**
 * Marker base class for digital radios. Extend this instead of BaseAnalogProtocol when the
 * radio supports zones, contacts, scan lists, RX groups, encryption keys, calibration, etc.
 *
 * The empty body is intentional — the only purpose right now is to allow
 * `instanceof BaseDigitalProtocol` checks in useRadioConnection.ts.
 */
export abstract class BaseDigitalProtocol extends BaseAnalogProtocol {}
