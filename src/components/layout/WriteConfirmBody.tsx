/**
 * The write confirmation, laid out as what it is: consequences first, then what
 * the plan sends, then the checklist. See writeConfirmation.ts for why this is
 * no longer a string.
 */

import React from 'react';
import { formatPlural } from '../../utils/formatPlural';
import { Callout, DialogHeading } from '../ui/DialogParts';
import {
  buildWriteConfirmation,
  type Capped,
  type RegionRow,
  type WriteConfirmInput,
} from './writeConfirmation';

const n = (value: number) => value.toLocaleString();
const bytes = (value: number) => `${n(value)} ${formatPlural(value, 'byte')}`;

const More: React.FC<{ more: number; noun?: string }> = ({ more, noun = 'more' }) =>
  more > 0 ? <span className="text-muted"> …and {n(more)} {noun}</span> : null;

const Stat: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded bg-dark-charcoal px-3 py-2 min-w-0">
    <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
    <div className="text-white font-mono text-sm truncate">{value}</div>
    {sub && <div className="text-xs text-muted truncate">{sub}</div>}
  </div>
);

const Regions: React.FC<{ regions: Capped<RegionRow> }> = ({ regions }) => (
  <table className="w-full text-xs mt-1">
    <tbody>
      {regions.items.map((r) => (
        <tr key={r.what} className="border-t border-neon-cyan border-opacity-20 first:border-t-0">
          <td className="py-1 pr-3 text-cool-gray">{r.what}</td>
          <td className="py-1 pr-3 text-right font-mono text-white whitespace-nowrap">{bytes(r.bytes)}</td>
          <td className="py-1 text-right font-mono text-muted whitespace-nowrap">
            {n(r.frames)} {formatPlural(r.frames, 'frame')}
          </td>
        </tr>
      ))}
      {regions.more > 0 && (
        <tr className="border-t border-neon-cyan border-opacity-20">
          <td colSpan={3} className="py-1 text-muted">
            …and {n(regions.more)} more {formatPlural(regions.more, 'region')}
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

export const WriteConfirmBody: React.FC<WriteConfirmInput> = (input) => {
  const c = buildWriteConfirmation(input);
  const plan = c.plan;

  return (
    <div className="space-y-4 text-sm pb-1">
      {/* What cannot be undone leads — it used to sit mid-paragraph. */}
      {c.removals.map((r) => (
        <Callout
          key={r.unit}
          tone="danger"
          title={`Removes ${n(r.count)} ${formatPlural(r.count, r.unit)} from the radio`}
        >
          <span className="font-mono">
            {r.unit === 'zone' ? 'Slots ' : ''}
            {r.list.items.join(', ')}
          </span>
          <More more={r.list.more} />
        </Callout>
      ))}

      {c.checks.length > 0 && (
        <Callout tone="caution" title="Codeplug check">
          <div className="space-y-2">
            {c.checks.map((check, i) => (
              <div key={i}>
                <p>{check.message}</p>
                {check.list.items.length > 0 && (
                  <ul className="mt-1 ml-4 list-disc text-xs space-y-0.5">
                    {check.list.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    {check.list.more > 0 && <li className="text-muted list-none -ml-4">…and {n(check.list.more)} more</li>}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Callout>
      )}

      {c.readWarnings.length > 0 && (
        <Callout tone="caution" title="This read had warnings">
          <ul className="space-y-1.5">
            {c.readWarnings.map((w, i) => (
              <li key={i}>
                <span className="text-yellow-200">{w.blocker ? '⛔ ' : ''}{w.problem}</span>
                <span className="block text-xs text-muted">{w.consequence}</span>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {plan && (
        <section>
          <DialogHeading>What this write sends</DialogHeading>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="Scope"
              value={plan.wholeCodeplug ? 'Whole codeplug' : 'Channels only'}
            />
            <Stat
              label="Frames"
              value={n(plan.frames.total)}
              sub={`${n(plan.frames.channel)} channel · ${n(plan.frames.other)} other`}
            />
            <Stat
              label="On the wire"
              value={bytes(plan.wireBytes)}
              sub={plan.seconds < 1 ? 'under a second' : `about ${plan.seconds.toFixed(1)} s`}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {plan.wholeCodeplug
              ? 'Every region that was read goes back, not only what changed.'
              : 'No read log staged, so regions other than channels are left alone.'}
          </p>

          <div className="mt-3 space-y-3">
            {plan.writeBack && (
              <p className="rounded bg-dark-charcoal px-3 py-2 text-cool-gray">
                <span className="text-white font-medium">Nothing changes.</span> Every byte matches what
                was read, so a failure mid-write would put the radio&apos;s own bytes back over themselves.
              </p>
            )}

            {plan.changed && (
              <div>
                <p className="text-white">
                  Changes <span className="font-mono text-neon-cyan">{bytes(plan.changed.bytes)}</span>
                </p>
                <Regions regions={plan.changed.regions} />
              </div>
            )}

            {plan.added && (
              <div>
                <p className="text-white">
                  New <span className="font-mono text-neon-cyan">{bytes(plan.added.bytes)}</span>
                  <span className="text-muted text-xs"> — the radio has nothing here yet</span>
                </p>
                <Regions regions={plan.added.regions} />
              </div>
            )}

            {plan.channelsWritten && (
              <p className="text-cool-gray">
                Channels written: <span className="font-mono">{plan.channelsWritten.items.join(', ')}</span>
                <More more={plan.channelsWritten.more} />
              </p>
            )}

            {plan.skipped && (
              <div className="text-xs text-muted">
                <p>Not written ({n(plan.skipped.items.length + plan.skipped.more)}):</p>
                <ul className="ml-4 list-disc">
                  {plan.skipped.items.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <More more={plan.skipped.more} />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="border-t border-neon-cyan border-opacity-20 pt-4">
        <DialogHeading>Before you write</DialogHeading>
        <p className="text-cool-gray">
          Writing to the radio is <span className="text-yellow-300">experimental</span> and used at your own
          risk. Make sure:
        </p>
        {/* "Baofeng CPS" was named here on a dialog every radio shows, including
            the BTECH/Anytone DA-7X2, whose owners have no Baofeng software. */}
        <ul className="mt-2 ml-4 list-disc space-y-1 text-cool-gray">
          <li>You have read the radio with its own CPS and saved that as a backup</li>
          <li>You have a backup of your current codeplug</li>
          <li>Allow Reset is enabled, if your radio&apos;s own CPS offers that setting</li>
          <li>You understand this operation modifies your radio&apos;s memory</li>
        </ul>
      </section>
    </div>
  );
};
