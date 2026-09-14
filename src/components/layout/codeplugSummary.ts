/**
 * What an imported or restored codeplug holds, for its dialog.
 *
 * App.tsx and Toolbar.tsx each built this, identically: twelve bullets with
 * every zero listed, "1 channels" for the first four, and nothing about the
 * radio-specific tables a DA-7X2 file carries. One model now, listing only what
 * is there.
 */

import type { CodeplugData } from '../../services/codeplugExport';
import { formatPlural } from '../../utils/formatPlural';

export interface SummaryRow {
  label: string;
  count: number;
}

export interface CodeplugSummary {
  rows: SummaryRow[];
  radioSettings: boolean;
}

/** Tables with anything in them; an empty list or a null entry carried nothing. */
function tablesCarried(data: CodeplugData): number {
  return Object.values(data.tables ?? {}).filter(
    (value) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)
  ).length;
}

export function summarizeCodeplug(data: CodeplugData): CodeplugSummary {
  // Optional chaining throughout: a file from an older build can lack any list.
  const counted: [number, string][] = [
    [data.channels?.length ?? 0, 'channel'],
    [data.zones?.length ?? 0, 'zone'],
    [data.scanLists?.length ?? 0, 'scan list'],
    [data.contacts?.length ?? 0, 'contact'],
    [data.quickContacts?.length ?? 0, 'talk group'],
    [data.rxGroups?.length ?? 0, 'RX group'],
    [data.radioIds?.length ?? 0, 'DMR radio ID'],
    [data.messages?.length ?? 0, 'quick message'],
    [data.digitalEmergencies?.length ?? 0, 'digital emergency system'],
    [data.analogEmergencies?.length ?? 0, 'analog emergency system'],
    [data.encryptionKeys?.length ?? 0, 'encryption key'],
    [tablesCarried(data), 'radio-specific table'],
  ];
  return {
    rows: counted
      .filter(([count]) => count > 0)
      .map(([count, noun]) => {
        const plural = formatPlural(2, noun);
        return { label: plural.charAt(0).toUpperCase() + plural.slice(1), count };
      }),
    radioSettings: !!data.radioSettings,
  };
}
