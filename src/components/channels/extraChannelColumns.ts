import type { Channel } from '../../models/Channel';
import type { ChannelColumnGroup } from '../../types/radioCapabilities';
import {
  D890_ANALOG_APRS_PTT_MODE,
  D890_BUSY_LOCK,
  D890_DMR_MODE,
} from '../../radios/d890uv/constants';

/**
 * Optional channel columns, declared once and rendered from this one list by
 * both the header row and the cell row.
 *
 * The columns that pre-date this file are still written out longhand in
 * ChannelsTable/ChannelRow, gated by matching `hasColumn('x')` calls that a test
 * compares as multisets. That works, but it is discipline rather than structure:
 * a header gated differently from its cell shifts every column after it and
 * renders channel data under the wrong heading with no error anywhere. Driving
 * both sides off the same array removes the possibility instead of testing for
 * it, which is why every column added since is declared here.
 *
 * `provenance` is the honest part. Most of these fields were recovered from the
 * vendor CPS's own channel marshaller (`sub_005af490` write / `sub_005b1750`
 * read, which touch exactly the same 54 record offsets) rather than by watching
 * a byte move on a real radio — and the only codeplug ever captured leaves most
 * of them at a single value. The byte offset is solid; the value range is not.
 * The UI marks those, and DA7X2-NEEDS-CONFIRMING.md lists what would settle each
 * one.
 */
export type ExtraColumnProvenance =
  /** Watched change on a real radio, or matched against the vendor's own export. */
  | 'hardware'
  /** Offset from the vendor marshaller; the captured codeplug never varied it. */
  | 'marshaller'
  /** Offset from the marshaller AND the stored encoding is reasoned, not read. */
  | 'inferred';

export type ExtraColumnEditor =
  | { kind: 'boolean' }
  | { kind: 'number'; min: number; max: number; suffix?: string }
  | { kind: 'select'; options: readonly string[] };

export interface ExtraChannelColumn {
  /** Capability group. A radio that does not declare it never renders the column. */
  group: ChannelColumnGroup;
  /** Channel model field this column edits. */
  field: keyof Channel;
  /** Short header text — the grid is already wide. */
  header: string;
  /**
   * The vendor's own name for the field, and nothing else — the marker for an
   * unconfirmed column is appended straight after it, so an explanation baked
   * into the label reads as "...derives this*". Explanations go in `note`.
   */
  label: string;
  /** Extra context for the tooltip only. */
  note?: string;
  /** Where in the channel record it lives, for the tooltip. */
  offset: string;
  provenance: ExtraColumnProvenance;
  editor: ExtraColumnEditor;
  /** True for fields only meaningful on a digital channel. */
  digitalOnly?: boolean;
  /**
   * True for fields the radio only permits on an ANALOG-transmitting channel.
   *
   * The DA-7X2 has four channel types — 0 A-Analog, 1 D-Digital, 2 A+D TX A,
   * 3 D+A TX D — and the shared model classifies by what the channel TRANSMITS,
   * so 0 and 2 are 'Analog' while 1 and 3 are 'Digital'. That split happens to
   * land exactly on the availability rule for Busy Lock (allowed on Analog and
   * A-D, suppressed on Digital and D-A), so `!isDigitalMode()` is the correct
   * predicate rather than an approximation of one.
   */
  analogOnly?: boolean;
}

