import React, { useState } from 'react';
import { useAlert } from '../../hooks/useAlert';
import { formatPlural } from '../../utils/formatPlural';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import type { RXGroup } from '../../models/RXGroup';
import { ListDetailLayout } from '../ui/ListDetailLayout';
import { OrderedItemPicker } from '../ui/OrderedItemPicker';
import type { PickerItem } from '../ui/pickerItems';
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

  // group.talkGroupIndices stores DMR IDs (contactNumber); rows display "index: name".
  const talkGroupItem = (tg: (typeof talkGroups)[number]): PickerItem => ({
    id: tg.contactNumber,
    label: `${tg.index}: ${tg.name}`,
    searchText: `${tg.index} ${tg.name} ${tg.contactNumber}`,
  });

  const availableItems = talkGroups
    .filter(tg =>
      !group.talkGroupIndices.includes(tg.contactNumber) &&
      tg.callType === 0x04 // Only Group Call (exclude Private Call 0x03 and All Call 0x05)
    )
    .sort((a, b) => a.index - b.index)
    .map(talkGroupItem);

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
      <OrderedItemPicker
        selectedIds={group.talkGroupIndices}
        availableItems={availableItems}
        resolveItem={(dmrId) => {
          const tg = talkGroups.find(t => t.contactNumber === dmrId);
          return tg ? talkGroupItem(tg) : undefined;
        }}
        onChange={(ids) => updateGroup(group.index, { talkGroupIndices: ids })}
        maxItems={32}
        itemNoun="talk group"
        containerNoun="RX group"
        onAlert={onAlert}
        padded={false}
      />
    </div>
  );
};
