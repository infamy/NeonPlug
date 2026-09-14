/**
 * DA-7X2 / AT-D890UV general settings codec.
 *
 * Read-only for now. `encodeD890Settings` exists so the write path has a single
 * place to grow into, and so the round-trip is covered by tests — it is NOT
 * wired to any radio write. Per golden rule #1, none of this is verified on
 * hardware in the write direction.
 */

import {
  D890_ALERT_TONE_DURATION_MS,
  D890_ALERT_TONE_GROUPS,
  D890_ALERT_TONE_STEPS,
  D890_FREQUENCY_SCALE,
  D890_SETTINGS_BITFIELDS,
  D890_SETTINGS_FIELDS,
  D890_SETTINGS_FREQUENCIES,
  D890_UNMAPPED_BYTES,
} from './settingsMap';
import { readU16LE, readU32LE } from './structures';

/** One melody step: a tone and how long it sounds. */
export interface D890AlertToneStep {
  frequencyHz: number;
  durationMs: number;
}

export interface D890Settings extends Record<string, unknown> {
  alertTones: Record<string, D890AlertToneStep[]>;
  /** Raw value of every settings byte we cannot yet name, keyed by hex offset. */
  unmapped: Record<string, number>;
}

/**
 * Decodes the settings region into a flat object keyed by D890_SETTINGS_FIELDS.
 *
 * Returns null for a short buffer rather than filling with zeros: a truncated
 * read must not be presented as a radio whose every setting is Off.
 */
export function parseD890Settings(bytes: Uint8Array): D890Settings | null {
  const needed = D890_SETTINGS_FIELDS.reduce((max, f) => Math.max(max, f.offset + 1), 0);
  const toneEnd = D890_ALERT_TONE_GROUPS.reduce(
    (max, g) => Math.max(max, g.durations + D890_ALERT_TONE_STEPS * 2),
    0,
  );
  if (bytes.length < Math.max(needed, toneEnd)) return null;

  const out: Record<string, unknown> = {};
  for (const f of D890_SETTINGS_FIELDS) out[f.key] = bytes[f.offset] ?? 0;
  // Bitfields are surfaced as the whole byte. The UI splits it into checkboxes;
  // keeping the byte intact is what makes the write a read-modify-write rather
  // than a clobber.
  for (const b of D890_SETTINGS_BITFIELDS) out[b.key] = bytes[b.offset] ?? 0;

  for (const f of D890_SETTINGS_FREQUENCIES) {
    out[f.key] = readU32LE(bytes, f.offset) / D890_FREQUENCY_SCALE;
  }

  // Surfaced, not hidden - see D890_UNMAPPED_BYTES.
  const unmapped: Record<string, number> = {};
  for (const u of D890_UNMAPPED_BYTES) {
    unmapped[`0x${u.offset.toString(16).padStart(3, '0')}`] = bytes[u.offset] ?? 0;
  }
  out.unmapped = unmapped;

  const alertTones: Record<string, D890AlertToneStep[]> = {};
  for (const g of D890_ALERT_TONE_GROUPS) {
    const steps: D890AlertToneStep[] = [];
    for (let i = 0; i < D890_ALERT_TONE_STEPS; i += 1) {
      steps.push({
        frequencyHz: readU16LE(bytes, g.frequencies + i * 2),
        // The radio counts in units of 10 ms; the CPS shows milliseconds.
        durationMs: readU16LE(bytes, g.durations + i * 2) * D890_ALERT_TONE_DURATION_MS,
      });
    }
    alertTones[g.id] = steps;
  }
  out.alertTones = alertTones;
  return out as D890Settings;
}

/**
 * Applies settings onto a copy of the region image.
 *
 * Values are clamped to 0..255 and, for known fields, are NOT clamped to `max` —
 * `max` is a lower bound on the CPS's range (see settingsMap.ts), so clamping to
 * it would silently refuse legal values.
 */
export function encodeD890Settings(
  region: Uint8Array,
  settings: Partial<D890Settings>,
): Uint8Array {
  const out = new Uint8Array(region);
  for (const f of D890_SETTINGS_FIELDS) {
    const v = settings[f.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[f.offset] = Math.max(0, Math.min(255, Math.round(v)));
  }

  for (const b of D890_SETTINGS_BITFIELDS) {
    const v = settings[b.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[b.offset] = Math.max(0, Math.min(255, Math.round(v)));
  }

  for (const f of D890_SETTINGS_FREQUENCIES) {
    const v = settings[f.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    writeU32LE(out, f.offset, Math.round(v * D890_FREQUENCY_SCALE));
  }
  // D890_UNMAPPED_BYTES are deliberately never written back. Their meaning is
  // unknown, so the only safe thing to do with them is leave them exactly as the
  // radio had them.

  const tones = settings.alertTones;
  if (tones) {
    for (const g of D890_ALERT_TONE_GROUPS) {
      const steps = tones[g.id];
      if (!steps) continue;
      for (let i = 0; i < Math.min(steps.length, D890_ALERT_TONE_STEPS); i += 1) {
        const step = steps[i];
        if (!step) continue;
        writeU16LE(out, g.frequencies + i * 2, step.frequencyHz);
        writeU16LE(out, g.durations + i * 2, Math.round(step.durationMs / D890_ALERT_TONE_DURATION_MS));
      }
    }
  }
  return out;
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number): void {
  const v = Math.max(0, Math.min(0xffffffff, Math.round(value)));
  bytes[offset] = v & 0xff;
  bytes[offset + 1] = (v >>> 8) & 0xff;
  bytes[offset + 2] = (v >>> 16) & 0xff;
  bytes[offset + 3] = (v >>> 24) & 0xff;
}

function writeU16LE(bytes: Uint8Array, offset: number, value: number): void {
  const v = Math.max(0, Math.min(0xffff, Math.round(value)));
  bytes[offset] = v & 0xff;
  bytes[offset + 1] = (v >> 8) & 0xff;
}
