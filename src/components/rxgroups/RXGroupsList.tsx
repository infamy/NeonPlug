import React, { useState } from 'react';
import { useAlert } from '../../hooks/useAlert';
import { formatPlural } from '../../utils/formatPlural';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import type { RXGroup } from '../../models/RXGroup';
import { ListDetailLayout } from '../ui/ListDetailLayout';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmModal } from '../ui/ConfirmModal';

export const RXGroupsList: React.FC = () => {
  const { groups, selectedGroup, setSelectedGroup, addGroup, deleteGroup, updateGroup } = useRXGroupsStore();
  const [newGroupName, setNewGroupName] = useState('');
  const [editingName, setEditingName] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [groupToDelete, setGroupToDelete] = useState<{ index: number; name: string } | null>(null);
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert();

  const handleAddGroup = () => {
    if (groups.length >= 32) {
      showAlert('Maximum of 32 RX groups allowed.');
      return;
    }
    if (newGroupName.trim()) {
      addGroup({
        name: newGroupName.trim().slice(0, 11),
        bitmask: 0,
        statusFlag: 0,
        entryFlag: 0x01,
        validationFlag: 0,
        talkGroupIndices: [],
      });
      setNewGroupName('');
    }
  };

  const selectedGroupData = groups.find(g => g.index === selectedGroup);

  const listContent =
    groups.length === 0 ? (
      <EmptyState
        message="No RX groups created"
        secondary="Create an RX group to filter talk groups"
      />
    ) : (
      <div className="divide-y divide-neon-cyan divide-opacity-20">
        {groups.map((group) => (
          <div
            key={group.index}
            onClick={() => {
              if (editingName !== group.index) {
                setSelectedGroup(group.index);
              }
            }}
            className={`p-3 cursor-pointer transition-colors ${
              selectedGroup === group.index
                ? 'bg-neon-cyan bg-opacity-20 border-l-4 border-neon-cyan'
                : 'hover:bg-deep-gray hover:bg-opacity-50'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              {editingName === group.index ? (
                <input
                  type="text"
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value.slice(0, 11))}
                  onBlur={() => {
                    if (editingNameValue.trim()) {
                      updateGroup(group.index, { name: editingNameValue.trim().slice(0, 11) });
                    }
                    setEditingName(null);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      if (editingNameValue.trim()) {
                        updateGroup(group.index, { name: editingNameValue.trim().slice(0, 11) });
                      }
                      setEditingName(null);
                    } else if (e.key === 'Escape') {
                      setEditingName(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  maxLength={11}
                  className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-sm font-medium focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full"
                />
              ) : (
                <span
                  className="text-white font-medium cursor-text"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingName(group.index);
                    setEditingNameValue(group.name);
                  }}
                  title="Double-click to edit"
                >
                  {group.name}
                </span>
              )}
              <span className="text-cool-gray text-xs">
                {group.talkGroupIndices.length} {formatPlural(group.talkGroupIndices.length, 'talk group')}
              </span>
            </div>
            {group.talkGroupIndices.length > 0 && (
              <div className="text-cool-gray text-xs mb-2">
                Talk Groups: {group.talkGroupIndices.slice(0, 5).join(', ')}
                {group.talkGroupIndices.length > 5 && ` +${group.talkGroupIndices.length - 5} more`}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupToDelete({ index: group.index, name: group.name });
                }}
                className="px-2 py-0.5 bg-red-600 bg-opacity-50 text-red-300 rounded text-xs hover:bg-opacity-70 border border-red-600 border-opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    );

  const detailContent = (
    <Card padding="none">
      <div className="p-4 border-b border-neon-cyan border-opacity-30">
        {selectedGroupData ? (
          <div className="flex items-center gap-2">
            {editingName === selectedGroupData.index ? (
              <input
                type="text"
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value.slice(0, 11))}
                onBlur={() => {
                  if (editingNameValue.trim()) {
                    updateGroup(selectedGroupData.index, { name: editingNameValue.trim().slice(0, 11) });
                  }
                  setEditingName(null);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    if (editingNameValue.trim()) {
                      updateGroup(selectedGroupData.index, { name: editingNameValue.trim().slice(0, 11) });
                    }
                    setEditingName(null);
                  } else if (e.key === 'Escape') {
                    setEditingName(null);
                  }
                }}
                autoFocus
                maxLength={11}
                className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-neon-cyan font-bold focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan flex-1"
              />
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <h3
                  className="text-neon-cyan font-bold cursor-text flex-1 select-none"
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedGroupData) {
                      setEditingName(selectedGroupData.index);
                      setEditingNameValue(selectedGroupData.name);
                    }
                  }}
                  title="Double-click to edit"
                >
                  RX Group: {selectedGroupData.name}
                </h3>
              </div>
            )}
          </div>
        ) : (
          <h3 className="text-neon-cyan font-bold">Select an RX Group</h3>
        )}
      </div>
      {selectedGroupData ? (
        <RXGroupEditor group={selectedGroupData} onAlert={showAlert} />
      ) : (
        <EmptyState
          message="Select an RX group to edit"
          secondary="RX groups filter which talk groups the radio will receive"
        />
      )}
    </Card>
  );

  return (
    <>
      <ListDetailLayout
        listTitle="RX Groups"
        listSubtitle={`${groups.length}/32 groups`}
        addInputPlaceholder="Group name..."
        addInputValue={newGroupName}
        onAddInputChange={setNewGroupName}
        onAdd={handleAddGroup}
        addDisabled={groups.length >= 32}
        addInputMaxLength={11}
        listContent={listContent}
        detailContent={detailContent}
      />
      <ConfirmModal
        isOpen={!!groupToDelete}
        onClose={() => setGroupToDelete(null)}
        onConfirm={() => {
          if (groupToDelete) {
            deleteGroup(groupToDelete.index);
            if (selectedGroup === groupToDelete.index) {
              setSelectedGroup(null);
            }
            setGroupToDelete(null);
          }
        }}
        title="Delete RX group"
        message={groupToDelete ? `Delete RX group "${groupToDelete.name}"? This cannot be undone.` : ''}
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

interface RXGroupEditorProps {
  group: RXGroup;
  onAlert: (message: string) => void;
}

const RXGroupEditor: React.FC<RXGroupEditorProps> = ({ group, onAlert }) => {
  const { updateGroup } = useRXGroupsStore();
  const { contacts: talkGroups } = useQuickContactsStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddTalkGroup = (talkGroupIndex: number) => {
    // Find the talk group by index to get its DMR ID (contactNumber)
    const talkGroup = talkGroups.find(tg => tg.index === talkGroupIndex);
    if (!talkGroup) return;
    
    if (group.talkGroupIndices.length >= 32) {
      onAlert('Maximum of 32 talk groups per RX group allowed.');
      return;
    }
    
    const dmrId = talkGroup.contactNumber;
    if (!group.talkGroupIndices.includes(dmrId)) {
      updateGroup(group.index, {
        talkGroupIndices: [...group.talkGroupIndices, dmrId].sort((a, b) => a - b),
      });
    }
  };

  const handleRemoveTalkGroup = (talkGroupIndex: number) => {
    // Find the talk group by index to get its DMR ID (contactNumber)
    const talkGroup = talkGroups.find(tg => tg.index === talkGroupIndex);
    if (!talkGroup) return;
    
    const dmrId = talkGroup.contactNumber;
    updateGroup(group.index, {
      talkGroupIndices: group.talkGroupIndices.filter(id => id !== dmrId),
    });
  };

  const handleReorderTalkGroup = (fromIndex: number, toIndex: number) => {
    // fromIndex/toIndex are array indices in groupTalkGroups array
    const newPositions = [...group.talkGroupIndices];
    const [removed] = newPositions.splice(fromIndex, 1);
    newPositions.splice(toIndex, 0, removed);
    updateGroup(group.index, { talkGroupIndices: newPositions });
  };

  const availableTalkGroups = talkGroups
    .filter(tg => {
      return !group.talkGroupIndices.includes(tg.contactNumber) && 
             tg.callType === 0x04; // Only Group Call (exclude Private Call 0x03 and All Call 0x05)
    })
    .map(tg => tg.index)
    .sort((a, b) => a - b);

  const filteredAvailableTalkGroups = searchQuery.trim()
    ? availableTalkGroups.filter((tgIndex) => {
        const talkGroup = talkGroups.find(tg => tg.index === tgIndex);
        if (!talkGroup) return false;
        
        const query = searchQuery.toLowerCase().trim();
        
        // Search in name
        if (talkGroup.name.toLowerCase().includes(query)) return true;
        
        // Search in index
        if (talkGroup.index.toString().includes(query)) return true;
        
        // Search in contact number
        if (talkGroup.contactNumber?.toString().includes(query)) return true;
        
        return false;
      })
    : availableTalkGroups;

  // Find talk groups by matching DMR ID (contactNumber)
  const groupTalkGroups = group.talkGroupIndices
    .map(dmrId => talkGroups.find(tg => tg.contactNumber === dmrId))
    .filter(tg => tg !== undefined);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <label className="text-white font-medium">Name</label>
        <input
          type="text"
          value={group.name}
          onChange={(e) => updateGroup(group.index, { name: e.target.value.slice(0, 11) })}
          maxLength={11}
          className="flex-1 bg-transparent border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
          placeholder="Enter group name"
        />
      </div>
      <div>
        <h4 className="text-white font-medium mb-2">
          Talk Groups in RX Group ({group.talkGroupIndices.length}/32)
        </h4>
        {group.talkGroupIndices.length === 0 ? (
          <p className="text-cool-gray text-sm">No talk groups in this RX group</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {groupTalkGroups.map((talkGroup, index) => (
              <div
                key={talkGroup!.index}
                className="px-3 py-2 bg-neon-cyan bg-opacity-10 border border-neon-cyan border-opacity-30 rounded flex items-center justify-between hover:bg-opacity-20"
              >
                <div className="flex items-center gap-2">
                  <span className="text-cool-gray text-xs w-8">{index + 1}.</span>
                  <span className="text-white text-xs">
                    {talkGroup!.index}: {talkGroup!.name}
                  </span>
                </div>
                <div className="flex gap-1">
                  {index > 0 && (
                    <button
                      onClick={() => handleReorderTalkGroup(index, index - 1)}
                      className="px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-neon-cyan text-xs hover:bg-opacity-50"
                      title="Move up"
                    >
                      ↑
                    </button>
                  )}
                  {index < groupTalkGroups.length - 1 && (
                    <button
                      onClick={() => handleReorderTalkGroup(index, index + 1)}
                      className="px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-neon-cyan text-xs hover:bg-opacity-50"
                      title="Move down"
                    >
                      ↓
                    </button>
                  )}
                  <button
                    onClick={() => {
                      // talkGroup.index is 1-based, handleRemoveTalkGroup expects 1-based
                      handleRemoveTalkGroup(talkGroup!.index);
                    }}
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
          Available Talk Groups ({filteredAvailableTalkGroups.length} of {availableTalkGroups.length})
        </h4>
        {availableTalkGroups.length === 0 ? (
          <p className="text-cool-gray text-sm">All talk groups are in this RX group</p>
        ) : group.talkGroupIndices.length >= 32 ? (
          <p className="text-cool-gray text-sm">RX group is full (32 talk groups maximum)</p>
        ) : (
          <>
            <div className="mb-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search talk groups..."
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
            {filteredAvailableTalkGroups.length === 0 ? (
              <p className="text-cool-gray text-sm">No talk groups match your search</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-80 overflow-y-auto">
                {filteredAvailableTalkGroups.map((tgIndex) => {
                  const talkGroup = talkGroups.find(tg => tg.index === tgIndex);
                  return (
                    <button
                      key={tgIndex}
                      onClick={() => handleAddTalkGroup(tgIndex)}
                      className="px-3 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-xs hover:bg-opacity-50 hover:border-neon-cyan transition-colors"
                    >
                      {tgIndex}: {talkGroup?.name || 'Unknown'}
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
