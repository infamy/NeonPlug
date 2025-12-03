/**
 * Debug Export Service
 * Exports raw binary data alongside parsed data for troubleshooting
 */

import type { Channel, Zone } from '../models';

export interface RawChannelData {
  channelNumber: number;
  rawHex: string;
  rawBytes: number[];
  parsed: Channel;
  blockAddress: string;
  blockOffset: string;
}

export interface RawZoneData {
  zoneName: string;
  rawHex: string;
  rawBytes: number[];
  parsed: Zone;
  zoneNumber: number;
  offset: number;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
}

/**
 * Export channel debug data to JSON
 */
export function exportChannelDebug(
  channels: Channel[],
  rawChannelData: Map<number, { data: Uint8Array; blockAddr: number; offset: number }>
): string {
  const debugData: RawChannelData[] = [];

  for (const channel of channels) {
    const raw = rawChannelData.get(channel.number);
    if (raw) {
      debugData.push({
        channelNumber: channel.number,
        rawHex: bytesToHex(raw.data),
        rawBytes: Array.from(raw.data),
        parsed: channel,
        blockAddress: `0x${raw.blockAddr.toString(16).padStart(6, '0')}`,
        blockOffset: `0x${raw.offset.toString(16).padStart(4, '0')}`,
      });
    }
  }

  return JSON.stringify(debugData, null, 2);
}

/**
 * Export zone debug data to JSON
 */
export function exportZoneDebug(
  zones: Zone[],
  rawZoneData: Map<string, { data: Uint8Array; zoneNum: number; offset: number }>
): string {
  const debugData: RawZoneData[] = [];

  for (const zone of zones) {
    const raw = rawZoneData.get(zone.name);
    if (raw) {
      debugData.push({
        zoneName: zone.name,
        rawHex: bytesToHex(raw.data),
        rawBytes: Array.from(raw.data),
        parsed: zone,
        zoneNumber: raw.zoneNum,
        offset: raw.offset,
      });
    }
  }

  return JSON.stringify(debugData, null, 2);
}

export interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  data?: any;
}

/**
 * Export comprehensive debug data (channels + zones + console logs + all block metadata and data)
 */
export function exportFullDebug(
  channels: Channel[],
  zones: Zone[],
  rawChannelData: Map<number, { data: Uint8Array; blockAddr: number; offset: number }>,
  rawZoneData: Map<string, { data: Uint8Array; zoneNum: number; offset: number }>,
  consoleLogs?: LogEntry[],
  allBlockMetadata?: Map<number, { metadata: number; type: string }>,
  allBlockData?: Map<number, Uint8Array>
): string {
  const channelDebug = JSON.parse(exportChannelDebug(channels, rawChannelData));
  const zoneDebug = JSON.parse(exportZoneDebug(zones, rawZoneData));
  
  // Convert block metadata to JSON-serializable format
  const blockMetadataArray: Array<{ address: string; metadata: number; type: string }> = [];
  if (allBlockMetadata) {
    for (const [address, info] of allBlockMetadata.entries()) {
      blockMetadataArray.push({
        address: `0x${address.toString(16).padStart(6, '0')}`,
        metadata: info.metadata,
        type: info.type,
      });
    }
    // Sort by address
    blockMetadataArray.sort((a, b) => parseInt(a.address, 16) - parseInt(b.address, 16));
  }

  // Convert block data to JSON-serializable format (hex strings, byte arrays, and ASCII text)
  const blockDataArray: Array<{ address: string; metadata: number; hex: string; bytes: number[]; ascii: string }> = [];
  if (allBlockData && allBlockMetadata) {
    for (const [address, data] of allBlockData.entries()) {
      const metadataInfo = allBlockMetadata.get(address);
      if (metadataInfo) {
        // Convert to ASCII for text searching (replace non-printable chars with '.')
        const ascii = Array.from(data)
          .map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.')
          .join('');
        
        blockDataArray.push({
          address: `0x${address.toString(16).padStart(6, '0')}`,
          metadata: metadataInfo.metadata,
          hex: Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '),
          bytes: Array.from(data),
          ascii: ascii, // ASCII representation for easy text searching
        });
      }
    }
    // Sort by address
    blockDataArray.sort((a, b) => parseInt(a.address, 16) - parseInt(b.address, 16));
  }
  
  const debugData = {
    channels: channelDebug,
    zones: zoneDebug,
    consoleLogs: consoleLogs || [],
    blockMetadata: blockMetadataArray,
    blockData: blockDataArray,
    metadata: {
      channelCount: channels.length,
      zoneCount: zones.length,
      logCount: consoleLogs?.length || 0,
      blockCount: blockMetadataArray.length,
      nonEmptyBlockCount: blockDataArray.length,
      exportDate: new Date().toISOString(),
    },
  };

  return JSON.stringify(debugData, null, 2);
}

/**
 * Download debug data as file
 */
export function downloadDebug(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

