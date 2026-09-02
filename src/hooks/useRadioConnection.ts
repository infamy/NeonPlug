import { useState, useCallback } from 'react';
import type { RadioProtocol } from '../types/radio';
import { createDefaultProtocol, createProtocolForModel } from '../radios';
import { D890UVProtocol } from '../radios/d890uv/protocol';
import { DM32UVProtocol } from '../radios/dm32uv/protocol';
import { BaseDigitalProtocol } from '../radios/shared/BaseProtocols';
import type { OptionalDigitalReads } from '../radios/optionalReads';
import { CODEPLUG_READS } from '../radios/codeplugReads';
import type { CodeplugReadSinks } from '../radios/codeplugReads';
import { getCapabilitiesForModel } from '../radios/capabilities';
import type { Contact } from '../models/Contact';
import { useRadioStore } from '../store/radioStore';
import { useChannelsStore } from '../store/channelsStore';
import { useZonesStore } from '../store/zonesStore';
import { useScanListsStore } from '../store/scanListsStore';
import { useContactsStore } from '../store/contactsStore';
import { useRadioSettingsStore } from '../store/radioSettingsStore';
import { useDigitalEmergencyStore } from '../store/digitalEmergencyStore';
import { useAnalogEmergencyStore } from '../store/analogEmergencyStore';
import { useQuickMessagesStore } from '../store/quickMessagesStore';
import { useQuickContactsStore } from '../store/quickContactsStore';
import { useDMRRadioIDsStore } from '../store/dmrRadioIdsStore';
import { useCalibrationStore } from '../store/calibrationStore';
import { useRXGroupsStore } from '../store/rxGroupsStore';
import { useEncryptionKeysStore } from '../store/encryptionKeysStore';
import type { Channel } from '../models/Channel';
import type { Zone } from '../models/Zone';
import type { ScanList } from '../models/ScanList';
import { isValidChannelFrequency } from '../services/validation/frequencyValidator';
import { parseBootImageHeader } from '../utils/bootImage';

/** Augment error message when tab was hidden during a serial operation (better reporting). */
function withVisibilityContext(message: string, tabWentHidden: boolean): string {
  if (!tabWentHidden) return message;
  return `${message}\n\nTab was in background during operation; this can cause serial communication failures.`;
}

// Export steps so UI components can use them (single source of truth)
const READ_STEPS: string[] = [
  'Selecting port',
  'Connecting to radio',
  'Reading radio information',
  'Reading memory blocks',
  'Parsing channels',
  'Parsing configuration',
];

const WRITE_CHANNELS_STEPS: string[] = [
  'Selecting port',
  'Connecting to radio',
  'Reading radio information',
  'Discovering channel blocks',
  'Writing channels',
];

/**
 * The model a read will actually be attempted as.
 *
 * NOT the same precedence as `useEffectiveRadioModel`, which prefers the model
 * of the last successful read. Here the user's explicit pick wins, because that
 * is what builds the protocol — and after reading a DM-32 and then picking a
 * DA-7X2, the two disagree. Anything that TELLS the user which radio is being
 * read must use this, or it will confidently name the wrong one in exactly the
 * situation the label exists to resolve.
 */
export function modelForRead(): string | null {
  const { selectedRadioModel, radioInfo } = useRadioStore.getState();
  return selectedRadioModel ?? radioInfo?.model ?? null;
}

