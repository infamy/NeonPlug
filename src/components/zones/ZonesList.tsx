import React, { useState } from 'react';
import { useZonesStore } from '../../store/zonesStore';
import { useChannelsStore } from '../../store/channelsStore';
import type { Zone } from '../../models/Zone';

export const ZonesList: React.FC = () => {
  const { zones, selectedZone, setSelectedZone, addZone, deleteZone, renameZone } = useZonesStore();
  const [newZoneName, setNewZoneName] = useState('');
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [editZoneName, setEditZoneName] = useState('');

  const handleAddZone = () => {
    if (newZoneName.trim()) {
      const zoneName = newZoneName.trim();
      addZone({
        name: zoneName,
        channels: [],
      });
      setNewZoneName('');
      // Auto-select the newly created zone so user can immediately add channels
      setSelectedZone(zoneName);
    }
  };

  const handleStartEdit = (zoneName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingZone(zoneName);
    setEditZoneName(zoneName);
  };

  const handleSaveEdit = (oldName: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const success = renameZone(oldName, editZoneName);
    if (success) {
      setEditingZone(null);
      setEditZoneName('');
    } else {
      alert('Invalid zone name or name already exists. Zone names must be 1-10 characters and unique.');
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingZone(null);
    setEditZoneName('');
  };

  const selectedZoneData = zones.find(z => z.name === selectedZone);

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="bg-deep-gray rounded-lg border border-neon-cyan flex flex-col h-full">
        <div className="p-4 border-b border-neon-cyan border-opacity-30 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="text-neon-cyan font-bold">Zones</h3>
            <p className="text-cool-gray text-xs mt-1">{zones.length}/250 zones</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddZone()}
              placeholder="Zone name..."
              className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-32"
              maxLength={10}
              disabled={zones.length >= 250}
            />
            <button
              onClick={handleAddZone}
              disabled={zones.length >= 250 || !newZoneName.trim()}
              className="px-3 py-1 bg-neon-cyan text-dark-charcoal rounded font-medium hover:bg-opacity-90 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {zones.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-cool-gray">No zones created</p>
              <p className="text-cool-gray text-sm mt-2">Create a zone to organize channels</p>
            </div>
          ) : (
            <div className="divide-y divide-neon-cyan divide-opacity-20">
              {zones
                .filter(zone => zone.name && zone.name.trim().length > 0) // Filter out empty zones
                .map((zone, index) => (
                <div
                  key={`${zone.name}-${index}`} // Use index to ensure uniqueness
                  onClick={() => editingZone !== zone.name && setSelectedZone(zone.name)}
                  className={`p-3 transition-colors ${
                    editingZone === zone.name 
                      ? 'bg-deep-gray-light'
                      : selectedZone === zone.name
                      ? 'bg-neon-cyan bg-opacity-20 border-l-4 border-neon-cyan cursor-pointer'
                      : 'hover:bg-deep-gray hover:bg-opacity-50 cursor-pointer'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    {editingZone === zone.name ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editZoneName}
                          onChange={(e) => setEditZoneName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEdit(zone.name);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit(e as any);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-transparent border border-neon-cyan rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                          maxLength={10}
                          autoFocus
                        />
                        <button
                          onClick={(e) => handleSaveEdit(zone.name, e)}
                          className="px-2 py-1 bg-neon-cyan text-dark-charcoal rounded text-xs hover:bg-opacity-90"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-2 py-1 bg-cool-gray bg-opacity-30 text-cool-gray rounded text-xs hover:bg-opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-white font-medium">{zone.name}</span>
                        <span className="text-cool-gray text-xs">
                          {zone.channels.length} channel{zone.channels.length !== 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </div>
                  {editingZone !== zone.name && (
                    <>
                      {zone.channels.length > 0 && (
                        <div className="text-cool-gray text-xs mb-2">
                          Channels: {zone.channels.slice(0, 5).join(', ')}
                          {zone.channels.length > 5 && ` +${zone.channels.length - 5} more`}
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={(e) => handleStartEdit(zone.name, e)}
                          className="px-2 py-0.5 bg-neon-cyan bg-opacity-50 text-neon-cyan rounded text-xs hover:bg-opacity-70 border border-neon-cyan border-opacity-50"
                        >
                          Rename
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete zone "${zone.name}"? This cannot be undone.`)) {
                              deleteZone(zone.name);
                              if (selectedZone === zone.name) {
                                setSelectedZone(null);
                              }
                            }
                          }}
                          className="px-2 py-0.5 bg-red-600 bg-opacity-50 text-red-300 rounded text-xs hover:bg-opacity-70 border border-red-600 border-opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-deep-gray rounded-lg border border-neon-cyan flex flex-col h-full">
        <div className="p-4 border-b border-neon-cyan border-opacity-30 flex-shrink-0">
          <h3 className="text-neon-cyan font-bold">
            {selectedZoneData ? `Zone: ${selectedZoneData.name}` : 'Select a Zone'}
          </h3>
        </div>
        {selectedZoneData ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ZoneEditor zone={selectedZoneData} />
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-cool-gray">Select a zone to edit</p>
            <p className="text-cool-gray text-sm mt-2">Zones group channels for easy access</p>
          </div>
        )}
      </div>
    </div>
  );
};

interface ZoneEditorProps {
  zone: Zone;
}

const ZoneEditor: React.FC<ZoneEditorProps> = ({ zone }) => {
  const { updateZone } = useZonesStore();
  const { channels } = useChannelsStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddChannel = (channelNumber: number) => {
    if (zone.channels.length >= 64) {
      alert('Maximum of 64 channels per zone allowed.');
      return;
    }
    if (!zone.channels.includes(channelNumber)) {
      updateZone(zone.name, {
        channels: [...zone.channels, channelNumber].sort((a, b) => a - b),
      });
    }
  };

  const handleRemoveChannel = (channelNumber: number) => {
    updateZone(zone.name, {
      channels: zone.channels.filter(ch => ch !== channelNumber),
    });
  };

  const handleReorderChannel = (fromIndex: number, toIndex: number) => {
    const newChannels = [...zone.channels];
    const [removed] = newChannels.splice(fromIndex, 1);
    newChannels.splice(toIndex, 0, removed);
    updateZone(zone.name, { channels: newChannels });
  };

  const availableChannels = channels
    .filter(ch => !zone.channels.includes(ch.number))
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

  const zoneChannels = zone.channels
    .map(chNum => channels.find(ch => ch.number === chNum))
    .filter(ch => ch !== undefined);

  return (
    <div className="p-4 space-y-4 flex flex-col h-full">
      <div className="flex-shrink-0">
        <h4 className="text-white font-medium mb-2">Channels in Zone ({zone.channels.length}/64)</h4>
        {zone.channels.length === 0 ? (
          <p className="text-cool-gray text-sm">No channels in this zone</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {zoneChannels.map((channel, index) => (
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
                  {index < zoneChannels.length - 1 && (
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

      <div className="flex-1 flex flex-col min-h-0">
        <h4 className="text-white font-medium mb-2 flex-shrink-0">
          Available Channels ({filteredAvailableChannels.length} of {availableChannels.length})
        </h4>
        {availableChannels.length === 0 ? (
          <p className="text-cool-gray text-sm">All channels are in this zone</p>
        ) : zone.channels.length >= 64 ? (
          <p className="text-cool-gray text-sm">Zone is full (64 channels maximum)</p>
        ) : (
          <>
            <div className="mb-3 flex-shrink-0">
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
              <div className="flex flex-wrap gap-2 overflow-y-auto flex-1 min-h-0">
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
