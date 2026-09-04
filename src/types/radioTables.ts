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
   * The raw bytes a WRITE has to patch, kept from the last read.
   *
   * Every encoder on this radio patches the record the radio gave us rather
   * than building one, because a 16-byte write frame carries bytes the driver
   * does not model. That only works if those bytes survive from the read to the
   * write — and `useRadioConnection` builds a FRESH protocol instance per
   * operation, so anything left on the old instance is gone.
   *
   * This is the DA-7X2's form of the cache-restore rule the DM-32 and the clone
   * radios already follow (CLAUDE.md, write-path invariant 1). Without it a
   * write plan refuses outright: no original, nothing to patch.
   */
  writeOriginals: {
    /** Every span the read saw, keyed by address — the originals a whole-codeplug
     *  write patches. Held here because read and write use different protocol
     *  instances and the connection's own log dies with the read. */
    readLog?: ReadonlyMap<number, Uint8Array>;
    /** Hardware slot per zone, by position in the zones array — from
     *  `rawZoneIndices`. Zones are read compacted (empty slots dropped), so
     *  position and slot diverge and a write MUST place by slot. */
    zoneSlots?: readonly number[];
    /**
     * Zone id -> hardware slot, and zone id -> current A/B channel.
     *
     * Position is NOT a stable key once the user edits. Deleting one zone
     * shortens the array, so every later zone lines up against the slot below
     * it — which on 2026-09-03 wrote seven zones one slot down and left the A/B
     * pointers behind, three of them past the end of their new zone. Adding a
     * zone was worse: position 8 against 8 staged slots resolved to -1 and the
     * zone was skipped silently, with no mask bit and no record.
     *
     * Zone ids are regenerated per read, so these maps are valid for the
     * session that staged them — which is exactly the life of a write.
     */
    zoneSlotById?: Readonly<Record<string, number>>;
    zoneCurrentById?: Readonly<Record<string, { a: number; b: number }>>;
    /** Channel records by 1-based channel number, including VFO A/B at 4001/4002. */
    channelRecords: Map<number, Uint8Array>;
    /** The channel presence mask exactly as read — patched on write, never rebuilt. */
    channelMask: Uint8Array;
    /** Which radio these came from, so one radio's bytes can never patch another's. */
    model: string;
    /**
     * Integrity findings from the read these bytes came from.
     *
     * Carried with the originals rather than stored separately so they cannot
     * drift apart: a write is refused on the basis of the read it is patching,
     * and pairing them makes it impossible to check the wrong read's findings.
     */
    integrity: readonly import('../radios/d890uv/integrity').D890IntegrityFinding[];
  };
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
  broadcast: {
    am: D890BroadcastChannel[];
    fm: D890BroadcastChannel[];
    /** Each band's own tuning record — what the receiver is on in VFO mode.
     *  Not a memory: neither has a presence-mask bit. */
    amVfo: D890BroadcastChannel | null;
    fmVfo: D890BroadcastChannel | null;
  };
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
  /**
   * Auto-repeater offsets in MHz, by slot. Null is an unused slot.
   *
   * Index is identity: the `autoRepeater1Uhf` / `autoRepeater1Vhf` settings are
   * u8 selectors into this table, so a slot cannot be moved without repointing
   * whatever selects it.
   */
  autoRepeaterOffsets: (number | null)[];
  /** Power-on screen text and password. */
  powerOnDisplay: D890PowerOnDisplay;
  /**
   * The radio's OWN DMR ID — the vendor CPS calls it "MastID". Null when the
   * record is empty, which is how the radio stores "not used".
   */
  masterRadioId: {
    id: import('../models/DMRRadioID').DMRRadioID;
    /** Override the TX ID of every channel with this one — a byte of its own in
     *  the record. Labelled "Used" in the vendor CPS. */
    overrideAllTxIds: boolean;
  } | null;
}

/** A table id. Use this rather than a bare string so a typo cannot compile. */
export type RadioTableId = keyof RadioTables;