export function useRadioConnection() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { selectedRadioModel, preferredTransport, radioInfo, setConnected, setRadioInfo, setRawRadioSettingsData, setRawContactBlockData, setRawContactBlocks, setBlockMetadata, setBlockData, setCachedMemoryImage, setWriteBlockData, setZoneComparisonData, setBootImageRaw, setBootImageDescription, setRadioBusy, setRadioProgress, setConnectionError, setTable, clearTables } = useRadioStore();
  const { setChannels, setRawChannelData } = useChannelsStore();
  const { setZones, setRawZoneData } = useZonesStore();
  const { setScanLists, setRawScanListData } = useScanListsStore();
  const { setContacts, setContactsLoaded } = useContactsStore();
  const { setSettings: setRadioSettings } = useRadioSettingsStore();
  const { setSystems: setDigitalEmergencies, setConfig: setDigitalEmergencyConfig } = useDigitalEmergencyStore();
  const { setSystems: setAnalogEmergencies } = useAnalogEmergencyStore();
  const { setMessages, setRawMessageData, setMessagesLoaded } = useQuickMessagesStore();
  const { setContacts: setQuickContacts, setContactsLoaded: setQuickContactsLoaded } = useQuickContactsStore();
  const { setRadioIds, setRawRadioIdData, setRadioIdsLoaded } = useDMRRadioIDsStore();
  const { setCalibration, setCalibrationLoaded } = useCalibrationStore();
  const { setGroups: setRXGroups, setRawGroupData, setGroupsLoaded } = useRXGroupsStore();
  const { clearKeys: clearEncryptionKeys, setKeys: setEncryptionKeys } = useEncryptionKeysStore();

  const readFromRadio = useCallback(async (
    onProgress?: (progress: number, message: string, step?: string) => void,
    { forcePortSelection = true }: { forcePortSelection?: boolean } = {}
  ) => {
    setIsConnecting(true);
    setRadioBusy(true);
    setError(null);
    setConnectionError(null);

    // Clear all codeplug data so each read starts from a clean slate
    setChannels([]);
    setRawChannelData(new Map());
    setZones([]);
    setRawZoneData(new Map());
    setScanLists([]);
    setRawScanListData(new Map());
    setContacts([]);
    setContactsLoaded(false);
    setMessages([]);
    setRawMessageData(new Map());
    setMessagesLoaded(false);
    setQuickContacts([]);
    setQuickContactsLoaded(false);
    setRadioIds([]);
    setRawRadioIdData(new Map());
    setRadioIdsLoaded(false);
    setCalibration(null);
    setCalibrationLoaded(false);
    setRXGroups([]);
    setRawGroupData(new Map());
    setGroupsLoaded(false);
    clearEncryptionKeys();
    setRadioSettings(null);
    setDigitalEmergencies([]);
    setDigitalEmergencyConfig(null);
    setAnalogEmergencies([]);
    setBlockMetadata(new Map());
    setBlockData(new Map());
    setCachedMemoryImage(null);
    setRawRadioSettingsData(null);
    // The optional tables were NOT cleared here before the keyed-store change,
    // because each was a separately named slot and the ten of them were simply
    // missed. Reading a DM-32 after a DA-7X2 therefore left the DA-7X2's AM/FM
    // tables and tone lists in the store, and ChannelsTab shows its AM/FM pills
    // whenever `tables.broadcast` is present — so the previous radio's channels
    // stayed on screen.
    clearTables();

    let protocol: RadioProtocol | null = null;
    let tabWentHiddenDuringOperation = false;
    const onVisibilityChange = () => {
      if (document.hidden) tabWentHiddenDuringOperation = true;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const steps = READ_STEPS;

    // Read model from live store — selectedRadioModel may be null if the user never explicitly
    // used the picker (UI pre-selects it via useEffectiveRadioModel but doesn't write the store).
    // Fall back to the model from the last successful read.
    const effectiveModel: string | null = modelForRead();

    // All data-reading steps after connect() are extracted here so both the first attempt
    // and the retry go through exactly the same code path.
    const performRead = async (proto: RadioProtocol) => {
      onProgress?.(10, 'Reading radio information...', steps[2]);
      const info = await proto.getRadioInfo();
      setRadioInfo(info);
      setConnected(true);

      // Resolve caps from the actual model the radio reported — effectiveModel may be null
      // on first connect, which would cause bulk read to be skipped if we used it here.
      const caps = getCapabilitiesForModel(info.model ?? effectiveModel);

      // A miss here disables every capability flag at once — zones, scan lists,
      // channel-read support, band limits — and does it silently, because each
      // site reads `caps?.x`. That is exactly how a D890 read looked like a
      // channel-parser failure when the real cause was getRadioInfo() returning
      // the radio's wire ID ("ID890UV") instead of a descriptor model ID.
      // getRadioInfo() must return a registered model ID, not the wire string.
      if (!caps) {
        console.warn(
          `[Connection] No capabilities registered for model "${info.model ?? effectiveModel}" — ` +
            'every capability flag will be treated as unset. getRadioInfo() should return a ' +
            'model ID registered in RADIO_DESCRIPTORS, not the identity string the radio reports.'
        );
      }

      // Narrow to DM32UVProtocol once; all DM32-specific calls go through this variable.
      const dm32 = proto instanceof DM32UVProtocol ? proto : null;
      // Any DMR radio, DM-32 included. `readRXGroups` and `readQuickContacts`
      // are optional on the base, so they are called defensively below.
      const digital = proto instanceof BaseDigitalProtocol
        ? (proto as BaseDigitalProtocol & Partial<OptionalDigitalReads>)
        : null;

      if (caps?.supportsBulkRead && dm32) {
        onProgress?.(15, 'Reading all memory blocks...', steps[3]);
        await dm32.bulkReadRequiredBlocks();
      }

      // Sections that fail to read are collected here and surfaced in the
      // completion message — a silent failure would leave the UI showing an
      // empty section while the radio still holds data.
      const sectionReadWarnings: string[] = [];

      // Every section below is independent: a section that fails must not cost
      // the user the sections that already read. Warn, record the name for the
      // completion message, and carry on.
      const readSection = async (label: string, read: () => Promise<void>) => {
        try {
          await read();
        } catch (err) {
          console.warn(`Could not read ${label}:`, err);
          sectionReadWarnings.push(label);
        }
      };

      // Where CODEPLUG_READS puts what it reads. Passed in rather than
      // imported, so the registry does not depend on this store.
      const sinks: CodeplugReadSinks = {
        setTable,
        setEncryptionKeys,
        setMessages,
        setMessagesLoaded,
        setRXGroups,
        setQuickContacts,
      };

      onProgress?.(20, 'Parsing channels...', steps[4]);
      // A driver still being brought up can declare channels unreadable instead
      // of throwing. Without this the throw escapes the per-section handling
      // below, aborting the whole read — so the user loses zones, scan lists and
      // talkgroups that read perfectly well.
      if (caps?.supportsChannelRead === false) {
        console.warn('[Connection] Channel read not implemented for this radio yet');
        setChannels([]);
        sectionReadWarnings.push('Channels');
      } else {
        // Channels own 20-70% of the bar because they own most of the wall clock.
        const withChannelProgress = proto as typeof proto & {
          readChannels(cb?: (done: number, total: number) => void): Promise<Channel[]>;
        };
        const channels = await withChannelProgress.readChannels((done, total) => {
          if (total > 0) {
            onProgress?.(20 + (done / total) * 50, `Reading channel ${done} of ${total}...`, steps[4]);
          }
        });
        setChannels(channels);
      }

      // Enrich radioInfo with firmware from cached image (UV5R-Mini and DM-32UV)
      const fw = proto.getFirmwareFromCache?.();
      if (fw) {
        const current = useRadioStore.getState().radioInfo;
        if (current) setRadioInfo({ ...current, firmware: fw });
      }

      if (dm32) {
        setRawChannelData(dm32.rawChannelData);
        setBlockMetadata(new Map(dm32.blockMetadata));
        setBlockData(new Map(dm32.blockData));
      }

      // Suppress per-item progress messages during config parsing; only surface the percentage.
      const savedProgress = proto.onProgress;
      proto.onProgress = (progress, _msg) => {
        onProgress?.(70 + (progress * 0.25), 'Parsing configuration...', steps[5]);
      };

      // 70-90% is the configuration phase, and it used to be SILENT.
      //
      // The bar is driven either by explicit onProgress calls or by the
      // `proto.onProgress` bridge above — and the DA-7X2's driver never calls
      // the latter (the DM-32's calls it 133 times). So on that radio the bar
      // sat at exactly 70% through zones, scan lists, radio IDs and thirteen
      // table reads: on a link that moves ~10 KB/s, ten seconds of looking
      // frozen.
      //
      // Every step is planned up front so the denominator is the work that will
      // actually run, not the work this radio might have had. Planning is just
      // a method-presence check and is side-effect free.
      const configSteps: { label: string; run: () => Promise<void> }[] = [];

      if (caps?.supportsZones) {
        configSteps.push({
          label: 'Zones',
          run: async () => {
            setZones(await proto.readZones());
            if (dm32) setRawZoneData(dm32.rawZoneData);
          },
        });
      }

      if (caps?.supportsScanLists) {
        configSteps.push({
          label: 'Scan lists',
          run: async () => {
            setScanLists(await proto.readScanLists());
            if (dm32) setRawScanListData(dm32.rawScanListData);
          },
        });
      }


      // Generic DMR content — radio IDs, receive groups and talkgroups — is
      // common to every digital radio, so it is gated on the DIGITAL base class
      // and not on the DM-32. It used to sit inside the `if (dm32)` block below,
      // which meant the DA-7X2 read its channels, zones and scan lists and then
      // silently skipped everything the Digital tab renders: the tab came up
      // empty on a radio whose driver could read all three.
      //
      // The raw block captures stay DM-32-only. Those are its clone-image
      // debugging aids and have no meaning for an address-addressed radio.
      if (digital && !dm32) {
        configSteps.push({
          label: 'DMR Radio IDs',
          run: async () => setRadioIds(await digital.readDMRRadioIDs()),
        });

        // Everything else this radio may hold is declared in CODEPLUG_READS,
        // in the order the radio is asked. This hook does not name a table.
        //
        // Pictures are deliberately NOT among them: three 40 KB regions is the
        // largest thing this radio can be asked for, and they are cosmetic and
        // rarely looked at. The Settings area reads them on demand instead.
        for (const spec of CODEPLUG_READS) {
          const run = spec.plan(digital);
          if (run) configSteps.push({ label: spec.label, run: () => run(sinks) });
        }
      }

      // Run them, moving the bar and naming what is being read.
      //
      // Zones and scan lists are now inside `readSection` where they used to
      // throw. That is deliberate and matches what the channel read already
      // does: a section that cannot be read is reported in the completion
      // message rather than aborting the whole read and costing the user the
      // sections that read perfectly well.
      for (const [i, step] of configSteps.entries()) {
        onProgress?.(
          70 + (i / configSteps.length) * 20,
          `Reading ${step.label}...`,
          steps[5]
        );
        await readSection(step.label, step.run);
      }

      if (dm32) {
        await readSection('Quick Messages', async () => {
          setMessages(await dm32.readQuickMessages());
          setRawMessageData(new Map(dm32.rawMessageData));
        });

        await readSection('DMR Radio IDs', async () => {
          setRadioIds(await dm32.readDMRRadioIDs());
          setRawRadioIdData(new Map(dm32.rawDMRRadioIDData));
        });

        await readSection('Calibration', async () => setCalibration(await dm32.readCalibration()));

        await readSection('RX Groups', async () => {
          setRXGroups(await dm32.readRXGroups());
          setRawGroupData(new Map(dm32.rawRXGroupData));
        });

        await readSection('Talk Groups', async () => setQuickContacts(await dm32.readQuickContacts()));
      }

      try {
        onProgress?.(90, 'Reading configuration...', 'Reading configuration');

        await readSection('Radio Settings', async () => {
          const radioSettings = await proto.readRadioSettings();
          if (radioSettings) setRadioSettings(radioSettings);
          if (dm32?.rawRadioSettingsData) setRawRadioSettingsData(dm32.rawRadioSettingsData);
        });

        if (dm32) {
          await readSection('Digital Emergency Systems', async () => {
            const digitalEmergency = await dm32.readDigitalEmergencies();
            if (digitalEmergency) {
              setDigitalEmergencies(digitalEmergency.systems);
              setDigitalEmergencyConfig(digitalEmergency.config);
            }
          });

          await readSection('Analog Emergency Systems', async () => {
            const analogEmergencies = await dm32.readAnalogEmergencies();
            if (analogEmergencies) setAnalogEmergencies(analogEmergencies);
          });
        }
      } catch (err) { console.warn('Error reading configuration blocks:', err); sectionReadWarnings.push('configuration blocks'); }

      proto.onProgress = savedProgress;

      // Persist the clone-radio memory image (FT-65 family) so a later write —
      // which runs on a fresh protocol instance — can preserve non-channel
      // regions (settings, DTMF, P-keys) instead of writing zeros.
      const memoryImage = proto.getMemoryImage?.();
      if (memoryImage) {
        setCachedMemoryImage({ model: info.model, image: memoryImage });
      }

      // Close the connection — everything past this point parses from cache.
      // DM-32 already disconnected itself after its bulk read (disconnect is
      // idempotent); for clone radios this releases the port's stream locks so
      // the next operation can reopen the port instead of hitting
      // InvalidStateError ("port already open").
      try { await proto.disconnect(); } catch { /* already closed */ }

      if (sectionReadWarnings.length > 0) {
        onProgress?.(
          100,
          `Read complete — warning: could not read ${sectionReadWarnings.join(', ')}. ` +
            'These sections show as empty; re-read before editing them.',
          steps[5]
        );
      } else {
        onProgress?.(100, 'Read complete!', steps[5]);
      }
    };

    try {
      protocol = createProtocolForModel(effectiveModel ?? '') ?? createDefaultProtocol();
      protocol.onProgress = (progress, message) => onProgress?.(progress, message);

      // caps here is only used for transport selection — re-resolved inside performRead
      // from the actual model string the radio returns.
      const caps = getCapabilitiesForModel(effectiveModel);
      const transport = caps?.supportsBle
        ? (preferredTransport ?? caps?.preferredTransport ?? 'serial')
        : undefined;
      onProgress?.(5,
        forcePortSelection
          ? (transport === 'ble' ? 'Select BLE device...' : 'Select serial port...')
          : 'Reconnecting to radio...',
        steps[0]);
      await protocol.connect({ forcePortSelection, ...(transport != null && { transport }) });

      await performRead(protocol);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Read failed';
      const errorMessage = withVisibilityContext(rawMessage, tabWentHiddenDuringOperation);
      const isPortSelectionCancelled = rawMessage.includes('cancelled') || rawMessage.includes('Port selection cancelled');

      if (!isPortSelectionCancelled && protocol) {
        console.warn('Read failed, will retry:', errorMessage);
        try { await protocol.disconnect(); } catch { /* ignore */ }

        try {
          onProgress?.(5, 'Retrying...', steps[0]);
          protocol = createProtocolForModel(effectiveModel ?? '') ?? createDefaultProtocol();
          protocol.onProgress = (progress, message) => onProgress?.(progress, message);
          await protocol.connect();
          await performRead(protocol);
          return;
        } catch (retryErr) {
          const retryRawMessage = retryErr instanceof Error ? retryErr.message : 'Read failed';
          const retryErrorMessage = withVisibilityContext(retryRawMessage, tabWentHiddenDuringOperation);
          setError(retryErrorMessage);
          setConnectionError(retryErrorMessage);
          onProgress?.(0, `Error: ${retryErrorMessage}`, 'Error');
          setIsConnecting(false);
      setRadioBusy(false);
          try { await protocol?.disconnect(); } catch { /* ignore */ }
          throw retryErr;
        }
      }

      setError(errorMessage);
      setConnectionError(errorMessage);
      onProgress?.(0, `Error: ${errorMessage}`, 'Error');
      console.error('Radio read error:', err);
      setIsConnecting(false);
      setRadioBusy(false);
      try { await protocol?.disconnect(); } catch { /* ignore */ }
      throw err;
    } finally {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      setIsConnecting(false);
      setRadioBusy(false);
    }
  }, [selectedRadioModel, preferredTransport, setConnected, setRadioInfo, setRawRadioSettingsData, setChannels, setZones, setScanLists, setContacts, setContactsLoaded, setRawChannelData, setRawZoneData, setRawScanListData, setBlockMetadata, setBlockData, setCachedMemoryImage, setRadioSettings, setDigitalEmergencies, setDigitalEmergencyConfig, setAnalogEmergencies, setMessages, setRawMessageData, setMessagesLoaded, setQuickContacts, setQuickContactsLoaded, setRadioIds, setRawRadioIdData, setRadioIdsLoaded, setCalibration, setCalibrationLoaded, setRXGroups, setRawGroupData, setGroupsLoaded, setEncryptionKeys, setTable, clearTables, setConnectionError]);

  /**
   * Mirror a long operation's progress into the store so it survives the
   * starting component unmounting, and can be shown in the header.
   *
   * Only for jobs measured in minutes. Wrapping a two-second read would put a
   * bar in the header that flickers and says nothing.
   */
  const publish = useCallback((
    label: string,
    onProgress?: (progress: number, message: string) => void
  ) => (percent: number, message: string) => {
    setRadioProgress({ label, percent, message });
    onProgress?.(percent, message);
  }, [setRadioProgress]);

  const readContacts = useCallback(async (
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setRadioBusy(true);
    setError(null);
    const report = publish('Reading contacts', onProgress);
    
    let protocol: RadioProtocol | null = null;

    try {
      // Use protocol for connected radio (write/reconnect path)
      protocol = createProtocolForModel(radioInfo?.model ?? '') ?? createDefaultProtocol();
      
      // Set up progress callback
      protocol.onProgress = (progress, message) => {
        report(progress, message);
      };
      
      // Connect to radio (reuse existing connection if available)
      report(0, 'Connecting to radio...');
      await protocol.connect();
      
      // Get radio info if not already available
      if (!radioInfo) {
        report(5, 'Reading radio information...');
        const info = await protocol.getRadioInfo();
        setRadioInfo(info);
        setConnected(true);
      }
      
      // Report 0, not a made-up milestone. This used to claim 10% before a
      // single contact byte had moved, so the bar jumped to 10 and then fell
      // back to 1 as soon as real per-bank progress arrived.
      report(0, 'Reading contacts from radio (this may take a while)...');

      // The D890 family keeps TWO different things called "contacts": talkgroups
      // (what readContacts returns, already loaded with the codeplug) and the
      // DMR contact database. This button means the database.
      const d890 = protocol instanceof D890UVProtocol ? protocol : null;
      const contacts = d890
        ? (await d890.readDigitalContacts(report)).map((c, i) => ({
            id: i + 1,
            name: c.name,
            dmrId: c.dmrId,
            callSign: c.callSign,
            city: c.city,
            province: c.province,
            country: c.country,
            isFriend: c.isFriend,
          }))
        : await protocol.readContacts();
      setContacts(contacts);
      
      const dm32 = protocol instanceof DM32UVProtocol ? protocol : null;
      if (dm32?.rawContactBlockData) {
        setRawContactBlockData(dm32.rawContactBlockData, dm32.rawContactBlockAddress);
      }
      if (dm32?.rawContactBlocks) {
        setRawContactBlocks(dm32.rawContactBlocks);
      }
      
      report(100, `Successfully read ${contacts.length} contacts`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      report(0, `Error: ${errorMsg}`);
      throw err;
    } finally {
      if (protocol) {
        try {
          await protocol.disconnect();
        } catch (e) {
          console.warn('Error disconnecting after reading contacts:', e);
        }
      }
      setIsConnecting(false);
      setRadioBusy(false);
    }
  }, [setContacts, setRadioInfo, setConnected, radioInfo]);

  /**
   * Read the DA-7X2's three pictures on demand.
   *
   * Deliberately separate from the codeplug read: 3 x 40 KB dwarfs everything
   * else this radio holds, and the pictures are cosmetic. Anyone who wants to
   * look at them can wait; nobody should wait for them by default.
   */
  /**
   * A read that is NOT part of a codeplug read: the user asked for this one
   * thing, so connect, fetch it, disconnect.
   *
   * Kept separate from the codeplug because of what it costs. The link is
   * byte-limited at ~10 KB/s, so a table nobody is looking at is dead weight on
   * every read — the three picture regions are 40 KB each, and the satellite
   * table is 12.8 KB. The vendor CPS draws the same line: satellites are behind
   * its Tools menu, not part of reading a codeplug.
   */
  const runOnDemandRead = useCallback(async (
    label: string,
    onProgress: ((progress: number, message: string) => void) | undefined,
    run: (
      proto: RadioProtocol & Partial<OptionalDigitalReads>,
      report: (percent: number, message: string) => void
    ) => Promise<void>
  ) => {
    setIsConnecting(true);
    setRadioBusy(true);
    const report = publish(label, onProgress);
    setError(null);
    let protocol: RadioProtocol | null = null;
    try {
      protocol = createProtocolForModel(selectedRadioModel ?? radioInfo?.model ?? '');
      if (!protocol) throw new Error('No driver for this radio.');
      report(0, 'Connecting to radio...');
      await protocol.connect();
      await run(protocol as RadioProtocol & Partial<OptionalDigitalReads>, report);
      report(100, `${label} complete.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      report(0, `Error: ${msg}`);
      throw err;
    } finally {
      // Disconnect on success as well as failure: leaving the port open and
      // locked makes the NEXT port.open() throw.
      if (protocol) {
        try { await protocol.disconnect(); } catch (e) { console.warn(`Error disconnecting after ${label}:`, e); }
      }
      setIsConnecting(false);
      setRadioBusy(false);
    }
  }, [selectedRadioModel, radioInfo, publish]);

  const readPictures = useCallback((
    onProgress?: (progress: number, message: string) => void
  ) => runOnDemandRead('Reading images', onProgress, async (proto, report) => {
    if (!proto.readImages) throw new Error('This radio has no boot or standby pictures.');
    report(2, 'Reading pictures...');
    // Connecting is a couple of percent; the transfer is the rest.
    setTable('pictures', await proto.readImages((percent, label) => {
      report(2 + percent * 0.98, label);
    }));
  }), [runOnDemandRead, setTable]);

  /**
   * The satellite table, on demand.
   *
   * It used to be read with the codeplug, costing 12,800 bytes — about 1.3 s of
   * a ~10 s read — on every single read, for a table most users never open. The
   * vendor CPS does not read it with a codeplug either; it is behind Tools.
   */
  const readSatellites = useCallback((
    onProgress?: (progress: number, message: string) => void
  ) => runOnDemandRead('Reading satellites', onProgress, async (proto, report) => {
    if (!proto.readSatellites) throw new Error('This radio has no satellite table.');
    report(2, 'Reading satellite table...');
    setTable('satellites', await proto.readSatellites());
  }), [runOnDemandRead, setTable]);

  const readBootImage = useCallback(async (
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setRadioBusy(true);
    const report = publish('Reading boot image', onProgress);
    setError(null);
    let protocol: RadioProtocol | null = null;
    try {
      protocol = createProtocolForModel(radioInfo?.model ?? '') ?? createDefaultProtocol();
      protocol.onProgress = (progress, message) => {
        report(progress, message);
      };
      report(0, 'Connecting to radio...');
      await protocol.connect();
      if (!radioInfo) {
        report(5, 'Reading radio information...');
        const info = await protocol.getRadioInfo();
        setRadioInfo(info);
        setConnected(true);
      }
      report(10, 'Reading boot image from radio...');
      const dm32 = protocol instanceof DM32UVProtocol ? protocol : null;
      if (!dm32) throw new Error('Boot image is only supported on DM-32UV');
      const raw = await dm32.readBootImage();
      setBootImageRaw(raw);
      const parsed = parseBootImageHeader(raw);
      setBootImageDescription(parsed.description || null);
      report(100, 'Boot image read complete');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      report(0, `Error: ${errorMsg}`);
      throw err;
    } finally {
      if (protocol) {
        try {
          await protocol.disconnect();
        } catch (e) {
          console.warn('Error disconnecting after reading boot image:', e);
        }
      }
      setIsConnecting(false);
      setRadioBusy(false);
    }
  }, [setBootImageRaw, setBootImageDescription, setRadioInfo, setConnected, radioInfo]);

  const writeBootImage = useCallback(async (
    data: Uint8Array,
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setRadioBusy(true);
    const report = publish('Writing boot image', onProgress);
    setError(null);
    let protocol: RadioProtocol | null = null;
    try {
      protocol = createProtocolForModel(radioInfo?.model ?? '') ?? createDefaultProtocol();
      protocol.onProgress = (progress, message) => {
        report(progress, message);
      };
      report(0, 'Connecting to radio...');
      await protocol.connect();
      if (!radioInfo) {
        report(5, 'Reading radio information...');
        const info = await protocol.getRadioInfo();
        setRadioInfo(info);
        setConnected(true);
      }
      report(10, 'Writing boot image to radio...');
      const dm32 = protocol instanceof DM32UVProtocol ? protocol : null;
      if (!dm32) throw new Error('Boot image is only supported on DM-32UV');
      await dm32.writeBootImage(data);
      setBootImageRaw(data);
      const parsed = parseBootImageHeader(data);
      setBootImageDescription(parsed.description || null);
      report(100, 'Boot image write complete');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      report(0, `Error: ${errorMsg}`);
      throw err;
    } finally {
      if (protocol) {
        try {
          await protocol.disconnect();
        } catch (e) {
          console.warn('Error disconnecting after writing boot image:', e);
        }
      }
      setIsConnecting(false);
      setRadioBusy(false);
    }
  }, [setBootImageRaw, setBootImageDescription, setRadioInfo, setConnected, radioInfo]);

  const writeContacts = useCallback(async (
    contacts: Contact[],
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setRadioBusy(true);
    setError(null);
    
    let protocol: RadioProtocol | null = null;

    try {
      // Use protocol for connected radio (write path)
      protocol = createProtocolForModel(radioInfo?.model ?? '') ?? createDefaultProtocol();
      
      // Set up progress callback
      protocol.onProgress = (progress, message) => {
        onProgress?.(progress, message);
      };
      
      // Connect to radio
      onProgress?.(0, 'Connecting to radio...');
      await protocol.connect();
      
      // Get radio info if not already available
      if (!radioInfo) {
        onProgress?.(5, 'Reading radio information...');
        const info = await protocol.getRadioInfo();
        setRadioInfo(info);
        setConnected(true);
      }
      
      // Write contacts (this is slow - writes many 4KB blocks)
      onProgress?.(10, `Writing ${contacts.length} contacts to radio (this may take a while)...`);
      await protocol.writeContacts(contacts);
      
      // Update store with written contacts
      setContacts(contacts);
      
      onProgress?.(100, `Successfully wrote ${contacts.length} contacts`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      onProgress?.(0, `Error: ${errorMsg}`);
      throw err;
    } finally {
      if (protocol) {
        try {
          await protocol.disconnect();
        } catch (e) {
          console.warn('Error disconnecting after writing contacts:', e);
        }
      }
      setIsConnecting(false);
      setRadioBusy(false);
    }
  }, [setContacts, setRadioInfo, setConnected, radioInfo]);

  const writeChannelsToRadio = useCallback(async (
    channels: Channel[],
    zones: Zone[],
    scanLists: ScanList[],
    onProgress?: (progress: number, message: string, step?: string) => void
  ) => {
    setIsConnecting(true);
    setRadioBusy(true);
    setError(null);
    setConnectionError(null);
    
    let protocol: RadioProtocol | null = null;
    const steps = WRITE_CHANNELS_STEPS;
    let tabWentHiddenDuringOperation = false;
    const onVisibilityChange = () => {
      if (document.hidden) tabWentHiddenDuringOperation = true;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    try {
      // Filter channels to only include those with valid frequencies (use effective model for capabilities)
      const effectiveModel = radioInfo?.model ?? selectedRadioModel ?? null;
      const bandLimits = getCapabilitiesForModel(effectiveModel)?.bandLimits;
      const validChannels = channels.filter(ch => isValidChannelFrequency(ch, bandLimits));
      const filteredCount = channels.length - validChannels.length;
      
      if (filteredCount > 0) {
        console.warn(`Filtered out ${filteredCount} channel(s) with frequencies outside supported ranges`);
      }
      
      // Update zones to only include channel numbers that exist (never write zone refs to non-existent channels)
      const validChannelNumbers = new Set(validChannels.map(ch => ch.number));
      const filteredZones = zones.map(zone => {
        const invalidRefs = zone.channels.filter(chNum => !validChannelNumbers.has(chNum));
        if (invalidRefs.length > 0) {
          console.warn(
            `[Zones] Zone "${zone.name}" referenced non-existent channel(s): ${invalidRefs.join(', ')}. Removed before write to prevent radio errors.`
          );
        }
        return {
          ...zone,
          channels: zone.channels.filter(chNum => validChannelNumbers.has(chNum))
        };
      }).filter(zone => zone.channels.length > 0); // Remove empty zones
      
      // Update scan lists to only include valid channel numbers
      const filteredScanLists = scanLists.map(scanList => ({
        ...scanList,
        channels: scanList.channels.filter(chNum => validChannelNumbers.has(chNum))
      })).filter(scanList => scanList.channels.length > 0); // Remove empty scan lists
      
      // Use protocol for connected radio (write path)
      protocol = createProtocolForModel(radioInfo?.model ?? '') ?? createDefaultProtocol();
      const dm32 = protocol instanceof DM32UVProtocol ? protocol : null;

      // Restore cache from store if available (DM-32 bulk read path)
      if (dm32) {
        const storeState = useRadioStore.getState();
        const storeBlockData = storeState.blockData;
        const storeBlockMetadata = storeState.blockMetadata;
        if (storeBlockData && storeBlockData.size > 0 && storeBlockMetadata && storeBlockMetadata.size > 0) {
          dm32.restoreCacheFromStore(new Map(storeBlockData), new Map(storeBlockMetadata));
        } else {
          console.warn('[Connection] Store cache is empty - will need to read all blocks from radio');
        }
      } else if (protocol.setMemoryImage) {
        // Clone radios (FT-65 family): restore the memory image from the last read
        // so the full-image write preserves non-channel regions. Only restore an
        // image that came from the same model — never write one radio's image to another.
        const { cachedMemoryImage } = useRadioStore.getState();
        if (cachedMemoryImage && cachedMemoryImage.model === effectiveModel) {
          protocol.setMemoryImage(cachedMemoryImage.image);
        }
      }
      
      // Set up progress callback that forwards to our callback
      protocol.onProgress = (progress, message) => {
        onProgress?.(progress, message);
      };
      
      // Step 1: Select port
      onProgress?.(5, 'Please select a serial port in the browser dialog...', steps[0]);
      
      // Step 2: Connect to radio
      onProgress?.(10, 'Connecting to radio...', steps[1]);
      await protocol.connect();
      
      // Step 3: Get radio info
      onProgress?.(10, 'Reading radio information...', steps[2]);
      const connectedRadioInfo = await protocol.getRadioInfo();
      
      setRadioInfo(connectedRadioInfo);
      setConnected(true);
      
      // Settings state is needed before the channel write: buffered-settings
      // protocols (Yaesu clone) flush settings into the memory image that
      // writeChannels uploads, so they must be staged first or they are never sent.
      const radioSettingsStore = useRadioSettingsStore.getState();
      const radioSettings = radioSettingsStore.settings;
      const changedFields = radioSettingsStore.getChangedFields();
      const hasSettingsToWrite = radioSettings != null && changedFields.length > 0;

      // Step 4: Write channels (and zones/scan lists for DM-32; analog radios use writeChannels only)
      if (dm32) {
        onProgress?.(20, 'Writing channels, zones, and scan lists to radio...', steps[4]);
        await dm32.writeAllData(validChannels, filteredZones, filteredScanLists);
      } else {
        if (hasSettingsToWrite && protocol.bufferedSettingsWrite) {
          onProgress?.(15, `Staging ${changedFields.length} changed setting(s)...`, steps[4]);
          await protocol.writeRadioSettings(radioSettings, { changedFields });
        }
        onProgress?.(20, 'Writing channels to radio...', steps[4]);
        await protocol.writeChannels(validChannels);
        if (hasSettingsToWrite && protocol.bufferedSettingsWrite) {
          // The channel write uploaded the image containing the staged settings.
          radioSettingsStore.clearChanges();
        }
      }

      if (dm32) {
        // Step 5: Talk Groups
        const quickContacts = useQuickContactsStore.getState().contacts;
        if (quickContacts && quickContacts.length > 0) {
          onProgress?.(90, `Writing ${quickContacts.length} talk group(s) to radio...`, steps[4]);
          await dm32.writeQuickContacts(quickContacts);
        }

        // Step 5.5: Quick Messages
        const quickMessages = useQuickMessagesStore.getState().messages;
        if (quickMessages && quickMessages.length > 0) {
          onProgress?.(92, `Writing ${quickMessages.length} quick message(s) to radio...`, steps[4]);
          await dm32.writeQuickMessages(quickMessages);
        }

        // Step 5.6: RX Groups
        const rxGroupsStore = useRXGroupsStore.getState();
        if (rxGroupsStore.groups.length > 0 && rxGroupsStore.groupsLoaded) {
          onProgress?.(93, `Writing ${rxGroupsStore.groups.length} RX group(s) to radio...`, steps[4]);
          await dm32.writeRXGroups(rxGroupsStore.groups);
        }

        // Step 5.7: DMR Radio IDs
        const dmrRadioIDsStore = useDMRRadioIDsStore.getState();
        if (dmrRadioIDsStore.radioIds.length > 0) {
          onProgress?.(94, `Writing ${dmrRadioIDsStore.radioIds.length} DMR Radio ID(s) to radio...`, steps[4]);
          await dm32.writeDMRRadioIDs(dmrRadioIDsStore.radioIds);
        }

        // Step 5.8: Encryption Keys
        const encryptionKeysStore = useEncryptionKeysStore.getState();
        if (encryptionKeysStore.keys.length > 0 && encryptionKeysStore.keysLoaded) {
          onProgress?.(94, `Writing ${encryptionKeysStore.keys.length} encryption key(s) to radio...`, steps[4]);
          await dm32.writeEncryptionKeys(encryptionKeysStore.keys);
        }

        // Step 5.9: Digital Emergency Systems
        const digitalEmergencyStore = useDigitalEmergencyStore.getState();
        if (digitalEmergencyStore.systems.length > 0 && digitalEmergencyStore.config) {
          onProgress?.(94, `Writing ${digitalEmergencyStore.systems.length} digital emergency system(s) to radio...`, steps[4]);
          await dm32.writeDigitalEmergencies(digitalEmergencyStore.systems, digitalEmergencyStore.config);
        }

        // Step 5.10: Analog Emergency Systems
        const analogEmergencyStore = useAnalogEmergencyStore.getState();
        if (analogEmergencyStore.systems.length > 0) {
          onProgress?.(94, `Writing ${analogEmergencyStore.systems.length} analog emergency system(s) to radio...`, steps[4]);
          await dm32.writeAnalogEmergencies(analogEmergencyStore.systems);
        }
      }

      // Step 6: Write radio settings if modified — direct-write protocols only
      // (DM-32, UV5R-Mini); buffered-settings protocols were handled with the
      // channel write above.
      if (hasSettingsToWrite && !protocol.bufferedSettingsWrite) {
        onProgress?.(95, `Writing ${changedFields.length} changed setting(s) to radio...`, steps[4]);
        await protocol.writeRadioSettings(radioSettings, { changedFields });
        // Clear changes after successful write
        radioSettingsStore.clearChanges();
      }

      // Store write block data and zone comparison data for debug export (DM-32 only)
      if (dm32) {
        setWriteBlockData(dm32.writeBlockData);
        setZoneComparisonData(dm32.zoneComparisonData);
      } else {
        // Persist the just-written image as the new baseline for this session
        // (the write may have flushed settings changes into it).
        const writtenImage = protocol.getMemoryImage?.();
        if (writtenImage) {
          setCachedMemoryImage({ model: connectedRadioInfo.model, image: writtenImage });
        }
      }
      
      // Step 6: Disconnect
      await protocol.disconnect();
      
      const summaryQuickContacts = useQuickContactsStore.getState().contacts;
      const summaryQuickMessages = useQuickMessagesStore.getState().messages;
      const summaryRxGroupsStore = useRXGroupsStore.getState();
      const summaryEncryptionKeysStore = useEncryptionKeysStore.getState();
      const summary = [
        validChannels.length > 0 ? `${validChannels.length} channels` : null,
        filteredZones.length > 0 ? `${filteredZones.length} zones` : null,
        filteredScanLists.length > 0 ? `${filteredScanLists.length} scan lists` : null,
        summaryQuickContacts?.length ? `${summaryQuickContacts.length} talk group(s)` : null,
        summaryQuickMessages?.length ? `${summaryQuickMessages.length} quick message(s)` : null,
        summaryRxGroupsStore.groups?.length && summaryRxGroupsStore.groupsLoaded ? `${summaryRxGroupsStore.groups.length} RX group(s)` : null,
        summaryEncryptionKeysStore.keys?.length && summaryEncryptionKeysStore.keysLoaded ? `${summaryEncryptionKeysStore.keys.length} encryption key(s)` : null,
        hasSettingsToWrite ? `${changedFields.length} setting(s)` : null,
      ].filter(Boolean).join(', ');
      
      // Add warning if channels were filtered
      if (filteredCount > 0) {
        const warningMsg = `Note: ${filteredCount} channel(s) were filtered out due to unsupported frequencies. Successfully wrote ${summary} to radio!`;
        onProgress?.(100, warningMsg, steps[4]);
      } else {
        onProgress?.(100, `Successfully wrote ${summary} to radio!`, steps[4]);
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Write failed';
      const errorMessage = withVisibilityContext(rawMessage, tabWentHiddenDuringOperation);
      setError(errorMessage);
      setConnectionError(errorMessage);
      onProgress?.(0, `Error: ${errorMessage}`, 'Error');

      console.error('Radio write error:', err);

      // Set connecting to false so modal can show error state
      setIsConnecting(false);
      setRadioBusy(false);

      // Try to disconnect on error (if connection exists)
      if (protocol) {
        try {
          await protocol.disconnect();
        } catch (disconnectErr) {
          // Ignore disconnect errors - connection might already be closed
          console.warn('Error during disconnect cleanup:', disconnectErr);
        }
      }

      // Re-throw the error so the caller can handle it and show error in modal
      throw err;
    } finally {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      setIsConnecting(false);
      setRadioBusy(false);
    }
  }, [radioInfo, selectedRadioModel, setConnected, setRadioInfo, setCachedMemoryImage, setWriteBlockData, setZoneComparisonData, setConnectionError]);

  return {
    isConnecting,
    error,
    readFromRadio,
    readContacts,
    readBootImage,
    readPictures,
    readSatellites,
    writeBootImage,
    writeContacts,
    writeChannelsToRadio,
    readSteps: READ_STEPS,
    writeChannelsSteps: WRITE_CHANNELS_STEPS,
    /** Model the next/current read is attempted as — for display, see modelForRead. */
    readModel: selectedRadioModel ?? radioInfo?.model ?? null,
    /**
     * Model a write is performed as. Deliberately NOT the same as readModel:
     * the write path builds its protocol from `radioInfo.model` alone, so a
     * write only ever targets a radio that was actually read.
     */
    writeModel: radioInfo?.model ?? null,
  };
}

