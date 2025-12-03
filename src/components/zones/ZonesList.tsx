import React, { useState } from 'react';
import { useZonesStore } from '../../store/zonesStore';
import { useChannelsStore } from '../../store/channelsStore';
import type { Zone } from '../../models/Zone';

export const ZonesList: React.FC = () => {
  const { zones, selectedZone, setSelectedZone, addZone, deleteZone } = useZonesStore();
  const [newZoneName, setNewZoneName] = useState('');

  const handleAddZone = () => {
    if (newZoneName.trim()) {
      addZone({
        name: newZoneName.trim(),
        channels: [],
      });
      setNewZoneName('');
    }
  };

  const selectedZoneData = zones.find(z => z.name === selectedZone);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-deep-gray rounded-lg border border-neon-cyan">
        <div className="p-4 border-b border-neon-cyan border-opacity-30 flex justify-between items-center">
          <h3 className="text-neon-cyan font-bold">Zones</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddZone()}
              placeholder="Zone name..."
              className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-32"
              maxLength={11}
            />
            <button
              onClick={handleAddZone}
              className="px-3 py-1 bg-neon-cyan text-dark-charcoal rounded font-medium hover:bg-opacity-90 text-xs"
            >
              Add
            </button>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[calc(100vh-250px)]">
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
                  onClick={() => setSelectedZone(zone.name)}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedZone === zone.name
                      ? 'bg-neon-cyan bg-opacity-20 border-l-4 border-neon-cyan'
                      : 'hover:bg-deep-gray hover:bg-opacity-50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white font-medium">{zone.name}</span>
                    <span className="text-cool-gray text-xs">
                      {zone.channels.length} channel{zone.channels.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {zone.channels.length > 0 && (
                    <div className="text-cool-gray text-xs mb-2">
                      Channels: {zone.channels.slice(0, 5).join(', ')}
                      {zone.channels.length > 5 && ` +${zone.channels.length - 5} more`}
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-deep-gray rounded-lg border border-neon-cyan">
        <div className="p-4 border-b border-neon-cyan border-opacity-30">
          <h3 className="text-neon-cyan font-bold">
            {selectedZoneData ? `Zone: ${selectedZoneData.name}` : 'Select a Zone'}
          </h3>
        </div>
        {selectedZoneData ? (
          <ZoneEditor zone={selectedZoneData} />
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

  const handleAddChannel = (channelNumber: number) => {
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

  const zoneChannels = zone.channels
    .map(chNum => channels.find(ch => ch.number === chNum))
    .filter(ch => ch !== undefined);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h4 className="text-white font-medium mb-2">Channels in Zone ({zone.channels.length})</h4>
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

      <div>
        <h4 className="text-white font-medium mb-2">Available Channels ({availableChannels.length})</h4>
        {availableChannels.length === 0 ? (
          <p className="text-cool-gray text-sm">All channels are in this zone</p>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-80 overflow-y-auto">
            {availableChannels.map((chNum) => {
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
      </div>
    </div>
  );
};
