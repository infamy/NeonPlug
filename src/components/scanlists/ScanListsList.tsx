import React, { useState } from 'react';
import { useScanListsStore } from '../../store/scanListsStore';
import { useChannelsStore } from '../../store/channelsStore';
import type { ScanList } from '../../models/ScanList';

export const ScanListsList: React.FC = () => {
  const { scanLists, selectedScanList, setSelectedScanList, addScanList, deleteScanList } = useScanListsStore();
  const [newScanListName, setNewScanListName] = useState('');

  const selectedScanListData = scanLists.find(sl => sl.name === selectedScanList);

  const handleAddScanList = () => {
    if (scanLists.length >= 32) {
      alert('Maximum of 32 scan lists allowed.');
      return;
    }
    if (!newScanListName.trim()) {
      return;
    }
    // Check if name already exists
    if (scanLists.some(sl => sl.name === newScanListName.trim())) {
      alert('A scan list with this name already exists.');
      return;
    }
    addScanList({
      name: newScanListName.trim().slice(0, 16),
      ctcScanMode: 0,
      settings: new Array(8).fill(0),
      channels: [],
    });
    setNewScanListName('');
  };

  const handleDeleteScanList = (name: string) => {
    if (confirm(`Are you sure you want to delete scan list "${name}"? This cannot be undone.`)) {
      deleteScanList(name);
      if (selectedScanList === name) {
        setSelectedScanList(null);
      }
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-deep-gray rounded-lg border border-neon-cyan">
        <div className="p-4 border-b border-neon-cyan border-opacity-30 flex justify-between items-center">
          <div>
            <h3 className="text-neon-cyan font-bold">Scan Lists</h3>
            <p className="text-cool-gray text-xs mt-1">{scanLists.length}/32 scan lists</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newScanListName}
              onChange={(e) => setNewScanListName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddScanList()}
              placeholder="Scan list name..."
              className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-32"
              maxLength={16}
              disabled={scanLists.length >= 32}
            />
            <button
              onClick={handleAddScanList}
              disabled={scanLists.length >= 32 || !newScanListName.trim()}
              className="px-3 py-1 bg-neon-cyan text-dark-charcoal rounded font-medium hover:bg-opacity-90 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[calc(100vh-250px)]">
          {scanLists.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-cool-gray">No scan lists loaded</p>
              <p className="text-cool-gray text-sm mt-2">Read from radio to view scan lists</p>
            </div>
          ) : (
            <div className="divide-y divide-neon-cyan divide-opacity-20">
              {scanLists.map((scanList, index) => (
                <div
                  key={`${scanList.name}-${index}`}
                  onClick={() => setSelectedScanList(scanList.name)}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedScanList === scanList.name
                      ? 'bg-neon-cyan bg-opacity-20 border-l-4 border-neon-cyan'
                      : 'hover:bg-deep-gray hover:bg-opacity-50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white font-medium">{scanList.name}</span>
                    <span className="text-cool-gray text-xs">
                      {scanList.channels.length} channel{scanList.channels.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {scanList.channels.length > 0 && (
                    <div className="text-cool-gray text-xs mb-2">
                      Channels: {scanList.channels.slice(0, 5).join(', ')}
                      {scanList.channels.length > 5 && ` +${scanList.channels.length - 5} more`}
                    </div>
                  )}
                  <div className="flex gap-2 justify-end mt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScanList(scanList.name);
                      }}
                      className="px-2 py-0.5 bg-red-600 bg-opacity-50 text-red-300 rounded text-xs hover:bg-opacity-70 border border-red-600 border-opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-deep-gray rounded-lg border border-neon-cyan">
        <div className="p-4 border-b border-neon-cyan border-opacity-30">
          <h3 className="text-neon-cyan font-bold">
            {selectedScanListData ? `Scan List: ${selectedScanListData.name}` : 'Select a Scan List'}
          </h3>
        </div>
        {selectedScanListData ? (
          <ScanListEditor scanList={selectedScanListData} />
        ) : (
          <div className="p-8 text-center">
            <p className="text-cool-gray">Select a scan list to edit</p>
            <p className="text-cool-gray text-sm mt-2">Scan lists define which channels to scan</p>
          </div>
        )}
      </div>
    </div>
  );
};

interface ScanListEditorProps {
  scanList: ScanList;
}

const ScanListEditor: React.FC<ScanListEditorProps> = ({ scanList }) => {
  const { updateScanList } = useScanListsStore();
  const { channels } = useChannelsStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddChannel = (channelNumber: number) => {
    if (scanList.channels.length >= 16) {
      alert('Maximum of 16 channels per scan list allowed.');
      return;
    }
    if (!scanList.channels.includes(channelNumber)) {
      updateScanList(scanList.name, {
        channels: [...scanList.channels, channelNumber].sort((a, b) => a - b),
      });
    }
  };

  const handleRemoveChannel = (channelNumber: number) => {
    updateScanList(scanList.name, {
      channels: scanList.channels.filter(ch => ch !== channelNumber),
    });
  };

  const handleReorderChannel = (fromIndex: number, toIndex: number) => {
    const newChannels = [...scanList.channels];
    const [removed] = newChannels.splice(fromIndex, 1);
    newChannels.splice(toIndex, 0, removed);
    updateScanList(scanList.name, { channels: newChannels });
  };

  const availableChannels = channels
    .filter(ch => !scanList.channels.includes(ch.number))
    .map(ch => ch.number)
    .sort((a, b) => a - b);

  const filteredAvailableChannels = searchQuery.trim()
    ? availableChannels.filter((chNum) => {
        const channel = channels.find(ch => ch.number === chNum);
        if (!channel) return false;
        
        const query = searchQuery.toLowerCase().trim();
        
        // Search in name
        if (channel.name.toLowerCase().includes(query)) return true;
        
        // Search in channel number
        if (channel.number.toString().includes(query)) return true;
        
        // Search in frequencies
        const rxFreq = channel.rxFrequency.toFixed(4);
        const txFreq = channel.txFrequency.toFixed(4);
        if (rxFreq.includes(query) || txFreq.includes(query)) return true;
        
        // Search in mode
        if (channel.mode.toLowerCase().includes(query)) return true;
        
        // Search in bandwidth
        if (channel.bandwidth.toLowerCase().includes(query)) return true;
        
        // Search in power
        if (channel.power.toLowerCase().includes(query)) return true;
        
        return false;
      })
    : availableChannels;

  const scanListChannels = scanList.channels
    .map(chNum => channels.find(ch => ch.number === chNum))
    .filter(ch => ch !== undefined);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h4 className="text-white font-medium mb-2">
          Channels in Scan List ({scanList.channels.length}/16)
        </h4>
        {scanList.channels.length === 0 ? (
          <p className="text-cool-gray text-sm">No channels in this scan list</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {scanListChannels.map((channel, index) => (
              <div
                key={channel!.number}
                className="px-3 py-2 bg-neon-cyan bg-opacity-10 border border-neon-cyan border-opacity-30 rounded flex items-center justify-between hover:bg-opacity-20"
              >
                <div className="flex items-center gap-2">
                  <span className="text-cool-gray text-xs w-8">{index + 1}.</span>
                  <span className="text-white text-xs">
                    {channel!.number}: {channel!.name}
                  </span>
                </div>
                <div className="flex gap-1">
                  {index > 0 && (
                    <button
                      onClick={() => handleReorderChannel(index, index - 1)}
                      className="px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-neon-cyan text-xs hover:bg-opacity-50"
                      title="Move up"
                    >
                      ↑
                    </button>
                  )}
                  {index < scanListChannels.length - 1 && (
                    <button
                      onClick={() => handleReorderChannel(index, index + 1)}
                      className="px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-neon-cyan text-xs hover:bg-opacity-50"
                      title="Move down"
                    >
                      ↓
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveChannel(channel!.number)}
                    className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-white font-medium mb-2">
          Available Channels ({filteredAvailableChannels.length} of {availableChannels.length})
        </h4>
        {availableChannels.length === 0 ? (
          <p className="text-cool-gray text-sm">All channels are in this scan list</p>
        ) : scanList.channels.length >= 16 ? (
          <p className="text-cool-gray text-sm">Scan list is full (16 channels maximum)</p>
        ) : (
          <>
            <div className="mb-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search channels..."
                  className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-1.5 pl-9 text-white text-xs focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
                <span className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-cool-gray text-xs">
                  🔍
                </span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-cool-gray hover:text-white text-sm"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            {filteredAvailableChannels.length === 0 ? (
              <p className="text-cool-gray text-sm">No channels match your search</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-80 overflow-y-auto">
                {filteredAvailableChannels.map((chNum) => {
                  const channel = channels.find(ch => ch.number === chNum);
                  return (
                    <button
                      key={chNum}
                      onClick={() => handleAddChannel(chNum)}
                      className="px-3 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-xs hover:bg-opacity-50 hover:border-neon-cyan transition-colors"
                    >
                      {chNum}: {channel?.name || 'Unknown'}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

