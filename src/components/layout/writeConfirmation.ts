/**
 * What the write confirmation says, as data.
 *
 * This used to be one string, pre-wrapped into a 448px dialog: destructive
 * removals, byte counts, read warnings and the pre-write checklist all in the
 * same grey text, a divider of 40 box-drawing characters wider than the dialog,
 * and hard line breaks landing mid-sentence. The most dangerous line it can
 * carry — "REMOVES N channels from the radio" — sat in the middle of it.
 *
 * Built as a model first so the ORDER and the limits are testable without
 * rendering anything: removals lead, checks follow, then what the plan sends.
 */

import type { D890WritePreview } from '../../hooks/useRadioConnection';
import type { D890IntegrityFinding } from '../../radios/d890uv/integrity';
import type { CodeplugWriteWarning } from '../../services/validation/codeplugValidator';

export interface WriteConfirmInput {
  /** Null for radios that do not plan their writes this way. */
  preview: D890WritePreview | null;
  /** Read-integrity findings that did not block the write. */
  integrity: readonly D890IntegrityFinding[];
  /** Codeplug checks from validateCodeplugForWrite. */
  warnings: readonly CodeplugWriteWarning[];
}

/** A list shown up to a limit, with a count of what did not fit. */
export interface Capped<T> {
  items: T[];
  more: number;
}

export const capList = <T>(items: readonly T[], limit: number): Capped<T> => ({
  items: items.slice(0, limit),
  more: Math.max(0, items.length - limit),
});

export interface RegionRow {
  what: string;
  bytes: number;
  frames: number;
}

export interface WriteConfirmation {
  /** Destructive consequences. Shown first, because they are what cannot be undone. */
  removals: { count: number; unit: 'channel' | 'zone'; list: Capped<number> }[];
  checks: { message: string; list: Capped<string> }[];
  readWarnings: { blocker: boolean; region: string; problem: string; consequence: string }[];
  plan: null | {
    wholeCodeplug: boolean;
    frames: { total: number; channel: number; other: number };
    wireBytes: number;
    seconds: number;
    /** Nothing changes AND nothing is new — the write only puts back what was read. */
    writeBack: boolean;
    changed: { bytes: number; regions: Capped<RegionRow> } | null;
    added: { bytes: number; regions: Capped<RegionRow> } | null;
    /** Channels-only writes, where there is no read log to diff against. */
    channelsWritten: Capped<number> | null;
    skipped: Capped<string> | null;
  };
}

/** Limits carried over from the string version, so no list got longer. */
export const WRITE_CONFIRM_LIMITS = {
  regions: 8,
  removals: 12,
  channelsWritten: 12,
  skipped: 5,
  checkItems: 10,
} as const;

function checkItems(w: CodeplugWriteWarning): string[] {
  if (w.id === 'channels_not_in_zones' && w.channels?.length) {
    return w.channels.map((c) => `Ch ${c.number} – ${c.name || '(no name)'}`);
  }
  if (w.id === 'zones_reference_nonexistent_channels' && w.zoneRefs?.length) {
    return w.zoneRefs.map(
      (z) => `Zone "${z.zoneName}": Ch ${z.invalidChannelNumbers.join(', ')} do not exist`
    );
  }
  if (w.id === 'channels_reference_deleted_dmr_radio_id' && w.channels?.length) {
    return w.channels.map(
      (c) => `Ch ${c.number} – ${c.name || '(no name)'} (Radio ID index ${c.dmrRadioIdIndex ?? '?'})`
    );
  }
  return [];
}

export function buildWriteConfirmation({ preview, integrity, warnings }: WriteConfirmInput): WriteConfirmation {
  const L = WRITE_CONFIRM_LIMITS;

  const removals: WriteConfirmation['removals'] = [];
  if (preview && preview.clearedChannels.length > 0) {
    removals.push({
      count: preview.clearedChannels.length,
      unit: 'channel',
      list: capList(preview.clearedChannels, L.removals),
    });
  }
  if (preview?.clearedZoneSlots && preview.clearedZoneSlots.length > 0) {
    removals.push({
      count: preview.clearedZoneSlots.length,
      unit: 'zone',
      list: capList(preview.clearedZoneSlots, L.removals),
    });
  }

  const checks = warnings.map((w) => ({ message: w.message, list: capList(checkItems(w), L.checkItems) }));

  const readWarnings = integrity.map((f) => ({
    blocker: f.level === 'blocker',
    region: f.region,
    problem: f.problem,
    consequence: f.consequence,
  }));

  if (!preview) return { removals, checks, readWarnings, plan: null };

  const bytesChanged = preview.bytesChanged;
  const bytesNew = preview.bytesNew ?? 0;

  return {
    removals,
    checks,
    readWarnings,
    plan: {
      wholeCodeplug: !!preview.wholeCodeplug,
      frames: { total: preview.totalFrames, channel: preview.recordFrames, other: preview.maskFrames },
      wireBytes: preview.bytesOnWire,
      seconds: preview.estimatedSeconds,
      // The string version said "Nothing changes" on bytesChanged === 0 alone,
      // which would have been false for a write that only ADDED records.
      writeBack: bytesChanged === 0 && bytesNew === 0,
      changed:
        bytesChanged !== undefined && bytesChanged > 0
          ? { bytes: bytesChanged, regions: capList(preview.changedRegions ?? [], L.regions) }
          : null,
      // An ADD cannot appear in `changed`: a diff needs an original, and a new
      // record has none. Its own entry, so the dialog never describes a smaller
      // write than it sends.
      added:
        bytesNew > 0
          ? { bytes: bytesNew, regions: capList(preview.newRegions ?? [], L.regions) }
          : null,
      channelsWritten:
        bytesChanged === undefined && preview.changedChannels.length > 0
          ? capList(preview.changedChannels, L.channelsWritten)
          : null,
      skipped: preview.skipped.length > 0 ? capList(preview.skipped, L.skipped) : null,
    },
  };
}
