import React, { useMemo, useState } from 'react';
import type { BlockLayoutSpec } from '../../types/radioCapabilities';
import { resolveFieldAt, describeField } from '../../utils/blockLayout';

interface KnownOffset {
  offset: number;
  field: string;
  getUIValue?: (hexValue: number, data: Uint8Array, offset: number) => string;
}

interface OffsetInspectorProps {
  data: Uint8Array;
  /** Per-radio block layout (caps.diagnostics.blockLayouts) — preferred source. */
  layout?: BlockLayoutSpec;
  /** Legacy hand-written offset list (e.g. boot image regions). Ignored when `layout` is set. */
  knownOffsets?: KnownOffset[];
  idPrefix?: string;
  placeholder?: string;
}

interface Row {
  start: number;
  field: string;
  value: string;
}

/** Cap expanded occurrences of repeated fields so huge record arrays stay readable. */
const MAX_REPEAT_ROWS = 8;

export const OffsetInspector: React.FC<OffsetInspectorProps> = ({
  data,
  layout,
  knownOffsets,
  idPrefix = 'offset',
  placeholder = '0x000',
}) => {
  const [inspectOffset, setInspectOffset] = useState<string>('');

  const rows = useMemo<Row[]>(() => {
    if (layout) {
      const out: Row[] = [];
      for (const spec of layout.fields) {
        const len = spec.len ?? 1;
        const count = spec.repeat?.count ?? 1;
        const stride = spec.repeat?.stride ?? len;
        const shown = Math.min(count, MAX_REPEAT_ROWS);
        for (let i = 0; i < shown; i++) {
          const start = spec.at + i * stride;
          if (start >= data.length) break;
          let value = `${data[start]}`;
          if (spec.decode) {
            try {
              value = spec.decode(data.subarray(start, start + len), i);
            } catch {
              value = '<decode error>';
            }
          }
          out.push({ start, field: count > 1 ? `${spec.name} #${i + 1}` : spec.name, value });
        }
        if (count > shown) {
          out.push({ start: -1, field: `${spec.name} — ${count - shown} more occurrences`, value: '…' });
        }
      }
      return out;
    }
    return (knownOffsets ?? [])
      .filter((k) => k.offset < data.length)
      .map((k) => ({
        start: k.offset,
        field: k.field,
        value: k.getUIValue ? k.getUIValue(data[k.offset], data, k.offset) : `${data[k.offset]}`,
      }));
  }, [layout, knownOffsets, data]);

  const parsedOffset = parseInt(inspectOffset.replace(/^0x/i, ''), 16);
  const offsetValid = !isNaN(parsedOffset) && parsedOffset >= 0 && parsedOffset < data.length;
  const resolved = layout && offsetValid ? resolveFieldAt(layout, parsedOffset) : null;

  return (
    <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
      <div className="mb-4">
        <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={inspectOffset}
            onChange={(e) => setInspectOffset(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
          />
          <button
            type="button"
            onClick={() => {
              if (!offsetValid) return;
              // With a layout, jump to the row of the field containing the offset.
              const target = resolved ? resolved.start : parsedOffset;
              document.getElementById(`${idPrefix}-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
          >
            Go
          </button>
        </div>
        {layout && offsetValid && (
          <p className="mt-2 text-xs font-mono text-cool-gray">
            0x{parsedOffset.toString(16).toUpperCase()}: byte 0x{data[parsedOffset].toString(16).toUpperCase().padStart(2, '0')} —{' '}
            {resolved ? describeField(resolved, data) : 'no annotated field at this offset'}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-yellow-600/30">
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Offset</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Hex</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Decimal</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Field</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">UI Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.start}-${i}`}
                id={row.start >= 0 ? `${idPrefix}-${row.start}` : undefined}
                className="border-b border-yellow-600/10 hover:bg-yellow-900/10"
              >
                <td className="py-2 px-3 text-cool-gray font-mono">
                  {row.start >= 0 ? `0x${row.start.toString(16).toUpperCase().padStart(3, '0')}` : '…'}
                </td>
                <td className="py-2 px-3 text-yellow-300 font-mono">
                  {row.start >= 0 ? `0x${data[row.start].toString(16).toUpperCase().padStart(2, '0')}` : '…'}
                </td>
                <td className="py-2 px-3 text-white">{row.start >= 0 ? data[row.start] : '…'}</td>
                <td className="py-2 px-3 text-cool-gray">{row.field}</td>
                <td className="py-2 px-3 text-white">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
