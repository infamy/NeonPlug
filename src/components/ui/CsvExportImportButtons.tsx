import React, { useEffect, useRef, useState } from 'react';
import { BUTTON } from './controlStyles';

interface CsvExportImportButtonsProps {
  /** What the list holds, for the tooltip, e.g. "channels" */
  label: string;
  onExport: () => void;
  onImportFile: (file: File) => void;
  exportDisabled?: boolean;
}

/**
 * CSV export and import for one list, behind a single small "CSV" button so it
 * stays out of the way of the tab's own actions. Export downloads the list;
 * Import opens a file picker. Callers own the export and import logic, including
 * the confirmation before an import replaces anything.
 */
export const CsvExportImportButtons: React.FC<CsvExportImportButtonsProps> = ({
  label,
  onExport,
  onImportFile,
  exportDisabled,
}) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on a click anywhere else, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
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
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${BUTTON.subtle} px-2 py-1 text-xs border rounded`}
        title={`Export or import ${label} as CSV`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        CSV ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 min-w-[10rem] py-1 rounded border-panel-strong bg-dark-charcoal shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            disabled={exportDisabled}
            onClick={() => {
              setOpen(false);
              onExport();
            }}
            className={`${BUTTON.menuItem} block w-full px-3 py-1.5 text-left text-xs disabled:opacity-40 disabled:pointer-events-none`}
          >
            Export to CSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              fileInputRef.current?.click();
            }}
            className={`${BUTTON.menuItem} block w-full px-3 py-1.5 text-left text-xs`}
          >
            Import from CSV…
          </button>
        </div>
      )}
    </div>
  );
};
