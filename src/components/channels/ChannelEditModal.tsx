import React from 'react';
import { Modal } from '../ui/Modal';
import type { Channel } from '../../models/Channel';
import type { RXGroup } from '../../models/RXGroup';
import type { EncryptionKey } from '../../models/EncryptionKey';
import type { QuickContact } from '../../models/QuickContact';
import { CTCSS_FREQUENCIES, DCS_CODES, formatCTCSSFrequency, formatDCSCode } from '../../utils/ctcssConstants';
import { isNoTxFrequency, isRxInNoTxBand } from '../../services/validation/frequencyValidator';

// Frequency input component that only updates parent on blur
interface FrequencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

const FrequencyInput: React.FC<FrequencyInputProps> = ({ value, onChange, className }) => {
  const [localValue, setLocalValue] = React.useState(value.toFixed(4));
  
  // Sync local value when prop changes (e.g., when channel changes)
  React.useEffect(() => {
    setLocalValue(value.toFixed(4));
  }, [value]);
  
  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed) && parsed > 0) {
      onChange(parsed);
      setLocalValue(parsed.toFixed(4));
    } else {
      // Reset to original value if invalid
      setLocalValue(value.toFixed(4));
    }
  };
  
  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      className={className}
    />
  );
};

interface ChannelEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  onSave: (channel: Channel) => void;
  rxGroups?: RXGroup[];
  encryptionKeys?: EncryptionKey[];
  talkGroups?: QuickContact[];
}

