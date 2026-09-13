/**
 * Every Channel field as CSV columns: the one place the channel CSV format is
 * defined, so the exporter and the importer cannot drift apart.
 *
 * The table is typed over every key of Channel. Add a field to the model and
 * this file stops compiling until the field has a column. The format had
 * drifted before: the exporter wrote 35 of the model's fields, so an export
 * followed by an import turned APRS off into Analog APRS, inverted DCS codes
 * into normal ones, and dropped every DMR and DA-7X2 field the radio would
 * then be written with.
 *
 * Column names are kept from that older exporter wherever a field already had
 * one, so files it wrote still import.
 */

import type { Channel, CTCSSDCS } from '../../models/Channel';

/** How one Channel field is written to, and read back from, its cells in a row. */
export interface ChannelCsvColumn<T> {
  /** One header per cell, in order. Most fields own one cell; a tone owns three. */
  headers: readonly string[];
  write(value: T | undefined): string[];
  /** `value: undefined` means the cells were empty, so the field keeps its default. */
  read(cells: string[]): { value: T | undefined } | { error: string };
}

/** Text written as-is. */
function text(header: string): ChannelCsvColumn<string> {
  return {
    headers: [header],
    write: (value) => [value ?? ''],
    read: ([cell]) => ({ value: cell === '' ? undefined : cell }),
  };
}

/**
 * A number, written in full. `String()` gives the shortest form that reads back
 * as the same number, so a 6.25 kHz step such as 446.00625 survives; the old
 * exporter's `toFixed(4)` rounded it.
 */
function num(header: string): ChannelCsvColumn<number> {
  return {
    headers: [header],
    write: (value) => [value === undefined ? '' : String(value)],
    read: ([cell]) => {
      if (cell === '') return { value: undefined };
      const n = parseFloat(cell);
      return { value: Number.isFinite(n) ? n : undefined };
    },
  };
}

/** Yes/No. Reads yes, true or 1 as true, as the CSV helpers always have. */
function flag(header: string): ChannelCsvColumn<boolean> {
  return {
    headers: [header],
    write: (value) => [value === undefined ? '' : value ? 'Yes' : 'No'],
    read: ([cell]) => {
      if (cell === '') return { value: undefined };
      const c = cell.toLowerCase();
      return { value: c === 'yes' || c === 'true' || c === '1' };
    },
  };
}

/**
 * One of a fixed set of values. Anything else is refused rather than cast: a
 * mode the importer cannot recognise must not be written to a radio as a guess.
 */
function choice<T extends string>(
  header: string,
  values: readonly T[],
  aliases: Readonly<Record<string, T>> = {}
): ChannelCsvColumn<T> {
  return {
    headers: [header],
    write: (value) => [value ?? ''],
    read: ([cell]) => {
      if (cell === '') return { value: undefined };
      const c = cell.toLowerCase();
      const hit = values.find((v) => v.toLowerCase() === c) ?? aliases[c];
      return hit ? { value: hit } : { error: `${header} "${cell}" is not one of ${values.join(', ')}` };
    },
  };
}

const TONE_TYPES = ['None', 'CTCSS', 'DCS'] as const;

/** A CTCSS/DCS setting as three cells: type, value, and DCS polarity (N normal, P inverted). */
function tone(side: 'RX' | 'TX'): ChannelCsvColumn<CTCSSDCS> {
  const [typeHeader, valueHeader, polarityHeader] = [
    `${side} CTCSS/DCS Type`,
    `${side} CTCSS/DCS Value`,
    `${side} CTCSS/DCS Polarity`,
  ];
  return {
    headers: [typeHeader, valueHeader, polarityHeader],
    write: (t) => [t?.type ?? '', t?.value === undefined ? '' : String(t.value), t?.polarity ?? ''],
    read: ([type, value, polarity]) => {
      if (type === '' && value === '' && polarity === '') return { value: undefined };
      const typeHit = type === '' ? 'None' : TONE_TYPES.find((x) => x.toLowerCase() === type.toLowerCase());
      if (!typeHit) return { error: `${typeHeader} "${type}" is not one of ${TONE_TYPES.join(', ')}` };
      const result: CTCSSDCS = { type: typeHit };
      if (value !== '') {
        const n = parseFloat(value);
        if (Number.isFinite(n)) result.value = n;
      }
      if (polarity !== '') {
        const p = polarity.toUpperCase();
        if (p !== 'N' && p !== 'P') return { error: `${polarityHeader} "${polarity}" is not N or P` };
        result.polarity = p;
      }
      return { value: result };
    },
  };
}

