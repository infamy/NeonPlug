/**
 * Optional read methods a digital radio MAY implement.
 *
 * Not every digital radio has AM zones, geofences or a power-on splash. Rather
 * than force `BaseDigitalProtocol` to grow a no-op stub for each one, a driver
 * simply implements what it has and `useRadioConnection` calls what is present.
 *
 * The point of this file is that the shape is declared ONCE. It used to be
 * written out twice — inline `as unknown as { ... }` casts in the connection
 * hook — which meant nothing checked those casts against the protocols they
 * described. A signature could change on the protocol and the cast would keep
 * asserting the old one, with the mismatch surfacing only at runtime on a
 * radio. A driver that says `implements OptionalDigitalReads` is now checked by
 * the compiler instead.
 *
 * `Partial<OptionalDigitalReads>` is what call sites use, so presence is still
 * a runtime question — a radio missing a method is normal, not an error.
 *
 * This file lives at the `radios/` level rather than in `radios/shared/`
 * deliberately: it names radio-specific types, and `shared/` should not know
 * about any particular radio. `radios/index.ts` already imports every driver,
 * so this level is the right place for cross-radio types.
 */

import type { EncryptionKey } from '../models/EncryptionKey';
import type { QuickTextMessage } from '../models/QuickTextMessage';
import type { RXGroup } from '../models/RXGroup';
import type { QuickContact } from '../models/QuickContact';
import type { D890RoamingChannel, D890RoamingZone } from './d890uv/structures';
import type { D890SatelliteRecord } from './d890uv/satellite';
import type { D890EmergencySettings, D890EmergencyContact } from './d890uv/emergency';
import type {
  D890BroadcastBand,
  D890BroadcastChannel,
} from './d890uv/broadcastChannels';
import type { D890GpsRoamingEntry } from './d890uv/gpsRoaming';
import type { D890AmZone } from './d890uv/amZones';
import type { D890FiveTone, D890TwoTone } from './d890uv/tones';
import type { D890PowerOnDisplay } from './d890uv/powerOnDisplay';
import type { D890ImageKind } from './d890uv/bootImage';

export interface OptionalDigitalReads {
  /** Talkgroup receive groups. */
  readRXGroups(): Promise<RXGroup[]>;
  /** Talkgroups, as distinct from the contact list. */
  readQuickContacts(): Promise<QuickContact[]>;
  readEncryptionKeys(): Promise<EncryptionKey[]>;
  readQuickMessages(): Promise<QuickTextMessage[]>;
  readRoamingChannels(): Promise<D890RoamingChannel[]>;
  readRoamingZones(): Promise<D890RoamingZone[]>;
  readSatellites(): Promise<D890SatelliteRecord[]>;
  readEmergency(): Promise<{
    settings: D890EmergencySettings | null;
    contact: D890EmergencyContact | null;
  }>;
  readBroadcastChannels(band: D890BroadcastBand): Promise<D890BroadcastChannel[]>;
  readFmVfo(): Promise<D890BroadcastChannel | null>;
  readGpsRoaming(): Promise<D890GpsRoamingEntry[]>;
  readAmZones(): Promise<D890AmZone[]>;
  readTones(): Promise<{ fiveTone: D890FiveTone[]; twoTone: D890TwoTone[] }>;
  readPowerOnDisplay(): Promise<D890PowerOnDisplay>;
  /**
   * Zone A/B current channels, indexed by hardware zone SLOT — see
   * `alignZoneCurrentChannels`, which maps them onto the zones array.
   */
  readZoneCurrentChannels(): Promise<{ a: number[]; b: number[] }>;
  /** Hardware slot number for each zone in the zones array, in order. */
  rawZoneIndices: number[];
  /** The radio's own DMR ID ("MastID"), or null when the record is empty. */
  /** Auto-repeater offsets in MHz, by slot; null for an unused slot. */
  readAutoRepeaterOffsets?(): Promise<(number | null)[]>;
  /** The AM airband receiver's own tuning record. */
  readAmVfo?(): Promise<import('./d890uv/broadcastChannels').D890BroadcastChannel | null>;
  readMasterRadioId?(): Promise<{
    id: import('../models/DMRRadioID').DMRRadioID;
    /** Override the TX ID of every channel with this one. The vendor CPS calls
     *  this checkbox "Used"; it is its own byte, not "the record is non-empty". */
    overrideAllTxIds: boolean;
  } | null>;
  /** Boot and standby pictures. Large and read on demand, never with a codeplug. */
  readImages(
    onProgress?: (percent: number, label: string) => void
  ): Promise<Record<D890ImageKind, Uint8Array | null>>;
}
