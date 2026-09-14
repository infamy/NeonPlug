import React, { useCallback, useEffect } from 'react';
import { useZonesStore } from '../../store/zonesStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useLogStore } from '../../store/logStore';
import { ZonesList } from './ZonesList';
import { formatPlural } from '../../utils/formatPlural';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmModal } from '../ui/ConfirmModal';
import { CsvExportImportButtons } from '../ui/CsvExportImportButtons';
import { useAlert } from '../../hooks/useAlert';
import { useCsvImport } from '../../hooks/useCsvImport';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { exportZonesToCSV, importZonesFromCSV, downloadCSV } from '../../services/csv';
import { addZones } from '../../services/csv/importModes';
import { checkZoneLimits } from '../../services/csv/importLimits';

export const ZonesTab: React.FC = () => {
  const { zones, updateZone, setZones } = useZonesStore();
  const { channels } = useChannelsStore();
  const { caps } = useRadioCapabilities();
  const addLog = useLogStore((s) => s.addLog);
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert('Full CSV Export/Import');
  const { startImport, csvImportDialog } = useCsvImport();

  const handleExportZonesCsv = useCallback(() => {
    downloadCSV(exportZonesToCSV(zones), 'zones.csv');
  }, [zones]);

  const handleImportZonesFile = useCallback((file: File) => {
    file.text().then(content => {
      const result = importZonesFromCSV(content);
      if (!result.success || !result.zones) {
        showAlert(result.errors?.join('\n') || 'Failed to import zones CSV', 'Import failed');
        return;
      }
      const imported = result.zones;
      startImport({
        noun: 'zone',
        existing: zones,
        imported,
        add: () => addZones(zones, imported),
        check: (list) => checkZoneLimits(list, caps),
        apply: (list) => setZones(list),
      });
    }).catch(err => {
      showAlert(err instanceof Error ? err.message : 'Failed to read CSV file', 'Import failed');
    });
  }, [showAlert, startImport, zones, caps, setZones]);

  // On zone page: remove any zone channel refs that point to non-existent channels, and log to debug
  useEffect(() => {
    if (channels.length === 0) return;
    const existingNumbers = new Set(channels.map((ch) => ch.number));
    for (const zone of zones) {
      const validChannels = zone.channels.filter((chNum) => existingNumbers.has(chNum));
      if (validChannels.length !== zone.channels.length) {
        const removed = zone.channels.filter((chNum) => !existingNumbers.has(chNum));
        updateZone(zone.id, { channels: validChannels });
        addLog({
          level: 'DEBUG',
          message: `Zone "${zone.name}": removed non-existent channel(s) ${removed.join(', ')}`,
          context: 'Zones',
        });
      }
    }
  }, [zones, channels, updateZone, addLog]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Zones"
        actions={<>
          <span>{zones.length} {formatPlural(zones.length, 'zone')}</span>
          <CsvExportImportButtons
            label="zones"
            onExport={handleExportZonesCsv}
            onImportFile={handleImportZonesFile}
            exportDisabled={zones.length === 0}
          />
        </>}
      />
      <div className="flex-1 min-h-0">
        <ZonesList />
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

