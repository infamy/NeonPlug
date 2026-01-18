import { useState, useCallback } from 'react';
import { DM32UVProtocol } from '../protocol/dm32uv/protocol';
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
import type { Channel } from '../models/Channel';
import type { Zone } from '../models/Zone';
import type { ScanList } from '../models/ScanList';

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
  
  const { radioInfo, setConnected, setRadioInfo, setSettings, setRawRadioSettingsData, setRawContactBlockData, setBlockMetadata, setBlockData, setWriteBlockData, setZoneComparisonData } = useRadioStore();
  const { setChannels, setRawChannelData } = useChannelsStore();
  const { setZones, setRawZoneData } = useZonesStore();
  const { setScanLists, setRawScanListData } = useScanListsStore();
  const { setContacts } = useContactsStore();
  const { setSettings: setRadioSettings } = useRadioSettingsStore();
  const { setSystems: setDigitalEmergencies, setConfig: setDigitalEmergencyConfig } = useDigitalEmergencyStore();
  const { setSystems: setAnalogEmergencies } = useAnalogEmergencyStore();
  const { setMessages, setRawMessageData } = useQuickMessagesStore();
  const { setContacts: setQuickContacts } = useQuickContactsStore();
  const { setRadioIds, setRawRadioIdData } = useDMRRadioIDsStore();
  const { setCalibration } = useCalibrationStore();
  const { setGroups: setRXGroups, setRawGroupData } = useRXGroupsStore();

  const readFromRadio = useCallback(async (
    onProgress?: (progress: number, message: string, step?: string) => void
  ) => {
    setIsConnecting(true);
    setError(null);
    
    let protocol: DM32UVProtocol | null = null;

    // Define steps once - this is the single source of truth
    // Use the exported READ_STEPS array (single source of truth)
    const steps = READ_STEPS;

    try {
      // Create protocol instance
      protocol = new DM32UVProtocol();
      
      // Set up progress callback that forwards to our callback
      protocol.onProgress = (progress, message) => {
        onProgress?.(progress, message);
      };
      
      // Step 1: Connect to radio (will auto-detect previously granted port or prompt if needed)
      onProgress?.(5, 'Connecting to radio...', steps[1]);
      await protocol.connect();
      
      // Step 3: Get radio info
      onProgress?.(10, 'Reading radio information...', steps[2]);
      const radioInfo = await protocol.getRadioInfo();
      
      setRadioInfo(radioInfo);
      setConnected(true);
      
      // Step 4: Bulk read all required blocks upfront
      // This will read all blocks and then disconnect from the radio
      onProgress?.(15, 'Reading all memory blocks...', steps[3]);
      await protocol.bulkReadRequiredBlocks();
      
      // Connection is now closed - all data is in cache
      // All parsing happens from cached blocks, no connection needed
      // Step 5: Process cached blocks to extract data (no connection needed)
      onProgress?.(20, 'Parsing channels from cache...', steps[4]);
      const channels = await protocol.readChannels();
      setChannels(channels);
      // Store raw channel data for debug export
      if ((protocol as any).rawChannelData) {
        setRawChannelData((protocol as any).rawChannelData);
      }
      // Store all block metadata and data for debug export
      if ((protocol as any).allBlockMetadata) {
        const metadata = (protocol as any).allBlockMetadata;
        // Create a new Map to ensure Zustand stores it properly
        const metadataCopy = new Map<number, { metadata: number; type: string }>(metadata);
        setBlockMetadata(metadataCopy);
      }
      if ((protocol as any).allBlockData) {
        const data = (protocol as any).allBlockData;
        // Create a new Map to ensure Zustand stores it properly
        const dataCopy = new Map<number, Uint8Array>(data);
        setBlockData(dataCopy);
      }

      // Step 6: Parse configuration (zones, scan lists, quick messages, etc.)
      // Suppress detailed messages and only show high-level progress
      const originalConfigProgress = protocol.onProgress;
      protocol.onProgress = (progress, _message) => {
        // Only update progress percentage, don't forward detailed messages
        const overallProgress = 70 + (progress * 0.25); // 70% to 95%
        // Only forward progress percentage, keep the high-level message
        onProgress?.(overallProgress, 'Parsing configuration...', steps[5]);
      };

      onProgress?.(70, 'Parsing configuration from cache...', steps[5]);
      
      // Read zones
      const zones = await protocol.readZones();
      setZones(zones);
      // Store raw zone data for debug export
      if ((protocol as any).rawZoneData) {
        setRawZoneData((protocol as any).rawZoneData);
      }

      // Read scan lists
      const scanLists = await protocol.readScanLists();
      setScanLists(scanLists);
      // Store raw scan list data for debug export
      if ((protocol as any).rawScanListData) {
        setRawScanListData((protocol as any).rawScanListData);
      }
      // Update blockData with scan list blocks
      if ((protocol as any).blockData) {
        setBlockData((protocol as any).blockData);
      }

      // Read quick messages (optional - don't fail if missing)
      try {
        const messages = await protocol.readQuickMessages();
        setMessages(messages);
        // Store raw message data for debug export
        const rawDataMap = new Map<number, { data: Uint8Array; messageIndex: number; offset: number }>();
        for (const [index, rawData] of protocol.rawMessageData.entries()) {
          rawDataMap.set(index, rawData);
        }
        setRawMessageData(rawDataMap);
      } catch (err) {
        // Quick messages are optional - log error but don't fail the entire read
        console.warn('Failed to read quick messages:', err);
      }

      // Read DMR Radio IDs (optional - don't fail if missing)
      try {
        const radioIds = await protocol.readDMRRadioIDs();
        setRadioIds(radioIds);
        // Store raw radio ID data for debug export
        const rawIdDataMap = new Map<number, { data: Uint8Array; idIndex: number; offset: number }>();
        for (const [index, rawData] of protocol.rawDMRRadioIDData.entries()) {
          rawIdDataMap.set(index, rawData);
        }
        setRawRadioIdData(rawIdDataMap);
      } catch (err) {
        // DMR Radio IDs are optional - log error but don't fail the entire read
        console.warn('Failed to read DMR Radio IDs:', err);
      }

      // Read calibration data (optional - don't fail if missing)
      try {
        const calibration = await protocol.readCalibration();
        setCalibration(calibration);
      } catch (err) {
        // Calibration is optional - log error but don't fail the entire read
        console.warn('Failed to read calibration data:', err);
      }

      // Read DMR RX Groups (optional - don't fail if missing)
      try {
        const rxGroups = await protocol.readRXGroups();
        setRXGroups(rxGroups);
        // Store raw DMR RX group data for debug export
        const rawGroupDataMap = new Map<number, { data: Uint8Array; groupIndex: number; offset: number }>();
        for (const [index, rawData] of protocol.rawRXGroupData.entries()) {
          rawGroupDataMap.set(index, rawData);
        }
        setRawGroupData(rawGroupDataMap);
      } catch (err) {
        console.warn('Could not read RX Groups:', err);
      }

      // Read Talk Groups (metadata 0x44)
      try {
        const quickContacts = await protocol.readQuickContacts();
        setQuickContacts(quickContacts);
      } catch (err) {
        console.warn('Could not read Talk Groups:', err);
      }

      // Step 7: Read configuration blocks (Radio Settings, Emergency Systems, etc.)
      try {
        onProgress?.(90, 'Reading configuration...', 'Reading configuration');
        
        // Read Radio Settings (for Radio Boot Text)
        try {
          const radioSettings = await protocol.readRadioSettings();
          if (radioSettings) {
            setRadioSettings(radioSettings);
          }
          // Store raw radio settings data for diagnostics
          if ((protocol as any).rawRadioSettingsData) {
            setRawRadioSettingsData((protocol as any).rawRadioSettingsData);
          }
        } catch (err) {
          // Radio settings are optional - don't fail the entire read if they're missing or cause errors
          console.warn('Could not read Radio Settings:', err);
        }

        // Read Digital Emergency Systems
        try {
          const digitalEmergency = await protocol.readDigitalEmergencies();
          if (digitalEmergency) {
            setDigitalEmergencies(digitalEmergency.systems);
            setDigitalEmergencyConfig(digitalEmergency.config);
          }
        } catch (err) {
          console.warn('Could not read Digital Emergency Systems:', err);
        }

        // Read Analog Emergency Systems
        try {
          const analogEmergencies = await protocol.readAnalogEmergencies();
          if (analogEmergencies) {
            setAnalogEmergencies(analogEmergencies);
          }
        } catch (err) {
          console.warn('Could not read Analog Emergency Systems:', err);
        }

        // Update blockData with all configuration blocks for debug export
        if ((protocol as any).blockData) {
          setBlockData((protocol as any).blockData);
        }
      } catch (err) {
        // Configuration blocks are optional - don't fail the entire read if they're missing or cause errors
        console.warn('Error reading configuration blocks:', err);
      }

      // Restore original progress handler
      protocol.onProgress = originalConfigProgress;

      // Step 6: Complete (contacts are read separately on demand)
      onProgress?.(100, 'Read complete!', steps[5]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Read failed';
      const isPortSelectionCancelled = errorMessage.includes('cancelled') || errorMessage.includes('Port selection cancelled');
      
      // If it's not a port selection cancellation, try retrying with forced port selection
      if (!isPortSelectionCancelled && protocol) {
        console.warn('Read failed, will retry with port selection:', errorMessage);
        
        // Clear the stored port so we force port selection on retry
        (protocol as any).port = null;
        
        // Try to disconnect the failed connection
        try {
          await protocol.disconnect();
        } catch (disconnectErr) {
          console.warn('Error during disconnect cleanup:', disconnectErr);
        }
        
        // Retry the entire read operation with forced port selection
        try {
          onProgress?.(5, 'Retrying with port selection...', steps[0]);
          // Create a new protocol instance to ensure clean state
          protocol = new DM32UVProtocol();
          protocol.onProgress = (progress, message) => {
            onProgress?.(progress, message);
          };
          
          // Force port selection for retry
          (protocol as any).port = null;
          await protocol.connect();
          
          // Continue with the read operation from the beginning
          onProgress?.(10, 'Reading radio information...', steps[2]);
          const radioInfo = await protocol.getRadioInfo();
          setRadioInfo(radioInfo);
          setConnected(true);
          
          onProgress?.(15, 'Reading all memory blocks...', steps[3]);
          await protocol.bulkReadRequiredBlocks();
          
          onProgress?.(20, 'Parsing channels from cache...', steps[4]);
          const channels = await protocol.readChannels();
          setChannels(channels);
          if ((protocol as any).rawChannelData) {
            setRawChannelData((protocol as any).rawChannelData);
          }
          if ((protocol as any).allBlockMetadata) {
            setBlockMetadata((protocol as any).allBlockMetadata);
          }
          if ((protocol as any).allBlockData) {
            setBlockData((protocol as any).allBlockData);
          }
          
          const originalConfigProgress = protocol.onProgress;
          protocol.onProgress = (progress, _message) => {
            const overallProgress = 70 + (progress * 0.25);
            onProgress?.(overallProgress, 'Parsing configuration...', steps[5]);
          };
          
          onProgress?.(70, 'Parsing configuration from cache...', steps[5]);
          
          const zones = await protocol.readZones();
          setZones(zones);
          if ((protocol as any).rawZoneData) {
            setRawZoneData((protocol as any).rawZoneData);
          }
          
          const scanLists = await protocol.readScanLists();
          setScanLists(scanLists);
          if ((protocol as any).rawScanListData) {
            setRawScanListData((protocol as any).rawScanListData);
          }
          if ((protocol as any).blockData) {
            setBlockData((protocol as any).blockData);
          }
          
          try {
            const messages = await protocol.readQuickMessages();
            setMessages(messages);
            const rawDataMap = new Map<number, { data: Uint8Array; messageIndex: number; offset: number }>();
            for (const [index, rawData] of protocol.rawMessageData.entries()) {
              rawDataMap.set(index, rawData);
            }
            setRawMessageData(rawDataMap);
          } catch (msgErr) {
            console.warn('Could not read Quick Messages:', msgErr);
          }
          
          try {
            const radioSettings = await protocol.readRadioSettings();
            setRadioSettings(radioSettings);
            if ((protocol as any).rawRadioSettingsData) {
              setRawRadioSettingsData((protocol as any).rawRadioSettingsData);
            }
          } catch (settingsErr) {
            console.warn('Could not read Radio Settings:', settingsErr);
          }
          
          try {
            const digitalEmergencies = await protocol.readDigitalEmergencies();
            if (digitalEmergencies) {
              setDigitalEmergencies(digitalEmergencies.systems);
              setDigitalEmergencyConfig(digitalEmergencies.config);
            }
          } catch (err) {
            console.warn('Could not read Digital Emergency Systems:', err);
          }
          
          try {
            const radioIds = await protocol.readDMRRadioIDs();
            if (radioIds) {
              setRadioIds(radioIds);
            }
          } catch (err) {
            console.warn('Could not read DMR Radio IDs:', err);
          }
          
          try {
            const calibration = await protocol.readCalibration();
            if (calibration) {
              setCalibration(calibration);
            }
          } catch (err) {
            console.warn('Could not read Calibration:', err);
          }
          
          try {
            const rxGroups = await protocol.readRXGroups();
            if (rxGroups) {
              setRXGroups(rxGroups);
            }
          } catch (err) {
            console.warn('Could not read RX Groups:', err);
          }

          // Read Talk Groups
          try {
            const quickContacts = await protocol.readQuickContacts();
            if (quickContacts) {
              setQuickContacts(quickContacts);
            }
          } catch (err) {
            console.warn('Could not read Talk Groups:', err);
          }
          
          try {
            const analogEmergencies = await protocol.readAnalogEmergencies();
            if (analogEmergencies) {
              setAnalogEmergencies(analogEmergencies);
            }
          } catch (err) {
            console.warn('Could not read Analog Emergency Systems:', err);
          }
          
          if ((protocol as any).blockData) {
            setBlockData((protocol as any).blockData);
          }
          
          protocol.onProgress = originalConfigProgress;
          
          onProgress?.(100, 'Read complete!', steps[5]);
          return; // Success - exit without throwing
        } catch (retryErr) {
          // Retry also failed, fall through to show error
          console.error('Retry with port selection also failed:', retryErr);
          const retryErrorMessage = retryErr instanceof Error ? retryErr.message : 'Read failed';
          setError(retryErrorMessage);
          onProgress?.(0, `Error: ${retryErrorMessage}`, 'Error');
          setIsConnecting(false);
          
          if (protocol) {
            try {
              await protocol.disconnect();
            } catch (disconnectErr) {
              console.warn('Error during disconnect cleanup:', disconnectErr);
            }
          }
          throw retryErr;
        }
      }
      
      // If port selection was cancelled or retry didn't happen, show error
      setError(errorMessage);
      onProgress?.(0, `Error: ${errorMessage}`, 'Error');
      
      console.error('Radio read error:', err);
      
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
      
      // Re-throw the error so the caller (Toolbar) can handle it and show error in modal
      throw err;
    } finally {
      // Only set connecting to false if we didn't already (success case)
      // On error, we set it in the catch block so modal stays open to show error
      if (!error) {
        setIsConnecting(false);
      }
    }
  }, [setConnected, setRadioInfo, setSettings, setRawRadioSettingsData, setChannels, setZones, setScanLists, setContacts, setRawChannelData, setRawZoneData, setBlockMetadata, setBlockData, setRadioSettings, setDigitalEmergencies, setDigitalEmergencyConfig, setAnalogEmergencies, setMessages, setRawMessageData, setQuickContacts, setRadioIds, setRawRadioIdData, setCalibration, setRXGroups, setRawGroupData]);

  const readContacts = useCallback(async (
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setError(null);
    
    let protocol: DM32UVProtocol | null = null;

    try {
      // Create protocol instance
      protocol = new DM32UVProtocol();
      
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

  const writeContacts = useCallback(async (
    contacts: Contact[],
    onProgress?: (progress: number, message: string) => void
  ) => {
    setIsConnecting(true);
    setError(null);
    
    let protocol: DM32UVProtocol | null = null;

    try {
      // Create protocol instance
      protocol = new DM32UVProtocol();
      
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
    
    let protocol: DM32UVProtocol | null = null;
    const steps = WRITE_CHANNELS_STEPS;

    try {
      // Create protocol instance
      protocol = new DM32UVProtocol();
      
      // Restore cache from store if available (from previous read operation)
      // Read directly from store state to avoid hook reactivity issues
      const storeState = useRadioStore.getState();
      const storeBlockData = storeState.blockData;
      const storeBlockMetadata = storeState.blockMetadata;
      
      if (storeBlockData && storeBlockData.size > 0 && storeBlockMetadata && storeBlockMetadata.size > 0) {
        // Create new Maps to ensure we have proper copies
        const dataCopy = new Map<number, Uint8Array>(storeBlockData);
        const metadataCopy = new Map<number, { metadata: number; type: string }>(storeBlockMetadata);
        protocol.restoreCacheFromStore(dataCopy, metadataCopy);
      } else {
        console.warn('[Connection] Store cache is empty - will need to read all blocks from radio');
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
      const radioInfo = await protocol.getRadioInfo();
      
      setRadioInfo(radioInfo);
      setConnected(true);
      
      // Step 4: Write channels, zones, and scan lists
      onProgress?.(20, 'Writing channels, zones, and scan lists to radio...', steps[4]);
      await protocol.writeAllData(channels, zones, scanLists);
      
      // Step 5: Write Talk Groups if they have been loaded
      const quickContactsStore = useQuickContactsStore.getState();
      const quickContacts = quickContactsStore.contacts;
      if (quickContacts && quickContacts.length > 0) {
        onProgress?.(90, `Writing ${quickContacts.length} talk group(s) to radio...`, steps[4]);
        await protocol.writeQuickContacts(quickContacts);
      }

      // Step 6: Write radio settings only if they have been modified
      const radioSettingsStore = useRadioSettingsStore.getState();
      const radioSettings = radioSettingsStore.settings;
      const changedFields = radioSettingsStore.getChangedFields();

      if (radioSettings && changedFields.length > 0) {
        onProgress?.(95, `Writing ${changedFields.length} changed setting(s) to radio...`, steps[4]);
        await protocol.writeRadioSettings(radioSettings, changedFields);
        // Clear changes after successful write
        radioSettingsStore.clearChanges();
      }
      
      // Store write block data and zone comparison data for debug export
      setWriteBlockData((protocol as any).writeBlockData);
      setZoneComparisonData((protocol as any).zoneComparisonData);
      
      // Step 6: Disconnect
      await protocol.disconnect();
      
      const summary = [
        channels.length > 0 ? `${channels.length} channels` : null,
        zones.length > 0 ? `${zones.length} zones` : null,
        scanLists.length > 0 ? `${scanLists.length} scan lists` : null,
        quickContacts && quickContacts.length > 0 ? `${quickContacts.length} talk group(s)` : null,
        radioSettings && changedFields.length > 0 ? `${changedFields.length} setting(s)` : null,
      ].filter(Boolean).join(', ');
      
      onProgress?.(100, `Successfully wrote ${summary} to radio!`, steps[4]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Write failed';
      setError(errorMessage);
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
      // Only set connecting to false if we didn't already (success case)
      // On error, we set it in the catch block so modal stays open to show error
      if (!error) {
        setIsConnecting(false);
      }
    }
  }, [setConnected, setRadioInfo, setWriteBlockData, setZoneComparisonData]);

  return {
    isConnecting,
    error,
    readFromRadio,
    readContacts,
    writeContacts,
    writeChannelsToRadio,
    readSteps: READ_STEPS,
    writeChannelsSteps: WRITE_CHANNELS_STEPS,
  };
}

