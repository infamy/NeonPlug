import React from 'react';
import { Modal } from '../ui/Modal';
import type { Channel } from '../../models/Channel';

interface ChannelEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  onSave: (channel: Channel) => void;
}

export const ChannelEditModal: React.FC<ChannelEditModalProps> = ({
  isOpen,
  onClose,
  channel,
  onSave,
}) => {
  const [editedChannel, setEditedChannel] = React.useState<Channel>(channel);

  React.useEffect(() => {
    setEditedChannel(channel);
  }, [channel]);

  const handleChange = (field: keyof Channel, value: any) => {
    setEditedChannel(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(editedChannel);
    onClose();
  };

  const formatFrequency = (freq: number): string => {
    return freq.toFixed(4);
  };

  const isDigitalMode = (mode: Channel['mode']): boolean => {
    return mode === 'Digital' || mode === 'Fixed Digital';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Channel ${channel.number}`}
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
                <input
                  type="text"
                  value={editedChannel.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  maxLength={16}
                />
                <p className="text-xs text-cool-gray mt-0.5">Maximum 16 characters</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-cool-gray mb-1">
                    Receive Frequency (MHz)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formatFrequency(editedChannel.rxFrequency)}
                    onChange={(e) => handleChange('rxFrequency', parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  />
                  <p className="text-xs text-cool-gray mt-0.5">Frequency the radio receives on</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-cool-gray mb-1">
                    Transmit Frequency (MHz)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formatFrequency(editedChannel.txFrequency)}
                    onChange={(e) => handleChange('txFrequency', parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  />
                  <p className="text-xs text-cool-gray mt-0.5">Frequency the radio transmits on</p>
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
                {editedChannel.rxCtcssDcs.type !== 'None' && (
                  <input
                    type="number"
                    step={editedChannel.rxCtcssDcs.type === 'CTCSS' ? '0.1' : '1'}
                    value={editedChannel.rxCtcssDcs.value || ''}
                    onChange={(e) => handleChange('rxCtcssDcs', {
                      ...editedChannel.rxCtcssDcs,
                      value: parseFloat(e.target.value) || 0,
                    })}
                    className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                    placeholder={editedChannel.rxCtcssDcs.type === 'CTCSS' ? 'Hz (e.g., 88.5)' : 'Code (e.g., 023)'}
                  />
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
                {editedChannel.txCtcssDcs.type !== 'None' && (
                  <input
                    type="number"
                    step={editedChannel.txCtcssDcs.type === 'CTCSS' ? '0.1' : '1'}
                    value={editedChannel.txCtcssDcs.value || ''}
                    onChange={(e) => handleChange('txCtcssDcs', {
                      ...editedChannel.txCtcssDcs,
                      value: parseFloat(e.target.value) || 0,
                    })}
                    className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan mb-1"
                    placeholder={editedChannel.txCtcssDcs.type === 'CTCSS' ? 'Hz (e.g., 88.5)' : 'Code (e.g., 023)'}
                  />
                )}
                <p className="text-xs text-cool-gray">Tone/code transmitted with signal</p>
              </div>
            </div>
          </section>

          {/* Digital Settings */}
          {isDigitalMode(editedChannel.mode) && (
            <section>
              <h3 className="text-neon-cyan font-bold mb-2 text-sm">Digital Settings</h3>
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
                    Contact ID
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="249"
                    value={editedChannel.contactId}
                    onChange={(e) => handleChange('contactId', parseInt(e.target.value) || 0)}
                    className="w-full bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                  />
                  <p className="text-xs text-cool-gray mt-0.5">DMR contact ID (0-249)</p>
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
                  onChange={(e) => handleChange('forbidTx', e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Forbid Transmit</span>
                  <p className="text-xs text-cool-gray">Prevents transmitting on this channel</p>
                </div>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedChannel.scanAdd}
                  onChange={(e) => handleChange('scanAdd', e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan flex-shrink-0"
                />
                <div>
                  <span className="text-sm text-white font-medium">Scan Add</span>
                  <p className="text-xs text-cool-gray">Include this channel in scan lists</p>
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

              <div>
                <label className="block text-xs font-medium text-cool-gray mb-1">
                  Busy Lock
                </label>
                <select
                  value={editedChannel.busyLock}
                  onChange={(e) => handleChange('busyLock', e.target.value)}
                  className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                >
                  <option value="Off">Off</option>
                  <option value="Carrier">Carrier (CXR)</option>
                  <option value="Repeater">Repeater (RPT)</option>
                </select>
                <p className="text-xs text-cool-gray mt-0.5">Lock transmit when channel is busy</p>
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
                    <option value="CTC&Opt">CTC & Optional</option>
                    <option value="CTC|Opt">CTC | Optional</option>
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
                  <option value={0}>2.5 kHz</option>
                  <option value={1}>5 kHz</option>
                  <option value={2}>6.25 kHz</option>
                  <option value={3}>10 kHz</option>
                  <option value={4}>12.5 kHz</option>
                  <option value={5}>25 kHz</option>
                  <option value={6}>50 kHz</option>
                  <option value={7}>100 kHz</option>
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
                  <option value="Two Tone">Two Tone</option>
                  <option value="Five Tone">Five Tone</option>
                  <option value="MDC1200">MDC1200</option>
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
                  <option value="BOT">Beginning of Transmission (BOT)</option>
                  <option value="EOT">End of Transmission (EOT)</option>
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

