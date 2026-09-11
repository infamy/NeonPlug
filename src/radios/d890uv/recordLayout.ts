/**
 * DA-7X2 / AT-D890UV byte maps, for the Diagnostics tab.
 *
 * This is documentation as data. It exists because the Diagnostics tab for this
 * radio was almost empty: the clone-block panels the DM-32 uses have nothing to
 * show for a sparse address-addressed radio, so the tab offered a region dump
 * and little else. Everything here renders with no radio connected, which is
 * where the reference value is — a user comparing NeonPlug against the OEM CPS
 * needs to see what NeonPlug thinks each byte is, and how sure it is.
 *
 * Provenance is the point, not decoration:
 *
 *   hardware   — watched change on a real radio, or matched byte-for-byte
 *                against the vendor CPS's own export of the same codeplug.
 *   marshaller — read out of the vendor CPS's channel/zone/scan-list
 *                marshallers (`sub_005af490` / `sub_005b1750` and their zone
 *                and scan-list counterparts), whose writer and reader touch
 *                exactly the same offsets. The offset is solid; the captured
 *                codeplug held one value, so the range is unobserved.
 *   inferred    — the offset is from the marshaller and the ENCODING is
 *                reasoned rather than read.
 *   unknown     — the byte is read off the radio and nothing claims it.
 *
 * Keep this in step with structures.ts. `tests/unit/d890uvLayout.test.ts`
 * asserts that every offset the parser touches appears here, so a field added
 * to the parser without a row fails the build rather than quietly going
 * undocumented.
 */

import { D890_ADDR, D890_LIMITS } from './constants';
import { D890_AM_ZONES } from './amZones';

export type D890Provenance = 'hardware' | 'marshaller' | 'inferred' | 'unknown';

export interface D890LayoutRow {
  /** Byte offset within the record, or the first byte of a multi-byte field. */
  offset: number;
  /** Number of bytes the field spans. */
  length: number;
  /** Bit range within the byte, when the field is narrower than a byte. */
  bits?: string;
  /** The vendor CPS's own name for the field. */
  vendorName: string;
  /** The vendor's user-facing column, where its export has one. */
  cpsColumn?: string;
  /** The Channel/ScanList model field NeonPlug decodes it into, if any. */
  field?: string;
  /** How the bytes encode the value. */
  encoding: string;
  provenance: D890Provenance;
  note?: string;
}

/**
 * The 0x80-byte channel record.
 *
 * The writer makes 55 accesses and the reader 88, and the two touch exactly the
 * same 54 offsets — the strongest single cross-check available without hardware.
 * Offsets 0x13, 0x2b-0x33 and 0x6f-0x7f are stepped over by both.
 */
export const D890_CHANNEL_LAYOUT: readonly D890LayoutRow[] = [
  { offset: 0x00, length: 4, vendorName: 'RX_Fre', cpsColumn: 'Receive Frequency', field: 'rxFrequency',
    encoding: 'BCD-as-hex, MSB first, /100000 → MHz', provenance: 'hardware' },
  { offset: 0x04, length: 4, vendorName: 'Offset_Fre', cpsColumn: 'Transmit Frequency', field: 'txFrequency',
    encoding: 'Same codec as RX_Fre. Simplex stores the TX frequency outright; the duplex modes store a delta.',
    provenance: 'hardware',
    note: 'Which of the two it is depends on the duplex bits at 0x08. That branch is a documented guess and it matters for every repeater channel.' },
  { offset: 0x08, length: 1, bits: '1-0', vendorName: 'Type', cpsColumn: 'Channel Type', field: 'mode',
    encoding: '0 A-Analog, 1 D-Digital, 2 A+D TX A, 3 D+A TX D', provenance: 'hardware',
    note: 'The shared model has no mixed mode, so the channel is classified by what it TRANSMITS.' },
  { offset: 0x08, length: 1, bits: '3-2', vendorName: 'Power', cpsColumn: 'Transmit Power', field: 'power',
    encoding: '0 Low, 1 Mid, 2 High, 3 Turbo', provenance: 'hardware' },
  { offset: 0x08, length: 1, bits: '5-4', vendorName: 'WN', cpsColumn: 'Band Width', field: 'bandwidth',
    encoding: '0 = 12.5 kHz, 1 = 25 kHz', provenance: 'hardware' },
  { offset: 0x08, length: 1, bits: '7-6', vendorName: 'Dup', encoding: '0 simplex, 1 +offset, 2 -offset',
    provenance: 'hardware' },
  { offset: 0x09, length: 1, bits: '1-0', vendorName: 'Dec_Type', cpsColumn: 'CTCSS/DCS Decode', field: 'rxCtcssDcs',
    encoding: 'Tone kind for RX: none / CTCSS / DCS', provenance: 'hardware' },
  { offset: 0x09, length: 1, bits: '3-2', vendorName: 'Enc_Type', cpsColumn: 'CTCSS/DCS Encode', field: 'txCtcssDcs',
    encoding: 'Tone kind for TX', provenance: 'hardware' },
  { offset: 0x09, length: 1, bits: '4', vendorName: 'Invert', cpsColumn: 'Reverse', field: 'reverse',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x09, length: 1, bits: '5', vendorName: 'OVIE', cpsColumn: 'PTT Prohibit', field: 'forbidTx',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x09, length: 1, bits: '6', vendorName: 'OacsuSet', cpsColumn: 'Call Confirmation', field: 'callConfirmation',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x09, length: 1, bits: '7', vendorName: 'TalkAround', cpsColumn: 'Talk Around(Simplex)', field: 'forbidTalkaround',
    encoding: 'boolean, INVERTED — set means talkaround is allowed', provenance: 'hardware' },
  { offset: 0x0a, length: 1, vendorName: 'Enc_CTCSS', field: 'txCtcssDcs',
    encoding: 'CTCSS table index for TX', provenance: 'hardware',
    note: 'Encode is TX and decode is RX — the opposite of the obvious reading, and they were swapped until a TX-only probe channel caught it.' },
  { offset: 0x0b, length: 1, vendorName: 'Dec_CTCSS', field: 'rxCtcssDcs',
    encoding: 'CTCSS table index for RX', provenance: 'hardware' },
  { offset: 0x0c, length: 2, vendorName: 'Enc_DCS', field: 'txCtcssDcs',
    encoding: 'u16 LE, octal-as-decimal, bit 9 = inverted', provenance: 'hardware' },
  { offset: 0x0e, length: 2, vendorName: 'Dec_DCS', field: 'rxCtcssDcs',
    encoding: 'u16 LE, same codec', provenance: 'hardware' },
  { offset: 0x10, length: 2, vendorName: 'Define_CTCSS', cpsColumn: 'Custom CTCSS', field: 'customCtcssHz',
    encoding: 'u16 LE, tenths of a Hz (1318 → 131.8)', provenance: 'hardware' },
  { offset: 0x12, length: 1, vendorName: 'R2ToneDecGroup', cpsColumn: '2TONE Decode', field: 'twoToneDecode',
    encoding: 'stored zero-based, displayed one-based', provenance: 'hardware',
    note: 'Does not round-trip at 0: the writer maps v>0 → v-1 else 0, the reader v>15 → 0 else v+1.' },
  { offset: 0x13, length: 1, vendorName: '(not used)', encoding: '—', provenance: 'marshaller',
    note: 'Both the writer and the reader step from 0x12 straight to 0x14.' },
  { offset: 0x14, length: 4, vendorName: 'Call_ID', cpsColumn: 'Contact/Talk Group', field: 'contactId',
    encoding: 'u32 LE, zero-based INDEX into the talkgroup list', provenance: 'hardware',
    note: 'The RE notes call this "the DMR contact ID itself, not an index". Hardware says otherwise: a channel using a talkgroup whose DMR ID is 16,776,415 stores 2.' },
  { offset: 0x18, length: 1, vendorName: 'Own_ID', cpsColumn: 'Radio ID', field: 'dmrRadioIdIndex',
    encoding: 'zero-based index into the radio-ID list', provenance: 'hardware' },
  { offset: 0x19, length: 1, bits: '3-0', vendorName: 'Ptt_ID', cpsColumn: 'PTT ID', field: 'pttId',
    encoding: '0 Off, 1 Start, 2 End, 3 Start&End', provenance: 'hardware' },
  { offset: 0x19, length: 1, bits: '7-4', vendorName: 'SQLCON', cpsColumn: 'Squelch Mode', field: 'rxSquelchMode',
    encoding: '0 Carrier, 1 CTCSS/DCS', provenance: 'hardware',
    note: 'A full nibble — the writer packs SQLCON*0x10 + Ptt_ID. Reading it as one bit truncated any value above 1.' },
  { offset: 0x1a, length: 1, bits: '3-0', vendorName: 'RepLock', cpsColumn: 'Busy Lock/TX Permit', field: 'busyLock',
    encoding: 'raw index', provenance: 'marshaller',
    note: 'The CPS DERIVES its displayed column from the channel type. This byte read 0 on every channel of a codeplug built to vary it, so the vocabulary is unknown.' },
  { offset: 0x1a, length: 1, bits: '7-4', vendorName: 'RPGA', cpsColumn: 'Optional Signal', field: 'signalingType',
    encoding: '0 None, 1 DTMF, 2 2Tone, 3 5Tone', provenance: 'hardware' },
  { offset: 0x1b, length: 1, vendorName: 'ScanList', cpsColumn: 'Scan List', field: 'scanListId',
    encoding: 'zero-based, 0xff = none', provenance: 'hardware' },
  { offset: 0x1c, length: 1, vendorName: 'GroupID', cpsColumn: 'Receive Group List', field: 'rxGroupListId',
    encoding: 'zero-based, 0xff = none', provenance: 'hardware' },
  { offset: 0x1d, length: 1, vendorName: 'RPGRCODE_2T', cpsColumn: '2Tone ID', field: 'twoToneId',
    encoding: 'stored zero-based', provenance: 'marshaller',
    note: 'The CPS silently drops this column on CSV import, so correlation could never reach it however many codeplugs were written.' },
  { offset: 0x1e, length: 1, vendorName: 'RPGRCODE_5T', cpsColumn: '5Tone ID', field: 'fiveToneId',
    encoding: 'stored zero-based', provenance: 'marshaller' },
  { offset: 0x1f, length: 1, vendorName: 'DTMFCode', cpsColumn: 'DTMF ID', field: 'dtmfId',
    encoding: 'stored zero-based', provenance: 'marshaller' },
  { offset: 0x20, length: 1, vendorName: 'CC', cpsColumn: 'RX Color Code', field: 'colorCode',
    encoding: '0-15', provenance: 'hardware' },
  { offset: 0x21, length: 1, bits: '0', vendorName: 'Slot', cpsColumn: 'Slot', field: 'slotOperation',
    encoding: '0 = TS1, 1 = TS2', provenance: 'hardware' },
  { offset: 0x21, length: 1, bits: '1', vendorName: 'Response', cpsColumn: 'DataACK Disable', field: 'dataAckDisable',
    encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x21, length: 1, bits: '3-2', vendorName: 'TDMA', cpsColumn: 'DMR MODE', field: 'dmrMode',
    encoding: 'raw 2-bit index', provenance: 'marshaller' },
  { offset: 0x21, length: 1, bits: '4', vendorName: 'TRUNK', cpsColumn: 'Slot Suit', field: 'slotSuit',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x21, length: 1, bits: '5', vendorName: 'BS_Mode', cpsColumn: 'APRS RX', field: 'aprsReceive',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x21, length: 1, bits: '6', vendorName: 'EMG_Kind', cpsColumn: 'AES Digital Encryption', field: 'encryption',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x21, length: 1, bits: '7', vendorName: 'Alone', cpsColumn: 'Work Alone', field: 'loneWorker',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x22, length: 1, vendorName: 'EMG_Key', field: 'emergencySystemIndex',
    encoding: 'raw index', provenance: 'marshaller' },
  { offset: 0x23, length: 8, vendorName: '(Standard 0xC0-0xC7)', encoding: '8 bytes copied verbatim from the CPS record',
    provenance: 'unknown',
    note: 'Read 0xff on all 102 captured channels. No SQL column and no other reader — the CPS itself does not say what they mean.' },
  { offset: 0x2b, length: 9, vendorName: '(not used)', encoding: '—', provenance: 'marshaller',
    note: 'The writer jumps 0x23 → 0x34.' },
  { offset: 0x34, length: 1, bits: '0', vendorName: 'link_measure', cpsColumn: 'Ranging', field: 'ranging',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x34, length: 1, bits: '1', vendorName: 'simplex', cpsColumn: 'Digital Duplex', field: 'digitalDuplex',
    encoding: 'boolean, INVERTED into digitalDuplex', provenance: 'inferred',
    note: 'Set on every captured channel while the CPS showed Digital Duplex = Off, which is what the inversion rests on.' },
  { offset: 0x34, length: 1, bits: '2', vendorName: 'roam_forbid', cpsColumn: 'Exclude channel from roaming',
    field: 'excludeFromRoaming', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x34, length: 1, bits: '3', vendorName: 'DataACK forbid', field: 'dataAckForbid',
    encoding: 'boolean', provenance: 'hardware',
    note: 'CORRECTED on hardware 2026-08-30. The marshaller names this bit rec_only (Receive Only); it is not. Toggling DataACK forbid off cleared exactly this bit and nothing else in the record. Receive Only is now unmapped rather than aimed at the wrong bit.' },
  { offset: 0x34, length: 1, bits: '4', vendorName: 'auto_scan', cpsColumn: 'Auto Scan', field: 'autoScan',
    encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x34, length: 1, bits: '5', vendorName: 'idle_tx', cpsColumn: 'Idle TX', field: 'idleTx',
    encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x34, length: 1, bits: '6', vendorName: 'compand', cpsColumn: 'compand', field: 'compander',
    encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x34, length: 1, bits: '7', vendorName: 'dmr_crc_ignore', cpsColumn: 'dmr_crc_ignore', field: 'dmrCrcIgnore',
    encoding: 'boolean', provenance: 'hardware' },
  { offset: 0x35, length: 1, vendorName: 'AprsUpKind', cpsColumn: 'APRS Report Type', field: 'aprsReportMode',
    encoding: '0 Off, 1 Analog, 2 Digital', provenance: 'hardware' },
  { offset: 0x36, length: 1, vendorName: 'AprsUpDate', cpsColumn: 'Analog APRS PTT Mode', field: 'analogAprsPttMode',
    encoding: 'raw index', provenance: 'marshaller' },
  { offset: 0x37, length: 1, vendorName: 'DigiAprsUpDate', cpsColumn: 'Digital APRS PTT Mode', field: 'digitalAprsPttMode',
    encoding: 'raw index (the vendor reader clamps it to ≤1)', provenance: 'marshaller' },
  { offset: 0x38, length: 1, vendorName: 'DigiAprsUpNum', cpsColumn: 'Digital APRS Report Channel',
    field: 'digitalAprsReportChannel', encoding: 'raw index', provenance: 'marshaller' },
  { offset: 0x39, length: 1, vendorName: 'Offset_Fre_Ex', cpsColumn: 'Correct Frequency[Hz]', field: 'offsetFrequencyEx',
    encoding: 'signed byte', provenance: 'marshaller',
    note: 'Read 0 on every captured channel, so it is exposed raw rather than folded into the TX frequency.' },
  { offset: 0x3a, length: 1, vendorName: 'NormalEmgCode', field: 'normalEmergencyCode',
    encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x3b, length: 1, bits: '0', vendorName: 'mul_emg', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x3b, length: 1, bits: '1', vendorName: 'random_emg', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x3b, length: 1, bits: '2', vendorName: 'sms_rec', cpsColumn: 'SMS Confirmation', field: 'smsConfirmation',
    encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x3b, length: 1, bits: '3', vendorName: 'ana_aprs_mute', cpsColumn: 'Ana APRS Mute', field: 'analogAprsMute',
    encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x3b, length: 1, bits: '4', vendorName: 'tx_talkalaes', cpsColumn: 'Send Talker Alias DMR/NX',
    field: 'sendTalkerAlias', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x3b, length: 1, bits: '5', vendorName: 'ex_emg_kind', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x3b, length: 1, bits: '6', vendorName: 'dup_call', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x3b, length: 1, bits: '7', vendorName: 'tx_int', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x3c, length: 1, vendorName: 'AnaAprsTxPath', cpsColumn: 'AnaAprsTxPath', field: 'analogAprsTxPath',
    encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x3d, length: 1, vendorName: 'Arc4EmgCode', cpsColumn: 'ARC4', field: 'arc4Code',
    encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x3e, length: 1, vendorName: 'DisturEn', cpsColumn: 'DisturEn', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x3f, length: 1, vendorName: 'DisturFreq', cpsColumn: 'DisturFreq', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x40, length: 1, vendorName: 'R5toneBot', cpsColumn: 'R5toneBot', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x41, length: 1, vendorName: 'R5ToneEot', cpsColumn: 'R5ToneEot', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x42, length: 1, vendorName: 'Rpga_Mdc', cpsColumn: 'Rpga_Mdc', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x43, length: 1, vendorName: 'TXCC', cpsColumn: 'txcc', field: 'txColorCode',
    encoding: '0-15', provenance: 'marshaller',
    note: 'A distinct field from CC at 0x20. Every captured channel had the two equal, so hardware alone cannot separate them.' },
  { offset: 0x44, length: 34, vendorName: 'Name', cpsColumn: 'Channel Name', field: 'name',
    encoding: '17 UTF-16LE units, 0xffff-terminated, 16 characters max', provenance: 'hardware' },
  { offset: 0x66, length: 1, bits: '0', vendorName: 'nxdn_wn', cpsColumn: 'nxdn_wn', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x66, length: 1, bits: '1', vendorName: 'NxdnRpga', cpsColumn: 'NxdnRpga', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x66, length: 1, bits: '4', vendorName: 'nxdnSqCon', cpsColumn: 'nxdnSqCon', encoding: 'boolean', provenance: 'marshaller' },
  { offset: 0x67, length: 1, bits: '3-0', vendorName: 'NxdnTxBusy', cpsColumn: 'NxdnTxBusy', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x67, length: 1, bits: '7-4', vendorName: 'NxDnPttId', cpsColumn: 'NxDnPttId', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x68, length: 1, vendorName: 'EnRan', cpsColumn: 'EnRan', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x69, length: 1, vendorName: 'DeRan', cpsColumn: 'DeRan', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x6a, length: 1, vendorName: 'NxdnEncry', cpsColumn: 'NxdnEncry', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x6b, length: 1, vendorName: 'NxdnGroupId', cpsColumn: 'NxdnGroupId', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x6c, length: 2, vendorName: 'NxdnIdNum', cpsColumn: 'NxdnIdNum', encoding: 'u16 LE', provenance: 'marshaller' },
  { offset: 0x6e, length: 1, vendorName: 'NxdnStateNum', cpsColumn: 'NxdnStateNum', encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x6f, length: 17, vendorName: '(not used)', encoding: '—', provenance: 'marshaller',
    note: 'The last access either routine makes is 0x6e.' },
];