/**
 * Vendor "Busy Lock/TX Permit". CONFIRMED ON HARDWARE 2026-08-30.
 *
 * Setting the VFO to "Channel Free" on the radio's own front panel moved byte
 * 0x1a from 0x00 to 0x02, and nothing else in the 128-byte record changed. That
 * pins both the offset and the third vocabulary entry, since
 * `D890_BUSY_LOCK[2] === 'Channel Free'`.
 *
 * This replaces an earlier note claiming the stored byte "is 0 on every channel
 * of a codeplug built to vary it" and that the CPS derives the column. The byte
 * is stored and it does vary — the earlier codeplug simply never set it.
 *
 * ⚠️ AVAILABLE ONLY ON Analog AND A-D CHANNELS — not on Digital or D-A
 * (operator-confirmed 2026-08-30). That is a constraint on the FIELD, not on its
 * value, and it explains a side effect observed the same day and left unexplained
 * at the time: switching the VFO from analog to digital CLEARED 0x1a back to 0
 * on its own. The radio zeroes a field its channel type does not permit.
 *
 * Two consequences:
 *   - A report that this column is "100% determined by Channel Type" is an
 *     overstatement of a real constraint, not an invention. The byte is stored
 *     and the CPS can set it — on the channel types that allow it.
 *   - ON A WRITE PATH: do not write this byte on a Digital or D-A channel. The
 *     radio does not merely ignore it, it actively clears it, so a read-back
 *     comparison would report a mismatch that is the radio behaving correctly.
 *
 * Still inferred: `Different CDT === 1`, from list position alone. One more
 * toggle settles it — on an analog channel.
 */
