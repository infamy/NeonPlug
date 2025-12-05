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

    const steps = [
      'Selecting port',
      'Connecting to radio',
      'Reading radio information',
      'Reading channels',
      'Reading configuration',
      'Complete',
    ];

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
      
      // Step 3: Get radio info and settings
      onProgress?.(10, 'Reading radio information...', steps[2]);
      const radioInfo = await protocol.getRadioInfo();
      const settings = await protocol.readRadioSettings();
      
      setRadioInfo(radioInfo);
      setSettings(settings);
      setConnected(true);
      
      // Step 4: Read channels
      onProgress?.(20, 'Reading channels...', steps[3]);
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

      // Step 5: Read configuration (zones, scan lists, quick messages, etc.)
      // Suppress detailed messages and only show high-level progress
      const originalConfigProgress = protocol.onProgress;
      protocol.onProgress = (progress, _message) => {
        // Only update progress percentage, don't forward detailed messages
        const overallProgress = 70 + (progress * 0.25); // 70% to 95%
        // Only forward progress percentage, keep the high-level message
        onProgress?.(overallProgress, 'Reading configuration...', steps[4]);
      };

      onProgress?.(70, 'Reading configuration...', steps[4]);
      
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

      // Step 8: Complete (contacts are read separately on demand)
      onProgress?.(100, 'Read complete!', steps[5]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Read failed';
      setError(errorMessage);
      onProgress?.(0, `Error: ${errorMessage}`, 'Error');
      
      // Don't throw - let the caller handle showing the startup modal
      // This prevents the page from "crashing" on error
      console.error('Radio read error:', err);
    } finally {
      // Always disconnect after reading
      if (protocol) {
        try {
          await protocol.disconnect();
        } catch (e) {
          console.warn('Error disconnecting:', e);
        }
      }
      // Don't clear radio info - keep it displayed after reading
      // setConnected(false);
      // setRadioInfo(null);
      // setSettings(null);
      setIsConnecting(false);
    }
  }, [setConnected, setRadioInfo, setSettings, setChannels, setZones, setScanLists, setContacts, setRawChannelData, setRawZoneData, setBlockMetadata, setBlockData, setRadioSettings, setDigitalEmergencies, setDigitalEmergencyConfig, setAnalogEmergencies, setMessages, setRawMessageData, setRadioIds, setRawRadioIdData, setCalibration, setRXGroups, setRawGroupData]);

  const readContacts = useCallback(async (
    onProgress?: (progress: number, message: string) => void
  ) => {
    // Ask for confirmation since this is a slow operation
    const confirmed = window.confirm(
      'Reading contacts from the radio can take a long time.\n\n' +
      'This operation will discover and read all contact blocks, which may take several minutes.\n\n' +
      'Do you want to continue?'
    );
    
    if (!confirmed) {
      return;
    }

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
      
      // Connect to radio (this will trigger port selection dialog)
      onProgress?.(5, 'Please select a serial port in the browser dialog...');
      onProgress?.(10, 'Connecting to radio...');
      await protocol.connect();
      
      // Read contacts
      onProgress?.(20, 'Reading contacts...');
      const contacts = await protocol.readContacts();
      setContacts(contacts);
      
      onProgress?.(100, 'Contacts read complete!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Read failed';
      setError(errorMessage);
      onProgress?.(0, `Error: ${errorMessage}`);
      console.error('Contacts read error:', err);
    } finally {
      if (protocol) {
        try {
          await protocol.disconnect();
        } catch (e) {
          console.warn('Error disconnecting:', e);
        }
      }
      setIsConnecting(false);
    }
  }, [setContacts]);

  const readQuickMessages = useCallback(async (
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
      
      // Connect to radio (this will trigger port selection dialog)
      onProgress?.(5, 'Please select a serial port in the browser dialog...');
      onProgress?.(10, 'Connecting to radio...');
      await protocol.connect();
      
      // Read quick messages
      onProgress?.(20, 'Reading quick messages...');
      const messages = await protocol.readQuickMessages();
      setMessages(messages);
      
      // Store raw message data for debug export
      const rawDataMap = new Map<number, { data: Uint8Array; messageIndex: number; offset: number }>();
      for (const [index, rawData] of protocol.rawMessageData.entries()) {
        rawDataMap.set(index, rawData);
      }
      setRawMessageData(rawDataMap);
      
      onProgress?.(100, 'Quick messages read complete!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Read failed';
      setError(errorMessage);
      onProgress?.(0, `Error: ${errorMessage}`);
      console.error('Quick messages read error:', err);
    } finally {
      if (protocol) {
        try {
          await protocol.disconnect();
        } catch (e) {
          console.warn('Error disconnecting:', e);
        }
      }
      setIsConnecting(false);
    }
  }, [setMessages, setRawMessageData]);

  return {
    isConnecting,
    error,
    readFromRadio,
    readContacts,
    readQuickMessages,
  };
}

