import { useChannelsStore } from '../store/channelsStore';
import { useZonesStore } from '../store/zonesStore';

export function useImportStores() {
  const { channels, setChannels } = useChannelsStore();
  const { zones, setZones } = useZonesStore();
  return { channels, setChannels, zones, setZones };
}