export const EXTRA_CHANNEL_COLUMNS: readonly ExtraChannelColumn[] = [
  // ---- tones and signalling ------------------------------------------------
  {
    group: 'customCtcss',
    field: 'customCtcssHz',
    header: 'Custom CT',
    label: 'Custom CTCSS (Hz)',
    offset: '0x10 u16, tenths of a Hz',
    provenance: 'hardware',
    editor: { kind: 'number', min: 0, max: 3000, suffix: 'Hz' },
  },
  {
    group: 'toneSignalling',
    field: 'twoToneDecode',
    header: '2T Dec',
    label: '2TONE Decode',
    offset: '0x12, stored zero-based',
    provenance: 'hardware',
    editor: { kind: 'number', min: 0, max: 16 },
  },
  {
    group: 'toneSignalling',
    field: 'twoToneId',
    header: '2T ID',
    label: '2Tone ID',
    offset: '0x1d, stored zero-based',
    provenance: 'marshaller',
    editor: { kind: 'number', min: 0, max: 16 },
  },
  {
    group: 'toneSignalling',
    field: 'fiveToneId',
    header: '5T ID',
    label: '5Tone ID',
    offset: '0x1e, stored zero-based',
    provenance: 'marshaller',
    editor: { kind: 'number', min: 0, max: 16 },
  },
  {
    group: 'toneSignalling',
    field: 'dtmfId',
    header: 'DTMF ID',
    label: 'DTMF ID',
    offset: '0x1f, stored zero-based',
    provenance: 'marshaller',
    editor: { kind: 'number', min: 0, max: 16 },
  },
  {
    group: 'reverse',
    field: 'reverse',
    header: 'REV',
    label: 'Reverse',
    note: 'Swaps RX and TX.',
    offset: '0x09 bit 4',
    provenance: 'hardware',
    editor: { kind: 'boolean' },
  },
  {
    group: 'busyLock',
    field: 'busyLock',
    header: 'TX Permit',
    label: 'Busy Lock / TX Permit',
    note: 'Confirmed on hardware: setting Channel Free on the radio stored 2 at 0x1a. A stored 0 still renders as "Off" on an analog channel and "Always" on a digital one, which is why this column looked derived until the byte was watched changing.',
    offset: '0x1a bits 3-0',
    provenance: 'hardware',
    editor: { kind: 'select', options: D890_BUSY_LOCK },
    // The vendor CPS suppresses this control on Digital and D-A channels, and
    // the radio actively clears the byte when a channel becomes digital. Showing
    // an editable field the radio will zero is worse than hiding it.
    analogOnly: true,
  },
  {
    group: 'frequencyCorrection',
    field: 'offsetFrequencyEx',
    header: 'Freq Corr',
    label: 'Correct Frequency',
    note: 'Signed. Deliberately not folded into the TX frequency — it read 0 on every channel, so how it combines with the offset is unverified.',
    offset: '0x39, signed byte',
    provenance: 'marshaller',
    editor: { kind: 'number', min: -128, max: 127 },
  },

  // ---- DMR --------------------------------------------------------------
  {
    group: 'txColorCode',
    field: 'txColorCode',
    header: 'TX CC',
    label: 'TX Colour Code',
    note: 'A distinct field from the RX colour code. Confirmed by a codeplug that set the two apart: the vendor exported RX from one byte and txcc from the other, 118/118 each way.',
    offset: '0x43',
    provenance: 'hardware',
    editor: { kind: 'number', min: 0, max: 15 },
    digitalOnly: true,
  },
  {
    group: 'slotSuit',
    field: 'slotSuit',
    header: 'Slot Suit',
    label: 'Slot Suit',
    offset: '0x21 bit 4',
    provenance: 'hardware',
    editor: { kind: 'boolean' },
    digitalOnly: true,
  },
  {
    group: 'dmrAdvanced',
    field: 'dmrMode',
    header: 'DMR Mode',
    label: 'DMR MODE',
    offset: '0x21 bits 3-2',
    provenance: 'hardware',
    editor: { kind: 'select', options: D890_DMR_MODE },
    digitalOnly: true,
  },
  {
    group: 'dmrAdvanced',
    field: 'digitalDuplex',
    header: 'Duplex',
    label: 'Digital Duplex',
    note: 'Stored inverted, as the vendor’s `simplex` bit.',
    offset: '0x34 bit 1',
    provenance: 'inferred',
    editor: { kind: 'boolean' },
    digitalOnly: true,
  },
  {
    group: 'dmrAdvanced',
    field: 'idleTx',
    header: 'Idle TX',
    label: 'Idle TX',
    offset: '0x34 bit 5',
    provenance: 'marshaller',
    editor: { kind: 'boolean' },
    digitalOnly: true,
  },
  {
    group: 'dmrAdvanced',
    field: 'dmrCrcIgnore',
    header: 'CRC Ign',
    label: 'Ignore DMR CRC',
    offset: '0x34 bit 7',
    provenance: 'hardware',
    editor: { kind: 'boolean' },
    digitalOnly: true,
  },
  {
    // Its own group rather than the existing 'confirmations', which the DM-32
    // declares for two fields the D890 does not have. Sharing it would put an
    // always-false column on the DM-32's grid.
    group: 'callConfirmation',
    field: 'callConfirmation',
    header: 'Call Conf',
    label: 'Call Confirmation',
    offset: '0x09 bit 6',
    provenance: 'hardware',
    editor: { kind: 'boolean' },
    digitalOnly: true,
  },

  // ---- scan and roaming ----------------------------------------------------
  {
    group: 'scanRoaming',
    field: 'autoScan',
    header: 'Auto Scan',
    label: 'Auto Scan',
    offset: '0x34 bit 4',
    provenance: 'marshaller',
    editor: { kind: 'boolean' },
  },
  {
    group: 'scanRoaming',
    field: 'excludeFromRoaming',
    header: 'No Roam',
    label: 'Exclude channel from roaming',
    offset: '0x34 bit 2',
    provenance: 'marshaller',
    editor: { kind: 'boolean' },
  },
  {
    group: 'scanRoaming',
    field: 'dataAckForbid',
    header: 'DataACK',
    label: 'DataACK forbid',
    offset: '0x34 bit 3',
    provenance: 'hardware',
    note: 'Confirmed on hardware 2026-08-30 by toggling it alone on the radio. The vendor marshaller names this bit rec_only, which is wrong — Receive Only is not currently mapped for this radio, because pointing it at a bit that means something else would let a user ask for RX-only and get a channel that still transmits.',
    editor: { kind: 'boolean' },
    digitalOnly: true,
  },
  {
    group: 'ranging',
    field: 'ranging',
    header: 'Ranging',
    label: 'Ranging (link measure)',
    offset: '0x34 bit 0',
    provenance: 'hardware',
    editor: { kind: 'boolean' },
  },

  // ---- messaging -----------------------------------------------------------
  {
    group: 'messaging',
    field: 'smsConfirmation',
    header: 'SMS Conf',
    label: 'SMS Confirmation',
    offset: '0x3b bit 2',
    provenance: 'marshaller',
    editor: { kind: 'boolean' },
    digitalOnly: true,
  },
  {
    group: 'messaging',
    field: 'sendTalkerAlias',
    header: 'Talker Alias',
    label: 'Send Talker Alias DMR/NX',
    offset: '0x3b bit 4',
    provenance: 'marshaller',
    editor: { kind: 'boolean' },
    digitalOnly: true,
  },

  // ---- APRS ----------------------------------------------------------------
  {
    group: 'aprsAdvanced',
    field: 'analogAprsPttMode',
    header: 'Ana APRS PTT',
    label: 'Analog APRS PTT Mode',
    offset: '0x36',
    provenance: 'marshaller',
    editor: { kind: 'select', options: D890_ANALOG_APRS_PTT_MODE },
  },
  {
    group: 'aprsAdvanced',
    field: 'digitalAprsPttMode',
    header: 'Dig APRS PTT',
    label: 'Digital APRS PTT Mode',
    note: 'A plain Off/On — a stored 2 exported as "On", so the CPS clamps rather than rejecting.',
    offset: '0x37',
    provenance: 'marshaller',
    editor: { kind: 'select', options: ['Off', 'On'] },
  },
  {
    group: 'aprsAdvanced',
    field: 'digitalAprsReportChannel',
    header: 'APRS Ch',
    label: 'Digital APRS Report Channel',
    note: 'Stored zero-based, displayed one-based — like the tone IDs beside it.',
    offset: '0x38',
    provenance: 'marshaller',
    editor: { kind: 'number', min: 1, max: 8 },
  },
  {
    group: 'aprsAdvanced',
    field: 'analogAprsMute',
    header: 'APRS Mute',
    label: 'Analog APRS Mute',
    offset: '0x3b bit 3',
    provenance: 'marshaller',
    editor: { kind: 'boolean' },
  },
  {
    group: 'aprsAdvanced',
    field: 'analogAprsTxPath',
    header: 'APRS Path',
    label: 'Analog APRS TX Path',
    offset: '0x3c',
    provenance: 'marshaller',
    editor: { kind: 'number', min: 0, max: 15 },
  },

  // ---- emergency and encryption codes --------------------------------------
  {
    group: 'emergencyCodes',
    field: 'emergencySystemIndex',
    header: 'Emerg Sys',
    label: 'Emergency System',
    offset: '0x22',
    provenance: 'marshaller',
    editor: { kind: 'number', min: 0, max: 32 },
  },
  {
    group: 'emergencyCodes',
    field: 'arc4Code',
    header: 'ARC4',
    label: 'ARC4 code',
    offset: '0x3d',
    provenance: 'marshaller',
    editor: { kind: 'number', min: 0, max: 255 },
  },
];

/** Columns a radio actually renders, in declaration order. */
export function extraColumnsFor(
  declared: ReadonlySet<ChannelColumnGroup>
): readonly ExtraChannelColumn[] {
  return EXTRA_CHANNEL_COLUMNS.filter((c) => declared.has(c.group));
}

/**
 * Tooltip text. The provenance marker is not decoration — a user comparing
 * NeonPlug against the OEM software needs to know which of these NeonPlug has
 * actually seen a radio change and which it has only read out of a disassembly.
 */
export function extraColumnTitle(c: ExtraChannelColumn): string {
  const caveat =
    c.provenance === 'hardware'
      ? ''
      : c.provenance === 'marshaller'
        ? ' — offset from the vendor CPS; not yet confirmed against a radio'
        : ' — offset from the vendor CPS; encoding inferred, not confirmed';
  return `${c.label} (${c.offset})${caveat}${c.note ? `. ${c.note}` : ''}`;
}

/** Marker appended to the header of anything not hardware-confirmed. */
export function extraColumnMarker(c: ExtraChannelColumn): string {
  return c.provenance === 'hardware' ? '' : '*';
}
