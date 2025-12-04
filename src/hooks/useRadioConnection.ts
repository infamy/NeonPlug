import { useState, useCallback } from 'react';
import { DM32UVProtocol } from '../protocol/dm32uv/protocol';
import { useRadioStore } from '../store/radioStore';
import { useChannelsStore } from '../store/channelsStore';
import { useZonesStore } from '../store/zonesStore';
import { useScanListsStore } from '../store/scanListsStore';
import { useContactsStore } from '../store/contactsStore';

export function useRadioConnection() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
    const { setConnected, setRadioInfo, setSettings, setBlockMetadata, setBlockData } = useRadioStore();
    const { setChannels, setRawChannelData } = useChannelsStore();
    const { setZones, setRawZoneData } = useZonesStore();
    const { setScanLists, setRawScanListData } = useScanListsStore();
    const { setContacts } = useContactsStore();

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
      'Reading zones',
      'Reading scan lists',
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

      // Step 5: Read zones
      // Map internal progress (0-100%) to overall range (70-85%)
      const originalZoneProgress = protocol.onProgress;
      protocol.onProgress = (progress, message) => {
        const overallProgress = 70 + (progress * 0.15); // 70% to 85%
        onProgress?.(overallProgress, message, steps[4]);
      };

      onProgress?.(70, 'Reading zones...', steps[4]);
      const zones = await protocol.readZones();
      setZones(zones);
      // Store raw zone data for debug export
      if ((protocol as any).rawZoneData) {
        setRawZoneData((protocol as any).rawZoneData);
      }

      // Restore original progress handler
      protocol.onProgress = originalZoneProgress;

      // Step 6: Read scan lists
      // Map internal progress (0-100%) to overall range (85-90%)
      const originalScanListProgress = protocol.onProgress;
      protocol.onProgress = (progress, message) => {
        const overallProgress = 85 + (progress * 0.05); // 85% to 90%
        onProgress?.(overallProgress, message, steps[5]);
      };

      onProgress?.(85, 'Reading scan lists...', steps[5]);
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

      // Restore original progress handler
      protocol.onProgress = originalScanListProgress;

      // Step 7: Complete (contacts are read separately on demand)
      onProgress?.(100, 'Read complete!', steps[6]);
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
  }, [setConnected, setRadioInfo, setSettings, setChannels, setZones, setScanLists, setContacts, setRawChannelData, setRawZoneData, setBlockMetadata, setBlockData]);

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

  return {
    isConnecting,
    error,
    readFromRadio,
    readContacts,
  };
}

