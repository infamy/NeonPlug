/**
 * Channel creation and manipulation helpers
 */

import type { Channel } from '../models';

/**
 * Create a new channel with sensible defaults
 * All unknown fields are set to 0/false to match typical radio defaults
 * 
 * @param overrides Partial channel data to override defaults
 * @returns A complete Channel object ready for encoding
 */
export function createDefaultChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    number: 1,
    name: '',
    rxFrequency: 146.5200,
    txFrequency: 146.5200,
    mode: 'Analog',
    forbidTx: false,
    busyLock: 'Off',
    loneWorker: false,
    bandwidth: '25kHz',
    scanAdd: false,
    scanListId: 0,
    forbidTalkaround: false,
    unknown1A_6_4: 0,
    unknown1A_3: false,
    aprsReceive: false,
    reverseFreq: 0,
    emergencyIndicator: false,
    emergencyAck: false,
    emergencySystemId: 0,
    power: 'High',
    aprsReportMode: 'Off',
    unknown1C_1_0: 0,
    voxFunction: false,
    scramble: false,
    compander: false,
    talkback: false,
    unknown1D_3_0: 0,
    squelchLevel: 0,
    pttIdDisplay: false,
    pttId: 0,
    colorCode: 0,
    rxCtcssDcs: { type: 'None' },
    txCtcssDcs: { type: 'None' },
    companderDup: false,
    voxRelated: false,
    unknown25_7_6: 0,
    unknown25_3_0: 0,
    pttIdDisplay2: false,
    rxSquelchMode: 'Carrier/CTC',
    unknown26_3_1: 0,
    unknown26_0: false,
    stepFrequency: 5, // 25kHz
    signalingType: 'None',
    pttIdType: 'Off',
    unknown29_3_2: 0,
    unknown29_1_0: 0,
    unknown2A: 0,
    contactId: 0,
    ...overrides,
  };
}

/**
 * Validate that a channel has all required fields for encoding
 * @param channel Channel to validate
 * @returns true if valid, throws error if invalid
 */
export function validateChannelForEncoding(channel: Partial<Channel>): channel is Channel {
  const requiredFields: (keyof Channel)[] = [
    'number',
    'name',
    'rxFrequency',
    'txFrequency',
    'mode',
    'bandwidth',
    'power',
    'rxCtcssDcs',
    'txCtcssDcs',
    'rxSquelchMode',
    'signalingType',
    'pttIdType',
  ];

  for (const field of requiredFields) {
    if (channel[field] === undefined || channel[field] === null) {
      throw new Error(`Channel missing required field: ${field}`);
    }
  }

  return true;
}

