import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useScanListsStore } from '../../store/scanListsStore';
import { useChannelsStore } from '../../store/channelsStore';
import type { ScanList } from '../../models/ScanList';
import type { Channel } from '../../models/Channel';
import { ListDetailLayout } from '../ui/ListDetailLayout';
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
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const selectedScanListData = scanLists.find(sl => sl.name === selectedScanList);

  const handleAddScanList = () => {
    if (scanLists.length >= 32) {
      setAlertMessage('Maximum of 32 scan lists allowed.');
      setAlertOpen(true);
      return;
    }
    if (!newScanListName.trim()) {
      return;
    }
    // Check if name already exists
    if (scanLists.some(sl => sl.name === newScanListName.trim())) {
      setAlertMessage('A scan list with this name already exists.');
      setAlertOpen(true);
      return;
    }
    const scanListName = newScanListName.trim().slice(0, 16);
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
      setAlertMessage('Invalid scan list name or name already exists. Scan list names must be 1-16 characters and unique.');
      setAlertOpen(true);
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
                    maxLength={16}
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
                    {scanList.channels.length} channel{scanList.channels.length !== 1 ? 's' : ''}
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
        <ScanListEditor scanList={selectedScanListData} onAlert={(msg) => { setAlertMessage(msg); setAlertOpen(true); }} />
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
        addInputMaxLength={16}
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
        onClose={() => setAlertOpen(false)}
        title="Notice"
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(true);

  const handleAddChannel = (channelNumber: number) => {
    if (scanList.channels.length >= 15) {
      onAlert('Maximum of 15 channels per scan list allowed.');
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

  // Get sorted list of channels for dropdowns
  const sortedChannels = [...channels].sort((a, b) => a.number - b.number);

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

              {/* Hang Time */}
              <div>
                <label className="block text-cool-gray text-xs mb-1">Hang Time (tenths of second)</label>
                <input
                  type="number"
                  min={1}
                  max={255}
                  value={scanList.hangTime || 30}
                  onChange={(e) => updateScanList(scanList.name, { hangTime: parseInt(e.target.value) || 30 })}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-neon-cyan"
                  placeholder="30 = 3.0s"
                />
                <p className="text-cool-gray text-xs mt-0.5">{((scanList.hangTime || 30) / 10).toFixed(1)}s</p>
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
                <p className="text-cool-gray text-xs mt-0.5">ENCODED (stored as value-2)</p>
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

                {/* Priority Channel 1 */}
                <div>
                  <label className="block text-cool-gray text-xs mb-1">Priority Channel 1</label>
                  <SearchableChannelSelect
                    value={scanList.priorityChannel1}
                    onChange={(value) => updateScanList(scanList.name, { priorityChannel1: value })}
                    channels={sortedChannels}
                    disabled={(scanList.priority1Type || 0) !== 2}
                    placeholder="Select channel..."
                  />
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

                {/* Priority Channel 2 */}
                <div>
                  <label className="block text-cool-gray text-xs mb-1">Priority Channel 2</label>
                  <SearchableChannelSelect
                    value={scanList.priorityChannel2}
                    onChange={(value) => updateScanList(scanList.name, { priorityChannel2: value })}
                    channels={sortedChannels}
                    disabled={(scanList.priority2Type || 0) !== 2}
                    placeholder="Select channel..."
                  />
                  <p className="text-cool-gray text-xs mt-0.5">ENCODED (stored as value-2)</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Channels Section */}
      <div>
        <h4 className="text-white font-medium mb-2">
          Channels in Scan List ({scanList.channels.length}/15)
        </h4>
        {scanList.channels.length === 0 ? (
          <p className="text-cool-gray text-sm">No channels in this scan list</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
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
        ) : scanList.channels.length >= 15 ? (
          <p className="text-cool-gray text-sm">Scan list is full (15 channels maximum)</p>
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
              <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
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