/** The 0x200-byte scan-list record; 0x98 onward is unused. */
export const D890_SCAN_LIST_LAYOUT: readonly D890LayoutRow[] = [
  { offset: 0x00, length: 1, vendorName: 'Scn_Mode', cpsColumn: 'Scan Mode', field: 'scanMode',
    encoding: 'raw', provenance: 'marshaller', note: 'Read 0 ("Off") on both captured lists.' },
  { offset: 0x01, length: 1, vendorName: 'Scn_PriorityCh', cpsColumn: 'Priority Channel Select',
    field: 'prioritySelect', encoding: '0 Off, 1 Select1, 2 Select2, 3 both', provenance: 'hardware' },
  { offset: 0x02, length: 2, vendorName: 'Scn_PriorityCH1', cpsColumn: 'Priority Channel 1',
    field: 'priorityChannel1Raw', encoding: 'u16 LE channel NUMBER; 0xffff = Off', provenance: 'hardware',
    note: 'The marshaller encodes v-1, but hardware stores the channel number directly: a list whose priority is "Blk 128" (channel 128) reads 128.' },
  { offset: 0x04, length: 2, vendorName: 'Scn_PriorityCH2', cpsColumn: 'Priority Channel 2',
    field: 'priorityChannel2Raw', encoding: 'u16 LE, same', provenance: 'hardware' },
  { offset: 0x06, length: 2, vendorName: 'Scn_LookBackTimeA', cpsColumn: 'Look Back Time A[s]',
    field: 'lookBackTimeA', encoding: 'tenths of a second; only the low byte is ever written', provenance: 'hardware' },
  { offset: 0x08, length: 2, vendorName: 'Scn_LookBackTimeB', cpsColumn: 'Look Back Time B[s]',
    field: 'lookBackTimeB', encoding: 'tenths of a second', provenance: 'hardware' },
  { offset: 0x0a, length: 2, vendorName: 'Scn_DropoutDelay', cpsColumn: 'Dropout Delay Time[s]',
    field: 'dropoutDelay', encoding: 'tenths of a second', provenance: 'hardware' },
  { offset: 0x0c, length: 2, vendorName: 'Scn_DwellTime', cpsColumn: 'Dwell Time[s]',
    field: 'dwellTime', encoding: 'tenths of a second', provenance: 'hardware' },
  { offset: 0x0e, length: 34, vendorName: 'Name', cpsColumn: 'Scan List Name', field: 'name',
    encoding: '17 UTF-16LE units, 0xffff-terminated', provenance: 'hardware' },
  { offset: 0x30, length: 100, vendorName: 'Members', cpsColumn: 'Scan Channel Member', field: 'channels',
    encoding: '50 × u16 LE, zero-based channel index, 0xffff = empty', provenance: 'hardware' },
  { offset: 0x94, length: 1, vendorName: 'Scn_RevertCh', cpsColumn: 'Revert Channel', field: 'revertChannel',
    encoding: 'raw index', provenance: 'hardware',
    note: 'Was read from 0xf8, inside the zero fill. The two captured lists store 4 and 6 where the CPS shows "Last Called" and "Priority Channel Select1 + TalkBack" — which fits no obvious ordering, so the vocabulary is unresolved.' },
  { offset: 0x95, length: 1, vendorName: 'ScanDigiGroupHold', field: 'digitalGroupHold',
    encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x96, length: 1, vendorName: 'ScanDigiPriHold', field: 'digitalPriorityHold',
    encoding: 'raw', provenance: 'marshaller' },
  { offset: 0x97, length: 1, vendorName: 'ScanAnaHold', field: 'analogHold',
    encoding: 'raw', provenance: 'marshaller' },
];

