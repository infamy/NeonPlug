import React, { useEffect, useMemo, useState } from 'react';
import { useAlert } from '../../hooks/useAlert';
import { useRadioStore } from '../../store/radioStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useEncryptionKeysStore } from '../../store/encryptionKeysStore';
import { useDigitalEmergencyStore } from '../../store/digitalEmergencyStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import { useChannelsStore } from '../../store/channelsStore';
import { isValidDMRId } from '../../services/validation/dmrValidator';
import { RXGroupsList } from '../rxgroups/RXGroupsList';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmModal } from '../ui/ConfirmModal';
import type { EncryptionKey } from '../../models/EncryptionKey';
import { LIMITS } from '../../radios/dm32uv/constants';
import {
  ENCRYPTION_TYPES,
  clearEncryptionKey,
  editEncryptionKey,
  encryptionTypeLabel,
  isEncryptionTypeLocked,
} from '../../utils/encryptionKeys';

const DEFAULT_TALK_GROUPS_MAX = 800;
const DEFAULT_DMR_RADIO_IDS_MAX = 250;

export const DigitalTab: React.FC = () => {
  const { blockMetadata, blockData } = useRadioStore();
  const { caps } = useRadioCapabilities();
  const limits = caps?.digital?.limits;
  const talkGroupsMax = limits?.TALK_GROUPS_MAX ?? DEFAULT_TALK_GROUPS_MAX;
  const dmrRadioIdsMax = limits?.DMR_RADIO_IDS_MAX ?? DEFAULT_DMR_RADIO_IDS_MAX;
  const { keys, keysLoaded, setKeys, updateKey } = useEncryptionKeysStore();
  const { systems: digitalEmergencies, setSystems: setDigitalEmergencies, setConfig: setDigitalEmergencyConfig, updateSystem, addSystem: addDigitalEmergency, deleteSystem: deleteDigitalEmergency } = useDigitalEmergencyStore();
  const { radioIds, radioIdsLoaded, updateRadioId, addRadioId, deleteRadioId } = useDMRRadioIDsStore();
  const { contacts: quickContacts, contactsLoaded: quickContactsLoaded, updateContact, addContact, deleteContact, setMaxTalkGroups } = useQuickContactsStore();
  const { groupsLoaded: rxGroupsLoaded } = useRXGroupsStore();
  const { messages, messagesLoaded, updateMessage, addMessage, deleteMessage } = useQuickMessagesStore();
  const { channels } = useChannelsStore();

  // Find block with metadata 0x10 (Encryption Keys)
  const block10Address = useMemo(() => {
    for (const [address, metadata] of blockMetadata.entries()) {
      if (metadata.metadata === 0x10) {
        return address;
      }
    }
    return null;
  }, [blockMetadata]);

  const block10Data = block10Address !== null ? blockData.get(block10Address) : null;

  // Digital Emergency is also in block 0x10 (same block as encryption keys, different offset)

  // Sync max talk groups from capabilities when radio/model changes
  useEffect(() => {
    setMaxTalkGroups(talkGroupsMax);
  }, [talkGroupsMax, setMaxTalkGroups]);

  // Parse encryption keys when block data and digital capabilities are available
  // Only parse once - skip if keys have already been loaded (user may have edited them)
  useEffect(() => {
    if (!block10Data || !caps?.digital || keysLoaded) return;
    try {
      const parsedKeys = caps.digital.parseEncryptionKeys(block10Data);
      setKeys(parsedKeys);
    } catch (error) {
      console.error('Error parsing encryption keys:', error);
    }
  }, [block10Data, caps?.digital, keysLoaded, setKeys]);

  // Parse digital emergency systems when block data and digital capabilities are available
  useEffect(() => {
    if (!block10Data || !caps?.digital) return;
    try {
      const { systems, config } = caps.digital.parseDigitalEmergencies(block10Data);
      setDigitalEmergencies(systems);
      setDigitalEmergencyConfig(config);
    } catch (error) {
      console.error('Error parsing digital emergency systems:', error);
    }
  }, [block10Data, caps?.digital, setDigitalEmergencies, setDigitalEmergencyConfig]);

  const handleKeyChange = (
    entryNumber: number,
    field: keyof EncryptionKey,
    value: string | number,
  ) => {
    // Checked here and not only in the control: a disabled select is a
    // suggestion, and this rule protects channel references from being silently
    // redirected on radios that store a separate key table per type.
    const existing = keys.find((k) => k.entryNumber === entryNumber);
    if (existing) {
      const result = editEncryptionKey(existing, field, value);
      if (!result.ok) {
        showAlert(result.reason, 'Encryption key');
        return;
      }
      updateKey(entryNumber, result.updates);
      return;
    }
    updateKey(entryNumber, { [field]: value });
  };

  const handleContactChange = (
    contactIndex: number,
    field: 'name' | 'contactNumber' | 'callType',
    value: string | number
  ) => {
    const contact = quickContacts.find(c => c.index === contactIndex);
    if (!contact) return;

    let updateData: Partial<typeof quickContacts[0]> = {};

    if (field === 'name') {
      updateData.name = value as string;
    } else if (field === 'contactNumber') {
      const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 16777215) {
        updateData.contactNumber = numValue;
      }
    } else if (field === 'callType') {
      const callTypeValue = typeof value === 'string' ? parseInt(value, 10) : value;
      updateData.callType = callTypeValue;
      // If All Call, lock contact number to 16777215
      if (callTypeValue === 0x05) {
        updateData.contactNumber = 16777215;
      }
    }

    updateContact(contactIndex, updateData);
  };

  const handleAddContact = () => {
    if (quickContacts.length >= talkGroupsMax) {
      showAlert(`Maximum of ${talkGroupsMax} talk groups allowed.`);
      return;
    }
    addContact({
      name: 'New Talk Group',
      contactNumber: 0,
      callType: 0x04, // Default to Group Call
      flag: 0,
    });
  };

  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert();
  const [deleteConfirm, setDeleteConfirm] = useState<
    { type: 'contact'; index: number } | { type: 'message'; index: number } | { type: 'radioId'; index: number } | null
  >(null);

  const handleDeleteContactClick = (index: number) => {
    setDeleteConfirm({ type: 'contact', index });
  };

  const handleAddMessage = () => {
    if (messages.length >= 20) {
      showAlert('Maximum of 20 quick messages allowed.');
      return;
    }
    const newIndex = messages.length;
    addMessage({
      index: newIndex,
      text: '',
      flag: 0, // Will be updated automatically when text is entered
      checkValue: 0,
    });
  };

  const handleDeleteMessageClick = (index: number) => {
    setDeleteConfirm({ type: 'message', index });
  };

  const handleAddRadioId = () => {
    if (radioIds.length >= dmrRadioIdsMax) {
      showAlert(`Maximum of ${dmrRadioIdsMax} DMR Radio IDs allowed.`);
      return;
    }
    const newIndex = radioIds.length;
    addRadioId({
      index: newIndex,
      name: 'New Radio ID',
      dmrId: '0',
      dmrIdValue: 0,
      dmrIdBytes: new Uint8Array([0, 0, 0]),
    });
  };

  const handleDeleteRadioIdClick = (index: number) => {
    setDeleteConfirm({ type: 'radioId', index });
  };

  const handleDeleteConfirmModalConfirm = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'contact') deleteContact(deleteConfirm.index);
    else if (deleteConfirm.type === 'message') deleteMessage(deleteConfirm.index);
    else if (deleteConfirm.type === 'radioId') deleteRadioId(deleteConfirm.index);
    setDeleteConfirm(null);
  };

  const deleteConfirmTitle =
    deleteConfirm?.type === 'contact'
      ? 'Delete contact'
      : deleteConfirm?.type === 'message'
        ? 'Delete message'
        : deleteConfirm?.type === 'radioId'
          ? 'Delete DMR Radio ID'
          : '';
  const deleteConfirmMessage =
    deleteConfirm?.type === 'contact'
      ? 'Are you sure you want to delete this contact?'
      : deleteConfirm?.type === 'message'
        ? 'Are you sure you want to delete this message?'
        : deleteConfirm?.type === 'radioId'
          ? 'Are you sure you want to delete this DMR Radio ID?'
          : '';

  return (
    <>
    <div className="p-6">
      <div className="mb-6">
        <SectionTitle as="h2" size="xl" bold className="text-2xl">Digital Settings</SectionTitle>
        <p className="text-cool-gray text-sm">
          Manage encryption keys, digital emergency systems, DMR radio IDs, talk groups, RX groups, and quick messages.
        </p>
      </div>

      {/* DMR Radio IDs Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <SectionTitle as="h3" size="xl">DMR Radio IDs</SectionTitle>
            <p className="text-cool-gray text-sm">
              Manage DMR Radio IDs. Up to {dmrRadioIdsMax} IDs can be configured.
            </p>
          </div>
          {radioIdsLoaded && radioIds.length < dmrRadioIdsMax && (
            <button
              onClick={handleAddRadioId}
              className="px-3 py-1 bg-neon-cyan text-dark-charcoal rounded hover:bg-neon-cyan-bright transition-colors text-sm font-semibold"
            >
              + Add ID
            </button>
          )}
        </div>

        {!radioIdsLoaded ? (
          <Card variant="subdued">
            <EmptyState message="DMR Radio IDs will be loaded when you read from the radio." />
          </Card>
        ) : radioIds.length === 0 ? (
          <Card variant="subdued">
            <EmptyState message="No DMR Radio IDs found on the radio." />
          </Card>
        ) : (
          <Card className="max-h-[calc(100vh-400px)] flex flex-col" padding="none">
            <div className="flex-1 overflow-auto">
              <div className="inline-block min-w-full">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Name</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">DMR ID</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radioIds.map((radioId) => (
                      <tr
                        key={radioId.index}
                        className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                      >
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={radioId.name}
                            onChange={(e) => {
                              const newName = e.target.value.slice(0, 12);
                              updateRadioId(radioId.index, { name: newName });
                            }}
                            maxLength={12}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                            placeholder="Enter name"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={radioId.dmrId}
                            onChange={(e) => {
                              const dmrIdValue = parseInt(e.target.value, 10);
                              if (isNaN(dmrIdValue) || dmrIdValue < 0 || dmrIdValue > 0xFFFFFF) return;
                              if (dmrIdValue > 0 && !isValidDMRId(dmrIdValue)) {
                                showAlert('DMR ID must be between 1 and 9,999,999 (0 = none).');
                                return;
                              }
                              updateRadioId(radioId.index, {
                                dmrId: e.target.value,
                                dmrIdValue: dmrIdValue,
                                dmrIdBytes: new Uint8Array([
                                  dmrIdValue & 0xFF,
                                  (dmrIdValue >> 8) & 0xFF,
                                  (dmrIdValue >> 16) & 0xFF,
                                ]),
                              });
                            }}
                            min="0"
                            max="16777215"
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white font-mono"
                            placeholder="DMR ID (1-9999999, 0=none)"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => handleDeleteRadioIdClick(radioId.index)}
                            className="px-2 py-1 bg-red-600 bg-opacity-50 text-red-300 rounded text-xs hover:bg-opacity-70 border border-red-600 border-opacity-50"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {radioIds.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-2 text-cool-gray text-center">
                          No DMR Radio IDs found on the radio.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Talk Groups Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <SectionTitle as="h3" size="xl">Talk Groups</SectionTitle>
            <p className="text-cool-gray text-sm">
              Manage DMR talk groups (contacts) for group calls, private calls, and all calls.
            </p>
          </div>
          {quickContactsLoaded && (
            <div className="flex items-center gap-3">
              <div className="text-cool-gray text-sm">
                {quickContacts.length}/{talkGroupsMax} talk groups
              </div>
              <button
                onClick={handleAddContact}
                disabled={quickContacts.length >= talkGroupsMax}
                className="px-3 py-1 bg-neon-cyan text-dark-charcoal rounded hover:bg-neon-cyan-bright transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add Group
              </button>
            </div>
          )}
        </div>

        {!quickContactsLoaded ? (
          <Card variant="subdued">
            <EmptyState message="Talk groups will be loaded when you read from the radio." />
          </Card>
        ) : quickContacts.length === 0 ? (
          <Card variant="subdued">
            <EmptyState message="No talk groups found on the radio." />
          </Card>
        ) : (
          <Card className="max-h-[calc(100vh-400px)] flex flex-col" padding="none">
            <div className="flex-1 overflow-auto">
              <div className="inline-block min-w-full">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Name</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">ID</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Call Type</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quickContacts.map((contact) => {
                      const isAllCall = contact.callType === 0x05;
                      return (
                        <tr
                          key={contact.index}
                          className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                        >
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={contact.name}
                              onChange={(e) => handleContactChange(contact.index, 'name', e.target.value)}
                              className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              value={contact.contactNumber}
                              onChange={(e) => handleContactChange(contact.index, 'contactNumber', e.target.value)}
                              min="0"
                              max="16777215"
                              disabled={isAllCall}
                              className={`bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white font-mono ${
                                isAllCall ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              title={isAllCall ? 'ID is locked to 16777215 for All Call' : ''}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={contact.callType}
                              onChange={(e) => handleContactChange(contact.index, 'callType', parseInt(e.target.value, 10))}
                              className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                            >
                              <option value={0x03}>Private Call</option>
                              <option value={0x04}>Group Call</option>
                              <option value={0x05}>All Call</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => handleDeleteContactClick(contact.index)}
                              className="px-2 py-1 bg-red-600 bg-opacity-50 text-red-300 rounded text-xs hover:bg-opacity-70 border border-red-600 border-opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* DMR RX Groups Section */}
      <div className="mb-8">
        <div className="mb-4">
          <SectionTitle as="h3" size="xl">DMR RX Groups</SectionTitle>
          <p className="text-cool-gray text-sm">
            Manage DMR RX Groups
          </p>
        </div>

        {!rxGroupsLoaded ? (
          <Card variant="subdued">
            <EmptyState message="DMR RX Groups will be loaded when you read from the radio." />
          </Card>
        ) : (
          <RXGroupsList />
        )}
      </div>

      {/* Digital Emergency Systems Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <SectionTitle as="h3" size="xl">Digital Emergency Systems</SectionTitle>
            <p className="text-cool-gray text-sm">
              Digital emergency configurations — metadata block 0x10, offset 0x000. Max {LIMITS.DIGITAL_EMERGENCY_MAX} entries.
            </p>
            {block10Address !== null && (
              <p className="text-cool-gray text-xs mt-1">
                Block Address: 0x{block10Address.toString(16).toUpperCase()}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              if (digitalEmergencies.length >= LIMITS.DIGITAL_EMERGENCY_MAX) return;
              addDigitalEmergency({
                index: digitalEmergencies.length,
                name: `DEmer ${digitalEmergencies.length + 1}`,
                alarmType: 0,
                alarmMode: 0,
                revertChannel: 0,
                retransmission: 5,
                hotMicDuration: 5,
                emergencyCallsNumber: 10,
                enabled: false,
                rxDurationTime: 1,
                autoEmergencyCallTimer: 10,
              });
            }}
            disabled={digitalEmergencies.length >= LIMITS.DIGITAL_EMERGENCY_MAX}
            className="px-3 py-1.5 text-xs bg-neon-cyan bg-opacity-10 border border-neon-cyan text-neon-cyan rounded hover:bg-opacity-20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ml-4"
          >
            + Add
          </button>
        </div>

        {!block10Data && digitalEmergencies.length === 0 ? (
          <Card variant="subdued">
            <EmptyState message="Block 0x10 not found. Read from radio or load a codeplug to view digital emergency systems." />
          </Card>
        ) : digitalEmergencies.length === 0 ? (
          <Card variant="subdued">
            <EmptyState message="No digital emergency systems configured." />
          </Card>
        ) : (
          <Card className="max-h-[calc(100vh-400px)] flex flex-col" padding="none">
            <div className="flex-1 overflow-auto">
              <div className="inline-block min-w-full">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[30px]">#</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[110px]">Name</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[145px]">Alarm Type</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[130px]">Alarm Mode</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]">Revert Ch</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Retrans</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[75px]">HOT MIC</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]">Em Calls</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[55px]">Enabled</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Rx Dur</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]">Auto Em</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {digitalEmergencies.map((system, i) => (
                      <tr
                        key={i}
                        className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                      >
                        <td className="px-2 py-1.5 text-center text-cool-gray font-mono">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={system.name}
                            onChange={(e) => updateSystem(i, { name: e.target.value.slice(0, 10) })}
                            maxLength={10}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.alarmType}
                            onChange={(e) => updateSystem(i, { alarmType: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {['None', 'Only Whistle', 'Normal', 'Secret', 'Secret With Voice', 'Alarm Whistle'].map((label, v) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.alarmMode}
                            onChange={(e) => updateSystem(i, { alarmMode: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {['Emergency Alarm', 'Alarm Call', 'Emergency Call'].map((label, v) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.revertChannel}
                            onChange={(e) => updateSystem(i, { revertChannel: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            <option value={0}>None</option>
                            {channels.map((ch) => (
                              <option key={ch.number} value={ch.number}>{ch.number}: {ch.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={system.retransmission}
                            onChange={(e) => updateSystem(i, { retransmission: Math.max(1, Math.min(15, Number(e.target.value))) })}
                            min={1}
                            max={15}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={system.hotMicDuration}
                            onChange={(e) => updateSystem(i, { hotMicDuration: Math.max(1, Math.min(15, Number(e.target.value))) })}
                            min={1}
                            max={15}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.emergencyCallsNumber}
                            onChange={(e) => updateSystem(i, { emergencyCallsNumber: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {Array.from({ length: 12 }, (_, k) => (k + 1) * 10).map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={system.enabled}
                            onChange={(e) => updateSystem(i, { enabled: e.target.checked })}
                            className="accent-neon-cyan w-4 h-4"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={system.rxDurationTime}
                            onChange={(e) => updateSystem(i, { rxDurationTime: Math.max(1, Math.min(255, Number(e.target.value))) })}
                            min={1}
                            max={255}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={system.autoEmergencyCallTimer}
                            onChange={(e) => updateSystem(i, { autoEmergencyCallTimer: Number(e.target.value) })}
                            className="bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-1 py-1 focus:outline-none focus:border-neon-cyan w-full text-xs text-white"
                          >
                            {Array.from({ length: 12 }, (_, k) => (k + 1) * 10).map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => deleteDigitalEmergency(i)}
                            className="text-red-400 hover:text-red-300 transition-colors px-1"
                            title="Delete"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Encryption Keys Section */}
      <div className="mb-8">
        <div className="mb-4">
          <SectionTitle as="h3" size="xl">Encryption Keys</SectionTitle>
          <p className="text-cool-gray text-sm">
            Manage encryption keys from metadata block 0x10. Up to 8 keys can be configured.
          </p>
          {block10Address !== null && (
            <p className="text-cool-gray text-xs mt-1">
              Block Address: 0x{block10Address.toString(16).toUpperCase()}
            </p>
          )}
        </div>

        {!block10Data && keys.length === 0 ? (
          <Card variant="subdued">
            <EmptyState message="Block 0x10 not found. Read from radio or load a codeplug to view encryption keys." />
          </Card>
        ) : (
          <Card className="max-h-[calc(100vh-400px)] flex flex-col" padding="none">
            <div className="flex-1 overflow-auto">
              <div className="inline-block min-w-full">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Name</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[120px]">Encryption Type</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[300px]">Key (Hex)</th>
                      <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[60px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr
                        key={key.entryNumber}
                        className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                      >
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={key.name}
                            onChange={(e) => handleKeyChange(key.entryNumber, 'name', e.target.value.slice(0, 10))}
                            maxLength={10}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                            placeholder="Enter name"
                          />
                        </td>
                        <td className="px-2 py-2">
                          {isEncryptionTypeLocked(key) ? (
                            // Fixed for the key's lifetime. On a radio that keeps a
                            // separate table per type, retyping is a MOVE between
                            // tables — it changes the key's slot and silently
                            // redirects every channel that referenced the old one.
                            // Clear the slot and create a new key instead.
                            <span
                              className="text-xs text-white"
                              title="A key's type is fixed once set. Use Clear to empty the slot, then choose a type for the new key."
                            >
                              {encryptionTypeLabel(key.encryptionType)}
                              <span className="text-cool-gray ml-1">(fixed)</span>
                            </span>
                          ) : (
                            <select
                              value={key.encryptionType ?? 0}
                              onChange={(e) => handleKeyChange(key.entryNumber, 'encryptionType', parseInt(e.target.value) || 0)}
                              className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                              title="Choosing a type creates the key in this slot. It cannot be changed afterwards."
                            >
                              {ENCRYPTION_TYPES.map((label, value) => (
                                <option key={label} value={value}>{label}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={key.key}
                            onChange={(e) => {
                              // Only allow hex characters, max 64 chars (32 bytes)
                              // Trailing zeros will be dropped on display
                              const hexValue = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 64).toUpperCase();
                              handleKeyChange(key.entryNumber, 'key', hexValue);
                            }}
                            maxLength={64}
                            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white font-mono"
                            placeholder="Enter hex key"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          {isEncryptionTypeLocked(key) && (
                            <button
                              onClick={() => updateKey(key.entryNumber, clearEncryptionKey())}
                              className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-red-400 border border-red-600 border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
                              title="Empty this slot — clears the type, name and key material. The slot can then hold a new key of any type."
                            >
                              Clear
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Quick Messages Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <SectionTitle as="h3" size="xl">Quick Text Messages</SectionTitle>
            <p className="text-cool-gray text-sm">
              Manage quick text messages. Maximum 128 bytes per message, up to 20 messages.
            </p>
          </div>
          {messagesLoaded && messages.length < 20 && (
            <button
              onClick={handleAddMessage}
              className="px-3 py-1 bg-neon-cyan text-dark-charcoal rounded hover:bg-neon-cyan-bright transition-colors text-sm font-semibold"
            >
              + Add Message
            </button>
          )}
        </div>

        {!messagesLoaded ? (
          <Card variant="subdued">
            <EmptyState message="Quick messages will be loaded when you read from the radio." />
          </Card>
        ) : (
          <Card className="max-h-[calc(100vh-400px)] flex flex-col" padding="none">
            <div className="flex-1 overflow-auto">
              <div className="inline-block min-w-full">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-charcoal border-b border-neon-cyan">
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[300px]">Message</th>
                      <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-2 py-2 text-cool-gray text-center">
                          No quick messages found on the radio.
                        </td>
                      </tr>
                    ) : (
                      messages.map((message, arrayIndex) => (
                        <tr
                          key={message.index}
                          className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
                        >
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={message.text}
                              onChange={(e) => {
                                const newText = e.target.value.slice(0, 128);
                                const textLength = new TextEncoder().encode(newText).length;
                                updateMessage(arrayIndex, { text: newText, flag: textLength });
                              }}
                              maxLength={128}
                              className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-white"
                              placeholder="Enter message text"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => handleDeleteMessageClick(arrayIndex)}
                              className="px-2 py-1 bg-red-600 bg-opacity-50 text-red-300 rounded text-xs hover:bg-opacity-70 border border-red-600 border-opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
    <ConfirmModal
      isOpen={!!deleteConfirm}
      onClose={() => setDeleteConfirm(null)}
      onConfirm={handleDeleteConfirmModalConfirm}
      title={deleteConfirmTitle}
      message={deleteConfirmMessage}
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

