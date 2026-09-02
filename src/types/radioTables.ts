/**
 * The optional data tables a radio may hold, keyed by an agnostic table id.
 *
 * `radioStore` used to carry one named slot per table — `d890Broadcast`,
 * `d890AmZones`, `d890Tones` and seven more — plus a setter, a setter type and
 * an initial value for each. Ten tables meant forty lines of shared store that
 * named one specific radio, and every component wanting that data had to name
 * the radio too, even though none of them actually behaved differently because
 * of it: they gate on the data being present, or on a capability flag.
 *
 * So the ids here are deliberately generic. `broadcast` is "this radio's AM/FM
 * broadcast tables", not "the DA-7X2's". A second radio with broadcast tables
 * fills the same key and every consumer works unchanged.
 *
 * The VALUE types are still DA-7X2 shapes, because that is the only radio that
 * has these tables so far and inventing a generic record before there is a
 * second example would be guessing. Generalising a value type is a local change
 * to this file plus its parsers when a second radio arrives; it does not touch
 * the store or any component.
 */

import type { D890RoamingChannel, D890RoamingZone } from '../radios/d890uv/structures';
import type { D890SatelliteRecord } from '../radios/d890uv/satellite';
import type { D890BroadcastChannel } from '../radios/d890uv/broadcastChannels';
import type { D890GpsRoamingEntry } from '../radios/d890uv/gpsRoaming';
import type { D890EmergencySettings, D890EmergencyContact } from '../radios/d890uv/emergency';
import type { D890AmZone } from '../radios/d890uv/amZones';
import type { D890FiveTone, D890TwoTone } from '../radios/d890uv/tones';
import type { D890PowerOnDisplay } from '../radios/d890uv/powerOnDisplay';

export interface RadioTables {
  /**
   * Boot image and standby pictures. Separate from `bootImageRaw` because a
   * radio may have several of them in a different format from the DM-32's
   * single image (the DA-7X2 has three, 160x128 RGB565).
   */
  pictures: { boot: Uint8Array | null; bk1: Uint8Array | null; bk2: Uint8Array | null };
  /**
   * Roaming channels and zones, kept raw — no model of its own yet, and
   * inventing one before there is a UI would be guessing at what that UI needs.
   */
  roaming: { channels: D890RoamingChannel[]; zones: D890RoamingZone[] };
  /** Satellite repeater table. Not APRS-related. */
  satellites: D890SatelliteRecord[];
  /** Emergency / alarm settings and the contact they call. */
  emergencyAlarm: { settings: D890EmergencySettings | null; contact: D890EmergencyContact | null };
  /** AM airband and FM broadcast channels — separate tables from the main list. */
  broadcast: { am: D890BroadcastChannel[]; fm: D890BroadcastChannel[]; fmVfo: D890BroadcastChannel | null };
  /** Zones over the AM airband table. */
  amZones: D890AmZone[];
  /** 5-Tone and 2-Tone signalling code lists. */
  toneLists: { fiveTone: D890FiveTone[]; twoTone: D890TwoTone[] };
  /** GPS Roaming geofences. */
  gpsRoaming: D890GpsRoamingEntry[];
  /**
   * Per-zone current A/B channel, as POSITIONS within that zone's own member
   * list — not channel numbers. Index is the zone number.
   */
  zoneCurrentChannels: { a: number[]; b: number[] };
  /** Power-on screen text and password. */
  powerOnDisplay: D890PowerOnDisplay;
}

/** A table id. Use this rather than a bare string so a typo cannot compile. */
export type RadioTableId = keyof RadioTables;
