import React, { useState } from 'react';
import { formatPlural } from '../../../utils/formatPlural';
import type { Channel, Zone } from '../../../models';
import type { QuickContact } from '../../../models/QuickContact';
import { useChannelsStore } from '../../../store/channelsStore';
import { useZonesStore } from '../../../store/zonesStore';
import { useQuickContactsStore } from '../../../store/quickContactsStore';
import { getNextChannelNumber, selectionCardClass } from '../../../utils/importHelpers';
import { generateZoneId } from '../../../utils/zoneHelpers';
import { generateRptrsChannels } from '../../../services/rptrsChannels';
import { generateMMDVMChannels, type MMDVMChannelEntry } from '../../../services/mmdvmChannels';
import { fetchBrandmeisterStaticTalkgroups, fetchBrandmeisterTalkgroupName } from '../../../services/brandmeisterApi';
import { mergeChannelSetsWithExisting } from '../../../services/channelMerger';
import {
  convertRptrFrequency,
  convertRptrOffset,
  groupRptrsByLocation,
  type RptrData,
} from '../../../data/rptrsData';
import { SelectAllButtons } from '../SelectAllButtons';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface RptrsSourceProps {
  rptrs: (RptrData & { distance?: number })[];
  isSearching: boolean;
  loadProgress: { percent: number; loaded: number; total: number } | null;
  supportsDigital: boolean;
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number }) => void;
}

