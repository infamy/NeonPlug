import React from 'react';

interface FieldVerificationRow {
  name: string;
  offset: number;
  parsed: any;
  ui: any;
  rawHex?: number;
  isBit?: boolean;
  note?: string;
}

interface FieldVerificationTableProps {
  fields: FieldVerificationRow[];
  data?: Uint8Array;
}

export const FieldVerificationTable: React.FC<FieldVerificationTableProps> = ({
  fields,
  data,
}) => {
  return (
    <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-yellow-600/30">
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Field</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Offset</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Raw Hex</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Parsed Value</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">UI Value</th>
              <th className="text-left py-2 px-3 text-yellow-400 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const rawHex = field.rawHex ?? (data ? data[field.offset] : 0);
              const matches = field.isBit 
                ? String(field.parsed) === String(field.ui)
                : field.parsed === field.ui;
              
              return (
                <tr
                  key={field.name}
                  className={`border-b border-yellow-600/10 hover:bg-yellow-900/10 ${!matches ? 'bg-red-900/20' : ''}`}
                >
                  <td className="py-2 px-3 text-cool-gray">{field.name}{field.note ? ` (${field.note})` : ''}</td>
                  <td className="py-2 px-3 text-cool-gray font-mono">0x{field.offset.toString(16).toUpperCase().padStart(3, '0')}</td>
                  <td className="py-2 px-3 text-yellow-300 font-mono">0x{rawHex.toString(16).toUpperCase().padStart(2, '0')}</td>
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