export interface D890Region {
  name: string;
  address: number;
  /** Bytes per record, or the size of a one-off region. */
  stride?: number;
  size?: number;
  contents: string;
  /** True when this driver reads the region during a normal codeplug read. */
  read: boolean;
  /**
   * True when this driver can ENCODE the region — a `parse -> encode` round
   * trip that reproduces real radio bytes exactly, so an unmodified record
   * rewrites unchanged.
   *
   * Deliberately not "we have written this to a radio". Nothing has been. This
   * flag tracks the half that can be proved offline, which is the half that has
   * to be right BEFORE anything is sent: the radio ACKs a write without echoing
   * it, so a bad encoder cannot be caught on the wire.
   *
   * Count them by grepping this file for the flag. The literal is deliberately
   * not repeated here — a doc comment containing the search string counts
   * itself, which is exactly how the read tally was off by one.
   */
  write?: boolean;
  /**
   * True when the region is a NICE-TO-HAVE rather than part of programming a
   * radio for normal use.
   *
   * Pictures and the satellite table are the clear cases: a codeplug with no
   * boot image works, and a user who never works satellites never opens that
   * table. The DMR contact database is here too — it is 16.4 MB of other
   * people's callsigns, useful but not something the radio needs to operate.
   *
   * Tracked separately because mixing them into one coverage figure flatters
   * it in one direction and understates it in the other: three picture regions
   * are 6% of the map and cosmetic, while a missing channel encoder would be a
   * blocker. The two questions — "can this radio be programmed?" and "is every
   * extra covered?" — deserve their own answers.
   */
  optional?: boolean;
  /**
   * True when this region has completed a full **hardware** round trip:
   * read from a radio, written back changed, and read again in a SEPARATE
   * session with the bytes matching what was sent.
   *
   * Deliberately not called `verified`, and deliberately distinct from `write`.
   * `write` already means "round-trips" — but the OFFLINE kind, `parse` ->
   * `encode` reproducing captured vendor bytes. That is provable without a
   * radio and is most of the work, yet it cannot catch an encoder aimed at the
   * wrong ADDRESS: this radio ACKs a write without echoing it, so perfect bytes
   * sent to the wrong place look identical to success.
   *
   * Only the hardware round trip separates those two, and it must be
   * cross-session. Comparing inside the write session compares against
   * pre-write contents and passes while proving nothing — and reading mid-write
   * reboots the radio.
   */
  hardwareRoundTrip?: boolean;
  /**
   * This region must NEVER be written, and that is a finished state rather than
   * a gap.
   *
   * Without it, a correctly read-only region counts as a write MISS forever, so
   * the write row can never reach 100% and permanently reports a shortfall that
   * does not exist. The coverage tool excludes these from the write and
   * round-trip denominators — you cannot round-trip what you must not write.
   *
   * Use it only where writing would be WRONG, not merely unimplemented.
   */
  neverWrite?: boolean;
  provenance: D890Provenance;
  note?: string;
}

/**
 * Every region of the radio's address space this project has a name for.
 *
 * Deliberately includes regions NeonPlug does not read: a map with the gaps
 * marked is what makes the gaps actionable, and the Diagnostics region dump can
 * capture any of them by address.
 */
