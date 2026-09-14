/**
 * What structured dialog bodies are built from.
 *
 * The write confirmation introduced these when it stopped being a string. The
 * write-blocked, write-refused, import and convert dialogs use the same pieces,
 * so the dialogs read as one family rather than five.
 */

import React from 'react';

/** A small uppercase heading inside a dialog — not a page or card title. */
export const DialogHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-xs font-semibold uppercase tracking-wider text-neon-cyan mb-2">{children}</h3>
);

/** A boxed statement that leads a dialog: red for what is refused or lost, yellow for what to check. */
export const Callout: React.FC<{ tone: 'danger' | 'caution'; title: string; children?: React.ReactNode }> = ({
  tone,
  title,
  children,
}) => (
  <div
    className={`rounded border px-3 py-2.5 ${
      tone === 'danger'
        ? 'border-red-500 border-opacity-50 bg-red-900 bg-opacity-20'
        : 'border-yellow-600 border-opacity-50 bg-yellow-900 bg-opacity-20'
    }`}
  >
    <p className={`font-semibold ${tone === 'danger' ? 'text-red-300' : 'text-yellow-300'}`}>{title}</p>
    {children && <div className="mt-1 text-cool-gray">{children}</div>}
  </div>
);
