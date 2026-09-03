/**
 * Codeplug integrity checks for the DA-7X2.
 *
 * The premise is not "make a broken radio read nicely". It is the opposite: a
 * codeplug that cannot be true should be REPORTED, the parts that are readable
 * recovered so the user can salvage them, and WRITING REFUSED — because writing
 * a corrupt read back is how corruption becomes permanent.
 *
 * The case that prompted this: a radio whose zone presence and hidden masks
 * both read 32 bytes of 0xFF. Decoded literally that is 250 zones, all hidden,
 * 242 of them empty placeholders. Had a write gone out from that read it would
 * have marked 250 slots present and written 242 invented zones into the radio.
 * Every existing gate passed — they check references and originals, not whether
 * the read itself is credible.
 *
 * **All-0xFF is not a vendor state.** The CPS's own programming session writes
 * `ff 00 00 00…` to the zone mask (8 zones) and `00…` to the hidden mask. Erased
 * flash reads as 0xFF, so a mask of all-0xFF means the region was never written
 * or has been lost — not that everything is present.
 */

import { D890_ADDR, D890_LIMITS } from './constants';

export type D890IntegrityLevel = 'blocker' | 'warning';

export interface D890IntegrityFinding {
  level: D890IntegrityLevel;
  /** The region, named as a user would recognise it. */
  region: string;
  /** What is wrong, in one sentence. */
  problem: string;
  /** What it means for the user, including whether a write is safe. */
  consequence: string;
}

/** True when every byte covering `slotCount` bits is 0xFF — i.e. erased. */
export function isErasedMask(mask: Uint8Array, slotCount: number): boolean {
  const bytes = Math.ceil(slotCount / 8);
  if (mask.length < bytes) return false;
  for (let i = 0; i < bytes; i += 1) if (mask[i] !== 0xff) return false;
  return true;
}

/**
 * Check one presence mask.
 *
 * A mask claiming EVERY slot is occupied is the signature. On a table of any
 * size that is implausible on its face — 250 zones or 4000 channels all in use —
 * and it is exactly what erased flash decodes to.
 */
export function checkPresenceMask(
  region: string,
  mask: Uint8Array,
  slotCount: number
): D890IntegrityFinding | null {
  if (!isErasedMask(mask, slotCount)) return null;
  return {
    level: 'blocker',
    region,
    problem: `the ${region} presence mask is ${Math.ceil(slotCount / 8)} bytes of 0xFF — erased flash, not data.`,
    consequence:
      `Decoded literally it claims all ${slotCount} slots are in use, so this read shows ` +
      `entries the radio does not have. What IS readable can still be exported, but writing ` +
      `is refused: it would send those invented entries to the radio.`,
  };
}

/**
 * Cross-check a mask against the records behind it.
 *
 * A mask can be intact and still disagree with reality. When it claims far more
 * slots than have any content, the mask is the thing to distrust — a record is
 * self-describing, a bit is not.
 */
export function checkMaskAgainstRecords(
  region: string,
  claimed: number,
  withContent: number
): D890IntegrityFinding | null {
  if (claimed === 0 || withContent >= claimed) return null;
  // A handful of empty-but-present slots is ordinary. An order of magnitude is
  // not, and is what an erased or partly-lost mask looks like.
  if (claimed < 8 || withContent * 4 > claimed) return null;
  return {
    level: 'warning',
    region,
    problem: `the ${region} mask claims ${claimed} entries but only ${withContent} contain anything.`,
    consequence:
      `The empty ones are probably not real. They are shown so nothing is hidden from you, ` +
      `but check them before writing — a write would make them real on the radio.`,
  };
}

/** Convenience wrappers so call sites do not repeat the geometry. */
export const D890_MASK_CHECKS = {
  zones: (mask: Uint8Array) => checkPresenceMask('zone', mask, D890_LIMITS.ZONES_MAX),
  channels: (mask: Uint8Array) => checkPresenceMask('channel', mask, D890_LIMITS.CHANNELS_MAX),
  hiddenZones: (mask: Uint8Array): D890IntegrityFinding | null => {
    if (!isErasedMask(mask, D890_LIMITS.ZONES_MAX)) return null;
    return {
      level: 'warning',
      region: 'zone hidden',
      problem: `the zone hidden mask is ${D890_ADDR.ZONE_HIDE_SIZE} bytes of 0xFF — erased flash.`,
      consequence:
        `Every zone will appear hidden, which is almost certainly wrong. The vendor CPS writes ` +
        `zeros here when no zone is hidden.`,
    };
  },
} as const;

/** True when any finding must stop a write. */
export function blocksWriting(findings: readonly D890IntegrityFinding[]): boolean {
  return findings.some((f) => f.level === 'blocker');
}

/** One human-readable summary, for a dialog or a log line. */
export function describeFindings(findings: readonly D890IntegrityFinding[]): string {
  return findings
    .map((f) => `${f.level === 'blocker' ? '⛔' : '⚠️'} ${f.problem}\n   ${f.consequence}`)
    .join('\n\n');
}
