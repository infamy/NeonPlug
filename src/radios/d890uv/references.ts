import type { Channel } from '../../models/Channel';

/**
 * Cross-table references in a DA-7X2 channel, and the rule that they must
 * resolve before anything is written.
 *
 * This exists because of a specific, reproducible failure. `confirm1.rdt` set 52
 * previously-zero channel bytes to 1 and 2 — a deliberate one-hot sweep. The
 * vendor CPS **parsed and re-exported it perfectly**, all 39 CSVs, no complaint.
 * Then Write To Radio died in `ModComm :: Proc_12_16_5AF070`, the channel→radio
 * marshaller, with `SetCommDataByChannelError`.
 *
 * The two halves of the vendor's own software disagree about what is valid. Its
 * file parser stores whatever byte it finds; its marshaller uses some of those
 * bytes as VB6 array subscripts and raises subscript-out-of-range. Ten of the
 * swept bytes point into tables that were empty or shorter than the value
 * written — `DTMFEncode` and `AESEncryptionCode` had **no rows at all** while the
 * channel referenced entries 1 and 2.
 *
 * So: a codeplug can be structurally perfect, survive a full round trip through
 * the vendor CPS, and still be unwritable. Structural validity is not
 * writability, and the check has to happen before the bytes are packed — not by
 * catching an error afterwards, because on this radio there is no afterwards
 * worth having.
 *
 * NeonPlug has no DA-7X2 write path yet. This lands first on purpose: the rule
 * is cheap to honour while the writer is being designed and expensive to retrofit
 * once it exists.
 */

/**
 * A table a channel field indexes into.
 *
 * `modelled` says whether NeonPlug actually holds that table. Where it does, the
 * reference can be checked and the editor can bound the input. Where it does not,
 * the field is a raw number NeonPlug cannot validate — and a writer must either
 * learn the table or refuse to write the field.
 */
export interface D890ReferenceField {
  /** Channel model field carrying the index. */
  field: keyof Channel;
  /** Human name of the field, for messages. */
  label: string;
  /** The vendor CSV table it indexes. */
  table: string;
  /** True when the index is one-based on the wire (0 = none). */
  oneBased: boolean;
  /** Whether NeonPlug models the table at all. */
  modelled: boolean;
}

export const D890_CHANNEL_REFERENCES: readonly D890ReferenceField[] = [
  { field: 'contactId', label: 'Contact / Talk Group', table: 'DMRTalkGroups', oneBased: true, modelled: true },
  { field: 'scanListId', label: 'Scan List', table: 'ScanList', oneBased: true, modelled: true },
  { field: 'rxGroupListId', label: 'Receive Group List', table: 'DMRReceiveGroupCallList', oneBased: true, modelled: true },
  { field: 'dmrRadioIdIndex', label: 'Radio ID', table: 'RadioIDList', oneBased: false, modelled: true },
  { field: 'encryptionId', label: 'Digital Encryption', table: 'AESEncryptionCode', oneBased: true, modelled: true },
  // Below here NeonPlug has no table to check against. Each one killed the
  // vendor's marshaller in confirm1.rdt when pointed at an entry that did not
  // exist, so a writer must not emit a non-zero value for any of them until the
  // corresponding table is modelled.
  { field: 'twoToneId', label: '2Tone ID', table: '2ToneEncode', oneBased: true, modelled: false },
  { field: 'fiveToneId', label: '5Tone ID', table: '5ToneEncode', oneBased: true, modelled: false },
  { field: 'dtmfId', label: 'DTMF ID', table: 'DTMFEncode', oneBased: true, modelled: false },
  { field: 'twoToneDecode', label: '2TONE Decode', table: '2ToneDecode', oneBased: true, modelled: false },
  { field: 'digitalAprsReportChannel', label: 'Digital APRS Report Channel', table: 'APRS digital channels', oneBased: true, modelled: false },
  { field: 'arc4Code', label: 'ARC4', table: 'ARC4EncryptionCode', oneBased: true, modelled: false },
  { field: 'emergencySystemIndex', label: 'Emergency System', table: 'Emergency systems', oneBased: true, modelled: false },
];

export interface DanglingReference {
  channelNumber: number;
  field: keyof Channel;
  label: string;
  table: string;
  /** The index the channel carries, as the user sees it. */
  value: number;
  /** How many entries the table actually has, or null when NeonPlug has no table. */
  available: number | null;
  reason: 'out-of-range' | 'table-not-modelled';
}

/** Entry counts for the tables NeonPlug models. */
export interface D890TableCounts {
  DMRTalkGroups: number;
  ScanList: number;
  DMRReceiveGroupCallList: number;
  RadioIDList: number;
  AESEncryptionCode: number;
}

/**
 * Every reference in `channels` that would not resolve on the radio.
 *
 * Returns findings rather than throwing, and never mutates: the caller decides
 * whether to refuse the write, clamp the field, or show the user a list. A
 * writer that silently clamped would produce a codeplug that differs from what
 * the user saw on screen, which is its own class of bug.
 *
 * A zero index means "none" everywhere on this radio and is always valid.
 */
export function findDanglingReferences(
  channels: readonly Channel[],
  counts: D890TableCounts
): DanglingReference[] {
  const out: DanglingReference[] = [];
  for (const channel of channels) {
    for (const ref of D890_CHANNEL_REFERENCES) {
      const raw = channel[ref.field];
      if (typeof raw !== 'number' || raw === 0) continue;

      if (!ref.modelled) {
        out.push({
          channelNumber: channel.number,
          field: ref.field,
          label: ref.label,
          table: ref.table,
          value: raw,
          available: null,
          reason: 'table-not-modelled',
        });
        continue;
      }

      const available = counts[ref.table as keyof D890TableCounts] ?? 0;
      // A one-based reference of N needs N entries; a zero-based one needs N+1.
      const highest = ref.oneBased ? available : available - 1;
      if (raw > highest) {
        out.push({
          channelNumber: channel.number,
          field: ref.field,
          label: ref.label,
          table: ref.table,
          value: raw,
          available,
          reason: 'out-of-range',
        });
      }
    }
  }
  return out;
}

/** One line per finding, for an alert or a log. */
export function describeDanglingReference(d: DanglingReference): string {
  return d.reason === 'table-not-modelled'
    ? `Channel ${d.channelNumber}: ${d.label} = ${d.value}, but NeonPlug does not hold the ${d.table} table and cannot check it`
    : `Channel ${d.channelNumber}: ${d.label} = ${d.value}, but ${d.table} has ${d.available} ${
        d.available === 1 ? 'entry' : 'entries'
      }`;
}
