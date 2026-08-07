import React, { useState, useRef, useEffect } from 'react';
import { useAlert } from '../../hooks/useAlert';
import { formatPlural } from '../../utils/formatPlural';
import { createPortal } from 'react-dom';
import { useScanListsStore } from '../../store/scanListsStore';
import { useChannelsStore } from '../../store/channelsStore';
import type { ScanList } from '../../models/ScanList';
import type { Channel } from '../../models/Channel';
import { ListDetailLayout } from '../ui/ListDetailLayout';
import { OrderedItemPicker } from '../ui/OrderedItemPicker';
import { channelPickerItem } from '../ui/pickerItems';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmModal } from '../ui/ConfirmModal';

export const ScanListsList: React.FC = () => {
  const { scanLists, selectedScanList, setSelectedScanList, addScanList, deleteScanList, renameScanList } = useScanListsStore();
  const [newScanListName, setNewScanListName] = useState('');
  const [editingScanList, setEditingScanList] = useState<string | null>(null);
  const [editScanListName, setEditScanListName] = useState('');
  const [scanListToDelete, setScanListToDelete] = useState<string | null>(null);
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert();

  const selectedScanListData = scanLists.find(sl => sl.name === selectedScanList);

  const handleAddScanList = () => {
    if (scanLists.length >= 32) {
      showAlert('Maximum of 32 scan lists allowed.');
      return;
    }
    if (!newScanListName.trim()) {
      return;
    }
    // Check if name already exists
    if (scanLists.some(sl => sl.name === newScanListName.trim())) {
      showAlert('A scan list with this name already exists.');
      return;
    }
    const scanListName = newScanListName.trim().slice(0, 11);
    addScanList({
      name: scanListName,
      ctcScanMode: 0,
      scanTxMode: 0,
      channels: [],
    });
    setNewScanListName('');
    // Auto-select the newly created scan list so user can immediately add channels
    setSelectedScanList(scanListName);
  };

  const handleDeleteScanListClick = (name: string) => {
    setScanListToDelete(name);
  };
  const handleDeleteScanListConfirm = () => {
    if (scanListToDelete) {
      deleteScanList(scanListToDelete);
      if (selectedScanList === scanListToDelete) {
        setSelectedScanList(null);
      }
      setScanListToDelete(null);
    }
  };

  const handleStartEdit = (scanListName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingScanList(scanListName);
    setEditScanListName(scanListName);
  };

  const handleSaveEdit = (oldName: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const success = renameScanList(oldName, editScanListName);
    if (success) {
      setEditingScanList(null);
      setEditScanListName('');
    } else {
      showAlert('Invalid scan list name or name already exists. Scan list names must be 1-11 characters and unique.');
    }
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingScanList(null);
    setEditScanListName('');
  };

  const listContent =
    scanLists.length === 0 ? (
      <EmptyState
        message="No scan lists loaded"
        secondary="Read from radio to view scan lists"
      />
    ) : (
      <div className="divide-y divide-neon-cyan divide-opacity-20">
        {scanLists.map((scanList, index) => (
          <div
            key={`${scanList.name}-${index}`}
            onClick={() => editingScanList !== scanList.name && setSelectedScanList(scanList.name)}
            className={`p-3 transition-colors ${
              editingScanList === scanList.name
                ? 'bg-deep-gray-light'
                : selectedScanList === scanList.name
                  ? 'bg-neon-cyan bg-opacity-20 border-l-4 border-neon-cyan cursor-pointer'
                  : 'hover:bg-deep-gray hover:bg-opacity-50 cursor-pointer'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              {editingScanList === scanList.name ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editScanListName}
                    onChange={(e) => setEditScanListName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveEdit(scanList.name);
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-transparent border border-neon-cyan rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    maxLength={11}
                    autoFocus
                  />
                  <button
                    onClick={(e) => handleSaveEdit(scanList.name, e)}
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
                  <span className="text-white font-medium">{scanList.name}</span>
                  <span className="text-cool-gray text-xs">
                    {scanList.channels.length} {formatPlural(scanList.channels.length, 'channel')}
                  </span>
                </>
              )}
            </div>
            {editingScanList !== scanList.name && (
              <>
                {scanList.channels.length > 0 && (
                  <div className="text-cool-gray text-xs mb-2">
                    Channels: {scanList.channels.slice(0, 5).join(', ')}
                    {scanList.channels.length > 5 && ` +${scanList.channels.length - 5} more`}
                  </div>
                )}
                <div className="flex gap-2 justify-end mt-2">
                  <button
                    onClick={(e) => handleStartEdit(scanList.name, e)}
                    className="px-2 py-0.5 bg-neon-cyan bg-opacity-50 text-neon-cyan rounded text-xs hover:bg-opacity-70 border border-neon-cyan border-opacity-50"
                  >
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteScanListClick(scanList.name);
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
    <Card padding="none">
      <div className="p-4 border-b border-neon-cyan border-opacity-30">
        <SectionTitle as="h3" size="md" bold>
          {selectedScanListData ? `Scan List: ${selectedScanListData.name}` : 'Select a Scan List'}
        </SectionTitle>
      </div>
      {selectedScanListData ? (
        <ScanListEditor scanList={selectedScanListData} onAlert={showAlert} />
      ) : (
        <EmptyState
          message="Select a scan list to edit"
          secondary="Scan lists define which channels to scan"
        />
      )}
    </Card>
  );

  return (
    <>
      <ListDetailLayout
        listTitle="Scan Lists"
        listSubtitle={`${scanLists.length}/32 scan lists`}
        addInputPlaceholder="Scan list name..."
        addInputValue={newScanListName}
        onAddInputChange={setNewScanListName}
        onAdd={handleAddScanList}
        addDisabled={scanLists.length >= 32}
        addInputMaxLength={11}
        listContent={listContent}
        detailContent={detailContent}
      />
      <ConfirmModal
        isOpen={!!scanListToDelete}
        onClose={() => setScanListToDelete(null)}
        onConfirm={handleDeleteScanListConfirm}
        title="Delete scan list"
        message={scanListToDelete ? `Are you sure you want to delete scan list "${scanListToDelete}"? This cannot be undone.` : ''}
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

interface SearchableChannelSelectProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  channels: Channel[];
  placeholder?: string;
  disabled?: boolean;
  includeNone?: boolean;
  includeCurrent?: boolean;
}

const SearchableChannelSelect: React.FC<SearchableChannelSelectProps> = ({
  value,
  onChange,
  channels,
  placeholder = 'Select channel...',
  disabled = false,
  includeNone = false,
  includeCurrent = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sortedChannels = [...channels].sort((a, b) => a.number - b.number);

  const filteredChannels = searchQuery.trim()
    ? sortedChannels.filter((ch) => {
        const query = searchQuery.toLowerCase();
        return (
          ch.number.toString().includes(query) ||
          ch.name.toLowerCase().includes(query)
        );
      })
    : sortedChannels;

  const selectedChannel = channels.find(ch => ch.number === value);
  const displayValue = value === 0 && includeNone
    ? 'None'
    : value === 1 && includeCurrent
    ? 'Current Channel'
    : selectedChannel
    ? selectedChannel.name
    : placeholder;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Update dropdown position when opened
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (channelNumber: number | undefined) => {
    onChange(channelNumber);
    setIsOpen(false);
    setSearchQuery('');
  };

  const dropdownContent = isOpen && !disabled && (
    <div 
      ref={dropdownRef}
      className="fixed z-[9999] bg-deep-gray border border-neon-cyan border-opacity-50 rounded shadow-2xl overflow-hidden"
      style={{
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        width: `${dropdownPosition.width}px`,
      }}
    >
      <div className="p-2 border-b border-neon-cyan border-opacity-30">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search channels..."
          autoFocus
          className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-neon-cyan"
        />
      </div>
      <div className="overflow-y-auto max-h-48">
            {!searchQuery.trim() && includeNone && (
              <button
                type="button"
                onClick={() => handleSelect(0)}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-neon-cyan hover:bg-opacity-20 transition-colors ${
                  value === 0 ? 'bg-neon-cyan bg-opacity-20 text-neon-cyan' : 'text-white'
                }`}
              >
                None
              </button>
            )}
            {!searchQuery.trim() && includeCurrent && (
              <button
                type="button"
                onClick={() => handleSelect(1)}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-neon-cyan hover:bg-opacity-20 transition-colors ${
                  value === 1 ? 'bg-neon-cyan bg-opacity-20 text-neon-cyan' : 'text-white'
                }`}
              >
                Current Channel
              </button>
            )}
            {filteredChannels.length === 0 ? (
              <div className="px-3 py-2 text-cool-gray text-xs">No channels found</div>
            ) : (
              filteredChannels.map((ch) => (
                <button
                  key={ch.number}
                  type="button"
                  onClick={() => handleSelect(ch.number)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-neon-cyan hover:bg-opacity-20 transition-colors ${
                    value === ch.number ? 'bg-neon-cyan bg-opacity-20 text-neon-cyan' : 'text-white'
                  }`}
                >
                  {ch.name}
                </button>
              ))
            )}
          </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-neon-cyan disabled:opacity-50 text-left flex items-center justify-between"
      >
        <span className={value ? 'text-white' : 'text-cool-gray'}>{displayValue}</span>
        <span className="text-cool-gray ml-2">▼</span>
      </button>
      {isOpen && !disabled && createPortal(dropdownContent, document.body)}
    </>
  );
};