export const RptrsSource: React.FC<RptrsSourceProps> = ({
  rptrs,
  isSearching: _isSearching,
  loadProgress: _loadProgress,
  supportsDigital,
  onError,
  onGenerationResult,
}) => {
  const [rptrsSearchFilter, setRptrsSearchFilter] = useState('');
  const [selectedRptrs, setSelectedRptrs] = useState<Set<number>>(new Set());
  const [rptrsZoneGrouping, setRptrsZoneGrouping] = useState<'location' | 'single'>('location');
  const [rptrsSeparateTimeslots, setRptrsSeparateTimeslots] = useState(true);
  const [rptrsUseStaticTgs, setRptrsUseStaticTgs] = useState(false);
  const [isAddingRptrs, setIsAddingRptrs] = useState(false);

  const handleToggleRptr = (index: number) => {
    const newSelected = new Set(selectedRptrs);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRptrs(newSelected);
  };

  const handleSelectAllRptrs = () => {
    setSelectedRptrs(new Set(rptrs.map((_, i) => i)));
  };

  const handleDeselectAllRptrs = () => {
    setSelectedRptrs(new Set());
  };

  /**
   * Per-repeater, per-static-talk-group channel generation. BrandMeister only — that's the
   * only network in rptrs.json whose static TG assignments are queryable via a public API.
   * Repeaters on other networks (or BrandMeister repeaters with none configured) are skipped
   * with a console warning rather than failing the whole batch.
   */
  const generateStaticTgChannels = async (
    selectedRptrsList: (RptrData & { distance?: number })[],
    startChannelNumber: number
  ): Promise<{ channels: Channel[]; zones: Zone[]; newTalkGroups: Omit<QuickContact, 'index' | 'offset' | 'rawData' | 'hasHeader'>[] }> => {
    const existingTalkGroups = useQuickContactsStore.getState().contacts;
    const queuedNewTgs: { contactNumber: number; index: number; name: string; callType: number; flag: number }[] = [];
    let nextTgIndex = existingTalkGroups.length + 1;

    const rptrsToProcess = selectedRptrsList.map(({ distance: _distance, ...rptr }) => rptr);
    const uniqueRptrs = new Map<string, RptrData>();
    for (const rptr of rptrsToProcess) {
      const freqMhz = convertRptrFrequency(rptr.frequency);
      const key = `${rptr.callsign}|${freqMhz.toFixed(3)}|${rptr.color_code}`;
      if (!uniqueRptrs.has(key)) uniqueRptrs.set(key, rptr);
    }

    const locationGroups = rptrsZoneGrouping === 'location'
      ? groupRptrsByLocation(Array.from(uniqueRptrs.values()), 2)
      : null;

    const channels: Channel[] = [];
    const zones: Zone[] = [];
    const allZoneChannels: number[] = [];
    let channelNumber = startChannelNumber;

    for (const rptr of uniqueRptrs.values()) {
      if ((rptr.ipsc_network || '').toLowerCase() !== 'brandmeister') {
        console.warn(`Skipping static TG import for ${rptr.callsign} — not a BrandMeister repeater`);
        continue;
      }

      let staticTgs;
      try {
        staticTgs = await fetchBrandmeisterStaticTalkgroups(rptr.id);
      } catch (err) {
        console.warn(`Skipping static TG import for ${rptr.callsign} — lookup failed`, err);
        continue;
      }
      if (staticTgs.length === 0) {
        console.warn(`Skipping static TG import for ${rptr.callsign} — no static talk groups configured`);
        continue;
      }

      const rxFrequency = convertRptrFrequency(rptr.frequency);
      const txFrequency = rxFrequency + convertRptrOffset(rptr.offset);

      const entries: MMDVMChannelEntry[] = [];
      for (const tg of staticTgs) {
        const existing = existingTalkGroups.find(c => c.contactNumber === tg.talkgroup)
          ?? queuedNewTgs.find(c => c.contactNumber === tg.talkgroup);
        let contactId: number;
        if (existing) {
          contactId = existing.index;
        } else {
          const fetchedName = await fetchBrandmeisterTalkgroupName(tg.talkgroup);
          const tgName = (fetchedName || `TG ${tg.talkgroup}`).substring(0, 16);
          contactId = nextTgIndex++;
          queuedNewTgs.push({ contactNumber: tg.talkgroup, index: contactId, name: tgName, callType: 0x04, flag: 0x00 });
        }
        entries.push({
          channelName: `${rptr.callsign}-${tg.talkgroup}`.substring(0, 16),
          contactId,
          timeslot: tg.slot,
        });
      }
      if (entries.length === 0) continue;

      let result;
      try {
        result = generateMMDVMChannels({
          frequencyMhz: rxFrequency,
          txFrequencyMhz: txFrequency,
          entries,
          firstChannelNumber: channelNumber,
          dmrRadioIdIndex: undefined,
          colorCode: rptr.color_code,
        });
      } catch (err) {
        console.warn(`Skipping static TG import for ${rptr.callsign} — ${err instanceof Error ? err.message : 'invalid frequency'}`);
        continue;
      }
      channelNumber += result.channels.length;
      channels.push(...result.channels);
      const channelNumbers = result.channels.map(c => c.number);

      if (rptrsZoneGrouping === 'single') {
        for (const num of channelNumbers) {
          if (!allZoneChannels.includes(num)) allZoneChannels.push(num);
        }
      } else if (locationGroups) {
        for (const [locationName, locationRptrs] of locationGroups.entries()) {
          if (locationRptrs.some(r =>
            r.callsign === rptr.callsign &&
            Math.abs(convertRptrFrequency(r.frequency) - rxFrequency) < 0.001 &&
            r.color_code === rptr.color_code
          )) {
            const zoneName = `DMR-${locationName}`.substring(0, 10);
            let zone = zones.find(z => z.name === zoneName);
            if (!zone) {
              zone = { id: generateZoneId(), name: zoneName, channels: [] };
              zones.push(zone);
            }
            for (const num of channelNumbers) {
              if (!zone.channels.includes(num)) zone.channels.push(num);
            }
            break;
          }
        }
      }
    }

    if (rptrsZoneGrouping === 'single' && allZoneChannels.length > 0) {
      zones.push({ id: generateZoneId(), name: 'DMR Rptrs', channels: Array.from(new Set(allZoneChannels)) });
    }

    const newTalkGroups = queuedNewTgs
      .sort((a, b) => a.index - b.index)
      .map(({ contactNumber, name, callType, flag }) => ({ contactNumber, name, callType, flag }));

    return { channels, zones, newTalkGroups };
  };

  const handleAddRptrsChannels = async () => {
    if (selectedRptrs.size === 0) {
      onError('Please select at least one DMR repeater');
      return;
    }

    setIsAddingRptrs(true);
    onError('');

    try {
      // Get selected repeaters
      const selectedRptrsList = Array.from(selectedRptrs)
        .map(i => rptrs[i])
        .filter(Boolean);

      if (selectedRptrsList.length === 0) {
        throw new Error('No DMR repeaters selected');
      }

      // Read the live channel list at the moment of the click, not a value captured
      // at render time — if another "Add channels" action ran since this component
      // last rendered, a stale array here would pick colliding channel numbers and
      // then blow away those newer channels entirely when committed below.
      const currentChannels = useChannelsStore.getState().channels;
      const nextChannelNumber = getNextChannelNumber(currentChannels);

      const result = rptrsUseStaticTgs
        ? await generateStaticTgChannels(selectedRptrsList, nextChannelNumber)
        : generateRptrsChannels(
            nextChannelNumber,
            selectedRptrsList,
            rptrsZoneGrouping === 'single',
            rptrsZoneGrouping === 'location',
            rptrsSeparateTimeslots
          );

      if (result.channels.length === 0) {
        onError(
          rptrsUseStaticTgs
            ? 'No static talk group channels generated — selected repeaters may not be on BrandMeister, or have none configured'
            : 'No channels to add from selected DMR repeaters'
        );
        return;
      }

      // Commit any newly-created talk groups first, so the channels' contactId
      // references resolve to real entries as soon as they land in the store.
      if ('newTalkGroups' in result && result.newTalkGroups.length > 0) {
        useQuickContactsStore.getState().addContacts(result.newTalkGroups);
      }

      // Merge overlaps within the new channels and dedupe against existing ones.
      // Existing channels are never renumbered — renumbering them would break
      // every zone and scan list that references them.
      const { channelsToAdd, channelMapping } = mergeChannelSetsWithExisting(
        currentChannels,
        [result.channels],
        nextChannelNumber
      );
      // Functional append: commits against whatever is in the store right now,
      // instead of replacing it wholesale with a snapshot that may already be stale.
      useChannelsStore.getState().addChannels(channelsToAdd);

      // Remap the generated zones through the merge mapping: a new channel that
      // collapsed into another (or matched an existing channel) changed number.
      const remappedZones = result.zones
        .map(zone => ({
          ...zone,
          channels: [...new Set(
            zone.channels
              .map(num => channelMapping.get(num))
              .filter((num): num is number => num !== undefined)
          )].sort((a, b) => a - b),
        }))
        .filter(zone => zone.channels.length > 0);
      useZonesStore.getState().addZones(remappedZones);

      onGenerationResult({
        channels: channelsToAdd.length,
        zones: remappedZones.length,
      });

      // Clear selection
      setSelectedRptrs(new Set());
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add DMR repeater channels');
    } finally {
      setIsAddingRptrs(false);
    }
  };

  if (!supportsDigital || rptrs.length === 0) return null;

  return (
    <Card padding="tight" className="mb-4">
      <SectionTitle as="h3" size="lg" className="mb-4">DMR Repeaters</SectionTitle>
        <>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Filter by callsign, city, or network..."
              value={rptrsSearchFilter}
              onChange={(e) => setRptrsSearchFilter(e.target.value)}
              className="w-full bg-black border border-neon-cyan rounded px-3 py-2 text-white"
            />
          </div>

          <div className="flex justify-between items-center mb-4">
            <SectionTitle as="h4" size="md">
              {rptrs.filter(r => {
                if (!rptrsSearchFilter.trim()) return true;
                const filter = rptrsSearchFilter.toLowerCase();
                return r.callsign.toLowerCase().includes(filter) ||
                       r.city.toLowerCase().includes(filter) ||
                       r.state.toLowerCase().includes(filter) ||
                       r.ipsc_network.toLowerCase().includes(filter);
              }).length} of {rptrs.length} {formatPlural(rptrs.length, 'DMR Repeater')}
              {rptrsSearchFilter.trim() && ` (filtered)`}
            </SectionTitle>
            <SelectAllButtons onSelectAll={handleSelectAllRptrs} onDeselectAll={handleDeselectAllRptrs} />
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
            {rptrs
              .filter(r => {
                if (!rptrsSearchFilter.trim()) return true;
                const filter = rptrsSearchFilter.toLowerCase();
                return r.callsign.toLowerCase().includes(filter) ||
                       r.city.toLowerCase().includes(filter) ||
                       r.state.toLowerCase().includes(filter) ||
                       r.ipsc_network.toLowerCase().includes(filter);
              })
              .map((rptr) => {
                const originalIndex = rptrs.findIndex(r => r === rptr);
                return (
                  <div
                    key={originalIndex}
                    className={selectionCardClass(selectedRptrs.has(originalIndex))}
                    onClick={() => handleToggleRptr(originalIndex)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="checkbox"
                            checked={selectedRptrs.has(originalIndex)}
                            onChange={() => handleToggleRptr(originalIndex)}
                            onClick={(e) => e.stopPropagation()}
                            className="mr-2"
                          />
                          <span className="font-semibold text-neon-cyan">{rptr.callsign}</span>
                          <span className="text-cool-gray text-sm">CC{rptr.color_code}</span>
                          <span className="text-cool-gray text-sm">{rptr.ts_linked}</span>
                        </div>
                        <div className="text-sm text-cool-gray">
                          <div>
                            {convertRptrFrequency(rptr.frequency).toFixed(5)} MHz
                            {rptr.offset && ` (Offset: ${rptr.offset} MHz)`}
                          </div>
                          <div>
                            {rptr.city}
                            {rptr.state && `, ${rptr.state}`}
                            {rptr.distance && ` (${rptr.distance.toFixed(1)} mi)`}
                          </div>
                          <div className="text-xs mt-1">
                            Network: {rptr.ipsc_network || 'Unknown'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {selectedRptrs.size > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-cool-gray">Zone Grouping:</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rptrsZoneGrouping"
                    value="location"
                    checked={rptrsZoneGrouping === 'location'}
                    onChange={(e) => setRptrsZoneGrouping(e.target.value as 'location' | 'single')}
                  />
                  <span className="text-cool-gray">Group by location</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rptrsZoneGrouping"
                    value="single"
                    checked={rptrsZoneGrouping === 'single'}
                    onChange={(e) => setRptrsZoneGrouping(e.target.value as 'location' | 'single')}
                  />
                  <span className="text-cool-gray">Single zone (all repeaters together)</span>
                </label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rptrsUseStaticTgs}
                  onChange={(e) => setRptrsUseStaticTgs(e.target.checked)}
                />
                <span className="text-cool-gray">Generate one channel per static talk group instead</span>
              </label>
              {rptrsUseStaticTgs ? (
                <div className="text-xs text-cool-gray pl-6">
                  Only works for BrandMeister repeaters — other networks will be skipped. Each
                  channel's timeslot comes from the repeater's static talk group assignment.
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rptrsSeparateTimeslots}
                    onChange={(e) => setRptrsSeparateTimeslots(e.target.checked)}
                  />
                  <span className="text-cool-gray">Create separate channels for each timeslot (TS1, TS2)</span>
                </label>
              )}
              <Button
                onClick={handleAddRptrsChannels}
                disabled={isAddingRptrs}
                className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
              >
                {isAddingRptrs
                  ? 'Adding DMR Repeater Channels...'
                  : rptrsUseStaticTgs
                    ? `Add Channels from ${selectedRptrs.size} ${formatPlural(selectedRptrs.size, 'Repeater')}'s Static Talk Groups`
                    : `Add ${selectedRptrs.size} ${formatPlural(selectedRptrs.size, 'DMR Repeater Channel')}`}
              </Button>
            </div>
          )}
        </>
    </Card>
  );
};
