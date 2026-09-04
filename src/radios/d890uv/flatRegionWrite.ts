/**
 * Write planning for the DA-7X2's FLAT regions.
 *
 * A flat region is a single fixed-address span with no presence mask and no
 * per-record index arithmetic — settings, APRS, the power-on screen, the zone
 * A/B position arrays, the zone hidden mask, the emergency pair, and the GPS
 * roaming table. There is exactly one of each on the radio, so the two questions
 * `planMaskedTableWrite` exists to answer — which slot, and is it occupied — do
 * not arise here at all. What is left is the part every planner shares: turn one
 * patched span into 16-byte frames, and refuse anything that cannot become them.
 *
 * The span still has to come from a READ. Every encoder feeding this file
 * patches the bytes the radio gave us (see the header of `tableWrite.ts`), and a
 * 16-byte frame carries whatever sits beside the fields this driver models. The
 * emergency region is the clearest case: the vendor's own writer never touches
 * +0x16..+0x20, and those bytes survive here only because they ride along from
 * `original` unchanged — not because anything omits them.
 *
 * ⚠️ Like the rest of this radio's write path, no frame this file plans has ever
 * been sent to a radio. The framing is confirmed; the write is inference.
 */

import { D890_ADDR, D890_BLOCK, D890_LIMITS } from './constants';
import { assertWritableAddress } from './framing';
import { D890_EMERGENCY } from './emergency';
import { D890_GPS_ROAMING } from './gpsRoaming';
import { D890_POWER_ON } from './powerOnDisplay';
import { D890WriteRefusedError, type D890WriteFrame } from './writePlan';

/** Where a flat region lives. The size comes from the span handed in. */
export interface D890FlatRegionSpec {
  /** Shown in frame labels and refusal messages, so it reads as something a user recognises. */
  label: string;
  address: number;
}

/** A spec plus its length, for the table of known regions below. */
export interface D890FlatRegion extends D890FlatRegionSpec {
  size: number;
}

export interface D890FlatRegionWriteInput {
  /** The span exactly as READ from the radio. Required — see the file header. */
  original: Uint8Array;
  /** The same span after an encoder patched it. */
  encoded: Uint8Array;
  /**
   * Send only the frames whose bytes actually CHANGE.
   *
   * A write on this radio costs 24 bytes on the wire per 16 stored, there is no
   * retry, and reading back mid-session reboots the radio — so an unchanged
   * frame buys nothing and is pure exposure. Editing one power-on line is one
   * frame instead of six; the settings region is 22 frames of which a typical
   * edit touches one.
   *
   * Reporting only — every frame is sent. The vendor
   * CPS rewrites everything every time, and whether this radio commits a partial
   * write is still an open question. Turn it on deliberately.
   */
}

export interface D890FlatRegionWritePlan {
  frames: D890WriteFrame[];
  /**
   * How many of the span's frames DIFFER, counted over the whole span whether or
   * not they were emitted — and every frame IS emitted. This is reporting only;
   * without it, it is what that flag would have saved.
   */
  changedFrames: number;
  /** Frames the span covers in total, i.e. what a full rewrite would send. */
  totalFrames: number;
}

/**
 * Plan a write for one flat region, or throw explaining why it cannot be done.
 *
 * The three refusals are all conditions a caller can fix, and none of them is
 * something to warn about and continue through — each would leave the radio
 * holding bytes that read back plausibly and behave wrongly.
 */
export function planFlatRegionWrite(
  spec: D890FlatRegionSpec,
  input: D890FlatRegionWriteInput
): D890FlatRegionWritePlan {
  const { original, encoded } = input;
  const FRAME = D890_BLOCK.WRITE_LEN;

  // Gate 1 — the two spans must describe the same bytes.
  //
  // Encoders patch, so a length change means the encoded buffer is not this
  // region: comparing them frame by frame would then align the wrong bytes and
  // "changed" would mean nothing.
  if (encoded.length !== original.length) {
    throw new D890WriteRefusedError(
      `Refusing to write ${spec.label}: the encoded span is ${encoded.length} bytes but the ` +
        `span read from the radio is ${original.length}. An encoder patches what the radio ` +
        `gave us, so a different length means these are not the same region.`
    );
  }

  // Gate 2 — whole frames only.
  //
  // `buildWriteCommand` rejects any payload but exactly 16 bytes, so a partial
  // tail could only be sent by inventing the bytes that follow it. Reads are
  // already rounded up to the same granularity, so the fix is to read the
  // region aligned rather than to pad it here.
  if (original.length % FRAME !== 0) {
    throw new D890WriteRefusedError(
      `Refusing to write ${spec.label}: its ${original.length}-byte span is not a whole ` +
        `number of ${FRAME}-byte frames. Read the region rounded up to ${FRAME} bytes ` +
        `instead — a short final frame cannot be sent without inventing its tail.`
    );
  }

  // Gate 3 — alignment. Caught here rather than at send time: an unaligned
  // address throws part-way through a session, and rule 1 forbids reading back
  // to discover what landed.
  if (spec.address % D890_BLOCK.ALIGNMENT !== 0) {
    throw new D890WriteRefusedError(
      `Refusing to write ${spec.label}: 0x${spec.address.toString(16)} is not ` +
        `${D890_BLOCK.ALIGNMENT}-byte aligned, so every frame in the region would be too.`
    );
  }

  const frames: D890WriteFrame[] = [];
  let changedFrames = 0;

  for (let off = 0; off < original.length; off += FRAME) {
    const address = spec.address + off;
    // Checked for every frame the span covers, not only the ones emitted, so a
    // region overlapping the guarded flash-management offsets is refused on its
    // geometry rather than on whichever bytes happen to differ today.
    assertWritableAddress(address);

    // Counted for reporting only — every frame in the span is SENT regardless.
    // A write that skips unchanged frames left a radio in a bad state; see the
    // note in writePlan.ts. The count is still worth surfacing so a plan can
    // say how much of what it sends is actually different.
    let identical = true;
    for (let i = off; i < off + FRAME; i += 1) {
      if (original[i] !== encoded[i]) {
        identical = false;
        break;
      }
    }
    if (!identical) changedFrames += 1;

    frames.push({
      address,
      // `slice` copies. A plan is inspected and held before it is sent, so it
      // must not alias a buffer the caller may still be patching.
      data: encoded.slice(off, off + FRAME),
      what: spec.label,
    });
  }

  return { frames, changedFrames, totalFrames: original.length / FRAME };
}

