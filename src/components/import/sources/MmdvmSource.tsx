import React, { useState, useRef, useEffect } from 'react';
import { useChannelsStore } from '../../../store/channelsStore';
import { useZonesStore } from '../../../store/zonesStore';
import { useContactsStore } from '../../../store/contactsStore';
import { useDMRRadioIDsStore } from '../../../store/dmrRadioIdsStore';
import { getNextChannelNumber } from '../../../utils/importHelpers';
import {
  generateMMDVMChannels,
  isValidMMDVMFrequency,
  MMDVM_FREQ_MIN_MHZ,
  MMDVM_FREQ_MAX_MHZ,
  type MMDVMChannelEntry,
} from '../../../services/mmdvmChannels';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface MmdvmSourceProps {
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number }) => void;
}

export const MmdvmSource: React.FC<MmdvmSourceProps> = ({ onError, onGenerationResult }) => {
  const { radioIds } = useDMRRadioIDsStore();

  const [mmdvmFrequency, setMmdvmFrequency] = useState('431.150');
  const [mmdvmEntries, setMmdvmEntries] = useState<MMDVMChannelEntry[]>([
    { channelName: '', talkGroupName: 'Local', talkGroupId: 9 },
  ]);
  const [mmdvmZoneName, setMmdvmZoneName] = useState('MMDVM');
  const [mmdvmDmrRadioIdIndex, setMmdvmDmrRadioIdIndex] = useState<string>(''); // '' = None, or String(index)
  const [isAddingMmdvm, setIsAddingMmdvm] = useState(false);
  const mmdvmDmrIdDefaultSetRef = useRef(false);

  // Preset MMDVM DMR Radio ID to first ID (slot 1) when list becomes available, once
  useEffect(() => {
    if (radioIds.length > 0 && !mmdvmDmrIdDefaultSetRef.current) {
      setMmdvmDmrRadioIdIndex(String(radioIds[0].index));
      mmdvmDmrIdDefaultSetRef.current = true;
    }
  }, [radioIds]);

  const handleAddMmdvmChannels = () => {
    const freq = parseFloat(mmdvmFrequency);
    if (!isValidMMDVMFrequency(freq)) {
      onError(`Frequency must be between ${MMDVM_FREQ_MIN_MHZ} and ${MMDVM_FREQ_MAX_MHZ} MHz`);
      return;
    }
    const validEntries = mmdvmEntries.filter(
      (e) => (e.talkGroupName?.trim() || e.channelName?.trim()) && !isNaN(e.talkGroupId) && e.talkGroupId >= 0
    );
    if (validEntries.length === 0) {
      onError('Add at least one channel with a Talk Group name and Talk Group ID.');
      return;
    }

    setIsAddingMmdvm(true);
    onError('');

    try {
      // Fresh reads at click time — see RptrsSource.tsx for why these can't be
      // values captured at render time.
      const currentChannels = useChannelsStore.getState().channels;
      const currentContacts = useContactsStore.getState().contacts;
      const nextChannelNumber = getNextChannelNumber(currentChannels);

      const maxContactId = currentContacts.length > 0 ? Math.max(...currentContacts.map((c) => c.id)) : 0;
      const firstContactId = maxContactId + 1;

      const firstDmrRadioIdIndex =
        mmdvmDmrRadioIdIndex === '' || mmdvmDmrRadioIdIndex === 'none'
          ? undefined
          : parseInt(mmdvmDmrRadioIdIndex, 10);
      const validDmrIndex =
        firstDmrRadioIdIndex !== undefined &&
        !isNaN(firstDmrRadioIdIndex) &&
        radioIds.some((r) => r.index === firstDmrRadioIdIndex)
          ? firstDmrRadioIdIndex
          : undefined;

      const result = generateMMDVMChannels({
        frequencyMhz: freq,
        entries: validEntries,
        firstChannelNumber: nextChannelNumber,
        firstContactId,
        dmrRadioIdIndex: validDmrIndex,
        zoneName: mmdvmZoneName.trim() || undefined,
      });

      useContactsStore.getState().addContacts(result.contacts);
      useChannelsStore.getState().addChannels(result.channels);
      useZonesStore.getState().addZones([result.zone]);

      onGenerationResult({
        channels: result.channels.length,
        zones: 1,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add MMDVM channels');
    } finally {
      setIsAddingMmdvm(false);
    }
  };

  return (
    <Card padding="tight" className="mb-4">
      <SectionTitle as="h3" size="lg" className="mb-2">MMDVM</SectionTitle>
      <p className="text-sm text-cool-gray mb-4">
        Add simplex MMDVM hotspot channels (one frequency, Slot 2, Color Code 1). You can create multiple channels on the same frequency with different talk groups—for example, one for local (TG 9) and one for a brandmeister talk group.
      </p>

      <div className="grid grid-cols-1 gap-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-cool-gray mb-2">Zone name</label>
            <input
              type="text"
              value={mmdvmZoneName}
              onChange={(e) => setMmdvmZoneName(e.target.value)}
              placeholder="Default: MMDVM"
              maxLength={16}
              className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-cool-gray mb-2">Frequency (MHz)</label>
            <input
              type="number"
              value={mmdvmFrequency}
              onChange={(e) => setMmdvmFrequency(e.target.value)}
              min={MMDVM_FREQ_MIN_MHZ}
              max={MMDVM_FREQ_MAX_MHZ}
              step="0.001"
              placeholder="431.150"
              className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
            />
            <p className="text-xs text-cool-gray mt-1">
              {MMDVM_FREQ_MIN_MHZ}–{MMDVM_FREQ_MAX_MHZ} MHz
            </p>
          </div>
          <div>
            <label className="block text-sm text-cool-gray mb-2">DMR Radio ID</label>
            <select
              value={mmdvmDmrRadioIdIndex}
              onChange={(e) => setMmdvmDmrRadioIdIndex(e.target.value)}
              className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
            >
              <option value="">None</option>
              {radioIds.map((radioId) => (
                <option key={radioId.index} value={String(radioId.index)}>
                  {radioId.name} (ID: {radioId.dmrId})
                </option>
              ))}
            </select>
            <p className="text-xs text-cool-gray mt-1">
              For TX on all channels
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm text-cool-gray mb-2">Channels (same frequency, different talk groups)</label>
          <p className="text-xs text-cool-gray mb-2">
            Each row is one channel. Set the talk group name and ID (e.g. Local = 9, Brandmeister Canada = 3100).
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {mmdvmEntries.map((entry, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-2 items-end p-2 rounded border border-neon-cyan border-opacity-30 bg-black bg-opacity-30"
              >
                <div className="col-span-3">
                  <label className="block text-xs text-cool-gray mb-1">Channel name</label>
                  <input
                    type="text"
                    value={entry.channelName}
                    onChange={(e) => {
                      const next = [...mmdvmEntries];
                      next[index] = { ...next[index], channelName: e.target.value };
                      setMmdvmEntries(next);
                    }}
                    placeholder="Optional"
                    maxLength={16}
                    className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-cool-gray mb-1">Talk group name</label>
                  <input
                    type="text"
                    value={entry.talkGroupName}
                    onChange={(e) => {
                      const next = [...mmdvmEntries];
                      next[index] = { ...next[index], talkGroupName: e.target.value };
                      setMmdvmEntries(next);
                    }}
                    placeholder="e.g. Local"
                    maxLength={16}
                    className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-cool-gray mb-1">TG ID</label>
                  <input
                    type="number"
                    value={entry.talkGroupId || ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                      const next = [...mmdvmEntries];
                      next[index] = { ...next[index], talkGroupId: isNaN(v) ? 0 : v };
                      setMmdvmEntries(next);
                    }}
                    min={0}
                    max={16776415}
                    placeholder="9"
                    className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div className="col-span-3 flex items-end gap-1">
                  {mmdvmEntries.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setMmdvmEntries(mmdvmEntries.filter((_, i) => i !== index))}
                      className="text-sm text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  ) : null}
                  {index === mmdvmEntries.length - 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setMmdvmEntries([
                          ...mmdvmEntries,
                          { channelName: '', talkGroupName: '', talkGroupId: 9 },
                        ])
                      }
                      className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                    >
                      + Add channel
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {radioIds.length === 0 && (
          <div className="rounded p-2 bg-yellow-900 border border-yellow-600 text-yellow-200 text-sm">
            No DMR Radio ID set. Add one in the Digital tab so your radio can transmit on these channels.
          </div>
        )}

        <p className="text-xs text-cool-gray">
          Settings: Digital, Slot 2, Color Code 1. Selected DMR Radio ID is used for TX on all channels.
        </p>
      </div>

      <Button
        onClick={handleAddMmdvmChannels}
        disabled={isAddingMmdvm}
        className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
      >
        {isAddingMmdvm ? 'Adding MMDVM channels...' : 'Add MMDVM channels'}
      </Button>
    </Card>
  );
};
