import React, { useState } from 'react';

interface OffsetInspectorProps {
  data: Uint8Array;
  knownOffsets: Array<{
    offset: number;
    field: string;
    getUIValue?: (hexValue: number, data: Uint8Array, offset: number) => string;
  }>;
  idPrefix?: string;
  placeholder?: string;
}

export const OffsetInspector: React.FC<OffsetInspectorProps> = ({
  data,
  knownOffsets,
  idPrefix = 'offset',
  placeholder = '0x000',
}) => {
  const [inspectOffset, setInspectOffset] = useState<string>('');

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
              const offset = parseInt(inspectOffset.replace(/^0x/i, ''), 16);
              if (!isNaN(offset) && offset >= 0 && offset < data.length) {
                const element = document.getElementById(`${idPrefix}-${offset}`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
          >
            Go
          </button>
        </div>
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
            {knownOffsets.map(({ offset, field, getUIValue }) => {
              if (offset >= data.length) return null;
              const hexValue = data[offset];
              const decimalValue = hexValue;
              const uiValue = getUIValue ? getUIValue(hexValue, data, offset) : `${decimalValue}`;
              
              return (
                <tr
                  key={offset}
                  id={`${idPrefix}-${offset}`}
                  className="border-b border-yellow-600/10 hover:bg-yellow-900/10"
                >
                  <td className="py-2 px-3 text-cool-gray font-mono">0x{offset.toString(16).toUpperCase().padStart(3, '0')}</td>
                  <td className="py-2 px-3 text-yellow-300 font-mono">0x{hexValue.toString(16).toUpperCase().padStart(2, '0')}</td>
                  <td className="py-2 px-3 text-white">{decimalValue}</td>
                  <td className="py-2 px-3 text-cool-gray">{field}</td>
                  <td className="py-2 px-3 text-white">{uiValue}</td>
                </tr>
              );
            }).filter(Boolean)}
          </tbody>
        </table>
      </div>
    </div>
  );
};