/**
 * The zone A/B position arrays are `ZONES_MAX` u16s — 500 bytes, which is not a
 * whole number of frames. Rounded UP, matching what `readZoneCurrentChannels`
 * asks the radio for and what `applyZoneCurrentChannels` patches, so the read,
 * the encoder and the write all describe the same 512 bytes. The 12 bytes past
 * the array belong to the radio and travel through untouched.
 */
export const ZONE_CURRENT_CHANNEL_BYTES =
  Math.ceil((D890_LIMITS.ZONES_MAX * 2) / D890_BLOCK.ALIGNMENT) * D890_BLOCK.ALIGNMENT;

/**
 * Every flat region, with its address taken from the READ path rather than
 * repeated.
 *
 * A write that disagrees with the read about where something lives is the worst
 * bug available on this radio: a read-back would look perfectly consistent while
 * the radio held something else.
 */
export const D890_FLAT_REGIONS = {
  settings: {
    label: 'settings',
    address: D890_ADDR.SETTINGS,
    size: D890_ADDR.SETTINGS_SIZE,
  },
  aprs: {
    label: 'APRS settings',
    address: D890_ADDR.APRS_SETTINGS,
    size: D890_ADDR.APRS_SETTINGS_SIZE,
  },
  /**
   * A 32-record table, but flat by the definition that matters here: it has NO
   * presence mask (confirmed from the vendor's capture — it sweeps the region
   * contiguously with nothing read first), and the vendor writes it as one run,
   * so there is no per-record index arithmetic to get wrong.
   */
  gpsRoaming: {
    label: 'GPS roaming',
    address: D890_GPS_ROAMING.DATA,
    size: D890_GPS_ROAMING.TABLE_BYTES,
  },
  /**
   * Indexed by zone SLOT, and each u16 is a POSITION in that zone's member list
   * rather than a channel number. Both matter to whoever fills the span; neither
   * matters to the frames, which is why these are flat regions and not zone
   * records. They sit inside the settings address range but belong to the ZONE
   * marshaller — the settings region ends well before them.
   */
  zoneCurrentChannelA: {
    label: 'zone current channel A',
    address: D890_ADDR.ZONE_A_CHANNEL,
    size: ZONE_CURRENT_CHANNEL_BYTES,
  },
  zoneCurrentChannelB: {
    label: 'zone current channel B',
    address: D890_ADDR.ZONE_B_CHANNEL,
    size: ZONE_CURRENT_CHANNEL_BYTES,
  },
  /** One bit per zone slot, SET = hidden. Immediately after the zone present mask. */
  zoneHidden: {
    label: 'zone hidden mask',
    address: D890_ADDR.ZONE_HIDE,
    size: D890_ADDR.ZONE_HIDE_SIZE,
  },
  /** Both text lines and the power-on password, in one span with mixed encodings. */
  powerOnDisplay: {
    label: 'power-on display',
    address: D890_POWER_ON.LINE_1,
    size: D890_POWER_ON.SPAN,
  },
  /**
   * Two separate 0x30-byte regions, one record each — not an array, despite
   * sitting near tables that are. The encoder touches only the first 0x16 bytes
   * of the settings record; the rest of the span is carried through from the
   * original, which is the only reason writing the whole 0x30 is safe.
   */
  emergencySettings: {
    label: 'emergency settings',
    address: D890_EMERGENCY.SETTINGS,
    size: D890_EMERGENCY.SIZE,
  },
  emergencyContact: {
    label: 'emergency contact',
    address: D890_EMERGENCY.CONTACT,
    size: D890_EMERGENCY.SIZE,
  },
} as const satisfies Record<string, D890FlatRegion>;
