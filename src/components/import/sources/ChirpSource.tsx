import React, { useState, useRef } from 'react';
import { useChannelsStore } from '../../../store/channelsStore';
import { getNextChannelNumber } from '../../../utils/importHelpers';
import { importChannelsFromChirpCSV, exportChannelsToChirpCSV, downloadCSV } from '../../../services/csv';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface ChirpSourceProps {
  onError: (msg: string) => void;
}

export const ChirpSource: React.FC<ChirpSourceProps> = ({ onError }) => {
  const { channels, setChannels } = useChannelsStore();

  const [isImportingChirp, setIsImportingChirp] = useState(false);
  const [chirpImportResult, setChirpImportResult] = useState<{
    operation: 'import' | 'export';
    channels: number;
    errors?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChirpCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingChirp(true);
    onError('');
    setChirpImportResult(null);

    try {
      const content = await file.text();

      const nextChannelNumber = getNextChannelNumber(channels);

      const result = importChannelsFromChirpCSV(content, nextChannelNumber);

      if (result.success && result.channels) {
        // Add imported channels
        const newChannels = [...channels, ...result.channels];
        setChannels(newChannels);

        setChirpImportResult({
          operation: 'import',
          channels: result.channels.length,
          errors: result.errors,
        });
      } else {
        onError(result.errors?.join('\n') || 'Failed to import CHIRP CSV');
        setChirpImportResult({
          operation: 'import',
          channels: 0,
          errors: result.errors,
        });
      }
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
          errors: [`Exported ${analogChannels.length} analog channel${analogChannels.length !== 1 ? 's' : ''}. ${digitalCount} digital channel${digitalCount !== 1 ? 's' : ''} excluded (CHIRP doesn't support digital).`],
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

  return (
    <>
      <div className="mb-6">
        <SectionTitle as="h2" size="xl" bold className="text-2xl">Smart Import/Export</SectionTitle>
        <p className="text-cool-gray">
          Import channels from CHIRP CSV format or export your channels to CHIRP CSV format
        </p>
      </div>

      {/* Chirp CSV Import/Export Section */}
      <Card padding="tight" className="mb-4">
        <SectionTitle as="h3" size="lg" className="mb-4">Analog CHIRP CSV Import/Export</SectionTitle>
        <p className="text-sm text-cool-gray mb-4">
          Import or export analog channels in CHIRP CSV format for use with other radio programming software. Digital channels are not supported by CHIRP and will be excluded from exports.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-cool-gray mb-2">Import from CHIRP CSV</label>
            <p className="text-xs text-cool-gray mb-2">
              Any digital channels in the CSV will be imported as analog.
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
              className="w-full bg-neon-cyan text-dark-charcoal hover:bg-neon-cyan-bright"
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
              className="w-full bg-neon-magenta text-white hover:bg-neon-magenta-bright"
            >
              Export to CHIRP CSV ({channels.filter(ch => ch.mode === 'Analog' || ch.mode === 'Fixed Analog').length} analog)
            </Button>
          </div>
        </div>

        {chirpImportResult && (
          <div className={`rounded p-3 mb-4 ${
            chirpImportResult.errors && chirpImportResult.errors.length > 0
              ? 'bg-yellow-900 border border-yellow-500 text-yellow-200'
              : 'bg-deep-gray border border-neon-cyan text-neon-cyan'
          }`}>
            <div className="font-semibold mb-1">
              {chirpImportResult.operation === 'import'
                ? (chirpImportResult.errors && chirpImportResult.errors.length > 0
                    ? 'Import completed with warnings'
                    : 'Import successful')
                : (chirpImportResult.errors && chirpImportResult.errors.length > 0
                    ? 'Export completed with warnings'
                    : 'Export successful')}
            </div>
            <div className="text-sm">
              {chirpImportResult.operation === 'import'
                ? `Imported ${chirpImportResult.channels} channel${chirpImportResult.channels !== 1 ? 's' : ''}`
                : `Exported ${chirpImportResult.channels} channel${chirpImportResult.channels !== 1 ? 's' : ''}`}
            </div>
            {chirpImportResult.errors && chirpImportResult.errors.length > 0 && (
              <div className="text-sm mt-2">
                <div className="font-semibold">Warnings:</div>
                <ul className="list-disc list-inside mt-1">
                  {chirpImportResult.errors.slice(0, 5).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {chirpImportResult.errors.length > 5 && (
                    <li>... and {chirpImportResult.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
};
