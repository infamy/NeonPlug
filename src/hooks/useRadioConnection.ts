import { useState, useCallback } from 'react';
import type { RadioProtocol } from '../types/radio';
import { createDefaultProtocol, createProtocolForModel } from '../radios';
import { DM32UVProtocol } from '../radios/dm32uv/protocol';
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

export function useRadioConnection() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { selectedRadioModel, preferredTransport, radioInfo, setConnected, setRadioInfo, setRawRadioSettingsData, setRawContactBlockData, setRawContactBlocks, setBlockMetadata, setBlockData, setCachedMemoryImage, setWriteBlockData, setZoneComparisonData, setBootImageRaw, setBootImageDescription, setConnectionError } = useRadioStore();
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
  const { clearKeys: clearEncryptionKeys } = useEncryptionKeysStore();

  const readFromRadio = useCallback(async (
    onProgress?: (progress: number, message: string, step?: string) => void,
    { forcePortSelection = true, onConnected }: { forcePortSelection?: boolean; onConnected?: () => Promise<void> | void } = {}
  ) => {
    setIsConnecting(true);
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
    const { selectedRadioModel: liveModel, radioInfo: liveRadioInfo } = useRadioStore.getState();
    const effectiveModel: string | null = liveModel ?? liveRadioInfo?.model ?? null;

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

      // Narrow to DM32UVProtocol once; all DM32-specific calls go through this variable.
      const dm32 = proto instanceof DM32UVProtocol ? proto : null;

      if (caps?.supportsBulkRead && dm32) {
        onProgress?.(15, 'Reading all memory blocks...', steps[3]);
        await dm32.bulkReadRequiredBlocks();
      }

      onProgress?.(20, 'Parsing channels...', steps[4]);
      const channels = await proto.readChannels();
      setChannels(channels);

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

      onProgress?.(70, 'Parsing configuration from cache...', steps[5]);

      if (caps?.supportsZones) {
        const zones = await proto.readZones();
        setZones(zones);
        if (dm32) setRawZoneData(dm32.rawZoneData);
      }

      if (caps?.supportsScanLists) {
        const scanLists = await proto.readScanLists();
        setScanLists(scanLists);
        if (dm32) setRawScanListData(dm32.rawScanListData);
      }

      if (dm32) {
        try {
          const messages = await dm32.readQuickMessages();
          setMessages(messages);
          const rawMsgMap = new Map<number, { data: Uint8Array; messageIndex: number; offset: number }>();
          for (const [i, raw] of dm32.rawMessageData.entries()) rawMsgMap.set(i, raw);
          setRawMessageData(rawMsgMap);
        } catch { console.warn('Could not read Quick Messages'); }

        try {
          const radioIds = await dm32.readDMRRadioIDs();
          setRadioIds(radioIds);
          const rawIdMap = new Map<number, { data: Uint8Array; idIndex: number; offset: number }>();
          for (const [i, raw] of dm32.rawDMRRadioIDData.entries()) rawIdMap.set(i, raw);
          setRawRadioIdData(rawIdMap);
        } catch { console.warn('Could not read DMR Radio IDs'); }

        try {
          setCalibration(await dm32.readCalibration());
        } catch { console.warn('Could not read calibration data'); }

        try {
          const rxGroups = await dm32.readRXGroups();
          setRXGroups(rxGroups);
          const rawGroupMap = new Map<number, { data: Uint8Array; groupIndex: number; offset: number }>();
          for (const [i, raw] of dm32.rawRXGroupData.entries()) rawGroupMap.set(i, raw);
          setRawGroupData(rawGroupMap);
        } catch { console.warn('Could not read RX Groups'); }

        try {
          setQuickContacts(await dm32.readQuickContacts());
        } catch { console.warn('Could not read Talk Groups'); }
      }

      try {
        onProgress?.(90, 'Reading configuration...', 'Reading configuration');

        try {
          const radioSettings = await proto.readRadioSettings();
          if (radioSettings) setRadioSettings(radioSettings);
          if (dm32?.rawRadioSettingsData) setRawRadioSettingsData(dm32.rawRadioSettingsData);
        } catch { console.warn('Could not read Radio Settings'); }

        if (dm32) {
          try {
            const digitalEmergency = await dm32.readDigitalEmergencies();
            if (digitalEmergency) {
              setDigitalEmergencies(digitalEmergency.systems);
              setDigitalEmergencyConfig(digitalEmergency.config);
            }
          } catch { console.warn('Could not read Digital Emergency Systems'); }

          try {
            const analogEmergencies = await dm32.readAnalogEmergencies();
            if (analogEmergencies) setAnalogEmergencies(analogEmergencies);
          } catch { console.warn('Could not read Analog Emergency Systems'); }
        }
      } catch { console.warn('Error reading configuration blocks'); }

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

      onProgress?.(100, 'Read complete!', steps[5]);
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
      if (onConnected) await onConnected();

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
          if (onConnected) await onConnected();
          await performRead(protocol);
          return;
        } catch (retryErr) {
          const retryRawMessage = retryErr instanceof Error ? retryErr.message : 'Read failed';
          const retryErrorMessage = withVisibilityContext(retryRawMessage, tabWentHiddenDuringOperation);
          setError(retryErrorMessage);
          setConnectionError(retryErrorMessage);
          onProgress?.(0, `Error: ${retryErrorMessage}`, 'Error');
          setIsConnecting(false);
          try { await protocol?.disconnect(); } catch { /* ignore */ }
          throw retryErr;
        }
      }

      setError(errorMessage);
      setConnectionError(errorMessage);
      onProgress?.(0, `Error: ${errorMessage}`, 'Error');
      console.error('Radio read error:', err);
      setIsConnecting(false);
      try { await protocol?.disconnect(); } catch { /* ignore */ }
      throw err;
    } finally {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      setIsConnecting(false);
    }
  }, [selectedRadioModel, preferredTransport, setConnected, setRadioInfo, setRawRadioSettingsData, setChannels, setZones, setScanLists, setContacts, setContactsLoaded, setRawChannelData, setRawZoneData, setRawScanListData, setBlockMetadata, setBlockData, setCachedMemoryImage, setRadioSettings, setDigitalEmergencies, setDigitalEmergencyConfig, setAnalogEmergencies, setMessages, setRawMessageData, setMessagesLoaded, setQuickContacts, setQuickContactsLoaded, setRadioIds, setRawRadioIdData, setRadioIdsLoaded, setCalibration, setCalibrationLoaded, setRXGroups, setRawGroupData, setGroupsLoaded, setConnectionError]);

  const readContacts = useCallback(async (
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setError(null);
    
    let protocol: RadioProtocol | null = null;

    try {
      // Use protocol for connected radio (write/reconnect path)
      protocol = createProtocolForModel(radioInfo?.model ?? '') ?? createDefaultProtocol();
      
      // Set up progress callback
      protocol.onProgress = (progress, message) => {
        onProgress?.(progress, message);
      };
      
      // Connect to radio (reuse existing connection if available)
      onProgress?.(0, 'Connecting to radio...');
      await protocol.connect();
      
      // Get radio info if not already available
      if (!radioInfo) {
        onProgress?.(5, 'Reading radio information...');
        const info = await protocol.getRadioInfo();
        setRadioInfo(info);
        setConnected(true);
      }
      
      // Read contacts (this is slow - reads many 4KB blocks)
      onProgress?.(10, 'Reading contacts from radio (this may take a while)...');
      const contacts = await protocol.readContacts();
      setContacts(contacts);
      
      const dm32 = protocol instanceof DM32UVProtocol ? protocol : null;
      if (dm32?.rawContactBlockData) {
        setRawContactBlockData(dm32.rawContactBlockData, dm32.rawContactBlockAddress);
      }
      if (dm32?.rawContactBlocks) {
        setRawContactBlocks(dm32.rawContactBlocks);
      }
      
      onProgress?.(100, `Successfully read ${contacts.length} contacts`);
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
          console.warn('Error disconnecting after reading contacts:', e);
        }
      }
      setIsConnecting(false);
    }
  }, [setContacts, setRadioInfo, setConnected, radioInfo]);

  const readBootImage = useCallback(async (
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setError(null);
    let protocol: RadioProtocol | null = null;
    try {
      protocol = createProtocolForModel(radioInfo?.model ?? '') ?? createDefaultProtocol();
      protocol.onProgress = (progress, message) => {
        onProgress?.(progress, message);
      };
      onProgress?.(0, 'Connecting to radio...');
      await protocol.connect();
      if (!radioInfo) {
        onProgress?.(5, 'Reading radio information...');
        const info = await protocol.getRadioInfo();
        setRadioInfo(info);
        setConnected(true);
      }
      onProgress?.(10, 'Reading boot image from radio...');
      const dm32 = protocol instanceof DM32UVProtocol ? protocol : null;
      if (!dm32) throw new Error('Boot image is only supported on DM-32UV');
      const raw = await dm32.readBootImage();
      setBootImageRaw(raw);
      const parsed = parseBootImageHeader(raw);
      setBootImageDescription(parsed.description || null);
      onProgress?.(100, 'Boot image read complete');
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
          console.warn('Error disconnecting after reading boot image:', e);
        }
      }
      setIsConnecting(false);
    }
  }, [setBootImageRaw, setBootImageDescription, setRadioInfo, setConnected, radioInfo]);

  const writeBootImage = useCallback(async (
    data: Uint8Array,
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setError(null);
    let protocol: RadioProtocol | null = null;
    try {
      protocol = createProtocolForModel(radioInfo?.model ?? '') ?? createDefaultProtocol();
      protocol.onProgress = (progress, message) => {
        onProgress?.(progress, message);
      };
      onProgress?.(0, 'Connecting to radio...');
      await protocol.connect();
      if (!radioInfo) {
        onProgress?.(5, 'Reading radio information...');
        const info = await protocol.getRadioInfo();
        setRadioInfo(info);
        setConnected(true);
      }
      onProgress?.(10, 'Writing boot image to radio...');
      const dm32 = protocol instanceof DM32UVProtocol ? protocol : null;
      if (!dm32) throw new Error('Boot image is only supported on DM-32UV');
      await dm32.writeBootImage(data);
      setBootImageRaw(data);
      const parsed = parseBootImageHeader(data);
      setBootImageDescription(parsed.description || null);
      onProgress?.(100, 'Boot image write complete');
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
          console.warn('Error disconnecting after writing boot image:', e);
        }
      }
      setIsConnecting(false);
    }
  }, [setBootImageRaw, setBootImageDescription, setRadioInfo, setConnected, radioInfo]);

  const writeContacts = useCallback(async (
    contacts: Contact[],
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
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
    }
  }, [setContacts, setRadioInfo, setConnected, radioInfo]);

  const writeChannelsToRadio = useCallback(async (
    channels: Channel[],
    zones: Zone[],
    scanLists: ScanList[],
    onProgress?: (progress: number, message: string, step?: string) => void
  ) => {
    setIsConnecting(true);
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
    }
  }, [radioInfo, selectedRadioModel, setConnected, setRadioInfo, setCachedMemoryImage, setWriteBlockData, setZoneComparisonData, setConnectionError]);

  return {
    isConnecting,
    error,
    readFromRadio,
    readContacts,
    readBootImage,
    writeBootImage,
    writeContacts,
    writeChannelsToRadio,
    readSteps: READ_STEPS,
    writeChannelsSteps: WRITE_CHANNELS_STEPS,
  };
}

