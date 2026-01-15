import React, { useState, useMemo } from 'react';
import { DataTable } from './DataTable';

interface OffsetField {
  offset: number;
  field: string;
  getValue?: (data: Uint8Array, offset: number) => string;
}

interface OffsetInspectorProps {
  data: Uint8Array;
  fields: OffsetField[];
  blockId: string;
}

export const OffsetInspector: React.FC<OffsetInspectorProps> = ({
  data,
  fields,
  blockId,
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
            placeholder="0x000"
            className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
          />
          <button
            type="button"
            onClick={() => {
              const offset = parseInt(inspectOffset.replace(/^0x/i, ''), 16);
              if (!isNaN(offset) && offset >= 0 && offset < data.length) {
                const element = document.getElementById(`${blockId}-${offset}`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
          >
            Go
          </button>
        </div>
      </div>
      <DataTable
        columns={[
          { header: 'Offset' },
          { header: 'Hex' },
          { header: 'Decimal' },
          { header: 'Field' },
          { header: 'UI Value' },
        ]}
      >
        {useMemo(() => {
          return fields.map(({ offset, field, getValue }) => {
            if (offset >= data.length) return null;
            const hexValue = data[offset];
            const decimalValue = hexValue;
            const uiValue = getValue ? getValue(data, offset) : `${decimalValue}`;
            
            return (
              <tr
                key={offset}
                id={`${blockId}-${offset}`}
                className="border-b border-yellow-600/10 hover:bg-yellow-900/10"
              >
                <td className="py-2 px-3 text-cool-gray font-mono">
                  0x{offset.toString(16).toUpperCase().padStart(3, '0')}
                </td>
                <td className="py-2 px-3 text-yellow-300 font-mono">
                  0x{hexValue.toString(16).toUpperCase().padStart(2, '0')}
                </td>
                <td className="py-2 px-3 text-white">{decimalValue}</td>
                <td className="py-2 px-3 text-cool-gray">{field}</td>
                <td className="py-2 px-3 text-white">{uiValue}</td>
              </tr>
            );
          }).filter(Boolean);
        }, [data, fields, blockId])}
      </DataTable>
    </div>
  );
};
