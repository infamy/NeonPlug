import React, { useState } from 'react';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useScanListsStore } from '../../store/scanListsStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { downloadFile } from '../../utils/download';

interface ExpectedWriteDataPanelProps {
  showAlert: (message: string, title?: string) => void;
}

export const ExpectedWriteDataPanel: React.FC<ExpectedWriteDataPanelProps> = ({ showAlert }) => {
  const { getChangedFields } = useRadioSettingsStore();
  const { channels } = useChannelsStore();
  const { zones } = useZonesStore();
  const { scanLists } = useScanListsStore();
  const { groups: rxGroups, groupsLoaded: rxGroupsLoaded } = useRXGroupsStore();
  const { messages: quickMessages } = useQuickMessagesStore();
  const { contacts: quickContacts } = useQuickContactsStore();
  const { radioIds: dmrRadioIds } = useDMRRadioIDsStore();
  const [showExpectedWriteData, setShowExpectedWriteData] = useState(false);

  const handleExportExpectedWriteHex = () => {
    if (channels.length === 0) {
      showAlert('No channels available to export.');
      return;
    }

    // Create a summary of expected write data in hex format
    const summary = {
      channels: channels.length,
      zones: zones.length,
      estimatedChannelBlocks: Math.ceil(channels.length / 125),
      estimatedZoneBlocks: zones.length > 0 ? 1 : 0,
      channelData: channels.map(ch => ({
        number: ch.number,
        name: ch.name,
        rxFreq: ch.rxFrequency.toFixed(4),
        txFreq: ch.txFrequency.toFixed(4),
        mode: ch.mode,
      })),
      zoneData: zones.map(zone => ({
        name: zone.name,
        channelCount: zone.channels.length,
        channels: zone.channels,
      })),
      note: 'This is a preview. Actual write data is generated during the write process.',
    };

    const hexContent = JSON.stringify(summary, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadFile(hexContent, `expected-write-data-${timestamp}.json`, 'application/json');
  };

  const handleExportExpectedWriteSummary = () => {
    if (channels.length === 0) {
      showAlert('No channels available to export.');
      return;
    }

    // Create a text summary (JSON)
    const summary = {
      channels: channels.length,
      zones: zones.length,
      estimatedChannelBlocks: Math.ceil(channels.length / 125),
      estimatedZoneBlocks: zones.length > 0 ? 1 : 0,
      note: 'Full binary write data generation requires an active write operation.',
      suggestion: 'Use "Write to Radio" to generate actual binary blocks, then check writeBlockData in debug export.',
    };

    const content = JSON.stringify(summary, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadFile(content, `expected-write-summary-${timestamp}.json`, 'application/json');
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold text-purple-400">Expected Write Data</h3>
          <span className="px-2 py-1 bg-purple-900/30 text-purple-400 text-xs rounded border border-purple-600/30">
            Preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExpectedWriteData(!showExpectedWriteData)}
            className="px-3 py-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-600/30 hover:border-purple-400 rounded transition-colors"
          >
            {showExpectedWriteData ? '▼ Hide' : '▶ Show'}
          </button>
          {showExpectedWriteData && channels.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportExpectedWriteHex}
                className="px-3 py-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-600/30 hover:border-purple-400 rounded transition-colors"
              >
                Download HEX
              </button>
              <button
                type="button"
                onClick={handleExportExpectedWriteSummary}
                className="px-3 py-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-600/30 hover:border-purple-400 rounded transition-colors"
              >
                Download JSON Summary
              </button>
            </>
          )}
        </div>
      </div>

      {showExpectedWriteData && (
        <div className="bg-deep-gray rounded-lg border border-purple-600/30 p-4">
          <div className="text-sm text-purple-200 mb-4">
            <p className="mb-2">
              This shows what data would be written to the radio based on current channels and zones.
            </p>
            <p className="text-purple-300/70">
              Note: Actual write data generation happens during the write process and may include additional blocks.
            </p>
          </div>

          {channels.length === 0 && zones.length === 0 ? (
            <div className="text-center py-8 text-cool-gray">
              <p>No channels or zones available to generate write data.</p>
              <p className="text-sm mt-2">Add some channels or zones first.</p>
            </div>
          ) : (() => {
            // Calculate all estimated blocks
            const channelBlocks = Math.ceil(channels.length / 125);
            const zoneBlocks = zones.length > 0 ? 1 : 0;
            const scanListBlocks = scanLists.length > 0 ? 1 : 0;
            const quickContactBlocks = quickContacts && quickContacts.length > 0 ? 1 : 0;
            const quickMessageBlocks = quickMessages && quickMessages.length > 0 ? 1 : 0;
            const rxGroupBlocks = rxGroups && rxGroups.length > 0 && rxGroupsLoaded ? 1 : 0;
            const dmrRadioIdBlocks = dmrRadioIds && dmrRadioIds.length > 0 ? 1 : 0;
            const radioSettingBlocks = getChangedFields().length > 0 ? 1 : 0;

            const totalBlocks = channelBlocks + zoneBlocks + scanListBlocks +
                              quickContactBlocks + quickMessageBlocks + rxGroupBlocks +
                              dmrRadioIdBlocks + radioSettingBlocks;

            return (
              <div className="bg-black/30 rounded border border-purple-600/20 p-4">
                <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                  <div className="bg-purple-900/20 rounded p-3 border border-purple-600/30">
                    <div className="text-purple-400 font-semibold mb-1">Channels</div>
                    <div className="text-2xl text-white">{channels.length}</div>
                  </div>
                  <div className="bg-purple-900/20 rounded p-3 border border-purple-600/30">
                    <div className="text-purple-400 font-semibold mb-1">Zones</div>
                    <div className="text-2xl text-white">{zones.length}</div>
                  </div>
                  <div className="bg-purple-900/20 rounded p-3 border border-purple-600/30">
                    <div className="text-purple-400 font-semibold mb-1">Est. Blocks</div>
                    <div className="text-2xl text-white">{totalBlocks}</div>
                  </div>
                </div>

                <div className="text-xs text-purple-300/70 mt-4 space-y-1">
                  <p>• Channel blocks: {channelBlocks} (125 channels per block)</p>
                  <p>• Zone blocks: {zoneBlocks} (all zones in single block)</p>
                  {scanListBlocks > 0 && <p>• Scan list blocks: {scanListBlocks}</p>}
                  {quickContactBlocks > 0 && <p>• Talk group blocks: {quickContactBlocks} ({quickContacts?.length} talk groups)</p>}
                  {quickMessageBlocks > 0 && <p>• Quick message blocks: {quickMessageBlocks} ({quickMessages?.length} messages)</p>}
                  {rxGroupBlocks > 0 && <p>• RX group blocks: {rxGroupBlocks} ({rxGroups?.length} groups)</p>}
                  {dmrRadioIdBlocks > 0 && <p>• DMR Radio ID blocks: {dmrRadioIdBlocks} ({dmrRadioIds?.length} IDs)</p>}
                  {radioSettingBlocks > 0 && <p>• Radio settings blocks: {radioSettingBlocks} ({getChangedFields().length} changed fields)</p>}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
