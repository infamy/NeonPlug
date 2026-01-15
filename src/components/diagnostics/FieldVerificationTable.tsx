import React, { useMemo } from 'react';
import { DataTable } from './DataTable';

export interface FieldVerification {
  name: string;
  offset: number;
  parsed: string | number;
  ui: string | number;
  getRawHex?: (data: Uint8Array, offset: number) => string;
}

interface FieldVerificationTableProps {
  data: Uint8Array;
  fields: FieldVerification[];
}

export const FieldVerificationTable: React.FC<FieldVerificationTableProps> = ({
  data,
  fields,
}) => {
  return (
    <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
      <DataTable
        columns={[
          { header: 'Field' },
          { header: 'Offset' },
          { header: 'Raw Hex' },
          { header: 'Parsed Value' },
          { header: 'UI Value' },
          { header: 'Status' },
        ]}
      >
        {useMemo(() => {
          return fields.map((field) => {
            const rawHex = field.getRawHex 
              ? field.getRawHex(data, field.offset)
              : `0x${(data[field.offset] || 0).toString(16).toUpperCase().padStart(2, '0')}`;
            const matches = String(field.parsed) === String(field.ui);
            
            return (
              <tr
                key={field.name}
                className={`border-b border-yellow-600/10 hover:bg-yellow-900/10 ${!matches ? 'bg-red-900/20' : ''}`}
              >
                <td className="py-2 px-3 text-cool-gray">{field.name}</td>
                <td className="py-2 px-3 text-cool-gray font-mono">
                  0x{field.offset.toString(16).toUpperCase().padStart(3, '0')}
                </td>
                <td className="py-2 px-3 text-yellow-300 font-mono">{rawHex}</td>
                <td className="py-2 px-3 text-white">{String(field.parsed)}</td>
                <td className="py-2 px-3 text-white">{String(field.ui ?? 'N/A')}</td>
                <td className="py-2 px-3">
                  {matches ? (
                    <span className="text-green-400">✓</span>
                  ) : (
                    <span className="text-red-400">✗</span>
                  )}
                </td>
              </tr>
            );
          });
        }, [data, fields])}
      </DataTable>
    </div>
  );
};
