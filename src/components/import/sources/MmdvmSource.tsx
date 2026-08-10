import React, { useState, useRef, useEffect } from 'react';
import { useChannelsStore } from '../../../store/channelsStore';
import { useZonesStore } from '../../../store/zonesStore';
import { useQuickContactsStore } from '../../../store/quickContactsStore';
import { useDMRRadioIDsStore } from '../../../store/dmrRadioIdsStore';
import { getNextChannelNumber } from '../../../utils/importHelpers';
import { generateZoneId } from '../../../utils/zoneHelpers';
import {
  generateMMDVMChannels,
  isValidMMDVMFrequency,
  isValidMMDVMDuplexFrequency,
  MMDVM_FREQ_MIN_MHZ,
  MMDVM_FREQ_MAX_MHZ,
  MMDVM_DUPLEX_VHF_MIN_MHZ,
  MMDVM_DUPLEX_UHF_MAX_MHZ,
  MMDVM_DUPLEX_RANGE_DESCRIPTION,
  type MMDVMChannelEntry,
} from '../../../services/mmdvmChannels';
import type { QuickContact } from '../../../models/QuickContact';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface MmdvmSourceProps {
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number }) => void;
}

interface MmdvmUiEntry {
  channelName: string;
  /** true = reference an existing Talk Group (QuickContact); false = create a new one */
  useExisting: boolean;
  existingIndex: string; // '' = none selected, else String(QuickContact.index)
  newTalkGroupName: string;
  newTalkGroupId: number;
}

const emptyEntry = (): MmdvmUiEntry => ({
  channelName: '',
  useExisting: false,
  existingIndex: '',
  newTalkGroupName: '',
  newTalkGroupId: 9,
});

const isEntryFilled = (e: MmdvmUiEntry): boolean =>
  e.useExisting ? e.existingIndex !== '' : (e.newTalkGroupName.trim() !== '' || e.channelName.trim() !== '');

