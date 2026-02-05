import React, { useState, useEffect, useRef } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useScanListsStore } from '../../store/scanListsStore';
import { useRXGroupsStore } from '../../store/rxGroupsStore';
import { useEncryptionKeysStore } from '../../store/encryptionKeysStore';
import { useQuickContactsStore } from '../../store/quickContactsStore';
import { useDMRRadioIDsStore } from '../../store/dmrRadioIdsStore';
import type { Channel } from '../../models/Channel';
import { ChannelEditModal } from './ChannelEditModal';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { CTCSS_FREQUENCIES, DCS_CODES, formatCTCSSFrequency, formatDCSCode } from '../../utils/ctcssConstants';

// Frequency input component that only updates parent on blur (prevents cursor jumping)
interface FrequencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

const FrequencyInput: React.FC<FrequencyInputProps> = ({ value, onChange, className }) => {
  const [localValue, setLocalValue] = useState(value.toFixed(4));
  
  // Sync local value when prop changes (e.g., when channel changes)
  useEffect(() => {
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

interface ChannelsTableProps {
  channels?: Channel[];
  scrollToChannel?: number | null;  // Channel number to scroll to
  onScrollComplete?: () => void;    // Callback after scroll completes
}

export const ChannelsTable: React.FC<ChannelsTableProps> = ({ 
  channels: channelsProp,
  scrollToChannel,
  onScrollComplete 
}) => {
  const { channels: channelsFromStore, updateChannel, deleteChannel, addChannel } = useChannelsStore();
  const { settings: radioSettings, updateSettings } = useRadioSettingsStore();
  const { scanLists } = useScanListsStore();
  const { groups: rxGroups } = useRXGroupsStore();
  const { keys: encryptionKeys } = useEncryptionKeysStore();
  const { contacts: talkGroups } = useQuickContactsStore();
  const { radioIds: dmrRadioIds } = useDMRRadioIDsStore();
  const channels = channelsProp ?? channelsFromStore;
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [clonedChannelNumber, setClonedChannelNumber] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Scroll to channel when scrollToChannel changes
  useEffect(() => {
    if (scrollToChannel !== null && scrollToChannel !== undefined) {
      const row = rowRefs.current.get(scrollToChannel);
      if (row) {
        // Small delay to ensure the DOM has updated
        requestAnimationFrame(() => {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Use IntersectionObserver to detect when scroll completes and row is visible
          const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting) {
              observer.disconnect();
              // Brief highlight effect after scroll completes
              row.classList.add('bg-neon-cyan', 'bg-opacity-20');
              setTimeout(() => {
                row.classList.remove('bg-neon-cyan', 'bg-opacity-20');
                onScrollComplete?.();
              }, 1000);
            }
          }, { threshold: 0.5 });
          
          observer.observe(row);
          
          // Fallback timeout in case observer doesn't fire
          setTimeout(() => {
            observer.disconnect();
          }, 3000);
        });
      }
    }
  }, [scrollToChannel, onScrollComplete]);

  const handleCellChange = (
    channelNumber: number,
    field: keyof Channel,
    value: string | number | boolean | Channel['rxCtcssDcs']
  ) => {
    // Handle VFO channels (4001 and 4002)
    if (channelNumber === 4001 && radioSettings?.vfoA) {
      // VFO A
      updateSettings({ vfoA: { ...radioSettings.vfoA, [field]: value } });
      return;
    }
    if (channelNumber === 4002 && radioSettings?.vfoB) {
      // VFO B
      updateSettings({ vfoB: { ...radioSettings.vfoB, [field]: value } });
      return;
    }
    // Regular channels
    updateChannel(channelNumber, { [field]: value });
  };

  const isVFOChannel = (channelNumber: number): boolean => {
    return channelNumber === 4001 || channelNumber === 4002;
  };

  const getVFOIdentifier = (channelNumber: number): string => {
    if (channelNumber === 4001) return 'A';
    if (channelNumber === 4002) return 'B';
    return channelNumber.toString();
  };

  const isDigitalMode = (mode: Channel['mode']): boolean => {
    return mode === 'Digital' || mode === 'Fixed Digital';
  };

  const handleCloneChannel = (channel: Channel) => {
    // Find the next available channel number
    const existingNumbers = new Set(channelsFromStore.map(ch => ch.number));
    let nextNumber = 1;
    while (existingNumbers.has(nextNumber)) {
      nextNumber++;
    }
    
    // Clone the channel with new number and modified name
    const clonedChannel: Channel = {
      ...channel,
      number: nextNumber,
      name: channel.name.length > 12 
        ? channel.name.substring(0, 12) + ' (C)' 
        : channel.name + ' (C)',
    };
    
    addChannel(clonedChannel);
    setClonedChannelNumber(nextNumber);
  };

  // Handle scroll to cloned channel
  useEffect(() => {
    if (clonedChannelNumber !== null) {
      const row = rowRefs.current.get(clonedChannelNumber);
      if (row) {
        requestAnimationFrame(() => {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Highlight after scroll completes
          const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting) {
              observer.disconnect();
              row.style.backgroundColor = 'rgba(0, 255, 255, 0.2)';
              setTimeout(() => {
                row.style.backgroundColor = '';
                setClonedChannelNumber(null);
              }, 1500);
            }
          }, { threshold: 0.5 });
          
          observer.observe(row);
          setTimeout(() => observer.disconnect(), 3000);
        });
      } else {
        setClonedChannelNumber(null);
      }
    }
  }, [clonedChannelNumber, channelsFromStore]);

  if (channels.length === 0) {
    return (
      <Card>
        <EmptyState message="No channels loaded" secondary="Connect to a radio or import channels to get started" />
      </Card>
    );
  }

  return (
    <Card className="max-h-[calc(100vh-200px)] flex flex-col" padding="none">
      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full">
          <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20">
          <tr className="bg-dark-charcoal border-b border-neon-cyan">
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-0 bg-dark-charcoal z-30 min-w-[40px]">#</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold sticky left-[40px] bg-dark-charcoal z-30 min-w-[120px]">Name</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[110px]">RX Freq</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[110px]">TX Freq</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[50px]">Mode</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[40px]">PWR</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[40px]">BW</th>
            {/* Common fields - work for both analog and digital */}
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Forbid TX</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[75px]">RX Tone</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[75px]">TX Tone</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Lone Worker">LW</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[50px]">Scan List</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">FTA</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Emerg</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">Emerg Ack</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Emerg ID</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">APRS RX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">APRS TX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">VOX</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Scramble">SCR</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Compander">CMP</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Talkback">TB</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[30px]" title="Compander Dup">CMP DUP</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">SQL</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">PTT ID Display</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">PTT ID</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]">VOX Related</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]">RX Squelch Mode</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[70px]">Step Freq</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[65px]">Sig Type</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[65px]">PTT ID Type</th>
            {/* Digital-only fields */}
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]">Color Code</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[80px]" title="RX Group List">RX Group</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]" title="Slot Operation">Slot</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Encryption">Enc</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[60px]" title="Encryption ID">Enc ID</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="TDMA Direct Mode">TDMA</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Short Data Confirm">SDC</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[35px]" title="Private Confirm">Priv</th>
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]" title="DMR Radio ID Index for TX (0=None, 1-255=Index into DMR Radio IDs list)">TX DMR ID</th>
            {/* Common fields - work for both */}
            <th className="px-2 py-2 text-left text-neon-cyan font-bold min-w-[100px]" title="TX Contact (Group/Private/All Call - index into Contacts list)">TG</th>
            <th className="px-2 py-2 text-center text-neon-cyan font-bold min-w-[60px] sticky right-0 bg-dark-charcoal z-30">Actions</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => {
            const showColorCode = isDigitalMode(channel.mode);
            return (
              <tr
                key={channel.number}
                ref={(el) => {
                  if (el) rowRefs.current.set(channel.number, el);
                  else rowRefs.current.delete(channel.number);
                }}
                className="border-b border-neon-cyan border-opacity-20 hover:bg-deep-gray hover:bg-opacity-50 transition-colors"
              >
                <td className="px-2 py-2 text-white sticky left-0 bg-deep-gray z-10 text-sm font-medium">
                  {isVFOChannel(channel.number) ? getVFOIdentifier(channel.number) : channel.number}
                </td>
                <td className="px-2 py-2 sticky left-[40px] bg-deep-gray z-10">
                  <input
                    type="text"
                    value={isVFOChannel(channel.number) ? '' : channel.name}
                    onChange={(e) => handleCellChange(channel.number, 'name', e.target.value)}
                    disabled={isVFOChannel(channel.number)}
                    className={`bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs ${
                      isVFOChannel(channel.number) 
                        ? 'text-cool-gray cursor-not-allowed' 
                        : 'text-white'
                    }`}
                    maxLength={16}
                    placeholder={isVFOChannel(channel.number) ? `VFO ${getVFOIdentifier(channel.number)}` : ''}
                  />
                </td>
                <td className="px-2 py-2">
                  <FrequencyInput
                    value={channel.rxFrequency}
                    onChange={(val) => handleCellChange(channel.number, 'rxFrequency', val)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                  />
                </td>
                <td className="px-2 py-2">
                  <FrequencyInput
                    value={channel.txFrequency}
                    onChange={(val) => handleCellChange(channel.number, 'txFrequency', val)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => {
                      const modeOrder = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
                      const currentIndex = modeOrder.indexOf(channel.mode);
                      const nextIndex = (currentIndex + 1) % modeOrder.length;
                      const newMode = modeOrder[nextIndex] as Channel['mode'];
                      // Auto-set bandwidth to Narrow when switching to Digital
                      if ((newMode === 'Digital' || newMode === 'Fixed Digital') && channel.bandwidth === '25kHz') {
                        handleCellChange(channel.number, 'bandwidth', '12.5kHz');
                      }
                      handleCellChange(channel.number, 'mode', newMode);
                    }}
                    className="w-10 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
                    title={channel.mode}
                  >
                    {channel.mode === 'Analog' || channel.mode === 'Fixed Analog' ? 'Ana' : 'Dig'}
                  </button>
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => {
                      const powerOrder = ['Low', 'Medium', 'High'];
                      const currentIndex = powerOrder.indexOf(channel.power);
                      const nextIndex = (currentIndex + 1) % powerOrder.length;
                      handleCellChange(channel.number, 'power', powerOrder[nextIndex]);
                    }}
                    className="w-8 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
                    title={channel.power}
                  >
                    {channel.power === 'Low' ? 'L' : channel.power === 'Medium' ? 'M' : 'H'}
                  </button>
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => {
                      if (!isDigitalMode(channel.mode)) {
                        handleCellChange(channel.number, 'bandwidth', channel.bandwidth === '25kHz' ? '12.5kHz' : '25kHz');
                      }
                    }}
                    disabled={isDigitalMode(channel.mode)}
                    className={`w-8 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors ${
                      isDigitalMode(channel.mode) 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'hover:bg-opacity-80 hover:border-neon-cyan'
                    }`}
                    title={isDigitalMode(channel.mode) ? 'Locked to Narrow (12.5kHz) for Digital' : (channel.bandwidth === '25kHz' ? 'Wide (25kHz)' : 'Narrow (12.5kHz)')}
                  >
                    {isDigitalMode(channel.mode) ? 'N' : (channel.bandwidth === '25kHz' ? 'W' : 'N')}
                  </button>
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.forbidTx}
                    onChange={(e) => handleCellChange(channel.number, 'forbidTx', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  {isDigitalMode(channel.mode) ? (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <select
                        value={channel.rxCtcssDcs.type}
                        onChange={(e) => {
                          const type = e.target.value as 'CTCSS' | 'DCS' | 'None';
                          handleCellChange(channel.number, 'rxCtcssDcs', {
                            ...channel.rxCtcssDcs,
                            type,
                            value: type === 'None' ? undefined : channel.rxCtcssDcs.value,
                          });
                        }}
                        className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                      >
                      <option value="None">None</option>
                      <option value="CTCSS">CTCSS</option>
                      <option value="DCS">DCS</option>
                    </select>
                    {channel.rxCtcssDcs.type === 'CTCSS' && (
                      <select
                        value={channel.rxCtcssDcs.value || ''}
                        onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                          ...channel.rxCtcssDcs,
                          value: e.target.value ? parseFloat(e.target.value) : undefined,
                        })}
                        className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                      >
                        <option value="">Select...</option>
                        {channel.rxCtcssDcs.value && !CTCSS_FREQUENCIES.includes(channel.rxCtcssDcs.value) && (
                          <option value={channel.rxCtcssDcs.value}>
                            {formatCTCSSFrequency(channel.rxCtcssDcs.value)} (Custom)
                          </option>
                        )}
                        {CTCSS_FREQUENCIES.map((freq) => (
                          <option key={freq} value={freq}>
                            {formatCTCSSFrequency(freq)}
                          </option>
                        ))}
                      </select>
                    )}
                    {channel.rxCtcssDcs.type === 'DCS' && (
                      <div className="flex gap-1">
                        <select
                          value={channel.rxCtcssDcs.value || ''}
                          onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                            ...channel.rxCtcssDcs,
                            value: e.target.value ? parseInt(e.target.value) : undefined,
                          })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                        >
                          <option value="">Select...</option>
                          {channel.rxCtcssDcs.value && !DCS_CODES.includes(channel.rxCtcssDcs.value) && (
                            <option value={channel.rxCtcssDcs.value}>
                              {formatDCSCode(channel.rxCtcssDcs.value, channel.rxCtcssDcs.polarity)} (Custom)
                            </option>
                          )}
                          {DCS_CODES.map((code) => (
                            <option key={code} value={code}>
                              {formatDCSCode(code)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={channel.rxCtcssDcs.polarity || 'N'}
                          onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                            ...channel.rxCtcssDcs,
                            polarity: e.target.value as 'N' | 'P',
                          })}
                          className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                          disabled={!channel.rxCtcssDcs.value}
                        >
                          <option value="N">N</option>
                          <option value="P">P</option>
                        </select>
                      </div>
                    )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2">
                  {isDigitalMode(channel.mode) ? (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <select
                        value={channel.txCtcssDcs.type}
                        onChange={(e) => {
                          const type = e.target.value as 'CTCSS' | 'DCS' | 'None';
                          handleCellChange(channel.number, 'txCtcssDcs', {
                            ...channel.txCtcssDcs,
                            type,
                            value: type === 'None' ? undefined : channel.txCtcssDcs.value,
                          });
                        }}
                        className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                      >
                      <option value="None">None</option>
                      <option value="CTCSS">CTCSS</option>
                      <option value="DCS">DCS</option>
                    </select>
                    {channel.txCtcssDcs.type === 'CTCSS' && (
                      <select
                        value={channel.txCtcssDcs.value || ''}
                        onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                          ...channel.txCtcssDcs,
                          value: e.target.value ? parseFloat(e.target.value) : undefined,
                        })}
                        className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
                      >
                        <option value="">Select...</option>
                        {channel.txCtcssDcs.value && !CTCSS_FREQUENCIES.includes(channel.txCtcssDcs.value) && (
                          <option value={channel.txCtcssDcs.value}>
                            {formatCTCSSFrequency(channel.txCtcssDcs.value)} (Custom)
                          </option>
                        )}
                        {CTCSS_FREQUENCIES.map((freq) => (
                          <option key={freq} value={freq}>
                            {formatCTCSSFrequency(freq)}
                          </option>
                        ))}
                      </select>
                    )}
                    {channel.txCtcssDcs.type === 'DCS' && (
                      <div className="flex gap-1">
                        <select
                          value={channel.txCtcssDcs.value || ''}
                          onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                            ...channel.txCtcssDcs,
                            value: e.target.value ? parseInt(e.target.value) : undefined,
                          })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                        >
                          <option value="">Select...</option>
                          {channel.txCtcssDcs.value && !DCS_CODES.includes(channel.txCtcssDcs.value) && (
                            <option value={channel.txCtcssDcs.value}>
                              {formatDCSCode(channel.txCtcssDcs.value, channel.txCtcssDcs.polarity)} (Custom)
                            </option>
                          )}
                          {DCS_CODES.map((code) => (
                            <option key={code} value={code}>
                              {formatDCSCode(code)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={channel.txCtcssDcs.polarity || 'N'}
                          onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                            ...channel.txCtcssDcs,
                            polarity: e.target.value as 'N' | 'P',
                          })}
                          className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                          disabled={!channel.txCtcssDcs.value}
                        >
                          <option value="N">N</option>
                          <option value="P">P</option>
                        </select>
                      </div>
                    )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-center" title="Lone Worker">
                  <input
                    type="checkbox"
                    checked={channel.loneWorker}
                    onChange={(e) => handleCellChange(channel.number, 'loneWorker', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Lone Worker"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.scanListId}
                    onChange={(e) => handleCellChange(channel.number, 'scanListId', parseInt(e.target.value) || 0)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value={0}>None</option>
                    {scanLists.map((scanList, index) => (
                      <option key={scanList.name} value={index + 1}>
                        {scanList.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.forbidTalkaround}
                    onChange={(e) => handleCellChange(channel.number, 'forbidTalkaround', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.emergencyIndicator}
                    onChange={(e) => handleCellChange(channel.number, 'emergencyIndicator', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.emergencyAck}
                    onChange={(e) => handleCellChange(channel.number, 'emergencyAck', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    max="31"
                    value={channel.emergencySystemId}
                    onChange={(e) => handleCellChange(channel.number, 'emergencySystemId', parseInt(e.target.value) || 0)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.aprsReceive}
                    onChange={(e) => handleCellChange(channel.number, 'aprsReceive', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.aprsReportMode === 'Digital'}
                    onChange={(e) => handleCellChange(channel.number, 'aprsReportMode', e.target.checked ? 'Digital' : 'Off')}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  {isDigitalMode(channel.mode) ? (
                    <span className="text-cool-gray text-xs">-</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={channel.voxFunction}
                      onChange={(e) => handleCellChange(channel.number, 'voxFunction', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan"
                    />
                  )}
                </td>
                <td className="px-2 py-2 text-center" title="Scramble">
                  <input
                    type="checkbox"
                    checked={channel.scramble}
                    onChange={(e) => handleCellChange(channel.number, 'scramble', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Scramble"
                  />
                </td>
                <td className="px-2 py-2 text-center" title="Compander">
                  <input
                    type="checkbox"
                    checked={channel.compander}
                    onChange={(e) => handleCellChange(channel.number, 'compander', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Compander"
                  />
                </td>
                <td className="px-2 py-2 text-center" title="Talkback">
                  <input
                    type="checkbox"
                    checked={channel.talkback}
                    onChange={(e) => handleCellChange(channel.number, 'talkback', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Talkback"
                  />
                </td>
                <td className="px-2 py-2 text-center" title="Compander Dup">
                  <input
                    type="checkbox"
                    checked={channel.companderDup}
                    onChange={(e) => handleCellChange(channel.number, 'companderDup', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                    title="Compander Dup"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={channel.squelchLevel}
                    onChange={(e) => handleCellChange(channel.number, 'squelchLevel', parseInt(e.target.value) || 0)}
                    className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  {isDigitalMode(channel.mode) ? (
                    <span className="text-cool-gray text-xs">-</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={channel.pttIdDisplay}
                      onChange={(e) => handleCellChange(channel.number, 'pttIdDisplay', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan"
                    />
                  )}
                </td>
                <td className="px-2 py-2">
                  {isDigitalMode(channel.mode) ? (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max="63"
                      value={channel.pttId}
                      onChange={(e) => handleCellChange(channel.number, 'pttId', parseInt(e.target.value) || 0)}
                      className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                    />
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={channel.voxRelated}
                    onChange={(e) => handleCellChange(channel.number, 'voxRelated', e.target.checked)}
                    className="w-4 h-4 accent-neon-cyan"
                  />
                </td>
                <td className="px-2 py-2">
                  {isDigitalMode(channel.mode) ? (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  ) : (
                    <select
                      value={channel.rxSquelchMode}
                      onChange={(e) => handleCellChange(channel.number, 'rxSquelchMode', e.target.value)}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                    >
                      <option value="Carrier/CTC">Carrier/CTC</option>
                      <option value="Optional">Optional</option>
                      <option value="CTC&Opt">CTC&Opt</option>
                      <option value="CTC|Opt">CTC|Opt</option>
                    </select>
                  )}
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.stepFrequency}
                    onChange={(e) => handleCellChange(channel.number, 'stepFrequency', parseInt(e.target.value) || 0)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
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
                </td>
                <td className="px-2 py-2">
                  {isDigitalMode(channel.mode) ? (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  ) : (
                    <select
                      value={channel.signalingType}
                      onChange={(e) => handleCellChange(channel.number, 'signalingType', e.target.value)}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                    >
                      <option value="None">None</option>
                      <option value="DTMF">DTMF</option>
                      <option value="Two Tone">2Tone</option>
                      <option value="Five Tone">5Tone</option>
                      <option value="MDC1200">MDC</option>
                    </select>
                  )}
                </td>
                <td className="px-2 py-2">
                  <select
                    value={channel.pttIdType}
                    onChange={(e) => handleCellChange(channel.number, 'pttIdType', e.target.value)}
                    className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                  >
                    <option value="Off">Off</option>
                    <option value="BOT">BOT</option>
                    <option value="EOT">EOT</option>
                    <option value="Both">Both</option>
                  </select>
                </td>
                {/* Digital-only fields */}
                <td className="px-2 py-2">
                  {showColorCode ? (
                    <input
                      type="number"
                      min="0"
                      max="15"
                      value={channel.colorCode}
                      onChange={(e) => handleCellChange(channel.number, 'colorCode', parseInt(e.target.value) || 0)}
                      className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
                    />
                  ) : (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {showColorCode ? (
                    <select
                      value={channel.rxGroupListId ?? 0}
                      onChange={(e) => handleCellChange(channel.number, 'rxGroupListId', parseInt(e.target.value) || 0)}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                    >
                      <option value={0}>None</option>
                      {rxGroups
                        .filter(group => group.index < 63) // RX Group List ID is 0-63, so valid indices are 0-62
                        .map((group) => (
                          <option key={group.index} value={group.index + 1}>
                            {group.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {showColorCode ? (
                    <button
                      onClick={() => {
                        // slotOperation: 0 = TS1, 1 = TS2 (stored at 0x1D bit 4)
                        // Toggle between 0 and 1
                        const currentSlot = channel.slotOperation ?? 0;
                        const newSlot = currentSlot === 0 ? 1 : 0; // Toggle: 0→1, 1→0
                        handleCellChange(channel.number, 'slotOperation', newSlot);
                      }}
                      className="w-8 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
                      title={`Slot ${(channel.slotOperation ?? 0) === 0 ? 1 : 2}`}
                    >
                      {(channel.slotOperation ?? 0) === 0 ? 1 : 2}
                    </button>
                  ) : (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {showColorCode ? (
                    <input
                      type="checkbox"
                      checked={channel.encryption ?? false}
                      onChange={(e) => handleCellChange(channel.number, 'encryption', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan"
                      title="Encryption"
                    />
                  ) : (
                    <span className="text-cool-gray text-xs">-</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {showColorCode ? (
                    <select
                      value={channel.encryptionId ?? 0}
                      onChange={(e) => handleCellChange(channel.number, 'encryptionId', parseInt(e.target.value) || 0)}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                      title="Encryption Key"
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
                  ) : (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {showColorCode ? (
                    <input
                      type="checkbox"
                      checked={channel.tdmaDirectMode ?? false}
                      onChange={(e) => handleCellChange(channel.number, 'tdmaDirectMode', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan"
                      title="TDMA Direct Mode"
                    />
                  ) : (
                    <span className="text-cool-gray text-xs">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {showColorCode ? (
                    <input
                      type="checkbox"
                      checked={channel.shortDataConfirm ?? false}
                      onChange={(e) => handleCellChange(channel.number, 'shortDataConfirm', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan"
                      title="Short Data Confirm"
                    />
                  ) : (
                    <span className="text-cool-gray text-xs">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {showColorCode ? (
                    <input
                      type="checkbox"
                      checked={channel.privateConfirm ?? false}
                      onChange={(e) => handleCellChange(channel.number, 'privateConfirm', e.target.checked)}
                      className="w-4 h-4 accent-neon-cyan"
                      title="Private Confirm"
                    />
                  ) : (
                    <span className="text-cool-gray text-xs">-</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {showColorCode ? (
                    <select
                      value={String(channel.dmrRadioIdIndex ?? 255)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        // 255 = None, store as 255 (will be converted to 0xFF when encoding)
                        handleCellChange(channel.number, 'dmrRadioIdIndex', value);
                      }}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                      title="DMR Radio ID Index for TX"
                    >
                      <option value="255">None</option>
                      {dmrRadioIds.map((radioId) => {
                        // Use 0-based index directly (0=first entry, 1=second entry, etc.)
                        return (
                          <option key={radioId.index} value={String(radioId.index)}>
                            {radioId.name} (ID: {radioId.dmrId})
                          </option>
                        );
                      })}
                      {/* Show current value even if it's not in the list (e.g., deleted radio ID) */}
                      {channel.dmrRadioIdIndex !== undefined && channel.dmrRadioIdIndex !== 255 && !dmrRadioIds.find(r => r.index === channel.dmrRadioIdIndex) && (
                        <option value={String(channel.dmrRadioIdIndex)} disabled>
                          Index {channel.dmrRadioIdIndex} (not found)
                        </option>
                      )}
                    </select>
                  ) : (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  )}
                </td>
                {/* Common fields - work for both */}
                <td className="px-2 py-2">
                  {showColorCode ? (
                    <select
                      value={channel.contactId}
                      onChange={(e) => handleCellChange(channel.number, 'contactId', parseInt(e.target.value) || 0)}
                      className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
                    >
                      <option value={0}>None</option>
                      {talkGroups.map((tg) => {
                        const callTypeLabel = tg.callType === 0x05 ? 'All' : tg.callType === 0x04 ? 'Grp' : tg.callType === 0x03 ? 'Prv' : '?';
                        return (
                          <option key={tg.index} value={tg.index}>
                            {tg.name} [{callTypeLabel}] ({tg.contactNumber})
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <span className="text-cool-gray text-xs text-center block">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center sticky right-0 bg-deep-gray z-10">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => setEditingChannel(channel)}
                      className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
                      title={`Edit ${isVFOChannel(channel.number) ? `VFO ${getVFOIdentifier(channel.number)}` : `channel ${channel.number}`}`}
                    >
                      ✎
                    </button>
                    {!isVFOChannel(channel.number) && (
                    <button
                      onClick={() => handleCloneChannel(channel)}
                      className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-neon-magenta border border-neon-magenta border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
                      title={`Clone channel ${channel.number}`}
                    >
                      ⧉
                    </button>
                    )}
                    {!isVFOChannel(channel.number) && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete channel ${channel.number}: "${channel.name}"?`)) {
                          deleteChannel(channel.number);
                        }
                      }}
                      className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-red-400 border border-red-600 border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
                      title={`Delete channel ${channel.number}`}
                    >
                      ×
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
        </div>
      </div>
      {editingChannel && (
        <ChannelEditModal
          isOpen={!!editingChannel}
          onClose={() => setEditingChannel(null)}
          channel={editingChannel}
          onSave={(updatedChannel) => {
            updateChannel(updatedChannel.number, updatedChannel);
            setEditingChannel(null);
          }}
          rxGroups={rxGroups}
          encryptionKeys={encryptionKeys}
          talkGroups={talkGroups}
        />
      )}
    </Card>
  );
};