import React, { useCallback } from 'react';
import { useScanListsStore } from '../../store/scanListsStore';
import { formatPlural } from '../../utils/formatPlural';
import { ScanListsList } from './ScanListsList';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmModal } from '../ui/ConfirmModal';
import { CsvExportImportButtons } from '../ui/CsvExportImportButtons';
import { useAlert } from '../../hooks/useAlert';
import { useCsvImport } from '../../hooks/useCsvImport';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { exportScanListsToCSV, importScanListsFromCSV, downloadCSV } from '../../services/csv';
import { addScanLists } from '../../services/csv/importModes';
import { checkScanListLimits } from '../../services/csv/importLimits';
import { nothingImportedMessage } from '../../services/csv/importProblems';

export const ScanListsTab: React.FC = () => {
  const { scanLists, setScanLists } = useScanListsStore();
  const { caps } = useRadioCapabilities();
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert('Full CSV Export/Import');
  const { startImport, csvImportDialog } = useCsvImport();

  const handleExportScanListsCsv = useCallback(() => {
    downloadCSV(exportScanListsToCSV(scanLists), 'scanlists.csv');
  }, [scanLists]);

  const handleImportScanListsFile = useCallback((file: File) => {
    file.text().then(content => {
      const result = importScanListsFromCSV(content);
      // Rows that can't be read are left out and named; only a file with
      // nothing readable stops here.
      if (!result.scanLists || result.scanLists.length === 0) {
        showAlert(nothingImportedMessage(result.errors), 'Import failed');
        return;
      }
      const imported = result.scanLists;
      startImport({
        noun: 'scan list',
        existing: scanLists,
        imported,
        problems: result.errors,
        add: () => addScanLists(scanLists, imported, caps),
        check: (list) => checkScanListLimits(list, caps),
        apply: (list) => setScanLists(list),
      });
    }).catch(err => {
      showAlert(err instanceof Error ? err.message : 'Failed to read CSV file', 'Import failed');
    });
  }, [showAlert, startImport, scanLists, caps, setScanLists]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Scan Lists"
        actions={<>
          <span>{scanLists.length} {formatPlural(scanLists.length, 'scan list')}</span>
          <CsvExportImportButtons
            label="scan lists"
            onExport={handleExportScanListsCsv}
            onImportFile={handleImportScanListsFile}
            exportDisabled={scanLists.length === 0}
          />
        </>}
      />
      {/* Fills the tab like Zones: the list and the editor each scroll inside a
          pane sized to the window. Both were capped at a guessed 100vh-250px,
          which let the page scroll as well. */}
      <div className="flex-1 min-h-0">
        <ScanListsList />
      </div>
      {csvImportDialog}
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