export const MmdvmSource: React.FC<MmdvmSourceProps> = ({ onError, onGenerationResult }) => {
  const { radioIds } = useDMRRadioIDsStore();
  const { contacts: talkGroups } = useQuickContactsStore();
  const { zones } = useZonesStore();

  const [mmdvmFrequency, setMmdvmFrequency] = useState('431.150');
  const [mmdvmDuplex, setMmdvmDuplex] = useState(false);
  const [mmdvmTxFrequency, setMmdvmTxFrequency] = useState('');
  const [mmdvmTimeslot, setMmdvmTimeslot] = useState<'1' | '2'>('2');
  const [mmdvmEntries, setMmdvmEntries] = useState<MmdvmUiEntry[]>([
    { channelName: '', useExisting: false, existingIndex: '', newTalkGroupName: 'Local', newTalkGroupId: 9 },
  ]);
  const [mmdvmZoneName, setMmdvmZoneName] = useState('MMDVM');
  const [mmdvmUseExistingZone, setMmdvmUseExistingZone] = useState(false);
  const [mmdvmExistingZoneId, setMmdvmExistingZoneId] = useState('');
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
    let txFreq: number | undefined;
    if (mmdvmDuplex) {
      // Duplex pairs with a real repeater — both sides use the broader 2m/70cm range, not
      // the narrow simplex-hotspot calling range below.
      if (!isValidMMDVMDuplexFrequency(freq)) {
        onError(`RX frequency must be in ${MMDVM_DUPLEX_RANGE_DESCRIPTION}`);
        return;
      }
      txFreq = parseFloat(mmdvmTxFrequency);
      if (!isValidMMDVMDuplexFrequency(txFreq)) {
        onError(`TX frequency must be in ${MMDVM_DUPLEX_RANGE_DESCRIPTION}`);
        return;
      }
    } else if (!isValidMMDVMFrequency(freq)) {
      onError(`Frequency must be between ${MMDVM_FREQ_MIN_MHZ} and ${MMDVM_FREQ_MAX_MHZ} MHz`);
      return;
    }

    const filledEntries = mmdvmEntries.filter(isEntryFilled);
    if (filledEntries.length === 0) {
      onError('Add at least one channel with a talk group (existing or new).');
      return;
    }
    for (const entry of filledEntries) {
      if (entry.useExisting) {
        if (entry.existingIndex === '' || !talkGroups.some((tg) => tg.index === parseInt(entry.existingIndex, 10))) {
          onError('Select a valid existing talk group for each channel using one, or switch it to "New".');
          return;
        }
      } else if (!entry.newTalkGroupName.trim() || isNaN(entry.newTalkGroupId) || entry.newTalkGroupId < 0) {
        onError('Enter a talk group name and ID for each new channel.');
        return;
      }
    }
    if (mmdvmUseExistingZone && !mmdvmExistingZoneId) {
      onError('Select an existing zone, or uncheck "Add to existing zone" to create a new one.');
      return;
    }

    setIsAddingMmdvm(true);
    onError('');

    try {
      // Fresh reads at click time — see RptrsSource.tsx for why these can't be
      // values captured at render time.
      const currentChannels = useChannelsStore.getState().channels;
      const nextChannelNumber = getNextChannelNumber(currentChannels);

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

      // Resolve talk groups: entries referencing an existing one use its index directly.
      // New ones get sequential indices predicted here, then created atomically below in
      // the same order — this stays in lockstep because nothing else touches the Talk
      // Groups store between the read and the addContacts() call.
      const currentTalkGroups = useQuickContactsStore.getState().contacts;
      let nextTalkGroupIndex = currentTalkGroups.length + 1;
      const newTalkGroups: Omit<QuickContact, 'index' | 'offset' | 'rawData' | 'hasHeader'>[] = [];
      const resolvedEntries: MMDVMChannelEntry[] = filledEntries.map((entry) => {
        if (entry.useExisting) {
          return { channelName: entry.channelName, contactId: parseInt(entry.existingIndex, 10) };
        }
        const contactId = nextTalkGroupIndex++;
        newTalkGroups.push({
          name: (entry.newTalkGroupName || `TG ${entry.newTalkGroupId}`).substring(0, 16),
          contactNumber: entry.newTalkGroupId,
          callType: 0x04, // Group Call
          flag: 0, // PC-created
        });
        return { channelName: entry.channelName, contactId };
      });

      const result = generateMMDVMChannels({
        frequencyMhz: freq,
        txFrequencyMhz: txFreq,
        entries: resolvedEntries,
        firstChannelNumber: nextChannelNumber,
        dmrRadioIdIndex: validDmrIndex,
        timeslot: mmdvmTimeslot === '1' ? 1 : 2,
      });

      if (newTalkGroups.length > 0) {
        useQuickContactsStore.getState().addContacts(newTalkGroups);
      }
      useChannelsStore.getState().addChannels(result.channels);

      const newChannelNumbers = result.channels.map((c) => c.number);
      if (mmdvmUseExistingZone && mmdvmExistingZoneId) {
        const zone = useZonesStore.getState().zones.find((z) => z.id === mmdvmExistingZoneId);
        if (zone) {
          const merged = Array.from(new Set([...zone.channels, ...newChannelNumbers])).slice(0, 64);
          useZonesStore.getState().updateZone(zone.id, { channels: merged });
        }
      } else {
        useZonesStore.getState().addZones([{
          id: generateZoneId(),
          name: (mmdvmZoneName.trim() || 'MMDVM').substring(0, 16),
          channels: newChannelNumbers,
        }]);
      }

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
        Add MMDVM hotspot channels (Color Code 1). Simplex uses one frequency for RX and TX; duplex
        pairs a separate TX frequency for a hotspot linked to a real repeater. You can create multiple
        channels on the same frequency pair with different talk groups—for example, one for local
        (TG 9) and one for a brandmeister talk group.
      </p>

      <div className="grid grid-cols-1 gap-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          <div>
            <label className="flex items-center gap-2 cursor-pointer w-fit mb-2">
              <input
                type="checkbox"
                checked={mmdvmUseExistingZone}
                onChange={(e) => setMmdvmUseExistingZone(e.target.checked)}
                className="w-4 h-4 accent-neon-cyan"
              />
              <span className="text-sm text-cool-gray">Add to existing zone</span>
            </label>
            {mmdvmUseExistingZone ? (
              <select
                value={mmdvmExistingZoneId}
                onChange={(e) => setMmdvmExistingZoneId(e.target.value)}
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              >
                <option value="">Select a zone...</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name} ({zone.channels.length} channels)
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={mmdvmZoneName}
                onChange={(e) => setMmdvmZoneName(e.target.value)}
                placeholder="Default: MMDVM"
                maxLength={16}
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
            )}
          </div>
          <div>
            <label className="block text-sm text-cool-gray mb-2">{mmdvmDuplex ? 'RX Frequency (MHz)' : 'Frequency (MHz)'}</label>
            <input
              type="number"
              value={mmdvmFrequency}
              onChange={(e) => setMmdvmFrequency(e.target.value)}
              min={mmdvmDuplex ? MMDVM_DUPLEX_VHF_MIN_MHZ : MMDVM_FREQ_MIN_MHZ}
              max={mmdvmDuplex ? MMDVM_DUPLEX_UHF_MAX_MHZ : MMDVM_FREQ_MAX_MHZ}
              step="0.001"
              placeholder="431.150"
              className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
            />
            <p className="text-xs text-cool-gray mt-1">
              {mmdvmDuplex
                ? `${MMDVM_DUPLEX_RANGE_DESCRIPTION} — the repeater's output frequency`
                : `${MMDVM_FREQ_MIN_MHZ}–${MMDVM_FREQ_MAX_MHZ} MHz`}
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
          <div>
            <label className="block text-sm text-cool-gray mb-2">Timeslot</label>
            <select
              value={mmdvmTimeslot}
              onChange={(e) => setMmdvmTimeslot(e.target.value === '1' ? '1' : '2')}
              className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
            >
              <option value="1">TS1</option>
              <option value="2">TS2</option>
            </select>
            <p className="text-xs text-cool-gray mt-1">
              Match your hotspot/repeater's slot
            </p>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={mmdvmDuplex}
              onChange={(e) => setMmdvmDuplex(e.target.checked)}
              className="w-4 h-4 accent-neon-cyan"
            />
            <span className="text-sm text-cool-gray">Duplex (hotspot linked to a real repeater)</span>
          </label>
          {mmdvmDuplex && (
            <div className="mt-2 max-w-xs">
              <label className="block text-sm text-cool-gray mb-2">TX Frequency (MHz)</label>
              <input
                type="number"
                value={mmdvmTxFrequency}
                onChange={(e) => setMmdvmTxFrequency(e.target.value)}
                min={MMDVM_DUPLEX_VHF_MIN_MHZ}
                max={MMDVM_DUPLEX_UHF_MAX_MHZ}
                step="0.001"
                placeholder="e.g. 436.150"
                className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
              />
              <p className="text-xs text-cool-gray mt-1">
                {MMDVM_DUPLEX_RANGE_DESCRIPTION} — the repeater's input frequency
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm text-cool-gray mb-2">Channels</label>
          <p className="text-xs text-cool-gray mb-2">
            Each row is one channel. Reference an existing talk group from the list, or create a new one.
          </p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {mmdvmEntries.map((entry, index) => (
              <div
                key={index}
                className="p-2 rounded border border-neon-cyan border-opacity-30 bg-black bg-opacity-30 space-y-2"
              >
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
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
                  <div className="col-span-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={entry.useExisting}
                        onChange={(e) => {
                          const next = [...mmdvmEntries];
                          next[index] = { ...next[index], useExisting: e.target.checked };
                          setMmdvmEntries(next);
                        }}
                        className="w-4 h-4 accent-neon-cyan"
                      />
                      <span className="text-xs text-cool-gray">Use existing talk group</span>
                    </label>
                  </div>
                  <div className="col-span-3 flex items-end gap-1 justify-end">
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
                        onClick={() => setMmdvmEntries([...mmdvmEntries, emptyEntry()])}
                        className="text-sm text-neon-cyan hover:text-neon-cyan-bright"
                      >
                        + Add channel
                      </button>
                    ) : null}
                  </div>
                </div>
                {entry.useExisting ? (
                  <div>
                    <label className="block text-xs text-cool-gray mb-1">Talk group</label>
                    <select
                      value={entry.existingIndex}
                      onChange={(e) => {
                        const next = [...mmdvmEntries];
                        next[index] = { ...next[index], existingIndex: e.target.value };
                        setMmdvmEntries(next);
                      }}
                      className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                    >
                      <option value="">Select a talk group...</option>
                      {talkGroups.map((tg) => (
                        <option key={tg.index} value={tg.index}>
                          {tg.name} ({tg.contactNumber})
                        </option>
                      ))}
                    </select>
                    {talkGroups.length === 0 && (
                      <p className="text-xs text-yellow-400 mt-1">No talk groups yet — uncheck to create one.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-cool-gray mb-1">New talk group name</label>
                      <input
                        type="text"
                        value={entry.newTalkGroupName}
                        onChange={(e) => {
                          const next = [...mmdvmEntries];
                          next[index] = { ...next[index], newTalkGroupName: e.target.value };
                          setMmdvmEntries(next);
                        }}
                        placeholder="e.g. Local"
                        maxLength={16}
                        className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-cool-gray mb-1">New TG ID</label>
                      <input
                        type="number"
                        value={entry.newTalkGroupId || ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                          const next = [...mmdvmEntries];
                          next[index] = { ...next[index], newTalkGroupId: isNaN(v) ? 0 : v };
                          setMmdvmEntries(next);
                        }}
                        min={0}
                        max={16776415}
                        placeholder="9"
                        className="w-full bg-black border border-neon-cyan rounded px-2 py-1.5 text-white text-sm"
                      />
                    </div>
                  </div>
                )}
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
          Settings: Digital, Color Code 1. Selected DMR Radio ID is used for TX on all channels. New talk
          groups are added to the Talk Groups list in the Digital tab.
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
