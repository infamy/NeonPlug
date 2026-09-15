import React, { useState, useRef } from 'react';
import { formatPlural } from '../../../utils/formatPlural';
import { useChannelsStore } from '../../../store/channelsStore';
import {
  importChannelsFromChirpCSV,
  importChannelsFromCSV,
  exportChannelsToChirpCSV,
  downloadCSV,
} from '../../../services/csv';
import { detectChannelCsvFormat } from '../../../services/csv/channelCsvFormat';
import { addChannels } from '../../../services/csv/importModes';
import { checkChannelLimits } from '../../../services/csv/importLimits';
import { nothingImportedMessage } from '../../../services/csv/importProblems';
import { useCsvImport, type CsvImportMode } from '../../../hooks/useCsvImport';
import { useRadioCapabilities } from '../../../hooks/useRadioCapabilities';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface ChirpSourceProps {
  onError: (msg: string) => void;
}

export const ChirpSource: React.FC<ChirpSourceProps> = ({ onError }) => {
  const { channels, setChannels } = useChannelsStore();
  const { caps } = useRadioCapabilities();
  const { startImport, csvImportDialog } = useCsvImport();

  const [isImportingChirp, setIsImportingChirp] = useState(false);
  const [chirpImportResult, setChirpImportResult] = useState<{
    operation: 'import' | 'export';
    channels: number;
    mode?: CsvImportMode;
    errors?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CHIRP rows used to be appended straight onto the channel list: no Add or
  // Replace choice, no check for channels already there, no radio limit, so the
  // same file imported twice doubled every channel. They now go through the same
  // steps as the Channels tab's CSV import.
  const handleChirpCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingChirp(true);
    onError('');
    setChirpImportResult(null);

    try {
      const content = await file.text();
      // A NeonPlug channels CSV is read by its own importer, rather than failing
      // every row as a CHIRP file.
      const format = detectChannelCsvFormat(content);
      if (!format) {
        onError(`${file.name} isn't a CHIRP or NeonPlug channels CSV: it has no Frequency or RX Frequency column.`);
        return;
      }
      // Numbered from 1: Replace keeps these numbers, and Add renumbers after the last channel.
      const result = format === 'neonplug' ? importChannelsFromCSV(content) : importChannelsFromChirpCSV(content, 1);
      const imported = result.channels ?? [];
      if (imported.length === 0) {
        onError(nothingImportedMessage(result.errors));
        return;
      }
      startImport({
        noun: 'channel',
        existing: channels,
        imported,
        problems: result.errors,
        add: () => addChannels(channels, imported),
        check: (list) => checkChannelLimits(list, caps),
        replaceNote: "zones and scan lists keep their channel numbers, so they will point at the file's channels.",
        apply: (list, mode) => {
          setChannels(list);
          setChirpImportResult({
            operation: 'import',
            channels: mode === 'replace' ? list.length : list.length - channels.length,
            mode,
            errors: result.errors,
          });
        },
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to import CHIRP CSV file');
    } finally {
      setIsImportingChirp(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleChirpCSVExport = () => {
    try {
      // Filter out digital channels - Chirp doesn't support them
      const analogChannels = channels.filter(ch =>
        ch.mode === 'Analog' || ch.mode === 'Fixed Analog'
      );

      if (analogChannels.length === 0) {
        onError('No analog channels to export. CHIRP only supports analog channels.');
        return;
      }

      const digitalCount = channels.length - analogChannels.length;
      const csvContent = exportChannelsToChirpCSV(analogChannels);
      downloadCSV(csvContent, 'chirp_channels.csv');

      if (digitalCount > 0) {
        setChirpImportResult({
          operation: 'export',
          channels: analogChannels.length,
          errors: [`Exported ${analogChannels.length} ${formatPlural(analogChannels.length, 'analog channel')}. ${digitalCount} ${formatPlural(digitalCount, 'digital channel')} excluded (CHIRP doesn't support digital).`],
        });
      } else {
        setChirpImportResult({
          operation: 'export',
          channels: analogChannels.length,
          errors: undefined,
        });
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to export CHIRP CSV');
    }
  };

  const result = chirpImportResult;
  const hasErrors = !!result?.errors && result.errors.length > 0;

  return (
    <>
      {/* Chirp CSV Import/Export Section. No page-level heading of its own: the
          tab has one PageHeader, and this card's title names the section. */}
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-4">Analog CHIRP CSV Import/Export</SectionTitle>
        <p className="text-sm text-cool-gray mb-4">
          Import or export analog channels in CHIRP CSV format for use with other radio programming software. Digital channels are not supported by CHIRP and will be excluded from exports.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-cool-gray mb-2">Import from CHIRP CSV</label>
            <p className="text-xs text-cool-gray mb-2">
              Any digital channels in the CSV will be imported as analog. A NeonPlug channels CSV works here too.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleChirpCSVImport}
              disabled={isImportingChirp}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImportingChirp}
              className="w-full"
            >
              {isImportingChirp ? 'Importing...' : 'Import CHIRP CSV'}
            </Button>
          </div>
          <div>
            <label className="block text-sm text-cool-gray mb-2">Export to CHIRP CSV</label>
            <p className="text-xs text-cool-gray mb-2">
              Only analog channels will be exported. Digital channels are excluded.
            </p>
            <Button
              onClick={handleChirpCSVExport}
              disabled={channels.filter(ch => ch.mode === 'Analog' || ch.mode === 'Fixed Analog').length === 0}
              variant="accent"
              className="w-full"
            >
              Export to CHIRP CSV ({channels.filter(ch => ch.mode === 'Analog' || ch.mode === 'Fixed Analog').length} analog)
            </Button>
          </div>
        </div>

        {result && (
          <div className={`rounded p-3 mb-4 ${
            hasErrors
              ? 'bg-yellow-900 border border-yellow-500 text-yellow-200'
              : 'bg-deep-gray border border-neon-cyan text-neon-cyan'
          }`}>
            <div className="font-semibold mb-1">
              {result.operation === 'import'
                ? (hasErrors ? 'Imported, with rows left out' : 'Import successful')
                : (hasErrors ? 'Export completed with warnings' : 'Export successful')}
            </div>
            <div className="text-sm">
              {result.operation === 'import'
                ? result.mode === 'replace'
                  ? `Replaced the channels with the file's ${result.channels}`
                  : `Added ${result.channels} ${formatPlural(result.channels, 'channel')}`
                : `Exported ${result.channels} ${formatPlural(result.channels, 'channel')}`}
            </div>
            {hasErrors && result.errors && (
              <div className="text-sm mt-2">
                <div className="font-semibold">
                  {result.operation === 'import'
                    ? `${result.errors.length} ${formatPlural(result.errors.length, 'row')} couldn't be read:`
                    : 'Warnings:'}
                </div>
                <ul className="list-disc list-inside mt-1">
                  {result.errors.slice(0, 5).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>... and {result.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
      {csvImportDialog}
    </>
  );
};
