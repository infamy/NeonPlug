import React, { useState } from 'react';
import { useAlert } from '../../hooks/useAlert';
import { formatPlural } from '../../utils/formatPlural';
import { useZonesStore } from '../../store/zonesStore';
import { useChannelsStore } from '../../store/channelsStore';
import type { Zone } from '../../models/Zone';
import { ListDetailLayout } from '../ui/ListDetailLayout';
import { OrderedItemPicker } from '../ui/OrderedItemPicker';
import { channelPickerItem } from '../ui/pickerItems';
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

  const availableItems = channels
    .filter(ch => !zone.channels.includes(ch.number))
    .sort((a, b) => a.number - b.number)
    .map(channelPickerItem);

  return (
    <OrderedItemPicker
      selectedIds={zone.channels}
      availableItems={availableItems}
      resolveItem={(num) => {
        const ch = channels.find(c => c.number === num);
        return ch ? channelPickerItem(ch) : undefined;
      }}
      onChange={(ids) => updateZone(zone.id, { channels: ids })}
      maxItems={64}
      itemNoun="channel"
      containerNoun="zone"
      onAlert={onAlert}
      fillHeight
    />
  );
};
