/**
 * Why a write stopped before it started: the read itself cannot be trusted.
 *
 * This was a string under the title "Notice": findings joined with emoji, and a
 * three-space indent that only held for the first wrapped line.
 */

import React from 'react';
import type { D890IntegrityFinding } from '../../radios/d890uv/integrity';
import { Callout, DialogHeading } from '../ui/DialogParts';

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const WriteBlockedBody: React.FC<{ findings: readonly D890IntegrityFinding[] }> = ({ findings }) => (
  <div className="space-y-4 text-sm pb-1">
    <Callout tone="danger" title="This codeplug did not read cleanly, so writing is blocked">
      Nothing was sent to the radio.
    </Callout>
    <section>
      <DialogHeading>What the read found</DialogHeading>
      <ul className="space-y-1.5">
        {findings.map((f, i) => (
          <li key={i}>
            <span className={f.level === 'blocker' ? 'text-red-300' : 'text-yellow-200'}>
              {f.level === 'blocker' ? '⛔ ' : ''}
              {sentence(f.problem)}
            </span>
            <span className="block text-xs text-muted">{f.consequence}</span>
          </li>
        ))}
      </ul>
    </section>
    <section className="border-t border-neon-cyan border-opacity-20 pt-4">
      <DialogHeading>What to do</DialogHeading>
      <p className="text-cool-gray">
        Read the radio again. If it reads the same way, the codeplug on the radio is damaged — restore it
        from a backup before writing.
      </p>
    </section>
  </div>
);