interface ScanListEditorProps {
  scanList: ScanList;
  onAlert: (message: string) => void;
}

const ScanListEditor: React.FC<ScanListEditorProps> = ({ scanList, onAlert }) => {
  const { updateScanList } = useScanListsStore();
  const { channels } = useChannelsStore();
  const [showSettings, setShowSettings] = useState(true);

  const availableItems = channels
    .filter(ch => !scanList.channels.includes(ch.number))
    .sort((a, b) => a.number - b.number)
    .map(channelPickerItem);

  // Get sorted list of channels for dropdowns
  const sortedChannels = [...channels].sort((a, b) => a.number - b.number);

  // Priority channels must be members of the scan list — the OEM CPS enforces
  // this, and the radio ignores a priority channel that isn't in the list
  // (hardware-observed 2026-08-07). They are picked via the P1/P2 buttons on
  // the member rows below.
  const priorityLabel = (num?: number) =>
    num !== undefined ? (channels.find(c => c.number === num)?.name ?? `Ch ${num}`) : 'None';

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-250px)]">
      {/* Scan List Settings - Collapsible */}
      <div className="bg-neon-cyan bg-opacity-5 border border-neon-cyan border-opacity-30 rounded-lg overflow-hidden">
        <div 
          className="p-3 flex justify-between items-center cursor-pointer hover:bg-neon-cyan hover:bg-opacity-10 transition-colors"
          onClick={() => setShowSettings(!showSettings)}
        >
          <h4 className="text-neon-cyan font-medium">Scan List Settings</h4>
          <span className="text-neon-cyan text-sm">{showSettings ? '▼' : '▶'}</span>
        </div>
        
        {showSettings && (
          <div className="p-4 pt-0 space-y-3 relative">
            <div className="grid grid-cols-2 gap-4 relative">
              {/* CTC Scan Mode */}
              <div>
                <label className="block text-cool-gray text-xs mb-1">CTC Scan Mode</label>
                <select
                  value={scanList.ctcScanMode}
                  onChange={(e) => updateScanList(scanList.name, { ctcScanMode: parseInt(e.target.value) })}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-neon-cyan"
                >
                  <option value={0}>Not Detection CTC</option>
                  <option value={1}>Detection CTC Non Priority</option>
                  <option value={2}>Detection CTC Priority</option>
                  <option value={3}>Detection CTC</option>
                </select>
              </div>

              {/* Scan TX Mode */}
              <div>
                <label className="block text-cool-gray text-xs mb-1">Scan TX Mode</label>
                <select
                  value={scanList.scanTxMode}
                  onChange={(e) => updateScanList(scanList.name, { scanTxMode: parseInt(e.target.value) })}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-neon-cyan"
                >
                  <option value={0}>Current Channel</option>
                  <option value={1}>Last Active Channel</option>
                  <option value={2}>Designed Channel</option>
                </select>
              </div>

              {/* Hang Time — raw byte is 0.5s per step */}
              <div>
                <label className="block text-cool-gray text-xs mb-1">
                  Hang Time
                  <span className="text-neon-cyan ml-2">{((scanList.hangTime || 6) * 0.5).toFixed(1)}s</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={60}
                  step={1}
                  value={scanList.hangTime || 6}
                  onChange={(e) => updateScanList(scanList.name, { hangTime: parseInt(e.target.value) || 6 })}
                  className="w-full accent-neon-cyan"
                />
                <div className="flex justify-between text-cool-gray text-[10px]">
                  <span>0.5s</span>
                  <span>30s</span>
                </div>
              </div>

              {/* Designated TX Channel */}
              <div>
                <label className="block text-cool-gray text-xs mb-1">Designated TX Channel</label>
                <SearchableChannelSelect
                  value={scanList.designatedTxChannel}
                  onChange={(value) => updateScanList(scanList.name, { designatedTxChannel: value || 0 })}
                  channels={sortedChannels}
                  includeNone={true}
                  includeCurrent={true}
                />
                <p className="text-cool-gray text-xs mt-0.5">Not written to radio yet — storage offset unverified</p>
              </div>
            </div>

            {/* Priority Settings */}
            <div className="pt-2 border-t border-neon-cyan border-opacity-20">
              <h5 className="text-white text-xs font-medium mb-2">Priority Settings</h5>
              <div className="grid grid-cols-2 gap-4">
                {/* Priority 1 Type */}
                <div>
                  <label className="block text-cool-gray text-xs mb-1">Priority 1 Type</label>
                  <select
                    value={scanList.priority1Type || 0}
                    onChange={(e) => updateScanList(scanList.name, { priority1Type: parseInt(e.target.value) })}
                    className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-neon-cyan"
                  >
                    <option value={0}>None</option>
                    <option value={1}>Current Channel</option>
                    <option value={2}>Specific Channel</option>
                  </select>
                </div>

                {/* Priority 2 Type */}
                <div>
                  <label className="block text-cool-gray text-xs mb-1">Priority 2 Type</label>
                  <select
                    value={scanList.priority2Type || 0}
                    onChange={(e) => updateScanList(scanList.name, { priority2Type: parseInt(e.target.value) })}
                    className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-neon-cyan"
                  >
                    <option value={0}>None</option>
                    <option value={1}>Current Channel</option>
                    <option value={2}>Specific Channel</option>
                  </select>
                </div>
              </div>
              <p className="text-cool-gray text-xs mt-2">
                Tip: set a type to “Specific Channel”, then use the P1 / P2 buttons on the
                channel rows below to pick the priority channels.
                {(scanList.priority1Type || 0) === 2 && (
                  <span className="text-neon-cyan"> P1: {priorityLabel(scanList.priorityChannel1)}.</span>
                )}
                {(scanList.priority2Type || 0) === 2 && (
                  <span className="text-neon-cyan"> P2: {priorityLabel(scanList.priorityChannel2)}.</span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Channels Section */}
      <OrderedItemPicker
        selectedIds={scanList.channels}
        availableItems={availableItems}
        resolveItem={(num) => {
          const ch = channels.find(c => c.number === num);
          return ch ? channelPickerItem(ch) : undefined;
        }}
        onChange={(ids) => updateScanList(scanList.name, { channels: ids })}
        maxItems={15}
        itemNoun="channel"
        containerNoun="scan list"
        onAlert={onAlert}
        padded={false}
        renderRowExtras={(id) => {
          const p1Enabled = (scanList.priority1Type || 0) === 2;
          const p2Enabled = (scanList.priority2Type || 0) === 2;
          const isP1 = p1Enabled && scanList.priorityChannel1 === id;
          const isP2 = p2Enabled && scanList.priorityChannel2 === id;
          const chipBase = 'px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors';
          const chipClass = (enabled: boolean, active: boolean) =>
            !enabled
              ? `${chipBase} bg-transparent text-cool-gray border-cool-gray border-opacity-20 opacity-30 cursor-not-allowed`
              : active
                ? `${chipBase} bg-neon-cyan text-dark-charcoal border-neon-cyan`
                : `${chipBase} bg-transparent text-cool-gray border-cool-gray border-opacity-40 hover:text-neon-cyan hover:border-neon-cyan`;
          return (
            <div className="flex gap-1 mr-1">
              <button
                disabled={!p1Enabled}
                onClick={() =>
                  p1Enabled &&
                  updateScanList(scanList.name, { priorityChannel1: isP1 ? undefined : id })
                }
                className={chipClass(p1Enabled, isP1)}
                title={
                  !p1Enabled
                    ? 'Set Priority 1 Type to "Specific Channel" to enable'
                    : isP1
                      ? 'Clear Priority 1'
                      : 'Set as Priority Channel 1'
                }
              >
                P1
              </button>
              <button
                disabled={!p2Enabled}
                onClick={() =>
                  p2Enabled &&
                  updateScanList(scanList.name, { priorityChannel2: isP2 ? undefined : id })
                }
                className={chipClass(p2Enabled, isP2)}
                title={
                  !p2Enabled
                    ? 'Set Priority 2 Type to "Specific Channel" to enable'
                    : isP2
                      ? 'Clear Priority 2'
                      : 'Set as Priority Channel 2'
                }
              >
                P2
              </button>
            </div>
          );
        }}
      />
    </div>
  );
};