export const D890_MEMORY_MAP: readonly D890Region[] = [
  { name: 'Local info', address: D890_ADDR.LOCAL_INFO, size: D890_ADDR.LOCAL_INFO_SIZE,
    contents: 'Firmware / region identity', read: true, neverWrite: true, provenance: 'hardware',
    note: 'NEVER WRITE. The device information block — the radio identifying itself — and the read-length negotiation probe target. Flagged neverWrite 2026-09-08 so it stops counting as a write miss: it was the last entry keeping Core write below 100%, and a region we are correct not to write is a finished state, not a shortfall.' },
  { name: 'Channel mask', address: D890_ADDR.CHANNEL_SET, size: D890_ADDR.CHANNEL_SET_SIZE,
    contents: 'One bit per channel; SET = present', read: true, write: true, provenance: 'hardware' },
  { name: 'Channels', address: D890_ADDR.CHANNEL_DATA, stride: D890_ADDR.CHANNEL_STRIDE,
    contents: `${D890_LIMITS.CHANNELS_MAX} records, ${D890_ADDR.CHANNELS_PER_BLOCK} per 0x${D890_ADDR.CHANNEL_BLOCK_STRIDE.toString(16)} block`,
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'Each record is two 0x40 halves read back to back. Blocks are far further apart than 128 × 0x80, so flat addressing is wrong past channel 127.' },
  { name: 'Zone membership', address: D890_ADDR.ZONE_CHANNELS, stride: D890_ADDR.ZONE_CHANNELS_STRIDE,
    contents: `250 × u16 zero-based channel indices, 0xffff-terminated`,
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'The vendor CPS caps a zone at 160 channels even though the region holds 250. CHANGED-FIELD round trip on hardware 2026-09-03: channel 10 removed from Z5 Tones, written, read back — 13 members to 12, every other zone byte-identical. The flag means a real EDIT survived, not a write-back; a write-back proves almost nothing here, because a duplicate write of identical bytes looks perfect (see TODO-DA7X2 section 4).' },
  { name: 'Zone present mask', address: D890_ADDR.ZONE_SET, size: D890_ADDR.ZONE_SET_SIZE,
    contents: 'One bit per zone; SET = present',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'CHANGED-BIT round trip on hardware 2026-09-03 — the first mask bit this driver has ever cleared. Zone 4 deleted from six; slots went from [0,1,2,3,4,5,6] to [0,1,3,4,5,6], leaving a GAP where it was. That gap is the proof: survivors kept their own slots instead of compacting down, which is what the earlier positional mapping did.' },
  // Was documented as 'Device identity' until 2026-09-07 — see the note.
  { name: 'Digital Contact Header', address: 0x07000000, size: 16,
    contents: 'u32 LE record count, u32 LE end address (one past the last record), then zeros',
    read: true, write: true, optional: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'WRITTEN BY NEONPLUG AND ROUND-TRIPPED 2026-09-11. NeonPlug restored 133,699 contacts and the VENDOR CPS, reading the radio, listed exactly 133,699 with the last record written (9990001) in slot 133,699 — a count and an extent it takes from this block. A NeonPlug read session the same night returned count 133,699, end address 0x09aa90ea and eight zero bytes, identical to the plan. (This block also carried the 200-contact round trip on 2026-09-10 but was not flagged then.) FOUND 2026-09-07 in 7x2_read_contacts.txt. The capture has 85 read runs; exactly two sit outside the contact banks and the CPS issues both BEFORE walking them — 0x04f80020 (16 bytes, all 0xFF) and this. Header read 8b 7e 02 00 1c 1e 20 0a: count 163,467 and end address 0x0a201e1c. CONFIRMED from two directions in the same capture — the count equals the number of records our own walker finds, and the end pointer predicts the CPS\'s last read exactly: it fetched ceil(7708/16)*16 = 7712 bytes of the tail bank at 0x0a200000, stopping at the pointer rounded up to a frame. The bytes immediately before it are 53 00 74 00 61 00 74 00 65 00 73 00 00 00 — "States" and its NUL, the Country field of the final record. This is what makes a contact WRITE tractable: without a count, publishing a database would have required blanking 16 MB of trailing banks to remove anything. SUFFICIENCY SETTLED 2026-09-10 (this said "not yet written or confirmed as sufficient"): the vendor CPS uploading 1,005 and then 500,000 contacts writes this block, the index and the records, and nothing else, so these two fields are all the radio needs. CORRECTION: this address was documented as "Device identity — model string returned by the 0x02 probe, NEVER WRITE" from 2026-08-30 until 2026-09-07. That was wrong on both counts. The model string is the reply to the IDENTIFY command (0x02) and is not a memory read at all — see connection.ts identify(), where the radio answers "IDMR-7X2.V100" to a bare command byte. And the block was recorded as BLANK because it was read during a firmware-version hunt while the radio held no contacts; a blank contact header is exactly what an empty database looks like. What is disproven is the old label\'s REASON — this is not the model string, so "writing here would change what the radio claims to be" is not an argument about this address. That is not a licence to write it: never-write and never-read are separate claims, and only the READ is evidenced here. The CPS demonstrably reads this block. (That nothing had been seen WRITING it was true when this paragraph was written; the 2026-09-10 upload captures showed the CPS writing it, and NeonPlug has written it since — see the lead.)' },
  { name: 'Digital Contact List', address: 0x07900000, size: 0x2900000,
    contents: '[flags u16 LE][DMR ID, 4-byte BCD] then SIX NUL-terminated UTF-16LE strings — Name, City, Callsign, State/Province, Country, and a sixth always empty. flags bit 0x1000 = MyFriend',
    read: true, write: true, optional: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'FULL HARDWARE ROUND TRIP 2026-09-10 — written BY NEONPLUG and read back by the VENDOR CPS, which listed all 200 contacts with every field in its own column. CORRECTED 2026-09-11: this note said that read also confirmed the INDEX at 0x07080000. It cannot have — the CPS contact read never touches the index (7x2_read_contacts.txt: a probe, the header, the record banks). Our own writes on hardware: 200 contacts (one bank) confirmed field by field by the CPS; 32,637 (17 banks) confirmed by count only, then overwritten; 133,699 (68 banks, 66 records split across a seam) on 2026-09-11 — the CPS listed 133,699 with the last record in the last slot and the owner browsed the whole list. THE INDEX was checked by a NeonPlug read session the same night: header, both sides of all 4 index-bank seams, the final entry and its 0xFF pad, both sides of all 67 record-bank seams, and 25 lookups done the way the radio does them (index entry, then offset, then record) — 34,864 bytes, zero differences from the plan, confirmed again by an independent Python encoder. That proves the index is on the radio as planned, not that the firmware searches it as believed; a received call showing the caller from this list is the check still owed. THE TAILS ARE ERASED: the 16 bytes past the last index entry (0x0728b220) and past the last record frame (0x09aa90f0) read 0xFF, although the 500,000-contact upload had written there and the restore sent no erase — the radio clears flash itself as a write goes in. How far that reaches is not measured. LAYOUT SETTLED 2026-09-10 by a capture of the vendor CPS uploading 500,000 contacts (1.13 GB, 3,719,980 frames, run to END): NeonPlug\'s planner reproduces EVERY frame of it byte for byte — the header, all 250,000 index frames and all 3,469,973 record frames across 277 bank boundaries (the vendor adds 6 frames of zero padding past the end address; ours stops at the frame). That settled three things. (1) The INDEX is banked like the records: 256,000 bytes (32,000 entries) at the start of every 0x80000 from 0x07080000, keeping each bank below the flash marker at 0x3fbf0 — replacing the 32,637-contact ceiling an unbanked index hit when a 133,699-contact write was refused by the address guard. (2) RECORDS go in INPUT order and only the index is sorted: the CSV was shuffled on purpose and the CPS wrote the records in file order. (3) The region reaches at least bank 277, so RECORD_BANKS_MAX is 278. The same analysis found the READ dropped records straddling a bank (11 of 36,957 in 21 banks) by parsing each bank alone; it now takes its extent from the header and parses one stream. IT TOOK TWO ATTEMPTS: the first wrote untruncated fields and the CPS read 137 contacts with columns shifted, because fields have hard length limits and an overrun desynchronises the record - see D890_CONTACT_FIELD_MAX. ENCODER PROVEN OFFLINE 2026-09-10: parse -> encode reproduces 500 consecutive real records (49,336 bytes, tests/fixtures/d890uv/digital-contacts-bank.bin, lifted from the vendor CPS contact download) BYTE FOR BYTE. That work corrected the record layout: a record carries SIX NUL-terminated strings, not five, the sixth always empty across all 1,906 records sampled. The walker had been stepping over those two bytes as padding it never explained — they are a field, and a record that omits them is two bytes short and puts every record after it out of alignment. NOT WRITTEN AS PART OF A CODEPLUG. 16.4 MB across 83 banks, read on demand only. Its write path is its own feature, with its own progress and cancellation (the Contacts tab, 2026-09-10). FOUND 2026-08-31 from a serial capture of the vendor CPS reading its contact list. The CPS walks 83 banks from 0x07900000 to 0x0a180000 at 0x80000 stride, reading exactly 200,000 bytes of each, then a 7,712-byte tail at 0x0a200000 — 16,407,744 bytes over 1,025,484 frames. (An earlier note here said "42 banks of 0x100000"; that came from masking addresses rather than measuring contiguous runs, and was wrong.) Records are NOT fixed-stride — the strings are NUL-terminated and packed, so a record is only locatable by walking from the start of a bank. Confirmed by content across four records: 03 02 70 42 = 3027042 (VA7IF), 03 02 70 48 = 3027048 (VA7SX), 00 03 02 33 = 30233 (VY1JN), 00 03 02 35 = 30235 (VE3ZO). Note the ID is FIXED-WIDTH BCD but the ID itself is not — DMR IDs share a country prefix (302 = Canada here) and vary in length after it, so 30233 and 3027042 are both valid and the field is simply left-padded with zeros. Do not treat a short value as a parse error. This is the region NeonPlug\'s CSV Contacts tab would need; it is deliberately NOT part of a codeplug read (the CPS itself takes ~1M frames for it). THE FRIENDS LIST IS NOT A SEPARATE TABLE. `MyFriend` is a FLAG on a digital contact (0x1000 in the record\'s leading u16), and the CPS\'s Friends List node is a filtered view of this same database — which is why no small friends region exists and why hunting for one found nothing. CONFIRMED 2026-08-31: across 163,467 records parsed from the capture, exactly two carry 0x1000, and they are exactly the two the owner sees in that node (Alex/VA7IF id 3027042 at 0x0808e414, Daria/VY1JN id 30233 at 0x07900e3c). Static analysis of the CPS agrees — the D890UV converter builds 12 fields ending in MyFriend. Static analysis of the CPS reads a base of 0x18000000 for this data. CORRECTED 2026-09-07: calling that "NOT the radio address" was half wrong. It IS the CPS host-buffer base - the code literally does sub eax, 0x18000000 to turn a radio address into a buffer offset - AND it is a radio address the CPS writes and the radio ACKs. Both are true. What is NOT true is that it holds the DMR contact database: the 312 MB contacts capture contains no 0x18xxxxxx address at all, and the contact download is 0x07000000 plus 0x07900000 only, exactly as this note says. 0x18000000 is instead the INDEX half of a second index/mask/records triple with the same machinery as talkgroups - mask at 0x18080000 (125 bytes = 1000 bits, inverted), index u32 at 0x18000000 + i*4, records at 0x18100000 + (V/1000)*0x80000 + (V%1000)*0xc8. The table is EMPTY on this radio, which is why the index is never read (the read marker marks only present entries) while the writer still emits all 4,000 bytes of 0xFF. A parallel 66,000-entry family exists at 0x18200000/0x18280000/0x18300000 and never reaches the wire. Both are contact-shaped (208-byte records, the size behind the CPS PrivateContacts struct) but WHICH list they are is unknown - candidates include Friends List, NXDN contacts and the talkgroup/contact whitelists. Adding one entry under each candidate CPS node and re-reading settles it: 0x18080000 is read on every codeplug read, so its first byte stops being 0xFF the moment the right node is populated. The serial frames carry the radio\'s own address in every request, and they say 0x07900000 — hardware wins. 0x18000000 is a CPS-internal buffer base (contacts marshal through [0x009D2E44] rather than the usual [0x009D2E2C], which is consistent with a separate host buffer). The small 0x18080000 run the normal read touches is something else and is all 0xFF. Historical note: the vendor `PrivateContacts` table maps to this, and there is no .rdt table for this database at all — it is too large for the codeplug file and the CPS downloads it separately. The two share this record layout, so a Friends List parser is the same code against a much smaller region, whose address is still unknown.' },
  { name: 'Zone hidden mask', address: D890_ADDR.ZONE_HIDE, size: D890_ADDR.ZONE_HIDE_SIZE,
    contents: 'One bit per zone; SET = hidden from the radio menu', read: true, write: true, provenance: 'hardware',
    note: 'PROVEN ON HARDWARE 2026-08-31 by a controlled change: with one zone hidden from the radio\'s own menu, 0x3482c20 read 01 00 00... against a present mask of FF at 0x3482c00 (8 zones), and the owner confirmed the hidden zone was zone 1 ("Z1 Single") — so the bit and the zone are matched by name, not merely by count. One bit for one hidden zone settles all three questions at once — SET = HIDDEN, bit 0 = zone 1 (LSB first, same convention as the present mask), and the address is 0x3482c20 (an OCR-mangled note once read it as 0x3482c28; that is dead). The region read all zeros in two earlier captures, so this is a clean before/after on the exact byte. The manual agrees independently: the DA-7X2 Operating Manual says "Zone Hide: Set ON to hide the zone if you don\'t need the zone", so ON = hidden — matching the mask decode here (set bit = hidden). That is documentation of the control, not of the bit, so a read-back with a known-hidden zone is still the stronger evidence; but the direction is no longer a guess. It is reachable two ways in the vendor CPS, both obscure: per zone in the zone edit dialog, and in bulk via Tool > Zone Hide Operation (All Checked / All UNChecked). The owner describes it as very buried and not clear what it does — which is why it reads as absent from the Zone grid, where there is no hide column. NeonPlug surfaces the per-zone flag directly in the zone editor beside the A/B channels rather than reproducing that.' },
  { name: 'Radio ID mask', address: D890_ADDR.RADIO_ID_SET, size: D890_ADDR.RADIO_ID_SET_SIZE,
    contents: 'One bit per radio ID; SET = present', read: true, write: true,
    hardwareRoundTrip: true, provenance: 'hardware',
    note: 'OWNER CONFIRMED ON HARDWARE 2026-09-10, having been the "unclaimed mask" — the 32-byte gap between the zone-hidden and scan-list masks that no vendor marshaller touches, named from a live read alone. NeonPlug wrote 0x0b -> 0x0f here while adding a radio ID into the slot-2 hole, and the RADIO\'S OWN MENU then listed four IDs. Only a presence mask produces that.' },
  { name: 'Scan-list mask', address: D890_ADDR.SCAN_LIST_SET, size: D890_ADDR.SCAN_LIST_SET_SIZE,
    contents: 'One bit per scan list; SET = present', read: true, write: true,
    hardwareRoundTrip: true, provenance: 'hardware',
    note: 'FULL HARDWARE ROUND TRIP 2026-09-10, confirmed on THE RADIO\'S OWN SCREEN. NeonPlug added a third scan list, SL Echo, into slot 2; this mask went 0x03 -> 0x07 and the radio\'s scan menu then listed three. That also validates blankScanList(): SL Echo is the first scan list this driver BUILT rather than patched, and its four unshowable fields — look-back A and B, dropout delay, revert channel — came from a vendor-created list captured earlier the same day.' },
  { name: 'Scan lists', address: D890_ADDR.SCAN_LIST_DATA, stride: D890_ADDR.SCAN_LIST_STRIDE,
    contents: `${D890_LIMITS.SCAN_LISTS_MAX} records, ${D890_ADDR.SCAN_LISTS_PER_BLOCK} per 0x${D890_ADDR.SCAN_LIST_BLOCK_STRIDE.toString(16)} block`,
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'The block split is still from the vendor marshaller — only lists 0 and 1 have ever been read from a radio. FULL HARDWARE ROUND TRIP 2026-09-10, verified by THE VENDOR CPS reading the radio rather than by our own read-back: NeonPlug renamed a list, added a member, and changed dwell time to 55, priority 1 to channel 62 and priority 2 from Off to channel 63; the CPS came back with dwellTime 55, pri1 0x3e and pri2 0x3f, while look-back A/B, dropout and revert stayed at 20/31/37/6 exactly as read. Dwell time matters because the RADIO\'S menu does not show it, so the CPS is the only independent check. ADD is also supported as of the same day, built from blankScanList().' },
  { name: 'Settings', address: D890_ADDR.SETTINGS, size: D890_ADDR.SETTINGS_SIZE,
    contents: 'General settings', read: true, write: true, provenance: 'hardware' },
  { name: 'Zone current channel A', address: D890_ADDR.ZONE_A_CHANNEL, stride: 2,
    contents: 'u16 per zone: the POSITION in that zone’s member list, not a channel number',
    read: true, write: true, provenance: 'hardware',
    note: 'Inside the settings address range but written by the ZONE marshaller. CONFIRMED 2026-08-31 against a real read: every value resolved to a sensible member of its own zone, which pins BOTH the position-not-channel-number encoding and the per-zone-slot indexing — a channel-number reading would have produced out-of-range members, and a mis-indexed one would have pointed into the wrong zone. NOT confirmed: which of the two addresses is VFO A and which is VFO B. That needs one glance at the radio\'s own A and B against this panel; a swap here would look entirely plausible.' },
  { name: 'Zone current channel B', address: D890_ADDR.ZONE_B_CHANNEL, stride: 2,
    contents: 'u16 per zone, same encoding', read: true, write: true, provenance: 'hardware',
    note: 'Same confirmation and same open question as channel A — see that entry.' },
  { name: 'Power-on display', address: 0x3500900, size: 0x60,
    contents: 'Start_Char / Start_Char2 (14 chars, UTF-16LE) then Password_Char (8 chars, ASCII)',
    read: true, write: true, provenance: 'hardware',
    note: 'CONFIRMED 2026-08-31: the CPS Power-on tab showed WELCOME / ANYTONE / 12345678 and the dump reads exactly that. Note the MIXED encoding — the two text lines are UTF-16LE, the password is plain ASCII. Fields are 0x20 each but the vendor declares varchar(14), and the CPS draws 14 boxes, so only 14 characters are decoded.' },
  { name: 'Zone names', address: D890_ADDR.ZONE_NAMES, stride: D890_ADDR.ZONE_NAME_STRIDE,
    contents: '17 UTF-16LE units, 0xffff-terminated', read: true, write: true,
    hardwareRoundTrip: true, provenance: 'hardware',
    note: 'FULL HARDWARE ROUND TRIP 2026-09-10, confirmed on THE RADIO\'S OWN SCREEN — the strongest evidence available here, since the zone name is what the radio displays when you switch zones. Renamed Z1 Single -> Z1 Zulu: 6 bytes across 2 frames, the low bytes of the UTF-16 units that differ, and the radio showed the new name.' },
  { name: 'Radio (DMR) IDs', address: D890_ADDR.RADIO_ID_DATA, stride: D890_ADDR.RADIO_ID_STRIDE,
    contents: 'BCD-as-hex ID at +0x00, UTF-16LE name at +0x04', read: true, write: true,
    hardwareRoundTrip: true, provenance: 'hardware',
    note: 'FULL HARDWARE ROUND TRIP 2026-09-10, and confirmed by THE RADIO\'S OWN MENU rather than by reading back what we sent. Slot 3 was renamed RID Max -> RID Zulu with its ID changed to 7654321, and a new RID Hole / 222 was written into the slot-2 hole a vendor CPS delete had left. The radio then showed FOUR IDs with RID Zulu LAST — proving three things at once: records do not compact, an add reuses a hole, and a record built over erased flash is valid provided its unmodelled tail (0x24-0x3f) is zeroed the way every vendor write does. Patching the 0xFF of erased flash directly would have produced the only record on the radio shaped that way.' },
  { name: 'Master radio ID', address: D890_ADDR.MASTER_ID_DATA, size: D890_ADDR.MASTER_ID_SIZE,
    contents: 'BCD-as-hex id at +0x00, UTF-16LE name at +0x04, Override All TX IDs flag at +0x26',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'FULL HARDWARE ROUND TRIP 2026-09-03 — read, written BY NEONPLUG, read back, and verified independently in the vendor CPS, which showed the ID, name and checkbox exactly as written. The first region this driver wrote from scratch rather than echoing vendor bytes. CONFIRMED ON HARDWARE 2026-09-03: setting MastID to 16776415 / "MASTERX" in the vendor CPS produced 16 77 64 15 4d 00 41 00 53 00 54 00 45 00 52 00 58 00 here, so it reuses the Radio ID codec rather than duplicating it. The checkbox the CPS labels "Used" is a byte at +0x26 (1 = on) and it means OVERRIDE ALL TX IDS: with it set, this ID replaces the TX ID of every channel. LOCATED by toggling it while KEEPING the ID and name — exactly one span of 133 changed and exactly one byte within it, which also disproved the first guess that "Used" merely meant the record was non-empty. The flag is specific to the MASTER record: all four regular Radio ID records carry 0x00 at +0x26 with everything past the name zero, so the two share a layout but not this field.' },
  { name: 'RX group lists', address: D890_ADDR.RX_GROUP_DATA, stride: D890_ADDR.RX_GROUP_STRIDE,
    contents: 'u32 members from +0x00, name at +0x100', read: true, write: true,
    hardwareRoundTrip: true, provenance: 'hardware',
    note: 'WIRED FOR WRITE 2026-09-10, last of the record tables, and ROUND-TRIPPED ON HARDWARE the same day: NeonPlug wrote a new group RXG Zulu into slot 0 — the hole a vendor CPS delete had left — and the VENDOR CPS, reading the radio, listed it AT INDEX 0 by name with an empty contact list, which is exactly what was sent. Three things at once: the record was written, the presence mask moved 0x02 -> 0x03, and the ADD REUSED THE HOLE rather than appending past it — lowestFreeSlot picking slot 0 over slot 2, confirmed on hardware rather than only in tests. The radio does not expose receive groups in its own menu, so the CPS is the only independent check available. It was held back for two days because its presence mask address was disputed: 0x3701510 was believed to collide with a hot key mask and read zero on a radio holding two lists, so writing it risked destroying a neighbouring table. SETTLED by two vendor CPS captures. (1) Creating two receive groups changed EXACTLY ONE BYTE in a 500 KB write - 0x3701510, 0x00 to 0x03 - while 0x3701500, the real hot key/status bitmask, stayed 0f. Two were created rather than one on purpose: a mask goes 0x03 to 0x0f while a COUNT goes 0x02 to 0x04, and one added cannot distinguish them. (2) Deleting the group in slot 0 moved the mask to 0x02 and rewrote ONLY slot 1, whose 288 bytes came back byte-for-byte identical - so a DELETE LEAVES A HOLE, like zones, radio IDs and scan lists, and unlike talk groups. The CPS writes 0x120 of each 0x200 record (64 u32 members from 0x00, 0x20-byte name at 0x100) and leaves 0x120-0x1ff alone; a NeonPlug read shows both populated records reading 0xFF across that span, so blankRxGroup() is 0xFF end to end. Members are 0-BASED TALK GROUP SLOTS, confirmed against the CPS grid: member 12 displays as TG0013. tests/fixtures/d890uv/rxgroup-vendor.bin is the vendor RX Group Delta record and the test asserts ours is byte-identical over the 0x120 it writes. A RECORD-SCAN FALLBACK IN THE READER WAS REMOVED at the same time: it preferred records to the mask whenever the mask read empty, which resurrected DELETED groups - the reference radio displayed two of them for days after a CPS write zeroed the mask. NOT YET ROUND-TRIPPED ON HARDWARE.' },
  { name: 'Talk group locator', address: 0x3900000, size: 40000,
    contents: '10,000 u32 slots; V = the SLOT INDEX of a present talk group, 0xFFFFFFFF absent', read: true, write: true, provenance: 'hardware',
    note: 'NOT the talkgroups themselves — those are at 0x3a00000 and are read and decoded. This is a separate 40,000-byte region the vendor CPS writes and NeonPlug never read until the preservation pass. Its captured contents are six u32 values 00,01,02,03,04,05 followed by 39,976 bytes of 0xFF, on a codeplug holding exactly six talkgroups. That pairing plus its adjacency to the talkgroup mask at 0x3980000 suggests an index or sort table over the talkgroup list, but nothing confirms it: a table of 0..N-1 is equally consistent with an identity mapping that carries no information at all. Read purely so a write can put it back unchanged; do not decode or generate it on that guess, because if it IS a sort order then writing 0..N-1 would silently reorder a list that was not in that order. IDENTIFIED 2026-09-07 by disassembling the vendor CPS: it is the talkgroup RECORD LOCATOR table, u32 LE per slot, indexed by the same loop counter as the talkgroup mask at 0x3980000. A slot value V locates its record at 0x3a00000 + (V/1000)*0x80000 + (V%1000)*0xc8, computed at three sites - the talkgroup reader, the writer, and the transfer driver whose output goes on the wire. Absent slots hold 0xFFFFFFFF. THE CAUTION IN THE OLD NOTE WAS RIGHT and now has a mechanism: it IS an identity map today, but only because the six talkgroups are contiguous. A WRITE MUST EMIT V = THE SLOT INDEX for each present slot and 0xFFFFFFFF for each absent one - NOT 0..N-1 packed. With a hole in the mask those differ, and a wrong entry sends the radio to the wrong RECORD, not merely to a wrong sort position. Ruled out as a sort order by content too: sorted by DMR ID the six would be 0,1,3,4,2,5 and by name 5,3,4,0,2,1; the table reads 0,1,2,3,4,5. The read/write asymmetry (32 bytes read, 40,000 written) is explained - the CPS read marker marks only PRESENT slots (6 x 4 bytes rounds to two 16-byte frames) while the writer marks present and absent alike, all 10,000. IDENTIFIED and PROVEN ON HARDWARE 2026-09-10 by the hole test: with 1,010 contiguous talk groups V and a packed 0..N-1 are identical, so only a gap can tell them apart. Deleting slot 500 and writing changed exactly 5 bytes - 4 in this table and 1 in the presence mask - and the read-back has locator[500] = ff ff ff ff, locator[501] = f5 01 00 00 (501, NOT 500), and all 1,009 surviving entries still equal their own slot. A packed writer would have rewritten every entry above the hole and sent the radio one record low for each. Codec in talkgroupLocator.ts; written in full on every talk group write, as the vendor does. ⚠️ RETRACTED 2026-09-10, SAME DAY: the round trip above proves only that our bytes survived, not that the RADIO accepts the result. Writing that delete left the radio reporting 1010 talk groups and CRASHING on the deleted entry. The mask bit was clear and this table read ff ff ff ff, both as intended — but planSpanTableWrite copies the original into the gap, so the RECORD was written back fully populated, and the radio counts something other than the mask. Whether the fix is blanking the record, compacting the table, or a count field nobody has found is UNKNOWN; delete a talk group in the vendor CPS with the serial log capturing and read what it does. Talk group add/delete is refused in d890WriteInput.ts until then.' },
  { name: 'Talkgroup mask', address: D890_ADDR.TALKGROUP_SET, size: D890_ADDR.TALKGROUP_SET_SIZE,
    contents: 'INVERTED — a set bit means the slot is EMPTY', read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'Getting the sense backwards yields either no contacts at all or ten thousand phantom ones.' },
  { name: 'Talkgroups', address: D890_ADDR.TALKGROUP_DATA, stride: D890_ADDR.TALKGROUP_STRIDE,
    contents: `Banked: bank × 0x${D890_ADDR.TALKGROUP_BANK_STRIDE.toString(16)} + index × 0x${D890_ADDR.TALKGROUP_STRIDE.toString(16)}`,
    read: true, write: true, hardwareRoundTrip: true, provenance: 'marshaller',
    note: 'Only six talkgroups have ever been loaded, so nothing past bank 0 is tested and the per-bank count is inferred.' },
  { name: 'Boot image', address: 0x03f80000, size: 40960,
    contents: '160x128 RGB565, big-endian, column-major, no header',
    read: true, optional: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'HW ROUND TRIP 2026-09-03: a picture written by NeonPlug rendered on the radio\'s own screen as the intended image. That is stronger than a read-back — a wrong pixel order or byte order would write and read back cleanly and still display as noise, so the screen confirms frame shape, address, RGB565 and column-major together. Frame shape independently matches a vendor capture of the same write (2560 frames, 40960 bytes at one address, no header, no trailer, no erase step). Read on demand from the Settings area, not with the codeplug — 3 x 40 KB is larger than the rest of the radio combined.' },
  { name: 'Background image 1', address: 0x04000000, size: 40960, contents: 'Same format as the boot image',
    read: true, optional: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'HW ROUND TRIP 2026-09-03 via NeonPlug: written and confirmed on the radio. Address was already CONFIRMED separately by writing a blue background here and a red one to BK2 — which ruled out the two bases being transposed.' },
  { name: 'Background image 2', address: 0x04080000, size: 40960, contents: 'Same format as the boot image',
    read: true, optional: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'HW ROUND TRIP 2026-09-03 via NeonPlug: written and confirmed on the radio. This also PROMOTED the address from marshaller to hardware — 0x4080000 came from the vendor disassembly alone until a NeonPlug write landed here and showed up as this image.' },
  { name: 'Satellite table', address: 0x04a80000, size: 12800, contents: '25 slots × 512 bytes, ASCII zero-padded',
    read: true, optional: true, write: true, provenance: 'marshaller',
    note: 'The CPS zero-fills all 25 slots on every write, so writing a short table wipes slots that previously held data.' },
  // ---- located by reading the radio, 2026-08-30 -------------------------
  // Every one of these was an address the RE bundle named but could not
  // resolve: the settings marshaller reaches them through nine stores whose
  // address is parametric (`base + i*0x40` over a runtime-sized array), so no
  // static trace could emit a row. Dumping them read-only and matching the
  // bytes against the vendor's own CSV export settled each in one read.
  { name: 'Roaming channels', address: 0x2080000, stride: 0x40,
    contents: 'RX and TX as BCD-as-hex u32 at +0x00/+0x04, then colour code, slot, and a UTF-16LE name',
    read: true, write: true, provenance: 'hardware',
    note: 'Confirmed by content: 410.21250 / 418.21250 and "Roaming CH 1", matching RoamingChannel.CSV exactly.' },
  { name: 'Roaming channel mask', address: 0x2084000, size: 0x20,
    contents: 'One bit per roaming channel; SET = present', read: true, write: true, provenance: 'hardware',
    note: 'Read 0x0F against a codeplug holding exactly four roaming channels.' },
  { name: 'Roaming zones', address: 0x2085000, stride: 0x80,
    contents: 'Members at +0x00 (roaming-channel indices, 0xff-terminated), UTF-16LE name at +0x40',
    read: true, write: true, provenance: 'hardware',
    note: 'Confirmed by content: members 00 01 02 03 and the name "ROAM ZONE 1".' },
  { name: 'APRS settings', address: 0x3501000, size: 205,
    contents: 'Position, callsigns and SSIDs, digipeater path, symbol pair, then eight u16 digital upload slots at +0x40',
    read: true, write: true, provenance: 'hardware',
    note: 'DECODED. Sixteen fields matched value-for-value against the vendor CPS\'s own APRS.CSV export of the same codeplug. Callsigns are six bytes with NO terminator — the SSID byte follows immediately, so a NUL-scan eats it. The vendor\'s "Enter Your Sending Text" is NOT here; everything past +0x50 read zero, so it lives in the unread 0x3501200 block.' },
  { name: 'VFO A / VFO B', address: 0x1f81000, stride: 0x80,
    contents: 'The two channel slots past the 4000 storable ones, reached by ordinary channel addressing',
    read: true, write: true, provenance: 'hardware',
    note: 'CONFIRMED: with VFO A set to 435.06250 MHz, this address opened with BCD 43 50 62 50 / 43 51 25 00 (RX 435.06250, TX 435.12500). The bundle mapping.md labels 0x3884000 "VFO" — that is WRONG; the value is not there and three reads of it returned nothing.' },
  { name: 'Pre-defined SMS', address: 0x3180000, stride: 0x200,
    contents: 'UTF-16LE message text; 20 slots per bank, banks 0x80000 apart',
    read: true, write: true, provenance: 'hardware',
    note: 'CONFIRMED: returned the five AnyTone factory defaults. Text is UTF-16LE, NOT the varchar(200) the vendor SQL DDL implies — that DDL describes the CPS database, not the radio.' },
  { name: 'SMS-associated block', address: 0x2980000, size: 0x640,
    contents: 'Unknown. The marshaller ties it to pre-defined SMS.',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'unknown',
    note: 'NOT a presence mask, despite being assumed one: 1521 of its 1600 bytes are 0xFF with the rest sparse 00/01/02/03. Meaning unresolved, so the SMS read uses an empty-run heuristic instead. DECODED 2026-09-07. This is the SMS MESSAGE STORE INDEX, and it is three pieces, not one. 0x2980000 + i*16 is a 16-byte envelope per slot, written only for occupied slots (5 occupied = the 80 bytes the CPS writes). 0x2980800 + i is a VALID BYTE per slot, 0x00 present and 0xFF free - so this region does have a byte-per-slot presence table after all, it is just not where it was looked for. 0x2980880 is the HEAD, the index of the first valid slot. VERIFIED against a capture: the five envelopes read next=1,2,3,4,0xFF and text=0,1,2,3,4, the valid bytes read 00 x5 then FF, and the head reads 00 - a chain 0->1->2->3->4->end over exactly the five predefined messages the radio holds. Envelope layout, from the CPS marshaller: +0x02 NextIndex (next VALID slot, 0xFF ends the chain), +0x03 NoteAdd (the TEXT slot, and the reader fetches the message body from THIS byte rather than from the record index, so the two can differ), +0x07 Attr, +0x0c..0f an 8-digit BCD Code. CONFIRMED ON HARDWARE 2026-09-08 by exactly that test: deleting the first predefined message left 0x2980800 = FF 00 00 00 00 FF... and 0x2980880 = 01, with slots 1-4 untouched. It IS a linked list, not a compacting array. NOTE THE ASYMMETRY - the ANALOG ADDRESS BOOK at 0x3801000 does compact and renumber on delete. Two tables in one radio with two different deletion semantics; do not carry one behaviour across to the other.' },
  { name: 'FM broadcast channels', address: 0x3400000, stride: 0x40, read: true, write: true,
    contents: 'BCD frequency x100 Hz at +0x00, UTF-16LE name at +0x04',
    provenance: 'hardware',
    note: 'CONFIRMED against the CPS: 01 08 00 00 = 108.0000 MHz on the factory "FM-001". Note the x100 Hz scale — the AM table uses x10 Hz for the same four bytes. Record STRIDE is unconfirmed; only one record exists on the captured radio.' },
  { name: 'FM VFO', address: 0x3402000, size: 0x60,
    contents: 'One FM channel record — the VFO, outside the numbered table and with no mask bit',
    read: true, write: true, provenance: 'hardware',
    note: 'CONFIRMED 2026-08-31 by the CPS\'s own help text on the FM node: "101 FMs (100 Normal FMs + VFO FM)". Previously logged as "probably the FM VFO" on the strength of a record whose name began "VF".' },
  { name: 'AM airband channels', address: 0x3880000, stride: 0x40, read: true, write: true,
    contents: 'BCD frequency x10 Hz at +0x00, UTF-16LE name at +0x04',
    provenance: 'hardware',
    note: 'CONFIRMED against the CPS: 10 80 00 00 = 108.00000 MHz on the factory "AM-001", the airband floor. Same record shape as FM but a DIFFERENT frequency scale — do not unify them.' },
  { name: 'AM airband VFO / tuning record', address: 0x3884000, size: 0x40,
    contents: 'BCD frequency at +0x00, UTF-16LE name at +0x04 — the same shape as an AM channel record',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'RECONCILED 2026-09-01 from the vendor CPS\'s own serial capture (7x2_read_new.txt). This address is NOT the mask: the CPS reads 64 bytes here — one record stride — consistent with the AM receiver\'s own tuning record, which is what broadcastChannels.ts assumes and why three attempts to read it AS a mask returned nothing. The real AM presence mask is at 0x3884200, where the CPS reads 32 bytes (256 bits for 256 slots) and got 07 00 00... on a radio holding three AM channels; it then read exactly 192 bytes at 0x3880000, i.e. records 0-2. So polarity is SET = PRESENT, and NeonPlug now reads the mask first and fetches only the slots it names — CONFIRMED ON HARDWARE 2026-09-01, with AM, FM, AM zones and both tone lists all still reading correctly off a radio. Records are still checked for vacancy, so a wrong bit costs bytes, never a phantom channel. 0x3884400 is the AM ZONE presence mask (CONFIRMED ON HARDWARE 2026-09-01 — the CPS reads 01 there and then exactly one 128-byte AM zone record). 0x3884600 and 0x3884800 were unidentified until 2026-09-03; both are now mapped and read — see the two entries below. DECODED 2026-09-03: this record is the AM receiver\'s own tuning state, same shape as an AM channel — the vendor CPS write capture set its name to "AM-256" and its BCD frequency to 10 80 15 00 (108.015 MHz), and writes all four frames of it. It has no presence-mask bit, so vacancy comes from the record contents.' },
  { name: 'FM broadcast scan mask', address: 0x3402050, size: 0x10,
    contents: 'One bit per FM channel INDEX, set = included in scan',
    read: true, write: true, provenance: 'hardware',
    note: 'Flat, unlike AM\'s, which is a u32 bitmap per zone over member POSITIONS. An FM channel therefore has exactly one scan state and belongs as a column on the channel table; an AM channel\'s depends on which zone is being scanned. Read into scanAdd since the driver started but NOT written until 2026-09-03 — and the address sits inside the verbatim preserve run at 0x3402000, so an edit was actively overwritten with its pre-edit bytes on every write. Planning it explicitly is what stops that.' },
  { name: 'AM zone A channel', address: D890_AM_ZONES.A_CHANNEL_TABLE, stride: D890_AM_ZONES.A_CHANNEL_STRIDE,
    contents: 'u16 per zone slot — a POSITION in that zone\'s member list, not an AM channel index',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'IDENTIFIED 2026-09-03 from the vendor CPS\'s own write frames. With A Channel set to the LAST member of three zones holding 6, 7 and 16 members, this table read 05 00 06 00 0f 00 — positions 5, 6 and 15; changing all three moved it to 03 00 04 00 0e 00. Same convention as the main zone table\'s A/B channels, which is why CurWorkCH at +0x20 inside the zone record (an ABSOLUTE index) is a different field. Earlier dumps of this address returned all 0xFF and it was written off as erased flash — it was erased only because NeonPlug never wrote it and the CPS had not yet touched it in that session. CHANGED-FIELD round trip on hardware 2026-09-03: CZBB set from position 3 to 0, written, read back as 00 00 04 00 0e 00 — the other two zones\' values untouched.' },
  { name: 'AM zone scan (AmChannelList_CH_Scan)', address: D890_AM_ZONES.SCAN_TABLE, stride: D890_AM_ZONES.SCAN_STRIDE,
    contents: 'u32 bitmap per zone slot — one bit per MEMBER POSITION, set = included in scan',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'IDENTIFIED 2026-09-03 from the same capture: 3f 00 00 00 / 7f 00 00 00 / ff ff 00 00 against zones of 6, 7 and 16 members — exactly 6, 7 and 16 bits set, matching the CPS\'s own Zone Channels column. Per (zone, MEMBER POSITION) and NOT per channel: one AM channel in two zones can be scanned in one and not the other, so this cannot become a column on the AM channel table the way FM\'s flat scan mask is. CHANGED-FIELD round trip on hardware 2026-09-03: one member of CZBB unticked, 3f -> 3b (bit 2 cleared), read back exactly, with the other zones\' bitmaps untouched.' },
  { name: 'AM airband zones', address: 0x3888000, stride: 0x80,
    contents: 'name (UTF-16LE at +0x00), CurWorkCH (u16 at +0x20), members (u16 AM channel indices from +0x22, 0xffff-terminated)',
    read: true, write: true, provenance: 'hardware',
    note: 'MAPPED 2026-08-31 from a radio with one zone set — the previous note said this needed the vendor disassembly, which turned out to be unnecessary once a populated example existed. The dump read "AMZONETEST" with members 1 and 2 against an AM table of AM-001/TEST1/TEST2 at indices 0/1/2, and the owner confirmed the zone holds TEST1 and TEST2. That is what separates +0x20 from the member list: reading members from +0x20 gives three, including a channel the zone does not contain. Members are AM channel INDICES, not channel numbers. +0x20 is kept raw — the main zone table stores its A/B as positions within the member list, and this field is analogous, but that is NOT confirmed here.' },
  { name: 'Analog / DTMF address book', address: 0x3801000, stride: 0x40,
    contents: 'BCD call ID at +0x00, digit count at +0x07, UTF-16LE name at +0x08',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'CONFIRMED: 12 34 50 ... 05 then "Contact1" — BCD id 12345, five digits. This is what identified BCD as the radio\'s ID encoding. FORMAT DECODED 2026-09-07, OFFLINE — one record was added in the vendor CPS and the before/after captures diffed. Records are 0x40 apart: +0x00 four bytes of packed BCD digits (high nibble first), +0x04 three zero bytes of unknown meaning, +0x07 the DIGIT COUNT, +0x08 a NUL-terminated UTF-16LE name. The count is load-bearing and not redundant: record 0 is 12 34 50 00 count 5 = \'12345\', record 1 is 65 43 21 00 count 6 = \'654321\', and without the count the trailing zero nibble is indistinguishable from a real digit. Parser in analogAddressBook.ts. NOT YET WIRED — nothing reads this into a table, so read stays false.' },
  { name: 'Analog address book masks', address: 0x3800000, size: 0x180,
    contents: 'Presence masks for the analog address book', read: true, write: true, hardwareRoundTrip: true, provenance: 'marshaller' },
  { name: 'Emergency / alarm (1)', address: 0x3482e00, size: 0x30, read: true, write: true,
    contents: 'alert_Information: AnaKind, ToneType, Tone_ID, Time, Tx_Time, Rx_Time, AnaChan, Set1, Cycle, DigiKind',
    provenance: 'marshaller',
    note: 'Has real data: 01 00 12 34 56 78 — the same BCD encoding as the address book, an ID of 12345678. Field NAMES are known from the DDL and match english.ini 2600-2615; the OFFSETS are not. Needs a codeplug with each field set distinctly. DECODED ENOUGH TO WARN, 2026-09-07. This is NOT a bitmask despite the name: it is ONE BYTE PER SLOT. Adding record 1 changed byte +0x01 from 0xff to 0x01, and a parallel table 0x100 higher changed +0x101 from 0xff to 0x00. Both used slots read their own index (0 and 1), which leaves the meaning genuinely ambiguous — table[i]==i fits a per-slot presence byte AND a compacted list of used slot numbers equally well. Deleting a slot out of order distinguishes them (0xff 0x01 versus 0x01 0xff) and has never been observed. Treat non-0xFF as used; do NOT rely on the value. The second table at 0x3800100 is zero for both used slots and unidentified.' },
  { name: 'Emergency / alarm (2)', address: 0x3483000, size: 0x30, read: true, write: true,
    contents: 'Second emergency block, presumed digital to the first\'s analog',
    provenance: 'marshaller',
    note: 'Has real data with time-like values: 0a 0a 3c (10, 10, 60) appears twice at matching relative offsets, suggesting a stride of 8. Not mapped.' },
  { name: 'Auto-repeater offsets', address: 0x3483200, size: 0x3e8,
    contents: '250 offsets, u32 LE, in units of 10 Hz',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'CONFIRMED ON HARDWARE 2026-09-03: setting the first two offsets to 5 MHz and 0.6 MHz in the vendor CPS wrote 20 a1 07 00 (500000) and 60 ea 00 00 (60000) — so the unit is 10 Hz, a scale nothing else in this driver uses (channel frequencies are BCD; GPS/roaming differ). The same 10 Hz u32 encoding also holds for the autoRepMin/Max settings at 0x0c4-0x0d3, which is independent corroboration. NO PRESENCE MASK: the table was entirely zero before the CPS wrote it and only the table bytes changed, so zero means unused. WHAT SELECTS A SLOT IS UNKNOWN — autoRepeater1Uhf/Vhf were wrongly assumed to be u8 indices into it, but the CPS Auto repeater tab shows them as Off/on dropdowns and auto-repeater there is a VFO feature; the channel field Offset_Fre_Ex at +0x39 is a per-channel Correct Frequency[Hz] trim, not an index. The slot number is still the record identity, so gaps are kept and nothing is renumbered. CHANGED-FIELD ROUND TRIP 2026-09-03: slot 0 edited 5.0 -> 7.6 MHz in NeonPlug, written and read back as c0 98 0b 00 (760000), with slot 1 still 60 ea 00 00 (0.6 MHz).' },
  { name: 'Hot key / one-key', address: 0x3700000, size: 0x1530,
    contents: 'One-key assignments', read: true, write: true, hardwareRoundTrip: true, provenance: 'marshaller' },
  { name: 'MDC1200 presence', address: 0x3703900, size: 32,
    contents: 'Presence for the MDC1200 encode list at 0x3702000',
    read: true, write: true, provenance: 'hardware',
    note: 'FOUND 2026-09-07. Read by EVERY read capture, unlike the record table it guards, and it moved 0x00 -> 0x01 across the CPS edit that created the single encode record. Sits exactly 100 * 0x40 above 0x3702000, the same mask-after-100-slots shape as the hardware-confirmed 5-Tone table at 0x3480000 whose mask is 0x3481900. BITMASK vs COUNT IS NOT SETTLED: one record gives 0x01 under either reading. 5-Tone read 0x03 with two records present, which favours a bitmask for that table, but that is a sibling, not this one. Creating three encode entries and deleting the MIDDLE one settles it: 0x05 means bitmask, 0x02 means count.' },
  { name: 'MDC1200 contacts slot table', address: 0x4980000, size: 128,
    contents: 'One byte per contact slot, 0xFF unused — 128 slots',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'FOUND 2026-09-07, read by every capture. Went ff ff -> 00 01 across the edit that added two contacts, byte for byte the same convention as the analog address book table at 0x3800000, and it precedes its records exactly as that one does. Its 128-byte length is where the 128-slot capacity of 0x4a00000 comes from — no full table has been observed. CARRIES THE SAME UNRESOLVED AMBIGUITY as 0x3800000: both used slots hold their own index, so per-slot presence and a compacted list of used slot numbers fit equally. Deleting slot 0 and keeping slot 1 tells them apart (ff 01 versus 01 ff) and would settle BOTH tables at once.' },
  { name: 'MDC1200 contacts second table', address: 0x4980100, size: 128,
    contents: 'Unidentified byte-per-slot table parallel to 0x4980000',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'FOUND 2026-09-07. Zero for both used slots and 0xFF elsewhere, so it carries no information in any sample we have — the same dead end as 0x3800100, which is parallel to the analog address book table in exactly the same way. Recorded so it is not rediscovered as a mystery.' },
  { name: 'MDC1200', address: 0x3702000, stride: 0x40, size: 0x40 * 100,
    contents: 'MDC1200 encode and decode lists', read: true, write: true, provenance: 'hardware',
    note: 'ADDRESS CONFIRMED 2026-09-07. STRIDE CORRECTED 0x10 -> 0x40 the same day, and an earlier claim here that no read capture shows this region was WRONG: 7x2_missingdataread_after.txt reads it, 64 bytes. The region is read only when it holds something, which is why five other read captures skip it. Its presence word is 0x3703900, which every capture reads — it went 0x00 -> 0x01 across the edit that created the one record. The 0x40 stride and a mask immediately after 100 slots is exactly the hardware-confirmed 5-Tone shape (0x3480000 + 100*0x40 = 0x3481900), and nothing is ever read or written between 0x3702040 and 0x3703900. 7x2_missingdatawrite.txt writes 64 bytes here reading 01 00 00 00 00 00 31 12 then zeros; the 31 12 at +0x06 is consistent with an MDC1200 four-hex-digit unit ID. Promoted from marshaller to hardware on that basis: the vendor demonstrably writes THIS address. Nothing in NeonPlug reads it, so a NeonPlug write leaves it stale — one of only two vendor-written spans with no reader. Extract with tools/parse-serial-capture.mjs --writes; a before/after CPS edit pair would settle the fields with no hardware session, the same way status messages were.' },
  { name: 'MDC1200 contacts', address: 0x4a00000, stride: 0x40, size: 0x40 * 128,
    contents: 'MDC1200 address book — 0x40 stride, 0x30 body, 128 slots',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'ADDRESS AND STRIDE CORRECTED 2026-09-07. Read coverage too: 7x2_missingdataread_after.txt READS 128 bytes here, so this is recoverable data rather than write-only; five other captures skip it because it was empty. Its slot table is 0x4980000, read by every capture, which went ff ff -> 00 01 across the edit — byte for byte the same convention as the analog address book at 0x3800000. The stride recorded here was 0x30, taken from the marshaller; the CPS writes 48 bytes at 0x4a00000 AND 48 at 0x4a00040, so records are 0x40 apart with the last 0x10 never written — the same shape as 0x3600000, which reads as one 512-byte run but is written as 8 separate 32-byte pieces at 0x40 stride. Record 0 reads 00 00 00 00 00 00 11 11 then zeros; 11 11 at +0x06 matches the ID position in the MDC1200 region above. Nothing reads this, so a NeonPlug write leaves it stale. FIELD LAYOUT, INFERRED (2 samples per claim, NOT confirmed): +0x01 Call Type (0 Private, 1 Group, 2 All), +0x04..05 Group Call ID, +0x06..07 Private Call ID, +0x08 UTF-16LE name. The ID appeared to MOVE between +0x04 and +0x06 across records; it does not. The vendor CPS language file (DA7X2REBUNDLE/07_cps_assets/english.ini) declares 23013=Private Call ID and 23014=Group Call ID as SEPARATE fields, and only the one matching Call Type is populated. That file also shows the vendor calls the feature QDC1200 (23000=QDC1200 Setting) while labelling the tables MDC1200. ID ENCODING SETTLED 2026-09-08 ON HARDWARE, and it CORRECTS a wrong reading made the day before. The ID is a plain LITTLE-ENDIAN uint16: a controlled write of 1234 stores d2 04, and 0x04D2 = 1234, which no BCD reading produces. It was decoded as byte-swapped BCD on 09-07 from two values that could not discriminate - 1111 is a palindrome that fits every candidate, and 22 02 read as BCD looks like 0222 which matched a believed 222. That second value is really 546. Reading it as BCD gives the wrong number for every value that is not coincidentally palindromic. Layout, all hardware-confirmed 2026-09-08: +0x00 Type (5 = ALARM, the 6th list entry, so 0-based), +0x01 call type (0 Private, 1 Group, 2 All Call), +0x02 ACK (1 = On), +0x04 Group ID u16 LE, +0x06 Private ID u16 LE, +0x08 UTF-16LE name. Type and ACK were unassigned until a row varied them. DELETION COMPACTS the records and renumbers the slot table, so a slot index is NOT a stable identifier - measured on the analog address book and inferred here from the identical structure. Codec in mdc1200.ts.' },
  { name: '5-Tone', address: 0x3480000, stride: 0x40, size: 0x40 * 100,
    contents: 'count at +0x02, digits packed two per byte from +0x04; 100 slots', read: true, write: true, provenance: 'hardware', note: 'MAPPED 2026-08-31 by before/after diff: one entry added in the CPS, written, and the same span re-read. +0x02 is the digit COUNT and +0x04 onwards the digits packed two per byte; two records agree (0x0e -> 14 digits, 0x08 -> 8). +0x03 held 0x46 in both and is NOT decoded — one repeated value proves nothing. 100 slots, confirmed by the boundary: slot 100 would start at 0x3481900, which is not a record at all — it is this table\'s PRESENCE MASK (CONFIRMED ON HARDWARE 2026-09-01; the CPS reads it before the records and its popcount equals the record count). FORMAT DECODED 2026-09-07, OFFLINE — no hardware time, by diffing 7x2_missingdataread.txt against 7x2_missingdataread_after.txt either side of a CPS edit. Status messages live at 0x3700100 on a 0x40 stride, UTF-16LE, 32 characters with NO terminator when full (the captured \'There is also a Status Message 1\' is exactly 32 and fills 0x3700180..0x37001bf to the last byte). Presence is a BITMASK at 0x3701500, bit N = slot N: it read 0x01 with only slot 0 filled and 0x07 once slots 1 and 2 were added, matching the occupied slots exactly in both captures. Parser in statusMessages.ts. HOT KEYS DECODED 2026-09-07 from a CPS Hot Key Set screenshot read against these bytes: 18 entries at 0x3701000 on a 0x30 stride - the same 6 Hot Key rows plus 12 Fun rows, and entry 18 onward is all zeros. +0x00 Mode (0 Call, 1 Menu, both observed), +0x01 Menu (reads 1 everywhere, vocabulary unknown), +0x02 Call Type (0 Analog, 1 Digital, both observed), +0x03 Digi Call Type (0 DMR Group, 3 DMR Hot - the values between are NOT known, so do not assume 1 and 2 follow grid order), +0x04..07 Call Object u32 with 0xFFFFFFFF = Off, +0x08 CONTENT. Content is an index into the predefined SMS table and that is CONFIRMED, not assumed: the one edited row holds 0x03 and predefined SMS index 3 at 0x3180000 + 3*0x200 reads Good bye!, the exact string the grid shows in that row. CORRECTED 2026-09-10: the byte at 0x3701510 is NOT a hot key mask, it is the RECEIVE GROUP presence mask (D890_ADDR.RX_GROUP_SET) - creating two receive groups in the vendor CPS changed it from 0x00 to 0x03 and moved nothing else in a 500 KB write. It had read 0x03 on a radio whose hot key entries 0 and 1 were the only rows differing from the grid default, and which also held exactly two receive groups; the matching counts were a coincidence. All 18 hot key entries are live and must be parsed - there is no hot key mask. Codec in hotKeys.ts. NOT YET WIRED: the parser exists but nothing reads this region into a table, so read stays false.' },
  { name: '2-Tone', address: 0x3482000, stride: 0x20, size: 0x20 * 32,
    contents: 'tones u16 LE at +0x00/+0x02, name UTF-16LE at +0x08; 32 slots', read: true, write: true, provenance: 'hardware', note: 'MAPPED 2026-08-31 by the same diff. Tones are u16 LE at +0x00/+0x02, name UTF-16LE at +0x08. The name is directly observed (\'sample2\'); the tenths-of-a-hertz SCALING is inferred from two samples landing on plausible values and is not confirmed. 32 slots, confirmed by the boundary: slot 32 would start at 0x3482400, which repeats slot 0 verbatim and is therefore a second 2-tone table.' },
  { name: 'DTMF', address: 0x3481e00, size: 0x50,
    contents: 'DTMF settings, then four 16-byte digit strings (BOT, EOT, kill, stun)',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'SIZE CORRECTED 2026-09-07 from 0x60 to 0x50: the CPS marks 0x3481e00/0x10 plus 0x3481e10/0x40. Layout from the DTMF marshaller against captured bytes 0e 0a 00 32 14 0a 00 00 01 01 14 00 00 00 00 00: +0x00 InterCode (digit code, forced to 0x0e if outside 10..15), +0x01 GroupCode (10..15, 0xFF Off), +0x02 decoding response 0..2, +0x03 and +0x04 timings in 10 ms units, +0x05 seconds, +0x06..08 a 3-digit self ID one digit code per byte, +0x09 side tone, +0x0a timing, +0x0b seconds, +0x0c PTT ID, +0x0d D-code pause; then four 16-byte 0xFF-padded digit strings at +0x10, +0x20, +0x30 and +0x40 (BOT, EOT, kill, stun). THREE TIMING BYTES ASSIGNED ON HARDWARE 2026-09-08 by writing three distinct values and reading back: +0x03 = 0x2A = 42 -> 420 ms is Pretime[ms], +0x04 = 0x1F = 31 -> 310 ms is First Digit Time[ms], +0x0a = 0x35 = 53 -> 530 ms is Time-Lapse After Encode[ms]. Each is stored as a SINGLE BYTE holding value/10, not a u16 - none of 310, 420 or 530 appears as a u16 anywhere in the block. Each captured byte value was unique within the block, which is what made the assignment unambiguous. STILL UNASSIGNED: Auto Reset Time[s] and PTT ID Pause Time[s], which the tooling could not set and went in at their existing values of 10 and Off - consistent with 0x0A at +0x01 or +0x05 and 0x00 at several offsets, but a repeated value cannot discriminate. One more write with 9 and 7 closes it. Two neighbours were misattributed: 0x3481a00 belongs to the 5-TONE marshaller, not DTMF, and 0x3481910 / 0x3481930 are 5-Tone SETTINGS rather than mask - a mask rebuild must not touch them.' },
  { name: 'DTMF encode list', address: 0x3500800, size: 0x100,
    contents: '16 entries x 16 bytes, one DTMF digit code per byte, 0xFF padded',
    read: true, write: true, hardwareRoundTrip: true, provenance: 'hardware',
    note: 'FOUND 2026-09-07 and VERIFIED from the wire. This region was unclaimed, sitting inside the verbatim 0x3500400/1376 preserve run. Setting a DTMF encode entry to 123123123 in the CPS changed it from all 0xFF to 01 02 03 01 02 03 01 02 03 ff ff... - one digit code per byte, 0xFF padded, exactly as the digit-string fields at 0x3481e10 are packed. These are the DTMF IDs 1-16 that a channel record selects by index. Owned by the same marshaller as 0x3481e00 despite sitting in the settings address range, which is why it was never attributed.' },
  { name: 'Encryption IDs', address: 0x3585000, stride: 2,
    contents: '32 slots, 16-bit Encryption ID, BIG-endian (the .rdt is little-endian)',
    read: true, write: true, provenance: 'hardware',
    note: 'CONFIRMED two ways: the radio read 01 01 02 02 … 20 20, and the vendor EncryptionCode.CSV of the same codeplug lists IDs 257, 514, 771 … — i.e. 0x0101 x slot. So the field is 16-bit and this is the ID table, not the key table. Endianness is still marshaller-only: every default is byte-palindromic, so no capture can distinguish BE from LE.' },
  { name: 'Encryption keys', address: 0x3585100, stride: 0x28,
    contents: '32 slots; only +0x10/+0x11 hold the 16-bit key, big-endian',
    read: true, write: true, provenance: 'hardware',
    note: 'CONFIRMED: keys 4660 and 43981 were written to the radio and read back at +0x10 and +0x38. 0x38 = 0x28 + 0x10, which pins the stride and the offset at the same time. Everything else in all 1280 bytes reads zero. The key passes through XOR with a mask that is 0 unless the CPS has an activation file loaded — untested, since no activation file is available.' },
  { name: 'AES encryption keys', address: 0x3580000, stride: 0x40,
    contents: 'key_id at +0x00, key bytes from +0x01, aes_key_num at +0x22',
    read: true, write: true, provenance: 'hardware',
    note: 'CONFIRMED: two 256-bit keys written through the vendor CPS read back byte for byte, slot 2 at +0x40 proving the stride. aes_key_num at +0x22 is 0x40 = 64 hex characters.' },
  { name: 'ARC4 encryption keys', address: 0x3584000, stride: 0x10,
    contents: 'key_id at +0x00, then 5 key bytes', read: true, write: true, provenance: 'marshaller',
    note: 'NOT confirmed, same reason as the AES table.' },
  { name: 'GPS Roaming / zone bars', address: 0x3502000, stride: 0x20,
    read: true, write: true, hardwareRoundTrip: true,
    contents: 'STR_ZONE_BARS: OnOff, Zone, Lati(Degree/MinInt/MinMark/Kind), Longti(Degree/MinInt/MinMark/Kind), Radius u32 at +0x0c',
    provenance: 'hardware',
    note: 'POSITION LAYOUT CORRECTED 2026-09-03 against a populated table, and it IS grouped per axis exactly like APRS at 0x3501000. An earlier note here asserted the opposite and the parser followed it; the same note then contradicted itself by predicting the APRS shape, and asked for a populated codeplug to settle it. A vendor CPS write gave one: `01 05 31 2c 0b 00 77 21 16 01 00 00 f4 01 00 00` = zone slot 5, 49deg 44.11min N, 119deg 33.22min W, radius 500 m. The old interleaved offsets were not merely unverified but impossible on these bytes — 0x03 (44) was read as the SOUTH boolean and 0x06 (119) as latitude MINUTES, which only run 0-59 — and rendered a geofence in British Columbia as a point in the South Atlantic. The interleaving came from GPSRoaming.CSV COLUMN order, which for this table is presentation order rather than storage order. CONFIRMED by two CPS views: the GPS Roaming grid (Latitude Degree | Latitude Minute | LatiMinMark | North or South | Longtitude Degree | ...) and the ZONE_BARS editor, which shows Latitude Minute as a single decimal 44.11, i.e. MinInt and MinMark are the integer and hundredths halves of one minute value. Zone is a hardware SLOT: byte 05 displays as "Z7 Digital", and Z7 sits at slot 5. Geometry (32 entries, stride 0x20) matches the CPS grid row count. Only 14 of each 32 bytes carry fields; +0x0A/+0x0B are alignment padding before the 4-byte radius and +0x10-0x1F are unused, so a write patches rather than rebuilds. The vendor writes 1280 bytes here, not 1024: 0x3502400-0x35024FF is 8 further slot-sized blocks past the 32 the CPS exposes, zero in both the baseline and the vendor write. NeonPlug covers them too — the model plans the 32 entries and the verbatim pass carries the rest, since VENDOR_WRITE_RUNS reads the full 1280 and no encoder claims that tail. Whether those 8 blocks are an internal 40-slot array capped at 32 in the UI, or plain padding, cannot be told from all-zero bytes. CHANGED-FIELD ROUND TRIP 2026-09-03: an existing fence was edited (latitude 44.11min -> 43.80min) and two further fences ADDED on previously blank slots, all written by NeonPlug and read back correctly — the first records this driver has written into empty slots of this table.' },
  { name: 'Zone roam mask', address: D890_ADDR.ZONE_ROAM, stride: D890_ADDR.ZONE_ROAM_STRIDE,
    contents: '32 bytes per zone: bit k = the zone’s k-th member is a roam channel',
    read: true, write: true, provenance: 'marshaller',
    note: 'Carried VERBATIM, and that is measured rather than assumed. A CPS write carrying Exclude channel from roaming = On for a channel that is a zone member left all 1024 bytes of this region zero, so the CPS does not derive the per-zone mask from the per-channel flag. The per-channel flag itself is real and we model it - channel byte 0x34 bit 2, parsed and written. POLARITY UNRESOLVED and deliberately not guessed: the control is EXCLUDE (On = not a roam channel) while this mask is documented as bit set = IS a roam channel, and with every Exclude off an all-zero mask cannot satisfy both. Nothing observed drives the mask, so do not infer a polarity from a UI that does not populate it.' },
];

