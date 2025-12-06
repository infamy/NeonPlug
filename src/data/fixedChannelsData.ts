/**
 * Fixed Channel Data
 * Centralized data file for all fixed channel sets
 * 
 * Data is loaded from fixedChannels.json for easy editing
 * To add new channel sets, edit src/data/fixedChannels.json
 */

import fixedChannelsJson from './fixedChannels.json';

export interface FixedChannelFrequency {
  number: number;
  rx: number; // MHz
  tx: number; // MHz
  name: string;
  ctcss?: number; // Optional CTCSS tone in Hz
  dcs?: number; // Optional DCS code
  notes?: string; // Optional notes
}

export interface FixedChannelSetData {
  name: string;
  description: string;
  frequencies: FixedChannelFrequency[];
  defaultPower: 'Low' | 'Medium' | 'High';
  defaultBandwidth: '12.5kHz' | '25kHz';
  defaultMode: 'Analog' | 'Digital' | 'Fixed Analog' | 'Fixed Digital';
}

/**
 * All fixed channel sets loaded from JSON
 * Edit src/data/fixedChannels.json to add new channel sets
 */
export const ALL_FIXED_CHANNEL_SETS: FixedChannelSetData[] = fixedChannelsJson as FixedChannelSetData[];