const MODES = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'] as const;
const BANDWIDTHS = ['12.5kHz', '25kHz'] as const;
const POWERS = ['Low', 'Medium', 'High', 'Turbo'] as const;
const APRS_REPORT_MODES = ['Off', 'Digital', 'Analog'] as const;
const SQUELCH_MODES = ['Carrier/CTC', 'CTCSS/DCS', 'Optional', 'CTC&Opt', 'CTC|Opt'] as const;
const SIGNALING_TYPES = ['None', 'DTMF', 'Two Tone', 'Five Tone', 'MDC1200'] as const;
const PTT_ID_TYPES = ['Off', 'BOT', 'EOT', 'Both'] as const;

type ChannelCsvColumns = { [K in keyof Channel]-?: ChannelCsvColumn<NonNullable<Channel[K]>> };

export const CHANNEL_CSV_COLUMNS = {
  number: num('Channel Number'),
  name: text('Name'),
  rxFrequency: num('RX Frequency'),
  txFrequency: num('TX Frequency'),
  mode: choice('Mode', MODES),
  bandwidth: choice('Bandwidth', BANDWIDTHS, { '12.5': '12.5kHz', narrow: '12.5kHz', '25': '25kHz', wide: '25kHz' }),
  power: choice('Power', POWERS, { mid: 'Medium', med: 'Medium' }),
  forbidTx: flag('Forbid TX'),
  loneWorker: flag('Lone Worker'),
  scanAdd: flag('Scan Add'),
  scanListId: num('Scan List ID'),
  forbidTalkaround: flag('Forbid Talkaround'),
  aprsReceive: flag('APRS Receive'),
  // The old exporter wrote Yes/No here, which the importer then cast straight to
  // a report mode, so "No" became Analog APRS. Its files still read correctly.
  aprsReportMode: choice('APRS TX', APRS_REPORT_MODES, { yes: 'Digital', no: 'Off' }),
  emergencyIndicator: flag('Emergency'),
  emergencyAck: flag('Emergency Ack'),
  emergencySystemId: num('Emergency ID'),
  digitalEmergencySystemId: num('Digital Emergency System ID'),
  voxFunction: flag('VOX'),
  scramble: flag('Scramble'),
  compander: flag('Compander'),
  talkback: flag('Talkback'),
  squelchLevel: num('Squelch'),
  pttIdDisplay: flag('PTT ID Display'),
  pttId: num('PTT ID'),
  colorCode: num('Color Code'),
  rxCtcssDcs: tone('RX'),
  txCtcssDcs: tone('TX'),
  companderDup: flag('Compander Dup'),
  voxRelated: flag('VOX Related'),
  pttIdDisplay2: flag('PTT ID Display2'),
  rxSquelchMode: choice('RX Squelch Mode', SQUELCH_MODES),
  stepFrequency: num('Step Frequency'),
  signalingType: choice('Signaling Type', SIGNALING_TYPES),
  pttIdType: choice('PTT ID Type', PTT_ID_TYPES),
  contactId: num('Contact ID'),
  dmrRadioIdIndex: num('DMR Radio ID Index'),
  rxGroupListId: num('RX Group List ID'),
  slotOperation: num('Slot Operation'),
  encryption: flag('Encryption'),
  encryptionId: num('Encryption ID'),
  tdmaDirectMode: flag('TDMA Direct Mode'),
  shortDataConfirm: flag('Short Data Confirm'),
  privateConfirm: flag('Private Confirm'),
  txContactId: num('TX Contact ID'),
  // DM-32 bits the codec carries without knowing what they mean. Kept so a round
  // trip writes back exactly what was read.
  unknown1A_6_4: num('unknown1A_6_4'),
  unknown1A_3: flag('unknown1A_3'),
  unknown1A_1_0: num('unknown1A_1_0'),
  unknown1C_1_0: num('unknown1C_1_0'),
  unknown1D_3_0: num('unknown1D_3_0'),
  unknown25_7_6: num('unknown25_7_6'),
  unknown25_3_0: num('unknown25_3_0'),
  unknown26_3_1: num('unknown26_3_1'),
  unknown26_0: flag('unknown26_0'),
  unknown29_3_2: num('unknown29_3_2'),
  unknown29_1_0: num('unknown29_1_0'),
  unknown2A: num('unknown2A'),
  // DA-7X2 fields. Empty for radios that don't decode them, and read back unset,
  // never as 0.
  reverse: flag('Reverse'),
  callConfirmation: flag('Call Confirmation'),
  slotSuit: flag('Slot Suit'),
  ranging: flag('Ranging'),
  customCtcssHz: num('Custom CTCSS Hz'),
  twoToneDecode: num('2Tone Decode'),
  twoToneId: num('2Tone ID'),
  fiveToneId: num('5Tone ID'),
  dtmfId: num('DTMF ID'),
  offsetFrequencyEx: num('Offset Frequency Ex'),
  txColorCode: num('TX Color Code'),
  busyLock: num('Busy Lock'),
  emergencySystemIndex: num('Emergency System Index'),
  dmrMode: num('DMR Mode'),
  dataAckDisable: flag('DataACK Disable'),
  digitalDuplex: flag('Digital Duplex'),
  excludeFromRoaming: flag('Exclude From Roaming'),
  receiveOnly: flag('Receive Only'),
  dataAckForbid: flag('DataACK Forbid'),
  autoScan: flag('Auto Scan'),
  idleTx: flag('Idle TX'),
  dmrCrcIgnore: flag('DMR CRC Ignore'),
  analogAprsPttMode: num('Analog APRS PTT Mode'),
  digitalAprsPttMode: num('Digital APRS PTT Mode'),
  digitalAprsReportChannel: num('Digital APRS Report Channel'),
  normalEmergencyCode: num('Normal Emergency Code'),
  smsConfirmation: flag('SMS Confirmation'),
  analogAprsMute: flag('Analog APRS Mute'),
  sendTalkerAlias: flag('Send Talker Alias'),
  analogAprsTxPath: num('Analog APRS TX Path'),
  arc4Code: num('ARC4 Code'),
  source: text('Source'),
} satisfies ChannelCsvColumns;

/** The table as a list, for code that walks every column in order. */
export const CHANNEL_CSV_COLUMN_LIST = Object.entries(CHANNEL_CSV_COLUMNS) as [keyof Channel, ChannelCsvColumn<unknown>][];

const KNOWN_HEADERS = new Set(CHANNEL_CSV_COLUMN_LIST.flatMap(([, column]) => column.headers.map((h) => h.toLowerCase())));

/**
 * Where a column sits in a file's (lowercased) header row, or -1.
 *
 * An exact header wins. A hand-made file may name a column loosely, such as
 * "RX Frequency (MHz)", so a header containing the name also matches, but never
 * a header that is itself another known column. Without that guard, a file with
 * no Mode column would read its DMR Mode column as the channel's mode.
 */
export function channelCsvCellIndex(headers: string[], header: string): number {
  const name = header.toLowerCase();
  const exact = headers.indexOf(name);
  if (exact >= 0) return exact;
  return headers.findIndex((h) => h.includes(name) && !KNOWN_HEADERS.has(h));
}