export const ChannelEditModal: React.FC<ChannelEditModalProps> = ({
  isOpen,
  onClose,
  channel,
  onSave,
  rxGroups = [],
  encryptionKeys = [],
  talkGroups = [],
}) => {
  const [editedChannel, setEditedChannel] = React.useState<Channel>(channel);

  React.useEffect(() => {
    const updatedChannel = { ...channel };
    // Ensure VFO channels have the correct name
    if (channel.number === 4001) {
      updatedChannel.name = 'VFO A';
    } else if (channel.number === 4002) {
      updatedChannel.name = 'VFO B';
    }
    setEditedChannel(updatedChannel);
  }, [channel]);

  const handleChange = (field: keyof Channel, value: any) => {
    setEditedChannel(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(editedChannel);
    onClose();
  };

  const isDigitalMode = (mode: Channel['mode']): boolean => {
    return mode === 'Digital' || mode === 'Fixed Digital';
  };

  const isVFOChannel = (channelNumber: number): boolean => {
    return channelNumber === 4001 || channelNumber === 4002;
  };

  const getVFOIdentifier = (channelNumber: number): string => {
    if (channelNumber === 4001) return 'A';
    if (channelNumber === 4002) return 'B';
    return channelNumber.toString();
  };

  const vfoName = isVFOChannel(channel.number) ? `VFO ${getVFOIdentifier(channel.number)}` : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit ${isVFOChannel(channel.number) ? `VFO ${getVFOIdentifier(channel.number)}` : `Channel ${channel.number}`}`}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="space-y-4">
          {/* Basic Information */}
          <section>
            <h3 className="text-neon-cyan font-bold mb-2 text-sm">Basic Information</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Channel Name
                </label>
                {vfoName ? (
                  <input
                    type="text"
                    value={vfoName}
                    disabled
                    readOnly
                    className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-cool-gray cursor-not-allowed opacity-60"
                  />
                ) : (
                  <>
                    <input
                      type="text"
                      value={editedChannel.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      maxLength={16}
                    />
                    <p className="text-xs text-cool-gray mt-0.5">Maximum 16 characters</p>
                  </>
                )}
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-cool-gray mb-1">
                    Receive Frequency (MHz)
                  </label>
                  <FrequencyInput
                    value={editedChannel.rxFrequency}
                    onChange={(val) => handleChange('rxFrequency', val)}
                    className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  />
                  <p className="text-xs text-cool-gray mt-0.5">Frequency the radio receives on</p>
                </div>
                <div className="flex flex-col gap-0.5 pb-5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!(isRxInNoTxBand(editedChannel.rxFrequency) && isNoTxFrequency(editedChannel.txFrequency))) {
                        handleChange('txFrequency', editedChannel.rxFrequency);
                      }
                    }}
                    disabled={isRxInNoTxBand(editedChannel.rxFrequency) && isNoTxFrequency(editedChannel.txFrequency)}
                    className="p-1.5 rounded border border-neon-cyan border-opacity-30 text-neon-cyan hover:bg-neon-cyan hover:bg-opacity-10 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan disabled:opacity-40 disabled:text-cool-gray disabled:border-opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    title={isRxInNoTxBand(editedChannel.rxFrequency) && isNoTxFrequency(editedChannel.txFrequency) ? 'Receive-only (no TX)' : 'Copy RX to TX'}
                    aria-label="Copy RX to TX"
                  >
                    <span className="text-sm font-bold">→</span>
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-cool-gray mb-1">
                    Transmit Frequency (MHz)
                  </label>
                  {isRxInNoTxBand(editedChannel.rxFrequency) && isNoTxFrequency(editedChannel.txFrequency) ? (
                    <>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value=""
                        title="Receive-only (no TX)"
                        aria-label="No transmit"
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-20 rounded px-2 py-1 text-sm text-cool-gray opacity-60 cursor-not-allowed"
                      />
                      <p className="text-xs text-cool-gray mt-0.5">Receive-only (87–136 MHz); TX disabled</p>
                    </>
                  ) : (
                    <>
                      <FrequencyInput
                        value={editedChannel.txFrequency}
                        onChange={(val) => handleChange('txFrequency', val)}
                        className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                      <p className="text-xs text-cool-gray mt-0.5">Frequency the radio transmits on</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-cool-gray mb-1">
                    Channel Mode
                  </label>
                  <select
                    value={editedChannel.mode}
                    onChange={(e) => handleChange('mode', e.target.value)}
                    className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  >
                    <option value="Analog">Analog</option>
                    <option value="Digital">Digital</option>
                    <option value="Fixed Analog">Fixed Analog</option>
                    <option value="Fixed Digital">Fixed Digital</option>
                  </select>
                  <p className="text-xs text-cool-gray mt-0.5">Communication mode for this channel</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-cool-gray mb-1">
                    Bandwidth
                  </label>
                  <select
                    value={editedChannel.bandwidth}
                    onChange={(e) => handleChange('bandwidth', e.target.value)}
                    className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  >
                    <option value="25kHz">25kHz (Wide)</option>
                    <option value="12.5kHz">12.5kHz (Narrow)</option>
                  </select>
                  <p className="text-xs text-cool-gray mt-0.5">Channel bandwidth</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Power Level
                </label>
                <select
                  value={editedChannel.power}
                  onChange={(e) => handleChange('power', e.target.value)}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
                <p className="text-xs text-cool-gray mt-0.5">Transmit power level</p>
              </div>
            </div>
          </section>

          {/* CTCSS/DCS Settings */}
          <section>
            <h3 className="text-neon-cyan font-bold mb-2 text-sm">CTCSS/DCS Settings</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Receive CTCSS/DCS
                </label>
                <select
                  value={editedChannel.rxCtcssDcs.type}
                  onChange={(e) => {
                    const type = e.target.value as 'CTCSS' | 'DCS' | 'None';
                    handleChange('rxCtcssDcs', {
                      ...editedChannel.rxCtcssDcs,
                      type,
                      value: type === 'None' ? undefined : editedChannel.rxCtcssDcs.value,
                    });
                  }}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                >
                  <option value="None">None</option>
                  <option value="CTCSS">CTCSS</option>
                  <option value="DCS">DCS</option>
                </select>
                {editedChannel.rxCtcssDcs.type === 'CTCSS' && (
                  <select
                    value={editedChannel.rxCtcssDcs.value || ''}
                    onChange={(e) => handleChange('rxCtcssDcs', {
                      ...editedChannel.rxCtcssDcs,
                      value: e.target.value ? parseFloat(e.target.value) : undefined,
                    })}
                    className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                  >
                    <option value="">Select CTCSS...</option>
                    {editedChannel.rxCtcssDcs.value && !CTCSS_FREQUENCIES.includes(editedChannel.rxCtcssDcs.value) && (
                      <option value={editedChannel.rxCtcssDcs.value}>
                        {formatCTCSSFrequency(editedChannel.rxCtcssDcs.value)} (Custom)
                      </option>
                    )}
                    {CTCSS_FREQUENCIES.map((freq) => (
                      <option key={freq} value={freq}>
                        {formatCTCSSFrequency(freq)}
                      </option>
                    ))}
                  </select>
                )}
                {editedChannel.rxCtcssDcs.type === 'DCS' && (
                  <div className="flex gap-2">
                    <select
                      value={editedChannel.rxCtcssDcs.value || ''}
                      onChange={(e) => handleChange('rxCtcssDcs', {
                        ...editedChannel.rxCtcssDcs,
                        value: e.target.value ? parseInt(e.target.value) : undefined,
                      })}
                      className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                    >
                      <option value="">Select DCS...</option>
                      {editedChannel.rxCtcssDcs.value && !DCS_CODES.includes(editedChannel.rxCtcssDcs.value) && (
                        <option value={editedChannel.rxCtcssDcs.value}>
                          {formatDCSCode(editedChannel.rxCtcssDcs.value, editedChannel.rxCtcssDcs.polarity)} (Custom)
                        </option>
                      )}
                      {DCS_CODES.map((code) => (
                        <option key={code} value={code}>
                          {formatDCSCode(code)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editedChannel.rxCtcssDcs.polarity || 'N'}
                      onChange={(e) => handleChange('rxCtcssDcs', {
                        ...editedChannel.rxCtcssDcs,
                        polarity: e.target.value as 'N' | 'P',
                      })}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                      disabled={!editedChannel.rxCtcssDcs.value}
                    >
                      <option value="N">N</option>
                      <option value="P">P</option>
                    </select>
                  </div>
                )}
                <p className="text-xs text-cool-gray">Tone/code required to open receiver</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Transmit CTCSS/DCS
                </label>
                <select
                  value={editedChannel.txCtcssDcs.type}
                  onChange={(e) => {
                    const type = e.target.value as 'CTCSS' | 'DCS' | 'None';
                    handleChange('txCtcssDcs', {
                      ...editedChannel.txCtcssDcs,
                      type,
                      value: type === 'None' ? undefined : editedChannel.txCtcssDcs.value,
                    });
                  }}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                >
                  <option value="None">None</option>
                  <option value="CTCSS">CTCSS</option>
                  <option value="DCS">DCS</option>
                </select>
                {editedChannel.txCtcssDcs.type === 'CTCSS' && (
                  <select
                    value={editedChannel.txCtcssDcs.value || ''}
                    onChange={(e) => handleChange('txCtcssDcs', {
                      ...editedChannel.txCtcssDcs,
                      value: e.target.value ? parseFloat(e.target.value) : undefined,
                    })}
                    className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                  >
                    <option value="">Select CTCSS...</option>
                    {editedChannel.txCtcssDcs.value && !CTCSS_FREQUENCIES.includes(editedChannel.txCtcssDcs.value) && (
                      <option value={editedChannel.txCtcssDcs.value}>
                        {formatCTCSSFrequency(editedChannel.txCtcssDcs.value)} (Custom)
                      </option>
                    )}
                    {CTCSS_FREQUENCIES.map((freq) => (
                      <option key={freq} value={freq}>
                        {formatCTCSSFrequency(freq)}
                      </option>
                    ))}
                  </select>
                )}
                {editedChannel.txCtcssDcs.type === 'DCS' && (
                  <div className="flex gap-2">
                    <select
                      value={editedChannel.txCtcssDcs.value || ''}
                      onChange={(e) => handleChange('txCtcssDcs', {
                        ...editedChannel.txCtcssDcs,
                        value: e.target.value ? parseInt(e.target.value) : undefined,
                      })}
                      className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                    >
                      <option value="">Select DCS...</option>
                      {editedChannel.txCtcssDcs.value && !DCS_CODES.includes(editedChannel.txCtcssDcs.value) && (
                        <option value={editedChannel.txCtcssDcs.value}>
                          {formatDCSCode(editedChannel.txCtcssDcs.value, editedChannel.txCtcssDcs.polarity)} (Custom)
                        </option>
                      )}
                      {DCS_CODES.map((code) => (
                        <option key={code} value={code}>
                          {formatDCSCode(code)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editedChannel.txCtcssDcs.polarity || 'N'}
                      onChange={(e) => handleChange('txCtcssDcs', {
                        ...editedChannel.txCtcssDcs,
                        polarity: e.target.value as 'N' | 'P',
                      })}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                      disabled={!editedChannel.txCtcssDcs.value}
                    >
                      <option value="N">N</option>
                      <option value="P">P</option>
                    </select>
                  </div>
                )}
                <p className="text-xs text-cool-gray">Tone/code transmitted with signal</p>
              </div>
            </div>
          </section>

          {/* Digital Settings */}
          {isDigitalMode(editedChannel.mode) && (
            <section>
              <h3 className="text-neon-cyan font-bold mb-2 text-sm">Digital Settings</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-cool-gray mb-1">
                      Color Code
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="15"
                      value={editedChannel.colorCode}
                      onChange={(e) => handleChange('colorCode', parseInt(e.target.value) || 0)}
                      className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    />
                    <p className="text-xs text-cool-gray mt-0.5">DMR color code (0-15)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-cool-gray mb-1">
                      TX Contact
                    </label>
                    <select
                      value={editedChannel.contactId}
                      onChange={(e) => handleChange('contactId', parseInt(e.target.value) || 0)}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    >
                      <option value={0}>None</option>
                      {talkGroups.map((tg) => {
                        const callTypeLabel = tg.callType === 0x05 ? 'All Call' : tg.callType === 0x04 ? 'Group' : tg.callType === 0x03 ? 'Private' : 'Unknown';
                        return (
                          <option key={tg.index} value={tg.index}>
                            {tg.name} [{callTypeLabel}] ({tg.contactNumber})
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-xs text-cool-gray mt-0.5">TX Contact for this channel (Group/Private/All Call)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-cool-gray mb-1">
                      RX Group List
                    </label>
                    <select
                      value={editedChannel.rxGroupListId ?? 0}
                      onChange={(e) => handleChange('rxGroupListId', parseInt(e.target.value) || 0)}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    >
                      <option value={0}>None</option>
                      {rxGroups
                        .filter(group => group.index < 63)
                        .map((group) => (
                          <option key={group.index} value={group.index + 1}>
                            {group.name}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-cool-gray mt-0.5">RX Group List ID (0-63)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-cool-gray mb-1">
                      Slot Operation
                    </label>
                    <select
                      value={(editedChannel.slotOperation ?? 0) === 0 ? 1 : 2}
                      onChange={(e) => {
                        // Storage: 0 = TS1, 1 = TS2 (at 0x1D bit 4)
                        // Convert from UI (1/2) to storage (0/1)
                        const uiValue = parseInt(e.target.value) || 1;
                        const storageValue = uiValue === 1 ? 0 : 1; // TS1 (1) → 0, TS2 (2) → 1
                        handleChange('slotOperation', storageValue);
                      }}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    >
                      <option value={1}>Slot 1 (TS1)</option>
                      <option value={2}>Slot 2 (TS2)</option>
                    </select>
                    <p className="text-xs text-cool-gray mt-0.5">Storage: 0 = TS1, 1 = TS2 (0x1D bit 4)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-cool-gray mb-1">
                      Encryption ID
                    </label>
                    <select
                      value={editedChannel.encryptionId ?? 0}
                      onChange={(e) => handleChange('encryptionId', parseInt(e.target.value) || 0)}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    >
                      <option value={0}>None</option>
                      {encryptionKeys
                        .filter(key => key.id >= 1 && key.id <= 8 && key.name.trim() !== '')
                        .map((key) => (
                          <option key={key.entryNumber} value={key.id}>
                            {key.name || `Key ${key.id}`}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-cool-gray mt-0.5">Encryption key (0-8)</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editedChannel.encryption ?? false}
                      onChange={(e) => handleChange('encryption', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                    />
                    <div>
                      <span className="text-sm text-white font-medium">Encryption</span>
                      <p className="text-xs text-cool-gray">Enable encryption</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editedChannel.tdmaDirectMode ?? false}
                      onChange={(e) => handleChange('tdmaDirectMode', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                    />
                    <div>
                      <span className="text-sm text-white font-medium">TDMA Direct Mode</span>
                      <p className="text-xs text-cool-gray">Enable TDMA direct mode</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editedChannel.shortDataConfirm ?? false}
                      onChange={(e) => handleChange('shortDataConfirm', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                    />
                    <div>
                      <span className="text-sm text-white font-medium">Short Data Confirm</span>
                      <p className="text-xs text-cool-gray">Enable short data confirmation</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editedChannel.privateConfirm ?? false}
                      onChange={(e) => handleChange('privateConfirm', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                    />
                    <div>
                      <span className="text-sm text-white font-medium">Private Confirm</span>
                      <p className="text-xs text-cool-gray">Enable private confirmation</p>
                    </div>
                  </label>
                </div>
              </div>
            </section>
          )}

          {/* Channel Features */}
          <section>
            <h3 className="text-neon-cyan font-bold mb-2 text-sm">Channel Features</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedChannel.forbidTx}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (!next && isRxInNoTxBand(editedChannel.rxFrequency) && isNoTxFrequency(editedChannel.txFrequency)) return;
                    handleChange('forbidTx', next);
                  }}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Forbid Transmit</span>
                  <p className="text-xs text-cool-gray">Prevents transmitting on this channel</p>
                </div>
              </label>

              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Scan List ID
                </label>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={editedChannel.scanListId}
                  onChange={(e) => handleChange('scanListId', parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
                <p className="text-xs text-cool-gray mt-0.5">Scan list to add this channel to (0-15)</p>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedChannel.loneWorker}
                  onChange={(e) => handleChange('loneWorker', e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Lone Worker</span>
                  <p className="text-xs text-cool-gray">Enable lone worker monitoring</p>
                </div>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedChannel.forbidTalkaround}
                  onChange={(e) => handleChange('forbidTalkaround', e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Forbid Talkaround</span>
                  <p className="text-xs text-cool-gray">Prevent direct communication without repeater</p>
                </div>
              </label>
            </div>
          </section>

          {/* Analog Features */}
          {!isDigitalMode(editedChannel.mode) && (
            <section>
              <h3 className="text-neon-cyan font-bold mb-2 text-sm">Analog Features</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedChannel.voxFunction}
                    onChange={(e) => handleChange('voxFunction', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">VOX Function</span>
                    <p className="text-xs text-cool-gray">Voice-operated transmit</p>
                  </div>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedChannel.scramble}
                    onChange={(e) => handleChange('scramble', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">Scramble</span>
                    <p className="text-xs text-cool-gray">Enable voice scrambling</p>
                  </div>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedChannel.compander}
                    onChange={(e) => handleChange('compander', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">Compander</span>
                    <p className="text-xs text-cool-gray">Enable compander for better audio</p>
                  </div>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedChannel.talkback}
                    onChange={(e) => handleChange('talkback', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">Talkback</span>
                    <p className="text-xs text-cool-gray">Monitor own transmission</p>
                  </div>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedChannel.companderDup}
                    onChange={(e) => handleChange('companderDup', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">Compander Dup</span>
                    <p className="text-xs text-cool-gray">Enable compander on duplex</p>
                  </div>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedChannel.voxRelated}
                    onChange={(e) => handleChange('voxRelated', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">VOX Related</span>
                    <p className="text-xs text-cool-gray">VOX-related function</p>
                  </div>
                </label>

                <div>
                  <label className="block text-xs font-medium text-cool-gray mb-1">
                    Squelch Level
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={editedChannel.squelchLevel}
                    onChange={(e) => handleChange('squelchLevel', parseInt(e.target.value) || 0)}
                    className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  />
                  <p className="text-xs text-cool-gray mt-0.5">Squelch threshold (0-255)</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-cool-gray mb-1">
                    Receive Squelch Mode
                  </label>
                  <select
                    value={editedChannel.rxSquelchMode}
                    onChange={(e) => handleChange('rxSquelchMode', e.target.value)}
                    className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  >
                    <option value="Carrier/CTC">Carrier/CTC</option>
                    <option value="Optional">Optional</option>
                    <option value="CTC&Opt">CTC&Opt</option>
                    <option value="CTC|Opt">CTC|Opt</option>
                  </select>
                  <p className="text-xs text-cool-gray mt-0.5">Squelch opening method</p>
                </div>
              </div>
            </section>
          )}

          {/* Advanced Settings */}
          <section>
            <h3 className="text-neon-cyan font-bold mb-2 text-sm">Advanced Settings</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Step Frequency
                </label>
                <select
                  value={editedChannel.stepFrequency}
                  onChange={(e) => handleChange('stepFrequency', parseInt(e.target.value) || 0)}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  <option value={0}>2.5K</option>
                  <option value={1}>5K</option>
                  <option value={2}>6.25K</option>
                  <option value={3}>10K</option>
                  <option value={4}>12.5K</option>
                  <option value={5}>25K</option>
                  <option value={6}>50K</option>
                  <option value={7}>100K</option>
                </select>
                <p className="text-xs text-cool-gray mt-0.5">Frequency step size</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Signaling Type
                </label>
                <select
                  value={editedChannel.signalingType}
                  onChange={(e) => handleChange('signalingType', e.target.value)}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  <option value="None">None</option>
                  <option value="DTMF">DTMF</option>
                  <option value="Two Tone">2Tone</option>
                  <option value="Five Tone">5Tone</option>
                  <option value="MDC1200">MDC</option>
                </select>
                <p className="text-xs text-cool-gray mt-0.5">Signaling system type</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  PTT ID Type
                </label>
                <select
                  value={editedChannel.pttIdType}
                  onChange={(e) => handleChange('pttIdType', e.target.value)}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  <option value="Off">Off</option>
                  <option value="BOT">BOT</option>
                  <option value="EOT">EOT</option>
                  <option value="Both">Both</option>
                </select>
                <p className="text-xs text-cool-gray mt-0.5">When to send PTT ID</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  PTT ID
                </label>
                <input
                  type="number"
                  min="0"
                  max="63"
                  value={editedChannel.pttId}
                  onChange={(e) => handleChange('pttId', parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
                <p className="text-xs text-cool-gray mt-0.5">PTT ID number (0-63)</p>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedChannel.pttIdDisplay}
                  onChange={(e) => handleChange('pttIdDisplay', e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">PTT ID Display</span>
                  <p className="text-xs text-cool-gray">Show PTT ID on display</p>
                </div>
              </label>
            </div>
          </section>

          {/* Emergency Settings */}
          <section>
            <h3 className="text-neon-cyan font-bold mb-2 text-sm">Emergency Settings</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedChannel.emergencyIndicator}
                  onChange={(e) => handleChange('emergencyIndicator', e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Emergency Indicator</span>
                  <p className="text-xs text-cool-gray">Mark channel as emergency channel</p>
                </div>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedChannel.emergencyAck}
                  onChange={(e) => handleChange('emergencyAck', e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Emergency Acknowledge</span>
                  <p className="text-xs text-cool-gray">Require emergency acknowledgment</p>
                </div>
              </label>

              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Emergency System ID
                </label>
                <input
                  type="number"
                  min="0"
                  max="31"
                  value={editedChannel.emergencySystemId}
                  onChange={(e) => handleChange('emergencySystemId', parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                />
                <p className="text-xs text-cool-gray mt-0.5">Emergency system identifier (0-31)</p>
              </div>
            </div>
          </section>

          {/* APRS Settings */}
          <section>
            <h3 className="text-neon-cyan font-bold mb-2 text-sm">APRS Settings</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedChannel.aprsReceive}
                  onChange={(e) => handleChange('aprsReceive', e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">APRS Receive</span>
                  <p className="text-xs text-cool-gray">Enable APRS reception</p>
                </div>
              </label>

              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  APRS Report Mode
                </label>
                <select
                  value={editedChannel.aprsReportMode}
                  onChange={(e) => handleChange('aprsReportMode', e.target.value)}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  <option value="Off">Off</option>
                  <option value="Digital">Digital</option>
                  <option value="Analog">Analog</option>
                </select>
                <p className="text-xs text-cool-gray mt-0.5">APRS reporting method</p>
              </div>
            </div>
          </section>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-neon-cyan border-opacity-30 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-cool-gray hover:text-white border border-neon-cyan border-opacity-30 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-neon-cyan text-dark-charcoal font-medium rounded hover:bg-opacity-90 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
};

