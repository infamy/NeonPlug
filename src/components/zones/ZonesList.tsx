import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import React, { useState } from 'react';
import { useAlert } from '../../hooks/useAlert';
import { formatPlural } from '../../utils/formatPlural';
import { useZonesStore } from '../../store/zonesStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useRadioStore } from '../../store/radioStore';
import type { Zone } from '../../models/Zone';
import { ListDetailLayout } from '../ui/ListDetailLayout';
import { OrderedItemPicker } from '../ui/OrderedItemPicker';
import { channelPickerItem } from '../ui/pickerItems';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmModal } from '../ui/ConfirmModal';

/** One of the two per-zone VFO channel pickers. Hoisted, not nested in its
 *  parent's render: a component defined inside a render is a new type on every
 *  pass, so React unmounts and remounts the <select> and the dropdown closes
 *  the moment the store updates. */
const ZoneChannelSelect: React.FC<{
  title: string;
  position: number;
  zone: Zone;
  label: (number: number) => string;
  onChange: (position: number) => void;
}> = ({ title, position, zone, label, onChange }) => (
  <div>
    <label className="block text-cool-gray text-xs mb-1">{title}</label>
    <select
      value={position}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-neon-cyan"
    >
      {position >= zone.channels.length && <option value={position}>Not set</option>}
      {zone.channels.map((number, index) => (
        <option key={`${number}-${index}`} value={index}>
          {label(number)}
        </option>
      ))}
    </select>
  </div>
);

/**
 * The zone's current A and B channel — what the radio has tuned on each VFO
 * when this zone is selected.
 *
 * Stored per zone as a POSITION within that zone's own member list, not as a
 * channel number, so it must be resolved through `zone.channels` and is
 * meaningless against any other zone. Editing therefore writes a position back,
 * not a channel number, and reordering the zone's channels moves what A and B
 * point at — which is how the radio itself behaves.
 *
 * A position past the end of the member list renders as "Not set" rather than
 * being clamped to a real channel: the radio can hold one (a zone shrunk since
 * the value was written), and quietly showing channel 1 instead would be a
 * claim about the radio that is not true.
 */
const ZoneCurrentChannels: React.FC<{ zone: Zone }> = ({ zone }) => {
  const { d890ZoneCurrentChannels, setD890ZoneCurrentChannels } = useRadioStore();
  const { channels } = useChannelsStore();
  const { zones, updateZone } = useZonesStore();

  // Index against the store's own array: the list pane filters out unnamed
  // zones, so a render position from there would be the wrong zone.
  const zoneIndex = zones.findIndex((z) => z.id === zone.id);
  const showHidden = zone.hidden !== undefined;
  const showChannels = !!d890ZoneCurrentChannels && zoneIndex >= 0;
  if (!showHidden && !showChannels) return null;

  const label = (number: number): string => {
    const channel = channels.find((c) => c.number === number);
    return channel ? `${number} · ${channel.name}` : `${number}`;
  };

  const update = (which: 'a' | 'b', position: number) => {
    // Only reachable from the A/B selects, which render only when this is set.
    if (!d890ZoneCurrentChannels) return;
    const next = {
      a: [...d890ZoneCurrentChannels.a],
      b: [...d890ZoneCurrentChannels.b],
    };
    next[which][zoneIndex] = position;
    setD890ZoneCurrentChannels(next);
  };

  return (
    // shrink-0: this sits in a flex column beside a fillHeight picker, which
    // otherwise compresses it below its own content and the overflow-hidden
    // above clips the last row — the hide checkbox.
    <div className="m-4 mb-0 shrink-0 bg-neon-cyan bg-opacity-5 border border-neon-cyan border-opacity-30 rounded-lg overflow-hidden">
      <div className="p-3 pb-2">
        <h4 className="text-neon-cyan font-medium">Zone Settings</h4>
        <p className="text-cool-gray text-xs mt-0.5">
          The channel each VFO tunes to when this zone is selected, and whether the zone
          appears on the radio at all.
        </p>
      </div>
      {showChannels && d890ZoneCurrentChannels && (
      <div className="p-4 pt-0 grid grid-cols-2 gap-4">
        <ZoneChannelSelect
          title="Current Channel A"
          position={d890ZoneCurrentChannels.a[zoneIndex] ?? 0}
          zone={zone}
          label={label}
          onChange={(p) => update('a', p)}
        />
        <ZoneChannelSelect
          title="Current Channel B"
          position={d890ZoneCurrentChannels.b[zoneIndex] ?? 0}
          zone={zone}
          label={label}
          onChange={(p) => update('b', p)}
        />
      </div>
      )}
      {/* Buried several levels down in the vendor CPS's zone editor. Surfaced
          plainly here — it changes whether the zone appears on the radio at
          all, which is not a thing to make people hunt for. */}
      {showHidden && (
        <div className="px-4 pb-3 pt-1 flex items-center gap-2">
          <input
            id={`zone-hidden-${zone.id}`}
            type="checkbox"
            checked={zone.hidden === true}
            onChange={(e) => updateZone(zone.id, { hidden: e.target.checked })}
            className="checkbox-theme"
          />
          <label htmlFor={`zone-hidden-${zone.id}`} className="text-cool-gray text-xs">
            Hide this zone from the radio&apos;s zone menu
          </label>
        </div>
      )}
    </div>
  );
};

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
                    <span className={`font-medium ${zone.hidden ? 'text-cool-gray italic' : 'text-white'}`}>
                      {zone.name}
                    </span>
                    {/* Hidden zones still exist and still hold their channels —
                        they are simply absent from the radio's zone menu. Dimmed
                        and badged rather than removed, so the list still matches
                        the codeplug. */}
                    {zone.hidden && (
                      <span
                        className="text-[10px] uppercase tracking-wide text-amber-400 border border-amber-400 border-opacity-40 rounded px-1 py-px"
                        title="Hidden from the radio's zone menu — the zone and its channels still exist"
                      >
                        hidden
                      </span>
                    )}
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
  // Per-radio limit, not a hardcoded DM-32 value.
  const { caps } = useRadioCapabilities();
  const { updateZone } = useZonesStore();
  const { channels } = useChannelsStore();

  const availableItems = channels
    .filter(ch => !zone.channels.includes(ch.number))
    .sort((a, b) => a.number - b.number)
    .map(channelPickerItem);

  return (
    <div className="flex flex-col h-full">
      <ZoneCurrentChannels zone={zone} />
      <OrderedItemPicker
      selectedIds={zone.channels}
      availableItems={availableItems}
      resolveItem={(num) => {
        const ch = channels.find(c => c.number === num);
        return ch ? channelPickerItem(ch) : undefined;
      }}
      onChange={(ids) => updateZone(zone.id, { channels: ids })}
      maxItems={caps?.maxZoneChannels ?? 64}
      itemNoun="channel"
      containerNoun="zone"
      onAlert={onAlert}
      fillHeight
      />
    </div>
  );
};
