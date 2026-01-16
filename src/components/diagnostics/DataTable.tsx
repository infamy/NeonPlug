import React, { ReactNode } from 'react';

interface Column {
  header: string;
  className?: string;
}

interface DataTableProps {
  columns: Column[];
  children: ReactNode;
  className?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  children,
  className = '',
}) => {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-yellow-600/30">
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={`text-left py-2 px-3 text-yellow-400 font-semibold ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
        </tbody>
      </table>
    </div>
  );
};
