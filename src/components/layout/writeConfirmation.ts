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
import { formatPlural } from '../../utils/formatPlural';

export interface WriteConfirmInput {
  /** Null for radios that do not plan their writes this way. */
  preview: D890WritePreview | null;
  /** Read-integrity findings that did not block the write. */
  integrity: readonly D890IntegrityFinding[];
  /** Codeplug checks from validateCodeplugForWrite. */
  warnings: readonly CodeplugWriteWarning[];
  /** Which radio the write runs as, and what it sends and leaves out. */
  summary?: WriteSummaryInput;
}

export interface WriteSummaryInput {
  model: string | null;
  channels: number;
  zones: number;
  scanLists: number;
  /** Left out because the radio cannot hold them (services/validation/writeFilter.ts). */
  droppedChannels: readonly { number: number; name: string }[];
  droppedZones: readonly string[];
  droppedScanLists: readonly string[];
  /** The settings the write sends (settings/settingsFields.ts); `all` for an imported codeplug. */
  settings?: { labels: readonly string[]; all: boolean };
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
  /** One line: what the write sends, and to which radio. */
  headline: string | null;
  /** The settings the write changes, or that it writes all of them. */
  settingsLine: string | null;
  /** Destructive consequences. Shown first, because they are what cannot be undone. */
  removals: { count: number; unit: 'channel' | 'zone'; list: Capped<number> }[];
  /** What the write leaves out because the radio cannot hold it. */
  leftOut: null | {
    channels: { count: number; list: Capped<string> };
    zones: { count: number; list: Capped<string> };
    scanLists: { count: number; list: Capped<string> };
  };
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
  leftOut: 10,
  settings: 8,
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

/** "3 channels, 2 zones and 1 scan list", leaving out what there is none of. */
function listCounts(summary: WriteSummaryInput): string {
  const parts = [
    [summary.channels, 'channel'],
    [summary.zones, 'zone'],
    [summary.scanLists, 'scan list'],
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, noun]) => `${(count as number).toLocaleString()} ${formatPlural(count as number, noun as string)}`);
  if (parts.length <= 1) return parts[0] ?? 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function buildHeadline(summary: WriteSummaryInput | undefined): string | null {
  if (!summary) return null;
  return `Writes ${listCounts(summary)} to ${summary.model ? `the ${summary.model}` : 'the radio'}.`;
}

function buildSettingsLine(summary: WriteSummaryInput | undefined): string | null {
  const settings = summary?.settings;
  if (!settings) return null;
  if (settings.all) return 'Writes every setting in the imported codeplug.';
  const n = settings.labels.length;
  if (n === 0) return null;
  const limit = WRITE_CONFIRM_LIMITS.settings;
  const shown = settings.labels.slice(0, limit).join(', ');
  const more = n > limit ? `, and ${n - limit} more` : '';
  return `Changes ${n} ${formatPlural(n, 'setting')}: ${shown}${more}.`;
}

function buildLeftOut(summary: WriteSummaryInput | undefined): WriteConfirmation['leftOut'] {
  if (!summary) return null;
  const { droppedChannels, droppedZones, droppedScanLists } = summary;
  if (droppedChannels.length + droppedZones.length + droppedScanLists.length === 0) return null;
  const L = WRITE_CONFIRM_LIMITS.leftOut;
  return {
    channels: {
      count: droppedChannels.length,
      list: capList(droppedChannels.map((c) => `${c.number} ${c.name || '(no name)'}`), L),
    },
    zones: { count: droppedZones.length, list: capList(droppedZones, L) },
    scanLists: { count: droppedScanLists.length, list: capList(droppedScanLists, L) },
  };
}

export function buildWriteConfirmation({ preview, integrity, warnings, summary }: WriteConfirmInput): WriteConfirmation {
  const L = WRITE_CONFIRM_LIMITS;

  const headline = buildHeadline(summary);
  const leftOut = buildLeftOut(summary);
  const settingsLine = buildSettingsLine(summary);

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

  if (!preview) return { headline, settingsLine, removals, leftOut, checks, readWarnings, plan: null };

  const bytesChanged = preview.bytesChanged;
  const bytesNew = preview.bytesNew ?? 0;

  return {
    headline,
    settingsLine,
    removals,
    leftOut,
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
