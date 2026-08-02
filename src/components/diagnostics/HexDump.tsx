import React, { useMemo, useState } from 'react';
import { downloadHexDump, downloadBinary } from '../../utils/hexdump';
import { resolveFieldAt, describeField } from '../../utils/blockLayout';
import type { BlockLayoutSpec } from '../../types/radioCapabilities';

interface HexDumpProps {
  data: Uint8Array;
  /** Unique prefix for per-row element ids (used by the offset-jump scroll). */
  idPrefix: string;
  /** Render the "Inspect Offset (hex)" input + Go button. */
  withOffsetJump?: boolean;
  /** When set, render 📥 Hex / 📥 Bin download buttons using this filename base. */
  downloadName?: string;
  /** Constrain to max-h-96 with vertical scroll (for large blocks). */
  scrollable?: boolean;
  /** Per-radio block annotation (caps.diagnostics.blockLayouts): tints annotated
   *  byte ranges, shows field tooltips on hover, and renders a legend. */
  layout?: BlockLayoutSpec;
}

/**
 * Standard Diagnostics hex grid: offset | hex bytes | ASCII, 16 bytes per row.
 * Replaces the per-panel inline hex viewers that were copy-pasted across
 * DiagnosticsTab and MetadataBlockDisplay.
 */
export const HexDump: React.FC<HexDumpProps> = ({
  data,
  idPrefix,
  withOffsetJump,
  downloadName,
  scrollable,
  layout,
}) => {
  const [jumpOffset, setJumpOffset] = useState('');

  const rows = useMemo(() => {
    const bytesPerRow = 16;
    const out = [];
    for (let i = 0; i < data.length; i += bytesPerRow) {
      const rowBytes = data.slice(i, i + bytesPerRow);
      const offsetHex = i.toString(16).toUpperCase().padStart(4, '0');
      const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
      const ascii = Array.from(rowBytes)
        .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
        .join('');

      let hexCell: React.ReactNode;
      if (!layout) {
        const hexBytes = Array.from(rowBytes)
          .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
          .join(' ');
        hexCell = <>{hexBytes}{hexPadding}</>;
      } else {
        // Merge consecutive bytes that resolve to the same field occurrence
        // into one span so each annotated region gets a single tint + tooltip.
        const segments: { text: string; title?: string; ordinal?: number }[] = [];
        let key: string | null | undefined;
        for (let j = 0; j < rowBytes.length; j++) {
          const resolved = resolveFieldAt(layout, i + j);
          const ordinal = resolved ? layout.fields.indexOf(resolved.spec) : undefined;
          const nextKey = resolved ? `${ordinal}:${resolved.index}` : null;
          const byteHex = rowBytes[j].toString(16).toUpperCase().padStart(2, '0');
          if (segments.length > 0 && nextKey === key) {
            segments[segments.length - 1].text += ` ${byteHex}`;
          } else {
            segments.push({
              text: byteHex,
              title: resolved ? describeField(resolved, data) : undefined,
              ordinal,
            });
            key = nextKey;
          }
        }
        hexCell = (
          <>
            {segments.map((s, k) => (
              <React.Fragment key={k}>
                {k > 0 && ' '}
                <span
                  title={s.title}
                  className={
                    s.ordinal === undefined
                      ? undefined
                      : s.ordinal % 2 === 0
                        ? 'bg-yellow-900/40 rounded-sm'
                        : 'bg-cyan-900/40 rounded-sm'
                  }
                >
                  {s.text}
                </span>
              </React.Fragment>
            ))}
            {hexPadding}
          </>
        );
      }

      out.push(
        <div key={i} id={`${idPrefix}-${i}`} className="flex border-b border-yellow-600/10 hover:bg-yellow-900/10 py-1">
          <div className="w-20 text-yellow-400 px-2">{offsetHex}</div>
          <div className="w-[52ch] text-yellow-300 px-2">{hexCell}</div>
          <div className="min-w-[16ch] w-[16ch] text-green-400 px-2 ml-4 whitespace-nowrap">{ascii}</div>
        </div>
      );
    }
    return out;
  }, [data, idPrefix, layout]);

  const jumpToOffset = () => {
    const offset = parseInt(jumpOffset.replace(/^0x/i, ''), 16);
    if (!isNaN(offset) && offset >= 0 && offset < data.length) {
      // Snap to the containing row — rows only have ids at 16-byte boundaries.
      const rowId = `${idPrefix}-${offset - (offset % 16)}`;
      document.getElementById(rowId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
      {(withOffsetJump || downloadName) && (
        <div className="mb-4 flex items-end gap-4">
          {withOffsetJump && (
            <div className="flex-1">
              <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={jumpOffset}
                  onChange={(e) => setJumpOffset(e.target.value)}
                  placeholder="0x000"
                  className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
                />
                <button
                  type="button"
                  onClick={jumpToOffset}
                  className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
                >
                  Go
                </button>
              </div>
            </div>
          )}
          {downloadName && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadHexDump(data, `${downloadName}-hexdump.txt`)}
                className="px-3 py-2 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                title="Download hex dump"
              >
                📥 Hex
              </button>
              <button
                type="button"
                onClick={() => downloadBinary(data, `${downloadName}.bin`)}
                className="px-3 py-2 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                title="Download binary"
              >
                📥 Bin
              </button>
            </div>
          )}
        </div>
      )}
      <div className={`overflow-x-auto ${scrollable ? 'max-h-96 overflow-y-auto' : ''}`}>
        <div className="font-mono text-xs">{rows}</div>
      </div>
      {layout && (
        <details className="mt-3 text-xs text-cool-gray">
          <summary className="cursor-pointer text-yellow-400">
            Layout: {layout.label} ({layout.fields.length} field{layout.fields.length === 1 ? '' : 's'})
          </summary>
          <ul className="mt-2 space-y-1 font-mono">
            {layout.fields.map((f, k) => (
              <li key={k}>
                <span className="text-yellow-300">0x{f.at.toString(16).toUpperCase().padStart(2, '0')}</span>
                {' '}{f.name}
                {f.len && f.len > 1 ? ` (${f.len}B)` : ''}
                {f.repeat ? ` ×${f.repeat.count} @ stride ${f.repeat.stride}` : ''}
                {f.notes ? <span className="text-cool-gray"> — {f.notes}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
