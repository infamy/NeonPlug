/**
 * Transmit power levels, in one place.
 *
 * These were previously enumerated separately in the channel row and the channel
 * edit modal, and both lists were wrong for a four-level radio. The row rendered
 * `Turbo` as `H` and its cycle silently downgraded the channel to `Low`; the
 * modal's `<select>` had no matching `<option>`, so it displayed `Low` for a
 * Turbo channel and would have saved that on edit.
 *
 * Anything that needs the list asks for it here, driven by the radio's declared
 * capability rather than by a model check.
 */
import type { PowerLevel } from '../models/Channel';
import type { RadioCapabilities } from '../types/radioCapabilities';

/** Radios that do not declare their levels are the usual three. */
export const DEFAULT_POWER_LEVELS: readonly PowerLevel[] = ['Low', 'Medium', 'High'];

/** Single-letter labels for the compact channel grid. */
export const POWER_ABBREV: Readonly<Record<string, string>> = {
  Low: 'L',
  Medium: 'M',
  High: 'H',
  Turbo: 'T',
};

/** The levels the given radio offers, weakest first. */
export function powerLevelsFor(caps: RadioCapabilities | null | undefined): readonly PowerLevel[] {
  const levels = caps?.powerLevels;
  return levels && levels.length > 0 ? levels : DEFAULT_POWER_LEVELS;
}

/**
 * The compact label for a level.
 *
 * Falls back to the first character rather than to a fixed level, so an
 * unrecognised value shows as something odd instead of masquerading as a real
 * setting the radio is not on.
 */
export function powerAbbrev(power: string): string {
  return POWER_ABBREV[power] ?? power.charAt(0).toUpperCase();
}

/**
 * The next level in the cycle.
 *
 * A level not in the list (because the radio was switched, or the codeplug came
 * from a different model) advances to the FIRST level rather than staying put,
 * but only because the caller asked to change it. The bug this replaces did that
 * on a level the radio genuinely supported.
 */
export function nextPowerLevel(current: string, levels: readonly PowerLevel[]): PowerLevel {
  const i = levels.indexOf(current as PowerLevel);
  return levels[(i + 1) % levels.length];
}

/**
 * The nearest level the target radio can actually transmit at.
 *
 * Downgrades to the strongest supported level no higher than the requested one,
 * so a DA-7X2 `Turbo` channel becomes `High` on a three-level radio rather than
 * an unrepresentable value the encoder has to guess at. Never upgrades: a
 * channel programmed for low power stays low.
 *
 * Returns null when nothing had to change, so callers can report only the
 * channels they actually altered.
 */
export function clampPowerLevel(
  power: string,
  levels: readonly PowerLevel[],
): PowerLevel | null {
  if (levels.includes(power as PowerLevel)) return null;
  const rank = DEFAULT_ORDER.indexOf(power as PowerLevel);
  if (rank < 0) return levels[0];
  for (let i = rank - 1; i >= 0; i -= 1) {
    const candidate = DEFAULT_ORDER[i];
    if (levels.includes(candidate)) return candidate;
  }
  return levels[0];
}

/** Weakest to strongest, across every radio. Used only for ranking. */
const DEFAULT_ORDER: readonly PowerLevel[] = ['Low', 'Medium', 'High', 'Turbo'];
