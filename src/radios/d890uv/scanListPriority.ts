/**
 * Scan-list priority channels: the D890's single raw field ↔ the shared model's
 * (type, channel) pair.
 *
 * The shared `ScanList` was shaped around the DM-32, which splits a priority
 * into a *type* (None / Current / Specific) and a separate channel number. The
 * D890 packs all three states into one u16:
 *
 * | raw      | meaning                        |
 * |----------|--------------------------------|
 * | `0xffff` | Off                            |
 * | `0x0000` | Current channel                |
 * | `n >= 1` | channel index n-1, i.e. channel number n |
 *
 * Both directions live here because wiring only one is a data-loss bug: the
 * read used to leave `priority1Type` undefined, so the UI showed "None" for a
 * list whose radio record said channel 60 — and writing that back would have
 * cleared a real priority. Measured on a radio read 2026-09-10: slot 0 held
 * raw 0x0001/0x0080, slot 1 held 0x003c/0xffff.
 */

import type { ScanList } from '../../models/ScanList';
import type { ScanListDecoded } from './structures';

/** Shared-model priority type. 0=None, 1=Current, 2=Specific. */
export const SCAN_PRIORITY_NONE = 0;
export const SCAN_PRIORITY_CURRENT = 1;
export const SCAN_PRIORITY_SPECIFIC = 2;

const RAW_OFF = 0xffff;
const RAW_CURRENT = 0x0000;

export interface ScanPriorityUi {
  /** 0=None, 1=Current, 2=Specific. */
  type: number;
  /** 1-based channel number; undefined unless `type` is Specific. */
  channel?: number;
}

/** Raw wire value → the shared model's (type, channel) pair. */
export function decodeScanPriority(raw: number): ScanPriorityUi {
  if (raw === RAW_OFF) return { type: SCAN_PRIORITY_NONE };
  if (raw === RAW_CURRENT) return { type: SCAN_PRIORITY_CURRENT };
  return { type: SCAN_PRIORITY_SPECIFIC, channel: raw };
}

/**
 * The shared model's (type, channel) pair → raw wire value.
 *
 * Specific-with-no-channel encodes as Off rather than as `0x0000`: 0 means
 * "Current" on this radio, so falling back to it would silently turn an
 * unfinished Specific into live priority scanning on whatever the user has
 * tuned. Off is the honest reading of "Specific, but no channel chosen".
 */
export function encodeScanPriority(type: number | undefined, channel: number | undefined): number {
  if (type === SCAN_PRIORITY_CURRENT) return RAW_CURRENT;
  if (type !== SCAN_PRIORITY_SPECIFIC) return RAW_OFF;
  if (!Number.isFinite(channel) || (channel ?? 0) < 1) return RAW_OFF;
  // 0xffff is Off and 0 is Current, so a Specific channel can only be 1..0xfffe.
  return Math.min(Math.trunc(channel!), RAW_OFF - 1);
}

/**
 * The lossy narrowing from this radio's record to the shared `ScanList`.
 *
 * Extracted from `readScanLists` so it can be tested without a radio: this is
 * the step where fields go missing, and every scan-list bug so far has lived in
 * it. What the shared model cannot hold is NOT lost for the write — the write
 * path patches `ScanListDecoded` itself (see `d890ScanLists`) — but whatever the
 * UI is to edit has to survive the trip through here.
 */
export function narrowScanList(sl: ScanListDecoded): ScanList {
  const p1 = decodeScanPriority(sl.priorityChannel1Raw);
  const p2 = decodeScanPriority(sl.priorityChannel2Raw);
  return {
    name: sl.name,
    // The hardware slot. Without it the write has no way to put an edited list
    // back where the radio holds it.
    slot: sl.slot,
    channels: sl.channels,
    channelCount: sl.channels.length,
    // DM-32 wire concepts with no D890 equivalent; left at neutral defaults
    // rather than invented. `capabilities.scanListFields` keeps the UI from
    // offering an editor for them.
    ctcScanMode: 0,
    scanTxMode: 0,
    // Hang time IS dwell time on this radio.
    hangTime: sl.dwellTime,
    priority1Type: p1.type,
    priorityChannel1: p1.channel,
    priority2Type: p2.type,
    priorityChannel2: p2.channel,
  };
}
