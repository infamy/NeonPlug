import { describe, it, expect } from 'vitest';
import { exportChannelsToCSV, importChannelsFromCSV } from '../../src/services/csv';
import { CHANNEL_CSV_COLUMNS } from '../../src/services/csv/channelCsvColumns';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import type { Channel } from '../../src/models/Channel';

// Every field set to something other than its default, so a column the format
// forgets, or writes lossily, shows up as a difference.
const EVERY_FIELD: Required<Channel> = {
  number: 42,
  name: 'Every Field',
  rxFrequency: 446.00625,
  txFrequency: 441.00625,
  mode: 'Fixed Digital',
  forbidTx: true,
  loneWorker: true,
  bandwidth: '12.5kHz',
  scanAdd: true,
  scanListId: 5,
  forbidTalkaround: true,
  unknown1A_6_4: 2,
  unknown1A_3: true,
  aprsReceive: true,
  unknown1A_1_0: 1,
  emergencyIndicator: true,
  emergencyAck: true,
  emergencySystemId: 7,
  digitalEmergencySystemId: 3,
  power: 'Turbo',
  aprsReportMode: 'Analog',
  unknown1C_1_0: 2,
  voxFunction: true,
  scramble: true,
  compander: true,
  talkback: true,
  unknown1D_3_0: 9,
  squelchLevel: 7,
  pttIdDisplay: true,
  pttId: 33,
  colorCode: 11,
  rxCtcssDcs: { type: 'DCS', value: 23, polarity: 'P' },
  txCtcssDcs: { type: 'CTCSS', value: 127.3 },
  unknown25_7_6: 1,
  companderDup: true,
  voxRelated: true,
  unknown25_3_0: 6,
  pttIdDisplay2: true,
  rxSquelchMode: 'CTC&Opt',
  unknown26_3_1: 5,
  unknown26_0: true,
  stepFrequency: 2,
  signalingType: 'MDC1200',
  pttIdType: 'Both',
  unknown29_3_2: 3,
  unknown29_1_0: 1,
  unknown2A: 200,
  dmrRadioIdIndex: 4,
  contactId: 812,
  rxGroupListId: 12,
  slotOperation: 1,
  reverse: true,
  callConfirmation: true,
  slotSuit: true,
  ranging: true,
  customCtcssHz: 151.4,
  twoToneDecode: 2,
  twoToneId: 3,
  fiveToneId: 4,
  dtmfId: 5,
  offsetFrequencyEx: -2,
  txColorCode: 9,
  busyLock: 2,
  emergencySystemIndex: 6,
  dmrMode: 3,
  dataAckDisable: true,
  digitalDuplex: true,
  excludeFromRoaming: true,
  receiveOnly: true,
  dataAckForbid: true,
  autoScan: true,
  idleTx: true,
  dmrCrcIgnore: true,
  analogAprsPttMode: 1,
  digitalAprsPttMode: 2,
  digitalAprsReportChannel: 8,
  normalEmergencyCode: 4,
  smsConfirmation: true,
  analogAprsMute: true,
  sendTalkerAlias: true,
  analogAprsTxPath: 3,
  arc4Code: 77,
  encryption: true,
  encryptionId: 6,
  tdmaDirectMode: true,
  shortDataConfirm: true,
  privateConfirm: true,
  txContactId: 812,
  source: 'CSV "test", with a comma',
};

const roundTrip = (channels: Channel[]) => importChannelsFromCSV(exportChannelsToCSV(channels));

describe('channel CSV round trip', () => {
  it('sets a value for every column, so no column goes untested', () => {
    expect(Object.keys(EVERY_FIELD).sort()).toEqual(Object.keys(CHANNEL_CSV_COLUMNS).sort());
  });

  it('brings every field back unchanged', () => {
    const result = roundTrip([EVERY_FIELD]);
    expect(result.errors).toBeUndefined();
    expect(result.channels).toEqual([EVERY_FIELD]);
  });

  it('leaves fields a radio never set unset, rather than writing 0', () => {
    const plain = createDefaultChannel({ number: 7, name: 'Plain', rxFrequency: 146.52, txFrequency: 146.52 });
    const [back] = roundTrip([plain]).channels!;
    expect(back).toEqual(plain);
    expect('txColorCode' in back).toBe(false);
    expect('slotOperation' in back).toBe(false);
  });

  it('keeps APRS off as off', () => {
    // The old exporter wrote "No" here, and the importer read it back as Analog APRS.
    const [back] = roundTrip([createDefaultChannel({ aprsReportMode: 'Off' })]).channels!;
    expect(back.aprsReportMode).toBe('Off');
  });

  it('still reads the Yes/No APRS column the old exporter wrote', () => {
    const csv = 'Name,RX Frequency,TX Frequency,APRS TX\nA,146.52,146.52,No\nB,146.52,146.52,Yes';
    expect(importChannelsFromCSV(csv).channels!.map((c) => c.aprsReportMode)).toEqual(['Off', 'Digital']);
  });

  it('keeps an inverted DCS code inverted', () => {
    const inverted = createDefaultChannel({ txCtcssDcs: { type: 'DCS', value: 754, polarity: 'P' } });
    expect(roundTrip([inverted]).channels![0].txCtcssDcs).toEqual({ type: 'DCS', value: 754, polarity: 'P' });
  });

  it('keeps a 6.25 kHz frequency exact', () => {
    const [back] = roundTrip([createDefaultChannel({ rxFrequency: 462.56250, txFrequency: 467.63125 })]).channels!;
    expect(back.rxFrequency).toBe(462.5625);
    expect(back.txFrequency).toBe(467.63125);
  });

  it('refuses a row with a mode it does not recognise, instead of guessing', () => {
    const csv = 'Name,RX Frequency,TX Frequency,Mode\nGood,146.52,146.52,Analog\nBad,146.52,146.52,FM';
    const result = importChannelsFromCSV(csv);
    expect(result.success).toBe(false);
    expect(result.channels!.map((c) => c.name)).toEqual(['Good']);
    expect(result.errors![0]).toMatch(/Row 3: Mode "FM" is not one of/);
  });

  it('does not read the DMR Mode column as the channel mode when Mode is missing', () => {
    const csv = 'Name,RX Frequency,TX Frequency,DMR Mode\nA,146.52,146.52,3';
    const [back] = importChannelsFromCSV(csv).channels!;
    expect(back.mode).toBe('Analog');
    expect(back.dmrMode).toBe(3);
  });
});
