import React, { useState } from 'react';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import type { DMRRadioID } from '../../models/DMRRadioID';

export const MessagesAndGroupsTab: React.FC = () => {
  const { messages, messagesLoaded } = useQuickMessagesStore();
  const { radioIds, radioIdsLoaded, updateRadioId } = useDMRRadioIDsStore();
  const { groups: rxGroups, groupsLoaded: rxGroupsLoaded } = useRXGroupsStore();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDmrId, setEditDmrId] = useState('');

  const MAX_DMR_RADIO_IDS = 5;

  const handleEdit = (radioId: DMRRadioID) => {
    setEditingId(radioId.index);
    setEditName(radioId.name);
    setEditDmrId(radioId.dmrId);
  };

  const handleSave = (index: number) => {
    const dmrIdValue = parseInt(editDmrId, 10);
    if (isNaN(dmrIdValue) || dmrIdValue < 0 || dmrIdValue > 0xFFFFFF) {
      alert('DMR ID must be a number between 0 and 16777215');
      return;
    }

    updateRadioId(index, {
      name: editName.trim(),
      dmrId: editDmrId.trim(),
      dmrIdValue: dmrIdValue,
      dmrIdBytes: new Uint8Array([
        dmrIdValue & 0xFF,
        (dmrIdValue >> 8) & 0xFF,
        (dmrIdValue >> 16) & 0xFF,
      ]),
    });

    setEditingId(null);
    setEditName('');
    setEditDmrId('');
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditName('');
    setEditDmrId('');
  };

  return (
    <div className="h-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neon-cyan mb-2">Messages & Groups</h2>
        <p className="text-cool-gray text-sm">
          Manage quick text messages and DMR RX groups for your radio.
        </p>
      </div>

      {/* Quick Messages Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-neon-magenta">Quick Text Messages</h3>
          {messagesLoaded && (
            <div className="text-cool-gray text-sm">
              {messages.length} message{messages.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {!messagesLoaded ? (
          <div className="border border-deep-gray rounded-lg p-6 bg-deep-gray">
            <div className="text-center">
              <p className="text-cool-gray">
                Quick messages will be loaded when you read from the radio.
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="border border-deep-gray rounded-lg p-6 bg-deep-gray">
            <p className="text-cool-gray text-center">No quick messages found on the radio.</p>
          </div>
        ) : (
          <div className="border border-deep-gray rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-deep-gray border-b border-deep-gray">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Index</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Message</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Flag</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Check Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-deep-gray">
                  {messages.map((message) => (
                    <tr key={message.index} className="hover:bg-deep-gray transition-colors">
                      <td className="px-4 py-3 text-cool-gray">{message.index}</td>
                      <td className="px-4 py-3 text-white">{message.text}</td>
                      <td className="px-4 py-3 text-cool-gray">0x{message.flag.toString(16).padStart(2, '0')}</td>
                      <td className="px-4 py-3 text-cool-gray">0x{message.checkValue.toString(16).padStart(4, '0')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DMR Radio IDs Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-neon-magenta">DMR Radio IDs</h3>
          {radioIdsLoaded && (
            <div className="text-cool-gray text-sm">
              {radioIds.length} / {MAX_DMR_RADIO_IDS} ID{radioIds.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {!radioIdsLoaded ? (
          <div className="border border-deep-gray rounded-lg p-6 bg-deep-gray">
            <div className="text-center">
              <p className="text-cool-gray">
                DMR Radio IDs will be loaded when you read from the radio.
              </p>
            </div>
          </div>
        ) : (
          <div className="border border-deep-gray rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-deep-gray border-b border-deep-gray">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">DMR ID</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-deep-gray">
                  {radioIds.slice(0, MAX_DMR_RADIO_IDS).map((radioId) => (
                    <tr key={radioId.index} className="hover:bg-deep-gray transition-colors">
                      {editingId === radioId.index ? (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              maxLength={12}
                              className="w-full px-2 py-1 bg-dark-charcoal text-white border border-neon-cyan rounded focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                              placeholder="Name (max 12 chars)"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={editDmrId}
                              onChange={(e) => setEditDmrId(e.target.value)}
                              min="0"
                              max="16777215"
                              className="w-full px-2 py-1 bg-dark-charcoal text-white border border-neon-cyan rounded focus:outline-none focus:ring-2 focus:ring-neon-cyan font-mono"
                              placeholder="DMR ID (0-16777215)"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSave(radioId.index)}
                                className="px-3 py-1 bg-neon-cyan text-dark-charcoal rounded hover:bg-neon-cyan-bright transition-colors text-sm font-semibold"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancel}
                                className="px-3 py-1 bg-deep-gray text-cool-gray rounded hover:bg-gray-700 transition-colors text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-white">{radioId.name}</td>
                          <td className="px-4 py-3 text-white font-mono">{radioId.dmrId}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleEdit(radioId)}
                              className="px-3 py-1 bg-neon-magenta text-dark-charcoal rounded hover:bg-neon-magenta-bright transition-colors text-sm font-semibold"
                            >
                              Edit
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {radioIds.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-cool-gray text-center">
                        No DMR Radio IDs found on the radio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {radioIds.length > MAX_DMR_RADIO_IDS && (
              <div className="px-4 py-2 bg-yellow-900/20 border-t border-yellow-600/30">
                <p className="text-yellow-400 text-sm">
                  Warning: Radio only supports {MAX_DMR_RADIO_IDS} DMR Radio IDs. Only the first {MAX_DMR_RADIO_IDS} are shown.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DMR RX Groups Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-neon-magenta">DMR RX Groups</h3>
          {rxGroupsLoaded && (
            <div className="text-cool-gray text-sm">
              {rxGroups.length} group{rxGroups.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {!rxGroupsLoaded ? (
          <div className="border border-deep-gray rounded-lg p-6 bg-deep-gray">
            <div className="text-center">
              <p className="text-cool-gray">
                DMR RX Groups will be loaded when you read from the radio.
              </p>
            </div>
          </div>
        ) : rxGroups.length === 0 ? (
          <div className="border border-deep-gray rounded-lg p-6 bg-deep-gray">
            <p className="text-cool-gray text-center">No DMR RX Groups found on the radio.</p>
          </div>
        ) : (
          <div className="border border-deep-gray rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-deep-gray border-b border-deep-gray">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Index</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Bitmask</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Contact IDs</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-neon-cyan">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-deep-gray">
                  {rxGroups.map((group) => (
                    <tr key={group.index} className="hover:bg-deep-gray transition-colors">
                      <td className="px-4 py-3 text-cool-gray">{group.index}</td>
                      <td className="px-4 py-3 text-white">{group.name}</td>
                      <td className="px-4 py-3 text-cool-gray font-mono">0x{group.bitmask.toString(16).padStart(8, '0')}</td>
                      <td className="px-4 py-3 text-white">
                        {group.contactIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {group.contactIds.map((id, idx) => (
                              <span key={idx} className="px-2 py-1 bg-dark-charcoal rounded text-sm font-mono">
                                {id}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-cool-gray">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-cool-gray">
                        <div className="text-xs">
                          <div>Flag: 0x{group.entryFlag.toString(16).padStart(2, '0')}</div>
                          <div>Status: 0x{group.statusFlag.toString(16).padStart(2, '0')}</div>
                          <div>Valid: 0x{group.validationFlag.toString(16).padStart(2, '0')}</div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

