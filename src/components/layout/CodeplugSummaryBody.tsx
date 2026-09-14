/**
 * What an imported or restored codeplug holds. The counting is codeplugSummary.ts.
 */

import React from 'react';
import type { CodeplugData } from '../../services/codeplugExport';
import { summarizeCodeplug } from './codeplugSummary';

const ROW = 'border-t border-neon-cyan border-opacity-20 first:border-t-0';

export const CodeplugSummaryBody: React.FC<{ data: CodeplugData; lead: string; fileName?: string }> = ({
  data,
  lead,
  fileName,
}) => {
  const { rows, radioSettings } = summarizeCodeplug(data);
  return (
    <div className="space-y-3 text-sm pb-1">
      <div>
        <p className="text-white">{lead}</p>
        {fileName && <p className="text-xs text-muted font-mono truncate">{fileName}</p>}
      </div>
      {rows.length === 0 && !radioSettings ? (
        <p className="text-cool-gray">The codeplug is empty.</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={ROW}>
                <td className="py-1 pr-3 text-cool-gray">{row.label}</td>
                <td className="py-1 text-right font-mono text-white">{row.count.toLocaleString()}</td>
              </tr>
            ))}
            {radioSettings && (
              <tr className={ROW}>
                <td className="py-1 pr-3 text-cool-gray">Radio settings</td>
                <td className="py-1 text-right text-white">Included</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};
