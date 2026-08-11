import React, { useCallback, useState } from 'react';
import { useScanListsStore } from '../../store/scanListsStore';
import { formatPlural } from '../../utils/formatPlural';
import { ScanListsList } from './ScanListsList';
import { ConfirmModal } from '../ui/ConfirmModal';
import { CsvExportImportButtons } from '../ui/CsvExportImportButtons';
import { useAlert } from '../../hooks/useAlert';
import { exportScanListsToCSV, importScanListsFromCSV, downloadCSV } from '../../services/csv';
import type { ScanList } from '../../models/ScanList';

export const ScanListsTab: React.FC = () => {
  const { scanLists, setScanLists } = useScanListsStore();
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert('Full CSV Export/Import');
  const [pendingScanListsImport, setPendingScanListsImport] = useState<ScanList[] | null>(null);

  const handleExportScanListsCsv = useCallback(() => {
    downloadCSV(exportScanListsToCSV(scanLists), 'scanlists.csv');
  }, [scanLists]);

  const handleImportScanListsFile = useCallback((file: File) => {
    file.text().then(content => {
      const result = importScanListsFromCSV(content);
      if (!result.success || !result.scanLists) {
        showAlert(result.errors?.join('\n') || 'Failed to import scan lists CSV', 'Import failed');
        return;
      }
      setPendingScanListsImport(result.scanLists);
    }).catch(err => {
      showAlert(err instanceof Error ? err.message : 'Failed to read CSV file', 'Import failed');
    });
  }, [showAlert]);

  const handleImportScanListsConfirm = useCallback(() => {
    if (pendingScanListsImport) {
      setScanLists(pendingScanListsImport);
    }
    setPendingScanListsImport(null);
  }, [pendingScanListsImport, setScanLists]);

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">Scan Lists</h2>
        <div className="flex items-center gap-4">
          <div className="text-cool-gray">
            {scanLists.length} {formatPlural(scanLists.length, 'scan list')}
          </div>
          <CsvExportImportButtons
            label="scan lists"
            onExport={handleExportScanListsCsv}
            onImportFile={handleImportScanListsFile}
            exportDisabled={scanLists.length === 0}
          />
        </div>
      </div>
      <ScanListsList />
      <ConfirmModal
        isOpen={pendingScanListsImport !== null}
        onClose={() => setPendingScanListsImport(null)}
        onConfirm={handleImportScanListsConfirm}
        title="Import Scan Lists CSV"
        message={`Replace all ${scanLists.length} existing ${formatPlural(scanLists.length, 'scan list')} with ${pendingScanListsImport?.length ?? 0} imported from CSV? This cannot be undone.`}
        confirmLabel="Replace"
        variant="danger"
      />
      <ConfirmModal
        isOpen={alertOpen}
        onClose={closeAlert}
        title={alertTitle}
        message={alertMessage}
        confirmLabel="OK"
        variant="alert"
      />
    </div>
  );
};
