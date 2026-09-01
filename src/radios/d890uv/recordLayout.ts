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
  { name: 'Device identity', address: 0x07000000, size: 16, contents: 'Model string returned by the 0x02 probe',
    read: true, provenance: 'hardware', note: 'Never write here.' },
  { name: 'Local info', address: D890_ADDR.LOCAL_INFO, size: D890_ADDR.LOCAL_INFO_SIZE,
    contents: 'Firmware / region identity', read: true, provenance: 'hardware' },
  { name: 'Channel mask', address: D890_ADDR.CHANNEL_SET, size: D890_ADDR.CHANNEL_SET_SIZE,
    contents: 'One bit per channel; SET = present', read: true, provenance: 'hardware' },
  { name: 'Channels', address: D890_ADDR.CHANNEL_DATA, stride: D890_ADDR.CHANNEL_STRIDE,
    contents: `${D890_LIMITS.CHANNELS_MAX} records, ${D890_ADDR.CHANNELS_PER_BLOCK} per 0x${D890_ADDR.CHANNEL_BLOCK_STRIDE.toString(16)} block`,
    read: true, provenance: 'hardware',
    note: 'Each record is two 0x40 halves read back to back. Blocks are far further apart than 128 × 0x80, so flat addressing is wrong past channel 127.' },
  { name: 'Zone membership', address: D890_ADDR.ZONE_CHANNELS, stride: D890_ADDR.ZONE_CHANNELS_STRIDE,
    contents: `250 × u16 zero-based channel indices, 0xffff-terminated`, read: true, provenance: 'hardware',
    note: 'The vendor CPS caps a zone at 160 channels even though the region holds 250.' },
  { name: 'Zone present mask', address: D890_ADDR.ZONE_SET, size: D890_ADDR.ZONE_SET_SIZE,
    contents: 'One bit per zone; SET = present', read: true, provenance: 'hardware' },
  { name: 'Digital Contact List', address: 0x07900000, size: 0x2900000,
    contents: '[flags u16 LE][DMR ID, 4-byte BCD] then five NUL-terminated UTF-16LE strings — Name, City, Callsign, State/Province, Country. flags bit 0x1000 = MyFriend',
    read: true, provenance: 'hardware',
    note: 'FOUND 2026-08-31 from a serial capture of the vendor CPS reading its contact list. The CPS walks 83 banks from 0x07900000 to 0x0a180000 at 0x80000 stride, reading exactly 200,000 bytes of each, then a 7,712-byte tail at 0x0a200000 — 16,407,744 bytes over 1,025,484 frames. (An earlier note here said "42 banks of 0x100000"; that came from masking addresses rather than measuring contiguous runs, and was wrong.) Records are NOT fixed-stride — the strings are NUL-terminated and packed, so a record is only locatable by walking from the start of a bank. Confirmed by content across four records: 03 02 70 42 = 3027042 (VA7IF), 03 02 70 48 = 3027048 (VA7SX), 00 03 02 33 = 30233 (VY1JN), 00 03 02 35 = 30235 (VE3ZO). Note the ID is FIXED-WIDTH BCD but the ID itself is not — DMR IDs share a country prefix (302 = Canada here) and vary in length after it, so 30233 and 3027042 are both valid and the field is simply left-padded with zeros. Do not treat a short value as a parse error. This is the region NeonPlug\'s CSV Contacts tab would need; it is deliberately NOT part of a codeplug read (the CPS itself takes ~1M frames for it). THE FRIENDS LIST IS NOT A SEPARATE TABLE. `MyFriend` is a FLAG on a digital contact (0x1000 in the record\'s leading u16), and the CPS\'s Friends List node is a filtered view of this same database — which is why no small friends region exists and why hunting for one found nothing. CONFIRMED 2026-08-31: across 163,467 records parsed from the capture, exactly two carry 0x1000, and they are exactly the two the owner sees in that node (Alex/VA7IF id 3027042 at 0x0808e414, Daria/VY1JN id 30233 at 0x07900e3c). Static analysis of the CPS agrees — the D890UV converter builds 12 fields ending in MyFriend. Static analysis of the CPS reads a base of 0x18000000 for this data; that is NOT the radio address and must not be used. The serial frames carry the radio\'s own address in every request, and they say 0x07900000 — hardware wins. 0x18000000 is a CPS-internal buffer base (contacts marshal through [0x009D2E44] rather than the usual [0x009D2E2C], which is consistent with a separate host buffer). The small 0x18080000 run the normal read touches is something else and is all 0xFF. Historical note: the vendor `PrivateContacts` table maps to this, and there is no .rdt table for this database at all — it is too large for the codeplug file and the CPS downloads it separately. The two share this record layout, so a Friends List parser is the same code against a much smaller region, whose address is still unknown.' },
  { name: 'Zone hidden mask', address: D890_ADDR.ZONE_HIDE, size: D890_ADDR.ZONE_HIDE_SIZE,
    contents: 'One bit per zone; SET = hidden from the radio menu', read: true, provenance: 'hardware',
    note: 'PROVEN ON HARDWARE 2026-08-31 by a controlled change: with one zone hidden from the radio\'s own menu, 0x3482c20 read 01 00 00... against a present mask of FF at 0x3482c00 (8 zones), and the owner confirmed the hidden zone was zone 1 ("Z1 Single") — so the bit and the zone are matched by name, not merely by count. One bit for one hidden zone settles all three questions at once — SET = HIDDEN, bit 0 = zone 1 (LSB first, same convention as the present mask), and the address is 0x3482c20 (an OCR-mangled note once read it as 0x3482c28; that is dead). The region read all zeros in two earlier captures, so this is a clean before/after on the exact byte. The manual agrees independently: the DA-7X2 Operating Manual says "Zone Hide: Set ON to hide the zone if you don\'t need the zone", so ON = hidden — matching the mask decode here (set bit = hidden). That is documentation of the control, not of the bit, so a read-back with a known-hidden zone is still the stronger evidence; but the direction is no longer a guess. It is reachable two ways in the vendor CPS, both obscure: per zone in the zone edit dialog, and in bulk via Tool > Zone Hide Operation (All Checked / All UNChecked). The owner describes it as very buried and not clear what it does — which is why it reads as absent from the Zone grid, where there is no hide column. NeonPlug surfaces the per-zone flag directly in the zone editor beside the A/B channels rather than reproducing that.' },
  { name: 'Unclaimed mask', address: D890_ADDR.RADIO_ID_SET, size: D890_ADDR.RADIO_ID_SET_SIZE,
    contents: 'Read here as the radio-ID occupancy mask', read: true, provenance: 'inferred',
    note: 'The 32-byte gap between the zone-hidden and scan-list masks. No vendor marshaller touches it, so its owner is unconfirmed — this driver names it from a live read alone.' },
  { name: 'Scan-list mask', address: D890_ADDR.SCAN_LIST_SET, size: D890_ADDR.SCAN_LIST_SET_SIZE,
    contents: 'One bit per scan list; SET = present', read: true, provenance: 'hardware' },
  { name: 'Scan lists', address: D890_ADDR.SCAN_LIST_DATA, stride: D890_ADDR.SCAN_LIST_STRIDE,
    contents: `${D890_LIMITS.SCAN_LISTS_MAX} records, ${D890_ADDR.SCAN_LISTS_PER_BLOCK} per 0x${D890_ADDR.SCAN_LIST_BLOCK_STRIDE.toString(16)} block`,
    read: true, provenance: 'marshaller',
    note: 'The block split is from the vendor marshaller — only lists 0 and 1 have ever been read from a radio.' },
  { name: 'Settings', address: D890_ADDR.SETTINGS, size: D890_ADDR.SETTINGS_SIZE,
    contents: 'General settings', read: true, provenance: 'hardware' },
  { name: 'Zone current channel A', address: D890_ADDR.ZONE_A_CHANNEL, stride: 2,
    contents: 'u16 per zone: the POSITION in that zone’s member list, not a channel number',
    read: true, provenance: 'hardware',
    note: 'Inside the settings address range but written by the ZONE marshaller. CONFIRMED 2026-08-31 against a real read: every value resolved to a sensible member of its own zone, which pins BOTH the position-not-channel-number encoding and the per-zone-slot indexing — a channel-number reading would have produced out-of-range members, and a mis-indexed one would have pointed into the wrong zone. NOT confirmed: which of the two addresses is VFO A and which is VFO B. That needs one glance at the radio\'s own A and B against this panel; a swap here would look entirely plausible.' },
  { name: 'Zone current channel B', address: D890_ADDR.ZONE_B_CHANNEL, stride: 2,
    contents: 'u16 per zone, same encoding', read: true, provenance: 'hardware',
    note: 'Same confirmation and same open question as channel A — see that entry.' },
  { name: 'Power-on display', address: 0x3500900, size: 0x60,
    contents: 'Start_Char / Start_Char2 (14 chars, UTF-16LE) then Password_Char (8 chars, ASCII)',
    read: true, provenance: 'hardware',
    note: 'CONFIRMED 2026-08-31: the CPS Power-on tab showed WELCOME / ANYTONE / 12345678 and the dump reads exactly that. Note the MIXED encoding — the two text lines are UTF-16LE, the password is plain ASCII. Fields are 0x20 each but the vendor declares varchar(14), and the CPS draws 14 boxes, so only 14 characters are decoded.' },
  { name: 'Zone names', address: D890_ADDR.ZONE_NAMES, stride: D890_ADDR.ZONE_NAME_STRIDE,
    contents: '17 UTF-16LE units, 0xffff-terminated', read: true, provenance: 'hardware' },
  { name: 'Radio (DMR) IDs', address: D890_ADDR.RADIO_ID_DATA, stride: D890_ADDR.RADIO_ID_STRIDE,
    contents: 'BCD-as-hex ID at +0x00, UTF-16LE name at +0x04', read: true, provenance: 'hardware' },
  { name: 'Master radio ID', address: D890_ADDR.MASTER_ID_DATA, size: D890_ADDR.MASTER_ID_SIZE,
    contents: 'The radio’s own ID record', read: true, provenance: 'hardware' },
  { name: 'RX group lists', address: D890_ADDR.RX_GROUP_DATA, stride: D890_ADDR.RX_GROUP_STRIDE,
    contents: 'u32 members from +0x00, name at +0x100', read: true, provenance: 'hardware' },
  { name: 'Talkgroup mask', address: D890_ADDR.TALKGROUP_SET, size: D890_ADDR.TALKGROUP_SET_SIZE,
    contents: 'INVERTED — a set bit means the slot is EMPTY', read: true, provenance: 'hardware',
    note: 'Getting the sense backwards yields either no contacts at all or ten thousand phantom ones.' },
  { name: 'Talkgroups', address: D890_ADDR.TALKGROUP_DATA, stride: D890_ADDR.TALKGROUP_STRIDE,
    contents: `Banked: bank × 0x${D890_ADDR.TALKGROUP_BANK_STRIDE.toString(16)} + index × 0x${D890_ADDR.TALKGROUP_STRIDE.toString(16)}`,
    read: true, provenance: 'marshaller',
    note: 'Only six talkgroups have ever been loaded, so nothing past bank 0 is tested and the per-bank count is inferred.' },
  { name: 'Boot image', address: 0x03f80000, size: 40960,
    contents: '160x128 RGB565, big-endian, column-major, no header', read: true, provenance: 'hardware',
    note: 'CONFIRMED: a written picture read back and decoded. Read on demand from the Settings area, not with the codeplug — 3 x 40 KB is larger than the rest of the radio combined.' },
  { name: 'Background image 1', address: 0x04000000, size: 40960, contents: 'Same format as the boot image',
    read: true, provenance: 'hardware',
    note: 'CONFIRMED by writing a blue background here and a red one to BK2 — which also ruled out the two bases being transposed.' },
  { name: 'Background image 2', address: 0x04080000, size: 40960, contents: 'Same format as the boot image',
    read: true, provenance: 'marshaller' },
  { name: 'Satellite table', address: 0x04a80000, size: 12800, contents: '25 slots × 512 bytes, ASCII zero-padded',
    read: true, provenance: 'marshaller',
    note: 'The CPS zero-fills all 25 slots on every write, so writing a short table wipes slots that previously held data.' },
  // ---- located by reading the radio, 2026-08-30 -------------------------
  // Every one of these was an address the RE bundle named but could not
  // resolve: the settings marshaller reaches them through nine stores whose
  // address is parametric (`base + i*0x40` over a runtime-sized array), so no
  // static trace could emit a row. Dumping them read-only and matching the
  // bytes against the vendor's own CSV export settled each in one read.
  { name: 'Roaming channels', address: 0x2080000, stride: 0x40,
    contents: 'RX and TX as BCD-as-hex u32 at +0x00/+0x04, then colour code, slot, and a UTF-16LE name',
    read: true, provenance: 'hardware',
    note: 'Confirmed by content: 410.21250 / 418.21250 and "Roaming CH 1", matching RoamingChannel.CSV exactly.' },
  { name: 'Roaming channel mask', address: 0x2084000, size: 0x20,
    contents: 'One bit per roaming channel; SET = present', read: true, provenance: 'hardware',
    note: 'Read 0x0F against a codeplug holding exactly four roaming channels.' },
  { name: 'Roaming zones', address: 0x2085000, stride: 0x80,
    contents: 'Members at +0x00 (roaming-channel indices, 0xff-terminated), UTF-16LE name at +0x40',
    read: true, provenance: 'hardware',
    note: 'Confirmed by content: members 00 01 02 03 and the name "ROAM ZONE 1".' },
  { name: 'APRS settings', address: 0x3501000, size: 205,
    contents: 'Position, callsigns and SSIDs, digipeater path, symbol pair, then eight u16 digital upload slots at +0x40',
    read: true, provenance: 'hardware',
    note: 'DECODED. Sixteen fields matched value-for-value against the vendor CPS\'s own APRS.CSV export of the same codeplug. Callsigns are six bytes with NO terminator — the SSID byte follows immediately, so a NUL-scan eats it. The vendor\'s "Enter Your Sending Text" is NOT here; everything past +0x50 read zero, so it lives in the unread 0x3501200 block.' },
  { name: 'VFO A / VFO B', address: 0x1f81000, stride: 0x80,
    contents: 'The two channel slots past the 4000 storable ones, reached by ordinary channel addressing',
    read: true, provenance: 'hardware',
    note: 'CONFIRMED: with VFO A set to 435.06250 MHz, this address opened with BCD 43 50 62 50 / 43 51 25 00 (RX 435.06250, TX 435.12500). The bundle mapping.md labels 0x3884000 "VFO" — that is WRONG; the value is not there and three reads of it returned nothing.' },
  { name: 'Pre-defined SMS', address: 0x3180000, stride: 0x200,
    contents: 'UTF-16LE message text; 20 slots per bank, banks 0x80000 apart',
    read: true, provenance: 'hardware',
    note: 'CONFIRMED: returned the five AnyTone factory defaults. Text is UTF-16LE, NOT the varchar(200) the vendor SQL DDL implies — that DDL describes the CPS database, not the radio.' },
  { name: 'SMS-associated block', address: 0x2980000, size: 0x640,
    contents: 'Unknown. The marshaller ties it to pre-defined SMS.',
    read: false, provenance: 'unknown',
    note: 'NOT a presence mask, despite being assumed one: 1521 of its 1600 bytes are 0xFF with the rest sparse 00/01/02/03. Meaning unresolved, so the SMS read uses an empty-run heuristic instead.' },
  { name: 'FM broadcast channels', address: 0x3400000, stride: 0x40, read: true,
    contents: 'BCD frequency x100 Hz at +0x00, UTF-16LE name at +0x04',
    provenance: 'hardware',
    note: 'CONFIRMED against the CPS: 01 08 00 00 = 108.0000 MHz on the factory "FM-001". Note the x100 Hz scale — the AM table uses x10 Hz for the same four bytes. Record STRIDE is unconfirmed; only one record exists on the captured radio.' },
  { name: 'FM VFO', address: 0x3402000, size: 0x60,
    contents: 'One FM channel record — the VFO, outside the numbered table and with no mask bit',
    read: true, provenance: 'hardware',
    note: 'CONFIRMED 2026-08-31 by the CPS\'s own help text on the FM node: "101 FMs (100 Normal FMs + VFO FM)". Previously logged as "probably the FM VFO" on the strength of a record whose name began "VF".' },
  { name: 'AM airband channels', address: 0x3880000, stride: 0x40, read: true,
    contents: 'BCD frequency x10 Hz at +0x00, UTF-16LE name at +0x04',
    provenance: 'hardware',
    note: 'CONFIRMED against the CPS: 10 80 00 00 = 108.00000 MHz on the factory "AM-001", the airband floor. Same record shape as FM but a DIFFERENT frequency scale — do not unify them.' },
  { name: 'AM airband masks', address: 0x3884000, size: 0x40,
    contents: 'Presence masks for the AM airband tables',
    read: false, provenance: 'marshaller',
    note: 'mapping.md calls this "VFO". It is not the channel VFO — see the VFO entry — though it may be the AM receiver\'s own tuning record, which is what broadcastChannels.ts assumes. Three read attempts returned nothing, so even the mask role is unverified. NOTE the presence mask NeonPlug actually reads is at 0x3884200, not here; this entry\'s address predates that and the two have never been reconciled. Moot for reading: NeonPlug bulk-reads the AM and FM record tables and decides occupancy from the records themselves, so neither mask address nor its polarity is on the read path any more. A write would have to settle both.' },
  { name: 'AM airband zones', address: 0x3888000, stride: 0x80,
    contents: 'name (UTF-16LE at +0x00), CurWorkCH (u16 at +0x20), members (u16 AM channel indices from +0x22, 0xffff-terminated)',
    read: true, provenance: 'hardware',
    note: 'MAPPED 2026-08-31 from a radio with one zone set — the previous note said this needed the vendor disassembly, which turned out to be unnecessary once a populated example existed. The dump read "AMZONETEST" with members 1 and 2 against an AM table of AM-001/TEST1/TEST2 at indices 0/1/2, and the owner confirmed the zone holds TEST1 and TEST2. That is what separates +0x20 from the member list: reading members from +0x20 gives three, including a channel the zone does not contain. Members are AM channel INDICES, not channel numbers. +0x20 is kept raw — the main zone table stores its A/B as positions within the member list, and this field is analogous, but that is NOT confirmed here.' },
  { name: 'Analog / DTMF address book', address: 0x3801000, stride: 0x30,
    contents: 'BCD call ID at +0x00, digit count at +0x07, UTF-16LE name at +0x08',
    read: false, provenance: 'hardware',
    note: 'CONFIRMED: 12 34 50 ... 05 then "Contact1" — BCD id 12345, five digits. This is what identified BCD as the radio\'s ID encoding.' },
  { name: 'Analog address book masks', address: 0x3800000, size: 0x180,
    contents: 'Presence masks for the analog address book', read: false, provenance: 'marshaller' },
  { name: 'Emergency / alarm (1)', address: 0x3482e00, size: 0x30, read: true,
    contents: 'alert_Information: AnaKind, ToneType, Tone_ID, Time, Tx_Time, Rx_Time, AnaChan, Set1, Cycle, DigiKind',
    provenance: 'marshaller',
    note: 'Has real data: 01 00 12 34 56 78 — the same BCD encoding as the address book, an ID of 12345678. Field NAMES are known from the DDL and match english.ini 2600-2615; the OFFSETS are not. Needs a codeplug with each field set distinctly.' },
  { name: 'Emergency / alarm (2)', address: 0x3483000, size: 0x30, read: true,
    contents: 'Second emergency block, presumed digital to the first\'s analog',
    provenance: 'marshaller',
    note: 'Has real data with time-like values: 0a 0a 3c (10, 10, 60) appears twice at matching relative offsets, suggesting a stride of 8. Not mapped.' },
  { name: 'Auto-repeater offsets', address: 0x3483200, size: 0x3e8,
    contents: '250 offsets of 4 bytes', read: false, provenance: 'marshaller' },
  { name: 'Hot key / one-key', address: 0x3700000, size: 0x1530,
    contents: 'One-key assignments', read: false, provenance: 'marshaller' },
  { name: 'MDC1200', address: 0x3702000, stride: 0x10,
    contents: 'MDC1200 encode and decode lists', read: false, provenance: 'marshaller' },
  { name: 'MDC1200 contacts', address: 0x4a00000, stride: 0x30,
    contents: 'MDC1200 address book', read: false, provenance: 'marshaller' },
  { name: '5-Tone', address: 0x3480000, stride: 0x40, size: 0x40 * 100,
    contents: 'count at +0x02, digits packed two per byte from +0x04; 100 slots', read: true, provenance: 'hardware', note: 'MAPPED 2026-08-31 by before/after diff: one entry added in the CPS, written, and the same span re-read. +0x02 is the digit COUNT and +0x04 onwards the digits packed two per byte; two records agree (0x0e -> 14 digits, 0x08 -> 8). +0x03 held 0x46 in both and is NOT decoded — one repeated value proves nothing. 100 slots, confirmed by the boundary: slot 100 would start at 0x3481900, which holds a different shape (probably the 5-Tone settings).' },
  { name: '2-Tone', address: 0x3482000, stride: 0x20, size: 0x20 * 32,
    contents: 'tones u16 LE at +0x00/+0x02, name UTF-16LE at +0x08; 32 slots', read: true, provenance: 'hardware', note: 'MAPPED 2026-08-31 by the same diff. Tones are u16 LE at +0x00/+0x02, name UTF-16LE at +0x08. The name is directly observed (\'sample2\'); the tenths-of-a-hertz SCALING is inferred from two samples landing on plausible values and is not confirmed. 32 slots, confirmed by the boundary: slot 32 would start at 0x3482400, which repeats slot 0 verbatim and is therefore a second 2-tone table.' },
  { name: 'DTMF', address: 0x3481e00, size: 0x60,
    contents: 'DTMF timing and stun codes', read: false, provenance: 'marshaller' },
  { name: 'Encryption IDs', address: 0x3585000, stride: 2,
    contents: '32 slots, 16-bit Encryption ID, BIG-endian (the .rdt is little-endian)',
    read: true, provenance: 'hardware',
    note: 'CONFIRMED two ways: the radio read 01 01 02 02 … 20 20, and the vendor EncryptionCode.CSV of the same codeplug lists IDs 257, 514, 771 … — i.e. 0x0101 x slot. So the field is 16-bit and this is the ID table, not the key table. Endianness is still marshaller-only: every default is byte-palindromic, so no capture can distinguish BE from LE.' },
  { name: 'Encryption keys', address: 0x3585100, stride: 0x28,
    contents: '32 slots; only +0x10/+0x11 hold the 16-bit key, big-endian',
    read: true, provenance: 'hardware',
    note: 'CONFIRMED: keys 4660 and 43981 were written to the radio and read back at +0x10 and +0x38. 0x38 = 0x28 + 0x10, which pins the stride and the offset at the same time. Everything else in all 1280 bytes reads zero. The key passes through XOR with a mask that is 0 unless the CPS has an activation file loaded — untested, since no activation file is available.' },
  { name: 'AES encryption keys', address: 0x3580000, stride: 0x40,
    contents: 'key_id at +0x00, key bytes from +0x01, aes_key_num at +0x22',
    read: true, provenance: 'hardware',
    note: 'CONFIRMED: two 256-bit keys written through the vendor CPS read back byte for byte, slot 2 at +0x40 proving the stride. aes_key_num at +0x22 is 0x40 = 64 hex characters.' },
  { name: 'ARC4 encryption keys', address: 0x3584000, stride: 0x10,
    contents: 'key_id at +0x00, then 5 key bytes', read: true, provenance: 'marshaller',
    note: 'NOT confirmed, same reason as the AES table.' },
  { name: 'GPS Roaming / zone bars', address: 0x3502000, stride: 0x20, read: true,
    contents: 'STR_ZONE_BARS: OnOff, Zone, Lati(Degree/MinInt/MinMark/Kind), Longti(Degree/MinInt/MinMark/Kind), Radius',
    provenance: 'marshaller',
    note: 'IDENTIFIED 2026-08-30, geometry VERIFIED from the marshaller: 32 entries (cmp ebx,0x20 at 14 sites), stride 0x20, 1024 bytes = 64 write frames, and the CPS GPSRoaming.CSV has exactly 32 rows. Only 14 of each 32 bytes are written; +0x0A/+0x0B and +0x10-0x1F are never touched, so a write must preserve them. Position is NOT grouped per axis the way APRS is. Previously logged as an unidentified table reading 00 FF then zeros — it is blank because no zone bars are set. This is the CPS\'s "GPS Roaming" control on GPS/Ranging: a geofence table that switches the radio to a given zone when it enters a circle of Radius around a position. The settings byte 0x114 (ZoneBarsEn) is its enable. Position is almost certainly the SAME degrees / whole minutes / hundredths / hemisphere layout confirmed for APRS at 0x3501000 — four fields per axis, matching exactly. Cannot be mapped from this codeplug: the table is empty, so it needs either a populated one or the disassembly of Proc_12_70_5E4CC0 / 12_71_5E53C0.' },
  { name: 'Zone roam mask', address: D890_ADDR.ZONE_ROAM, stride: D890_ADDR.ZONE_ROAM_STRIDE,
    contents: '32 bytes per zone: bit k = the zone’s k-th member is a roam channel',
    read: false, provenance: 'marshaller' },
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
