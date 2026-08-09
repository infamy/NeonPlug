import React, { useCallback, useEffect, useState } from 'react';
import { useZonesStore } from '../../store/zonesStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useLogStore } from '../../store/logStore';
import { ZonesList } from './ZonesList';
import { formatPlural } from '../../utils/formatPlural';
import { ConfirmModal } from '../ui/ConfirmModal';
import { CsvExportImportButtons } from '../ui/CsvExportImportButtons';
import { useAlert } from '../../hooks/useAlert';
import { exportZonesToCSV, importZonesFromCSV, downloadCSV } from '../../services/csv';
import type { Zone } from '../../models/Zone';

export const ZonesTab: React.FC = () => {
  const { zones, updateZone, setZones } = useZonesStore();
  const { channels } = useChannelsStore();
  const addLog = useLogStore((s) => s.addLog);
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert('Full CSV Export/Import');
  const [pendingZonesImport, setPendingZonesImport] = useState<Zone[] | null>(null);

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
      setPendingZonesImport(result.zones);
    }).catch(err => {
      showAlert(err instanceof Error ? err.message : 'Failed to read CSV file', 'Import failed');
    });
  }, [showAlert]);

  const handleImportZonesConfirm = useCallback(() => {
    if (pendingZonesImport) {
      setZones(pendingZonesImport);
    }
    setPendingZonesImport(null);
  }, [pendingZonesImport, setZones]);

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
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <h2 className="text-2xl font-bold text-neon-cyan">Zones</h2>
        <div className="flex items-center gap-4">
          <div className="text-cool-gray">
            {zones.length} {formatPlural(zones.length, 'zone')}
          </div>
          <CsvExportImportButtons
            label="zones"
            onExport={handleExportZonesCsv}
            onImportFile={handleImportZonesFile}
            exportDisabled={zones.length === 0}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ZonesList />
      </div>
      <ConfirmModal
        isOpen={pendingZonesImport !== null}
        onClose={() => setPendingZonesImport(null)}
        onConfirm={handleImportZonesConfirm}
        title="Import Zones CSV"
        message={`Replace all ${zones.length} existing ${formatPlural(zones.length, 'zone')} with ${pendingZonesImport?.length ?? 0} imported from CSV? This cannot be undone.`}
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

