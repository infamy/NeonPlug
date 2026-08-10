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
  getStateAbbrev,
  type RptrData,
} from '../../../data/rptrsData';
import { SelectAllButtons } from '../SelectAllButtons';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface StaticTgPreviewEntry {
  talkgroup: number;
  slot: 1 | 2;
  name: string;
  include: boolean;
}

interface RptrStaticTgPreview {
  rptr: RptrData;
  rxFrequency: number;
  txFrequency: number;
  tgs: StaticTgPreviewEntry[];
}

const DEFAULT_STATIC_TG_NAME_FORMAT = '{call}-{tg}';

/**
 * Fill a channel-name template with per-channel tokens and truncate to the 16-char
 * radio limit. Naming conventions vary a lot between operators (callsign vs. city vs.
 * abbreviated talk group name), so this is user-configurable rather than fixed.
 */
function applyChannelNameFormat(
  format: string,
  tokens: { call: string; city: string; state: string; tg: string; tgname: string }
): string {
  let name = format || DEFAULT_STATIC_TG_NAME_FORMAT;
  for (const [key, value] of Object.entries(tokens)) {
    name = name.split(`{${key}}`).join(value);
  }
  return name.substring(0, 16);
}

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
  const [rptrsChannelNameFormat, setRptrsChannelNameFormat] = useState(DEFAULT_STATIC_TG_NAME_FORMAT);
  const [isAddingRptrs, setIsAddingRptrs] = useState(false);
  const [isLoadingStaticTgs, setIsLoadingStaticTgs] = useState(false);
  const [staticTgPreview, setStaticTgPreview] = useState<RptrStaticTgPreview[] | null>(null);
  const [staticTgSkipped, setStaticTgSkipped] = useState<string[]>([]);

  const handleToggleRptr = (index: number) => {
    const newSelected = new Set(selectedRptrs);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRptrs(newSelected);
    setStaticTgPreview(null);
  };

  const handleSelectAllRptrs = () => {
    setSelectedRptrs(new Set(rptrs.map((_, i) => i)));
    setStaticTgPreview(null);
  };

  const handleDeselectAllRptrs = () => {
    setSelectedRptrs(new Set());
    setStaticTgPreview(null);
  };

  /**
   * Fetch static talk groups for the selected repeaters so the user can review and
   * uncheck ones they don't want before any channels are generated. BrandMeister only —
   * that's the only network in rptrs.json whose static TG assignments are queryable via
   * a public API; other networks (or BrandMeister repeaters with none configured) are
   * reported in staticTgSkipped instead of failing the whole batch.
   */
  const handleLoadStaticTgs = async () => {
    setIsLoadingStaticTgs(true);
    onError('');
    try {
      const selectedRptrsList = Array.from(selectedRptrs).map(i => rptrs[i]).filter(Boolean);
      const rptrsToProcess = selectedRptrsList.map(({ distance: _distance, ...rptr }) => rptr);
      const uniqueRptrs = new Map<string, RptrData>();
      for (const rptr of rptrsToProcess) {
        const freqMhz = convertRptrFrequency(rptr.frequency);
        const key = `${rptr.callsign}|${freqMhz.toFixed(3)}|${rptr.color_code}`;
        if (!uniqueRptrs.has(key)) uniqueRptrs.set(key, rptr);
      }

      const preview: RptrStaticTgPreview[] = [];
      const skipped: string[] = [];

      for (const rptr of uniqueRptrs.values()) {
        if ((rptr.ipsc_network || '').toLowerCase() !== 'brandmeister') {
          skipped.push(`${rptr.callsign} (not BrandMeister)`);
          continue;
        }
        let staticTgs;
        try {
          staticTgs = await fetchBrandmeisterStaticTalkgroups(rptr.id);
        } catch {
          skipped.push(`${rptr.callsign} (lookup failed)`);
          continue;
        }
        if (staticTgs.length === 0) {
          skipped.push(`${rptr.callsign} (no static talk groups configured)`);
          continue;
        }

        const tgs: StaticTgPreviewEntry[] = [];
        for (const tg of staticTgs) {
          const fetchedName = await fetchBrandmeisterTalkgroupName(tg.talkgroup);
          tgs.push({
            talkgroup: tg.talkgroup,
            slot: tg.slot,
            name: fetchedName || `TG ${tg.talkgroup}`,
            include: true,
          });
        }

        preview.push({
          rptr,
          rxFrequency: convertRptrFrequency(rptr.frequency),
          txFrequency: convertRptrFrequency(rptr.frequency) + convertRptrOffset(rptr.offset),
          tgs,
        });
      }

      setStaticTgPreview(preview);
      setStaticTgSkipped(skipped);
      if (preview.length === 0) {
        onError(`No static talk groups found.${skipped.length ? ' Skipped: ' + skipped.join(', ') : ''}`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load static talk groups');
    } finally {
      setIsLoadingStaticTgs(false);
    }
  };

  const handleToggleStaticTg = (rptrIndex: number, tgIndex: number) => {
    setStaticTgPreview(prev => {
      if (!prev) return prev;
      const next = [...prev];
      const entry = { ...next[rptrIndex] };
      entry.tgs = entry.tgs.map((tg, i) => i === tgIndex ? { ...tg, include: !tg.include } : tg);
      next[rptrIndex] = entry;
      return next;
    });
  };

  const handleToggleAllStaticTgsForRptr = (rptrIndex: number, include: boolean) => {
    setStaticTgPreview(prev => {
      if (!prev) return prev;
      const next = [...prev];
      const entry = { ...next[rptrIndex] };
      entry.tgs = entry.tgs.map(tg => ({ ...tg, include }));
      next[rptrIndex] = entry;
      return next;
    });
  };

  /**
   * Build channels/zones/new-talk-groups from the reviewed preview (only checked TGs).
   * Talk group resolution (existing vs. new) happens here, right before commit, against
   * the freshest store state.
   */
  const buildChannelsFromPreview = (
    preview: RptrStaticTgPreview[],
    startChannelNumber: number
  ): { channels: Channel[]; zones: Zone[]; newTalkGroups: Omit<QuickContact, 'index' | 'offset' | 'rawData' | 'hasHeader'>[] } => {
    const existingTalkGroups = useQuickContactsStore.getState().contacts;
    const queuedNewTgs: { contactNumber: number; index: number; name: string; callType: number; flag: number }[] = [];
    let nextTgIndex = existingTalkGroups.length + 1;

    const rptrsInPreview = preview.map(p => p.rptr);
    const locationGroups = rptrsZoneGrouping === 'location'
      ? groupRptrsByLocation(rptrsInPreview, 2)
      : null;

    const channels: Channel[] = [];
    const zones: Zone[] = [];
    const allZoneChannels: number[] = [];
    let channelNumber = startChannelNumber;

    for (const { rptr, rxFrequency, txFrequency, tgs } of preview) {
      const includedTgs = tgs.filter(tg => tg.include);
      if (includedTgs.length === 0) continue;

      const entries: MMDVMChannelEntry[] = includedTgs.map(tg => {
        const existing = existingTalkGroups.find(c => c.contactNumber === tg.talkgroup)
          ?? queuedNewTgs.find(c => c.contactNumber === tg.talkgroup);
        let contactId: number;
        if (existing) {
          contactId = existing.index;
        } else {
          contactId = nextTgIndex++;
          queuedNewTgs.push({
            contactNumber: tg.talkgroup,
            index: contactId,
            name: tg.name.substring(0, 16),
            callType: 0x04,
            flag: 0x00,
          });
        }
        return {
          channelName: applyChannelNameFormat(rptrsChannelNameFormat, {
            call: rptr.callsign,
            city: rptr.city,
            state: getStateAbbrev(rptr.state || ''),
            tg: String(tg.talkgroup),
            tgname: tg.name,
          }),
          contactId,
          timeslot: tg.slot,
        };
      });

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
        console.warn(`Skipping ${rptr.callsign} — ${err instanceof Error ? err.message : 'invalid frequency'}`);
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
    if (rptrsUseStaticTgs && !staticTgPreview) {
      onError('Load static talk groups first');
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

      const result = rptrsUseStaticTgs && staticTgPreview
        ? buildChannelsFromPreview(staticTgPreview, nextChannelNumber)
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
            ? 'No static talk group channels generated — check at least one talk group'
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
      setStaticTgPreview(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add DMR repeater channels');
    } finally {
      setIsAddingRptrs(false);
    }
  };

  if (!supportsDigital || rptrs.length === 0) return null;

  const namePreviewRptr = Array.from(selectedRptrs).map(i => rptrs[i]).filter(Boolean)[0];
  const namePreviewExample = namePreviewRptr
    ? applyChannelNameFormat(rptrsChannelNameFormat, {
        call: namePreviewRptr.callsign,
        city: namePreviewRptr.city,
        state: getStateAbbrev(namePreviewRptr.state || ''),
        tg: '3172',
        tgname: 'Colorado',
      })
    : applyChannelNameFormat(rptrsChannelNameFormat, {
        call: 'K0NXA',
        city: 'Denver',
        state: 'CO',
        tg: '3172',
        tgname: 'Colorado',
      });

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
                  onChange={(e) => {
                    setRptrsUseStaticTgs(e.target.checked);
                    setStaticTgPreview(null);
                  }}
                />
                <span className="text-cool-gray">Generate one channel per static talk group instead</span>
              </label>
              {rptrsUseStaticTgs ? (
                <>
                  <div className="text-xs text-cool-gray pl-6">
                    Only works for BrandMeister repeaters — other networks will be skipped. Each
                    channel's timeslot comes from the repeater's static talk group assignment.
                  </div>

                  <div className="pl-6 space-y-1">
                    <label className="text-xs text-cool-gray block">
                      Channel name format (tokens: {'{call}'} {'{city}'} {'{state}'} {'{tg}'} {'{tgname}'}, truncated to 16 chars):
                    </label>
                    <input
                      type="text"
                      value={rptrsChannelNameFormat}
                      onChange={(e) => setRptrsChannelNameFormat(e.target.value)}
                      placeholder={DEFAULT_STATIC_TG_NAME_FORMAT}
                      className="w-full bg-black border border-neon-cyan rounded px-2 py-1 text-white text-sm"
                    />
                    <div className="text-xs text-cool-gray">
                      Preview: <span className="text-neon-cyan">{namePreviewExample}</span>
                    </div>
                  </div>

                  {!staticTgPreview ? (
                    <Button
                      onClick={handleLoadStaticTgs}
                      disabled={isLoadingStaticTgs}
                      className="bg-neon-cyan text-black hover:bg-neon-cyan-bright w-full"
                    >
                      {isLoadingStaticTgs ? 'Loading Static Talk Groups...' : 'Load Static Talk Groups'}
                    </Button>
                  ) : (
                    <>
                      {staticTgSkipped.length > 0 && (
                        <div className="text-xs text-cool-gray">
                          Skipped: {staticTgSkipped.join(', ')}
                        </div>
                      )}
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {staticTgPreview.map((entry, rptrIndex) => (
                          <div key={`${entry.rptr.callsign}-${entry.rxFrequency}`} className="border border-neon-cyan/30 rounded p-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-neon-cyan">
                                {entry.rptr.callsign} — {entry.rxFrequency.toFixed(4)} MHz
                              </span>
                              <div className="flex gap-2 text-xs">
                                <button
                                  type="button"
                                  className="text-neon-cyan hover:underline"
                                  onClick={() => handleToggleAllStaticTgsForRptr(rptrIndex, true)}
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  className="text-neon-cyan hover:underline"
                                  onClick={() => handleToggleAllStaticTgsForRptr(rptrIndex, false)}
                                >
                                  None
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              {entry.tgs.map((tg, tgIndex) => (
                                <label key={tg.talkgroup} className="flex items-center gap-2 cursor-pointer text-sm">
                                  <input
                                    type="checkbox"
                                    checked={tg.include}
                                    onChange={() => handleToggleStaticTg(rptrIndex, tgIndex)}
                                  />
                                  <span className="text-cool-gray">
                                    TG {tg.talkgroup} — {tg.name} (TS{tg.slot})
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
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
              {(!rptrsUseStaticTgs || staticTgPreview) && (
                <Button
                  onClick={handleAddRptrsChannels}
                  disabled={isAddingRptrs}
                  className="bg-neon-magenta text-white hover:bg-neon-magenta-bright w-full"
                >
                  {isAddingRptrs
                    ? 'Adding DMR Repeater Channels...'
                    : rptrsUseStaticTgs
                      ? `Add Channels from Selected Talk Groups`
                      : `Add ${selectedRptrs.size} ${formatPlural(selectedRptrs.size, 'DMR Repeater Channel')}`}
                </Button>
              )}
            </div>
          )}
        </>
    </Card>
  );
};
