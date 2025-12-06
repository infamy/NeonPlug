import { useState, useCallback } from 'react';
import { DM32UVProtocol } from '../protocol/dm32uv/protocol';
import { useRadioStore } from '../store/radioStore';
import { useChannelsStore } from '../store/channelsStore';
import { useZonesStore } from '../store/zonesStore';
import { useScanListsStore } from '../store/scanListsStore';
import { useContactsStore } from '../store/contactsStore';
import { useRadioSettingsStore } from '../store/radioSettingsStore';
import { useDigitalEmergencyStore } from '../store/digitalEmergencyStore';
import { useAnalogEmergencyStore } from '../store/analogEmergencyStore';
import { useQuickMessagesStore } from '../store/quickMessagesStore';
import { useDMRRadioIDsStore } from '../store/dmrRadioIdsStore';
import { useCalibrationStore } from '../store/calibrationStore';
import { useRXGroupsStore } from '../store/rxGroupsStore';

// Export steps so UI components can use them (single source of truth)
const READ_STEPS: string[] = [
  'Selecting port',
  'Connecting to radio',
  'Reading radio information',
  'Reading memory blocks',
  'Parsing channels',
  'Parsing configuration',
];

export function useRadioConnection() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
    const { setConnected, setRadioInfo, setSettings, setBlockMetadata, setBlockData } = useRadioStore();
    const { setChannels, setRawChannelData } = useChannelsStore();
    const { setZones, setRawZoneData } = useZonesStore();
    const { setScanLists, setRawScanListData } = useScanListsStore();
    const { setContacts } = useContactsStore();
    const { setSettings: setRadioSettings } = useRadioSettingsStore();
    const { setSystems: setDigitalEmergencies, setConfig: setDigitalEmergencyConfig } = useDigitalEmergencyStore();
    const { setSystems: setAnalogEmergencies } = useAnalogEmergencyStore();
    const { setMessages, setRawMessageData } = useQuickMessagesStore();
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
      
      // Step 1: Select port (this will show browser's native port picker)
      onProgress?.(5, 'Please select a serial port in the browser dialog...', steps[0]);
      
      // Step 2: Connect to radio (this triggers the port selection dialog)
      onProgress?.(10, 'Connecting to radio...', steps[1]);
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
        setBlockMetadata((protocol as any).allBlockMetadata);
      }
      if ((protocol as any).allBlockData) {
        setBlockData((protocol as any).allBlockData);
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
        // DMR RX Groups are optional - log error but don't fail the entire read
        console.warn('Failed to read DMR RX Groups:', err);
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
  }, [setConnected, setRadioInfo, setSettings, setChannels, setZones, setScanLists, setContacts, setRawChannelData, setRawZoneData, setBlockMetadata, setBlockData, setRadioSettings, setDigitalEmergencies, setDigitalEmergencyConfig, setAnalogEmergencies, setMessages, setRawMessageData, setRadioIds, setRawRadioIdData, setCalibration, setRXGroups, setRawGroupData]);

  const readContacts = useCallback(async (
    onProgress?: (progress: number, message: string) => void
  ) => {
    // TODO: Reimplement contacts reading from cached blocks
    // Contacts need to be discovered and read from the cache array
    // This is a stub until we reimplement the contact reading logic
    onProgress?.(0, 'Contacts reading not yet implemented');
    console.warn('readContacts is a stub - needs reimplementation');
    throw new Error('Contacts reading is not yet implemented. It will be reimplemented to read from cached blocks.');
  }, []);

  return {
    isConnecting,
    error,
    readFromRadio,
    readContacts,
    readSteps: READ_STEPS,
  };
}

