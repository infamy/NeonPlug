import React, { useState } from 'react';
import { useAlert } from '../../hooks/useAlert';
import { formatPlural } from '../../utils/formatPlural';
import { useZonesStore } from '../../store/zonesStore';
import { useChannelsStore } from '../../store/channelsStore';
import type { Zone } from '../../models/Zone';
import { ListDetailLayout } from '../ui/ListDetailLayout';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmModal } from '../ui/ConfirmModal';

export const ZonesList: React.FC = () => {
  const { zones, selectedZoneId, setSelectedZoneId, addZone, deleteZone, renameZone } = useZonesStore();
  const [newZoneName, setNewZoneName] = useState('');
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [zoneToDelete, setZoneToDelete] = useState<{ id: string; name: string } | null>(null);
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert();

  const handleAddZone = () => {
    if (newZoneName.trim()) {
      const zoneName = newZoneName.trim();
      addZone({
        name: zoneName,
        channels: [],
      });
      setNewZoneName('');
      // Auto-select the newly created zone so user can immediately add channels
      setTimeout(() => {
        const addedZone = useZonesStore.getState().zones.find(z => z.name === zoneName && !selectedZoneId);
        if (addedZone) {
          setSelectedZoneId(addedZone.id);
        }
      }, 0);
    }
  };

  const handleStartEdit = (zoneId: string, zoneName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingZoneId(zoneId);
    setEditZoneName(zoneName);
  };

  const handleSaveEdit = (zoneId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const success = renameZone(zoneId, editZoneName);
    if (success) {
      setEditingZoneId(null);
      setEditZoneName('');
    } else {
      showAlert('Invalid zone name. Zone names must be 1-10 characters.');
    }
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingZoneId(null);
    setEditZoneName('');
  };

  const selectedZoneData = zones.find(z => z.id === selectedZoneId);

  const listContent =
    zones.length === 0 ? (
      <EmptyState
        message="No zones created"
        secondary="Create a zone to organize channels"
      />
    ) : (
      <div className="divide-y divide-neon-cyan divide-opacity-20">
        {zones
          .filter(zone => zone.name && zone.name.trim().length > 0)
          .map((zone) => (
            <div
              key={zone.id}
              onClick={() => editingZoneId !== zone.id && setSelectedZoneId(zone.id)}
              className={`p-3 transition-colors ${
                editingZoneId === zone.id
                  ? 'bg-deep-gray-light'
                  : selectedZoneId === zone.id
                    ? 'bg-neon-cyan bg-opacity-20 border-l-4 border-neon-cyan cursor-pointer'
                    : 'hover:bg-deep-gray hover:bg-opacity-50 cursor-pointer'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                {editingZoneId === zone.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editZoneName}
                      onChange={(e) => setEditZoneName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEdit(zone.id);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-transparent border border-neon-cyan rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      maxLength={10}
                      autoFocus
                    />
                    <button
                      onClick={(e) => handleSaveEdit(zone.id, e)}
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
                      {zone.channels.length} {formatPlural(zone.channels.length, 'channel')}
                    </span>
                  </>
                )}
              </div>
              {editingZoneId !== zone.id && (
                <>
                  {zone.channels.length > 0 && (
                    <div className="text-cool-gray text-xs mb-2">
                      Channels: {zone.channels.slice(0, 5).join(', ')}
                      {zone.channels.length > 5 && ` +${zone.channels.length - 5} more`}
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={(e) => handleStartEdit(zone.id, zone.name, e)}
                      className="px-2 py-0.5 bg-neon-cyan bg-opacity-50 text-neon-cyan rounded text-xs hover:bg-opacity-70 border border-neon-cyan border-opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setZoneToDelete({ id: zone.id, name: zone.name });
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
    );

  const detailContent = (
    <Card padding="none" className="flex flex-col h-full">
      <div className="p-4 border-b border-neon-cyan border-opacity-30 flex-shrink-0">
        <SectionTitle as="h3" size="md" bold>
          {selectedZoneData ? `Zone: ${selectedZoneData.name}` : 'Select a Zone'}
        </SectionTitle>
      </div>
      {selectedZoneData ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ZoneEditor zone={selectedZoneData} onAlert={showAlert} />
        </div>
      ) : (
        <EmptyState
          message="Select a zone to edit"
          secondary="Zones group channels for easy access"
        />
      )}
    </Card>
  );

  return (
    <>
      <ListDetailLayout
        listTitle="Zones"
        listSubtitle={`${zones.length}/250 zones`}
        addInputPlaceholder="Zone name..."
        addInputValue={newZoneName}
        onAddInputChange={setNewZoneName}
        onAdd={handleAddZone}
        addDisabled={zones.length >= 250}
        addInputMaxLength={10}
        listContent={listContent}
        detailContent={detailContent}
        fullHeight
      />
      <ConfirmModal
        isOpen={!!zoneToDelete}
        onClose={() => setZoneToDelete(null)}
        onConfirm={() => {
          if (zoneToDelete) {
            deleteZone(zoneToDelete.id);
            if (selectedZoneId === zoneToDelete.id) {
              setSelectedZoneId(null);
            }
            setZoneToDelete(null);
          }
        }}
        title="Delete zone"
        message={zoneToDelete ? `Delete zone "${zoneToDelete.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
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
    </>
  );
};

interface ZoneEditorProps {
  zone: Zone;
  onAlert: (message: string) => void;
}

const ZoneEditor: React.FC<ZoneEditorProps> = ({ zone, onAlert }) => {
  const { updateZone } = useZonesStore();
  const { channels } = useChannelsStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddChannel = (channelNumber: number) => {
    if (zone.channels.length >= 64) {
      onAlert('Maximum of 64 channels per zone allowed.');
      return;
    }
    if (!zone.channels.includes(channelNumber)) {
      updateZone(zone.id, {
        channels: [...zone.channels, channelNumber].sort((a, b) => a - b),
      });
    }
  };

  const handleRemoveChannel = (channelNumber: number) => {
    updateZone(zone.id, {
      channels: zone.channels.filter(ch => ch !== channelNumber),
    });
  };

  const handleReorderChannel = (fromIndex: number, toIndex: number) => {
    const newChannels = [...zone.channels];
    const [removed] = newChannels.splice(fromIndex, 1);
    newChannels.splice(toIndex, 0, removed);
    updateZone(zone.id, { channels: newChannels });
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
