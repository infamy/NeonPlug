import { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useChannelsStore } from '../../store/channelsStore';
import { D890UVProtocol } from '../../radios/d890uv/protocol';
import { VENDOR_WRITE_RUNS } from '../../radios/d890uv/codeplugWrite';
import { diffPlanAgainstRead, renderWriteDiff } from '../../radios/d890uv/writeDiff';
import { dryRunWrite } from '../../radios/d890uv/writeDryRun';
import type { D890WriteDiff } from '../../radios/d890uv/writeDiff';
import {
  buildD890CodeplugTables,
  d890ZoneSlots,
  d890Zones,
  buildD890WriteOriginals,
} from '../../services/d890WriteInput';
import { downloadFile } from '../../utils/download';
import { formatPlural } from '../../utils/formatPlural';
import { CollapsibleSection } from './CollapsibleSection';

/**
 * Plan a write and diff it against the read it came from — without a radio.
 *
 * The point is a claim that can be checked: "we write what we read" means an
 * UNMODIFIED codeplug plans frames identical to the bytes the radio just sent.
 * Every difference is a bug, a lossy decode, or a normalisation worth naming —
 * and all three are much cheaper to find here than on hardware that reboots
 * when a write goes wrong.
 *
 * This builds its input through the same `buildD890CodeplugTables` the Write
 * button uses, so it cannot drift into testing a different write.
 */
export function WriteDryRunPanel() {
  const staged = useRadioStore((s) => s.tables.writeOriginals);
  const [diff, setDiff] = useState<D890WriteDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string>('');

  const readLog = staged?.readLog;
  const ready = !!staged && !!readLog && readLog.size > 0;

  const run = () => {
    setError(null);
    setDiff(null);
    try {
      const zones = d890Zones();
      const zoneSlots = d890ZoneSlots(zones);
      // Planning touches no port; a bare instance with the staged originals is
      // all the planner needs.
      const proto = new D890UVProtocol();
      const originals = buildD890WriteOriginals(staged!.model);
      if (!originals) throw new Error('The staged read does not match the selected radio.');
      proto.setWriteOriginals(originals);
      const plan = proto.planCodeplug(
        useChannelsStore.getState().channels,
        zones,
        zoneSlots,
        buildD890CodeplugTables(zones, zoneSlots)
      );
      // Validate every frame through the REAL frame builder before diffing.
      //
      // The diff answers "are these the right bytes?"; this answers "would the
      // radio be sent them at all?" — buildWriteCommand runs the checksum and
      // the address guards, so a frame landing on a forbidden flash-management
      // offset throws HERE rather than mid-write. Worth doing precisely because
      // this plan covers slightly MORE than the vendor's own write does, so it
      // reaches addresses no capture has ever proven safe.
      const validated = dryRunWrite(plan.frames);
      const d = diffPlanAgainstRead(plan.frames, readLog!);
      setDiff(d);
      // Name the skipped regions rather than counting them. A bare count hid a
      // real bug on 2026-09-02: the read log was staged before most of the read
      // ran, so a "whole-codeplug" write planned only channels and reported
      // "skipped regions 11" without saying that zones and settings were among
      // them. The vendor total is here for the same reason — a plan an order of
      // magnitude short of it is not a codeplug write, whatever it is called.
      const vendorBytes = VENDOR_WRITE_RUNS.reduce((n, r) => n + r.bytes, 0);
      setReport(
        renderWriteDiff(
          d,
          `NeonPlug DA-7X2 write dry run\n` +
            `model ${staged!.model}\n` +
            `read spans ${readLog!.size}\n` +
            `payload ${plan.payloadBytes} bytes in ${plan.frames.length} frames\n` +
            `vendor write covers ${vendorBytes} bytes ` +
            `(${Math.round((plan.payloadBytes / vendorBytes) * 100)}% of it planned here)\n` +
            `wire ${validated.wireBytes} bytes, ~${validated.estimatedSeconds.toFixed(1)}s\n` +
            `all ${validated.frames} frames passed the checksum and address guards\n` +
            `skipped regions ${plan.skipped.length}` +
            (plan.skipped.length > 0
              ? `\n` + plan.skipped
                  .map((r) => `  - ${r.region} @ 0x${r.address.toString(16)}: ${r.reason}`)
                  .join('\n')
              : '') +
            (plan.clearedChannelNumbers.length > 0
              ? `\n⚠️ would CLEAR channels: ${plan.clearedChannelNumbers.join(', ')}`
              : '') +
            (plan.clearedZoneSlots.length > 0
              ? `\n⚠️ would CLEAR zone slots: ${plan.clearedZoneSlots.join(', ')}`
              : '')
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <CollapsibleSection title="Write dry run — plan vs read">
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Builds the write the Write button would send and compares every frame with
          the bytes read from the radio. Nothing is sent. On an unmodified codeplug
          every frame should match; anything that does not is a bug or a lossy decode.
        </p>

        {!ready && (
          <p className="text-yellow-400">
            Read the radio first — the dry run diffs against the read log, and there
            is none staged.
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={!ready}
            className="px-3 py-1.5 rounded border border-neon-cyan text-neon-cyan
                       hover:bg-neon-cyan/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Run dry run
          </button>
          {report && (
            <button
              onClick={() =>
                downloadFile(report, `neonplug-write-dryrun-${Date.now()}.txt`, 'text/plain')
              }
              className="px-3 py-1.5 rounded border-panel text-muted hover:bg-panel"
            >
              Download report
            </button>
          )}
        </div>

        {error && <pre className="text-red-400 whitespace-pre-wrap text-xs">{error}</pre>}

        {diff && (
          <div className="space-y-2">
            <div className="font-mono text-xs">
              <div>frames planned: {diff.totalFrames}</div>
              <div className="text-green-400">identical: {diff.identicalFrames}</div>
              <div className={diff.differingFrames > 0 ? 'text-yellow-400' : ''}>
                differing: {diff.differingFrames} ({formatPlural(diff.bytesChanged, 'byte')})
              </div>
              <div className={diff.unreadFrames > 0 ? 'text-yellow-400' : ''}>
                never read: {diff.unreadFrames}
              </div>
            </div>

            {diff.regions.some((r) => r.differing > 0 || r.unread > 0) && (
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-muted text-left">
                    <th>region</th><th>frames</th><th>same</th><th>diff</th><th>unread</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.regions
                    .filter((r) => r.differing > 0 || r.unread > 0)
                    .map((r) => (
                      <tr key={r.what}>
                        <td>{r.what}</td>
                        <td>{r.frames}</td>
                        <td>{r.identical}</td>
                        <td className={r.differing > 0 ? 'text-yellow-400' : ''}>{r.differing}</td>
                        <td className={r.unread > 0 ? 'text-yellow-400' : ''}>{r.unread}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            <pre className="max-h-96 overflow-auto text-[11px] leading-tight bg-panel p-2 rounded">
              {report}
            </pre>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