/** Frames and session sequence, for the Diagnostics protocol reference. */
export const D890_PROTOCOL_NOTES = {
  baud: 921600,
  session: [
    { step: 'PROGRAM', detail: 'Seven ASCII bytes, then a three-byte reply. The family convention is QX\\x06.' },
    { step: '0x02', detail: 'One byte out, sixteen back: an 0xff-terminated identity string. The cheapest safe way to confirm the radio.' },
    { step: 'R / W', detail: 'Read and write frames, 32-bit big-endian byte addresses, always 16-byte aligned.' },
    { step: 'END', detail: 'Session teardown.' },
  ],
  frames: [
    { name: 'Read request', bytes: "52 <addr:4 BE> <len>", note: 'No checksum. The vendor CPS only ever asks for 0x10; longer reads are negotiated here and work.' },
    { name: 'Read reply', bytes: '57 <addr:4 BE> <len> <data> <cksum> 06', note: 'Identical in shape to a write request.' },
    { name: 'Write request', bytes: '57 <addr:4 BE> 10 <16 data> <cksum> 06', note: 'Always exactly 16 bytes — no long-write form exists in the vendor binary.' },
  ],
  checksum: 'Plain 8-bit additive sum over frame[1..21] — address, length and all 16 data bytes. Not a CRC.',
  checksumNote:
    'Because a read reply and a write request are the same frame, checking a live read reply’s checksum validates the write checksum by construction, at zero risk.',
} as const;
