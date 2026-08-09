import React, { useRef } from 'react';

interface CsvExportImportButtonsProps {
  /** Human label used in button tooltips, e.g. "channels" */
  label: string;
  onExport: () => void;
  onImportFile: (file: File) => void;
  exportDisabled?: boolean;
}

/**
 * A small "Export CSV" / "Import CSV" button pair, matching the Channels tab's "+ Add"
 * button styling. Callers own the actual export/import logic (including any
 * confirmation before a destructive replace) — this just wires up the file picker.
 */
export const CsvExportImportButtons: React.FC<CsvExportImportButtonsProps> = ({
  label,
  onExport,
  onImportFile,
  exportDisabled,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
      <button
        onClick={onExport}
        disabled={exportDisabled}
        className="px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
        title={`Export ${label} to CSV`}
      >
        Export CSV
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="px-2 py-1 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-20 hover:border-opacity-50 rounded transition-colors focus:outline-none"
        title={`Import ${label} from CSV`}
      >
        Import CSV
      </button>
    </>
  );
};
