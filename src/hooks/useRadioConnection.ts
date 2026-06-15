import { useState, useCallback } from 'react';
import type { RadioProtocol } from '../types/radio';
import { createDefaultProtocol, createProtocolForModel } from '../radios';
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
  
  const { selectedRadioModel, preferredTransport, radioInfo, setConnected, setRadioInfo, setRawRadioSettingsData, setRawContactBlockData, setRawContactBlocks, setBlockMetadata, setBlockData, setWriteBlockData, setZoneComparisonData, setBootImageRaw, setBootImageDescription, setConnectionError } = useRadioStore();
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
    { forcePortSelection = true }: { forcePortSelection?: boolean } = {}
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

      if (caps?.supportsBulkRead && typeof (proto as any).bulkReadRequiredBlocks === 'function') {
        onProgress?.(15, 'Reading all memory blocks...', steps[3]);
        await (proto as any).bulkReadRequiredBlocks();
      }

      onProgress?.(20, 'Parsing channels...', steps[4]);
      const channels = await proto.readChannels();
      setChannels(channels);
      // Enrich radioInfo with firmware from cached image (UV5R-Mini path)
      if (typeof (proto as any).getFirmwareFromCache === 'function') {
        const fw = (proto as any).getFirmwareFromCache();
        if (fw) {
          const current = useRadioStore.getState().radioInfo;
          if (current) setRadioInfo({ ...current, firmware: fw });
        }
      }
      if ((proto as any).rawChannelData) setRawChannelData((proto as any).rawChannelData);
      if ((proto as any).allBlockMetadata) setBlockMetadata(new Map<number, { metadata: number; type: string }>((proto as any).allBlockMetadata));
      if ((proto as any).allBlockData) setBlockData(new Map<number, Uint8Array>((proto as any).allBlockData));

      // Suppress per-item progress messages during config parsing; only surface the percentage.
      const savedProgress = proto.onProgress;
      proto.onProgress = (progress, _msg) => {
        onProgress?.(70 + (progress * 0.25), 'Parsing configuration...', steps[5]);
      };

      onProgress?.(70, 'Parsing configuration from cache...', steps[5]);

      const zones = await proto.readZones();
      setZones(zones);
      if ((proto as any).rawZoneData) setRawZoneData((proto as any).rawZoneData);

      const scanLists = await proto.readScanLists();
      setScanLists(scanLists);
      if ((proto as any).rawScanListData) setRawScanListData((proto as any).rawScanListData);
      if ((proto as any).blockData) setBlockData((proto as any).blockData);

      try {
        const messages = await (proto as any).readQuickMessages();
        setMessages(messages);
        const rawMsgMap = new Map<number, { data: Uint8Array; messageIndex: number; offset: number }>();
        for (const [i, raw] of (proto as any).rawMessageData.entries()) rawMsgMap.set(i, raw);
        setRawMessageData(rawMsgMap);
      } catch { console.warn('Could not read Quick Messages'); }

      try {
        const radioIds = await proto.readDMRRadioIDs();
        setRadioIds(radioIds);
        const rawIdMap = new Map<number, { data: Uint8Array; idIndex: number; offset: number }>();
        for (const [i, raw] of (proto as any).rawDMRRadioIDData.entries()) rawIdMap.set(i, raw);
        setRawRadioIdData(rawIdMap);
      } catch { console.warn('Could not read DMR Radio IDs'); }

      try {
        setCalibration(await (proto as any).readCalibration());
      } catch { console.warn('Could not read calibration data'); }

      try {
        const rxGroups = await (proto as any).readRXGroups();
        setRXGroups(rxGroups);
        const rawGroupMap = new Map<number, { data: Uint8Array; groupIndex: number; offset: number }>();
        for (const [i, raw] of (proto as any).rawRXGroupData.entries()) rawGroupMap.set(i, raw);
        setRawGroupData(rawGroupMap);
      } catch { console.warn('Could not read RX Groups'); }

      try {
        setQuickContacts(await (proto as any).readQuickContacts());
      } catch { console.warn('Could not read Talk Groups'); }

      try {
        onProgress?.(90, 'Reading configuration...', 'Reading configuration');

        try {
          const radioSettings = await proto.readRadioSettings();
          if (radioSettings) setRadioSettings(radioSettings);
          if ((proto as any).rawRadioSettingsData) setRawRadioSettingsData((proto as any).rawRadioSettingsData);
        } catch { console.warn('Could not read Radio Settings'); }

        try {
          const digitalEmergency = await (proto as any).readDigitalEmergencies();
          if (digitalEmergency) {
            setDigitalEmergencies(digitalEmergency.systems);
            setDigitalEmergencyConfig(digitalEmergency.config);
          }
        } catch { console.warn('Could not read Digital Emergency Systems'); }

        try {
          const analogEmergencies = await (proto as any).readAnalogEmergencies();
          if (analogEmergencies) setAnalogEmergencies(analogEmergencies);
        } catch { console.warn('Could not read Analog Emergency Systems'); }

        if ((proto as any).blockData) setBlockData((proto as any).blockData);
      } catch { console.warn('Error reading configuration blocks'); }

      proto.onProgress = savedProgress;
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
      if (!error) setIsConnecting(false);
    }
  }, [selectedRadioModel, preferredTransport, setConnected, setRadioInfo, setRawRadioSettingsData, setChannels, setZones, setScanLists, setContacts, setContactsLoaded, setRawChannelData, setRawZoneData, setRawScanListData, setBlockMetadata, setBlockData, setRadioSettings, setDigitalEmergencies, setDigitalEmergencyConfig, setAnalogEmergencies, setMessages, setRawMessageData, setMessagesLoaded, setQuickContacts, setQuickContactsLoaded, setRadioIds, setRawRadioIdData, setRadioIdsLoaded, setCalibration, setCalibrationLoaded, setRXGroups, setRawGroupData, setGroupsLoaded, setConnectionError]);

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
      
      // Store first contact block for debugging
      if ((protocol as any).rawContactBlockData) {
        setRawContactBlockData((protocol as any).rawContactBlockData, (protocol as any).rawContactBlockAddress || null);
      }
      // Store all contact blocks for diagnostics
      if ((protocol as any).rawContactBlocks) {
        setRawContactBlocks((protocol as any).rawContactBlocks);
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
      const raw = await (protocol as any).readBootImage();
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
      await (protocol as any).writeBootImage(data);
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
      
      // Restore cache from store if available (DM-32 bulk read path)
      const storeState = useRadioStore.getState();
      const storeBlockData = storeState.blockData;
      const storeBlockMetadata = storeState.blockMetadata;
      if (typeof (protocol as any).restoreCacheFromStore === 'function') {
        if (storeBlockData && storeBlockData.size > 0 && storeBlockMetadata && storeBlockMetadata.size > 0) {
          const dataCopy = new Map<number, Uint8Array>(storeBlockData);
          const metadataCopy = new Map<number, { metadata: number; type: string }>(storeBlockMetadata);
          (protocol as any).restoreCacheFromStore(dataCopy, metadataCopy);
        } else {
          console.warn('[Connection] Store cache is empty - will need to read all blocks from radio');
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
      
      // Step 4: Write channels (and zones/scan lists for DM-32; UV5R-Mini uses writeChannels only)
      if (typeof (protocol as any).writeAllData === 'function') {
        onProgress?.(20, 'Writing channels, zones, and scan lists to radio...', steps[4]);
        await (protocol as any).writeAllData(validChannels, filteredZones, filteredScanLists);
      } else if (typeof protocol.writeChannels === 'function') {
        onProgress?.(20, 'Writing channels to radio...', steps[4]);
        await protocol.writeChannels(validChannels);
      } else {
        throw new Error('Protocol does not support writing channels');
      }

      // Step 5: Write Talk Groups if they have been loaded (DM-32 only)
      if (typeof (protocol as any).writeQuickContacts === 'function') {
        const quickContactsStore = useQuickContactsStore.getState();
        const quickContacts = quickContactsStore.contacts;
        if (quickContacts && quickContacts.length > 0) {
          onProgress?.(90, `Writing ${quickContacts.length} talk group(s) to radio...`, steps[4]);
          await (protocol as any).writeQuickContacts(quickContacts);
        }
      }

      // Step 5.5: Write Quick Messages if they have been loaded (DM-32 only)
      if (typeof (protocol as any).writeQuickMessages === 'function') {
        const quickMessagesStore = useQuickMessagesStore.getState();
        const quickMessages = quickMessagesStore.messages;
        if (quickMessages && quickMessages.length > 0) {
          onProgress?.(92, `Writing ${quickMessages.length} quick message(s) to radio...`, steps[4]);
          await (protocol as any).writeQuickMessages(quickMessages);
        }
      }

      // Step 5.6: Write RX Groups if they have been loaded (DM-32 only)
      if (typeof (protocol as any).writeRXGroups === 'function') {
        const rxGroupsStore = useRXGroupsStore.getState();
        const rxGroups = rxGroupsStore.groups;
        if (rxGroups && rxGroups.length > 0 && rxGroupsStore.groupsLoaded) {
          onProgress?.(93, `Writing ${rxGroups.length} RX group(s) to radio...`, steps[4]);
          await (protocol as any).writeRXGroups(rxGroups);
        }
      }

      // Step 5.7: Write DMR Radio IDs if they have been loaded (DM-32 only)
      const dmrRadioIDsStore = useDMRRadioIDsStore.getState();
      const dmrRadioIds = dmrRadioIDsStore.radioIds;
      if (dmrRadioIds && dmrRadioIds.length > 0) {
        onProgress?.(94, `Writing ${dmrRadioIds.length} DMR Radio ID(s) to radio...`, steps[4]);
        await protocol.writeDMRRadioIDs(dmrRadioIds);
      }

      // Step 5.8: Write Encryption Keys if they have been loaded (DM-32 only)
      if (typeof (protocol as any).writeEncryptionKeys === 'function') {
        const encryptionKeysStore = useEncryptionKeysStore.getState();
        const encryptionKeys = encryptionKeysStore.keys;
        if (encryptionKeys && encryptionKeys.length > 0 && encryptionKeysStore.keysLoaded) {
          onProgress?.(94, `Writing ${encryptionKeys.length} encryption key(s) to radio...`, steps[4]);
          await (protocol as any).writeEncryptionKeys(encryptionKeys);
        }
      }

      // Step 5.9: Write Digital Emergency Systems if they have been loaded (DM-32 only)
      if (typeof (protocol as any).writeDigitalEmergencies === 'function') {
        const digitalEmergencyStore = useDigitalEmergencyStore.getState();
        const digitalEmergencySystems = digitalEmergencyStore.systems;
        const digitalEmergencyConfig = digitalEmergencyStore.config;
        if (digitalEmergencySystems.length > 0 && digitalEmergencyConfig) {
          onProgress?.(94, `Writing ${digitalEmergencySystems.length} digital emergency system(s) to radio...`, steps[4]);
          await (protocol as any).writeDigitalEmergencies(digitalEmergencySystems, digitalEmergencyConfig);
        }
      }

      // Step 5.10: Write Analog Emergency Systems if they have been loaded (DM-32 only)
      if (typeof (protocol as any).writeAnalogEmergencies === 'function') {
        const analogEmergencyStore = useAnalogEmergencyStore.getState();
        const analogEmergencySystems = analogEmergencyStore.systems;
        if (analogEmergencySystems.length > 0) {
          onProgress?.(94, `Writing ${analogEmergencySystems.length} analog emergency system(s) to radio...`, steps[4]);
          await (protocol as any).writeAnalogEmergencies(analogEmergencySystems);
        }
      }

      // Step 6: Write radio settings only if they have been modified (UV5R-Mini and DM-32)
      const radioSettingsStore = useRadioSettingsStore.getState();
      const radioSettings = radioSettingsStore.settings;
      const changedFields = radioSettingsStore.getChangedFields();
      const hasSettingsToWrite = radioSettings && changedFields.length > 0;

      if (hasSettingsToWrite) {
        onProgress?.(95, `Writing ${changedFields.length} changed setting(s) to radio...`, steps[4]);
        await protocol.writeRadioSettings(radioSettings, { changedFields });
        // Clear changes after successful write
        radioSettingsStore.clearChanges();
      }
      
      // Store write block data and zone comparison data for debug export (DM-32 only)
      if ((protocol as any).writeBlockData != null) setWriteBlockData((protocol as any).writeBlockData);
      if ((protocol as any).zoneComparisonData != null) setZoneComparisonData((protocol as any).zoneComparisonData);
      
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
      // Only set connecting to false if we didn't already (success case)
      // On error, we set it in the catch block so modal stays open to show error
      if (!error) {
        setIsConnecting(false);
      }
    }
  }, [radioInfo, setConnected, setRadioInfo, setWriteBlockData, setZoneComparisonData, setConnectionError]);

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

