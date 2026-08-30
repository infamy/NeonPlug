import React, { useMemo, useState } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useChannelsStore } from '../../store/channelsStore';
import {
  D890_CHANNEL_LAYOUT,
  D890_SCAN_LIST_LAYOUT,
  D890_MEMORY_MAP,
  D890_PROTOCOL_NOTES,
  type D890LayoutRow,
  type D890Provenance,
} from '../../radios/d890uv/recordLayout';
import {
  D890_SETTINGS_FIELDS,
  D890_SETTINGS_FREQUENCIES,
  D890_SETTINGS_BITFIELDS,
  D890_UNMAPPED_BYTES,
  D890_ALERT_TONE_GROUPS,
} from '../../radios/d890uv/settingsMap';
import { D890_ADDR } from '../../radios/d890uv/constants';

/**
 * Reference panels for the sparse, address-addressed radios.
 *
 * The DM-32 diagnostics are built entirely around clone blocks — metadata block
 * viewers, an expected-write-data comparison, a contiguous memory image. None of
 * that has anything to show for a radio with no contiguous image, which left the
 * DA-7X2's Diagnostics tab holding a region dump and a log viewer.
 *
 * What this radio needs instead is the map: every byte NeonPlug thinks it knows,
 * what the vendor calls it, and — the part that matters — how it came to be
 * known. A user comparing NeonPlug against the OEM CPS can then tell a field
 * that was watched changing on a real radio from one that was read out of a
 * disassembly and has never been seen move.
 *
 * All of it renders with no radio connected, which is the point: the reference
 * is most useful while planning a capture, not after one.
 */

const PROVENANCE_STYLE: Record<D890Provenance, { label: string; className: string; title: string }> = {
  hardware: {
    label: 'hardware',
    className: 'text-green-400 border-green-600/40',
    title: 'Watched change on a real radio, or matched against the vendor CPS’s own export of the same codeplug.',
  },
  marshaller: {
    label: 'vendor CPS',
    className: 'text-neon-cyan border-neon-cyan/40',
    title:
      'Offset read out of the vendor CPS’s own marshaller, whose writer and reader touch the same offsets. The captured codeplug held one value, so the range is unobserved.',
  },
  inferred: {
    label: 'inferred',
    className: 'text-yellow-400 border-yellow-600/40',
    title: 'Offset from the vendor CPS; the encoding is reasoned rather than read.',
  },
  unknown: {
    label: 'unknown',
    className: 'text-cool-gray border-cool-gray/40',
    title: 'Read off the radio, and nothing claims it.',
  },
};

const Badge: React.FC<{ provenance: D890Provenance }> = ({ provenance }) => {
  const s = PROVENANCE_STYLE[provenance];
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wide border rounded ${s.className}`}
      title={s.title}
    >
      {s.label}
    </span>
  );
};

const hex = (n: number, pad = 2) => `0x${n.toString(16).padStart(pad, '0')}`;

function span(row: D890LayoutRow): string {
  const start = hex(row.offset);
  const end = row.length > 1 ? `-${hex(row.offset + row.length - 1)}` : '';
  return row.bits ? `${start} b${row.bits}` : `${start}${end}`;
}

const TH: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <th className={`px-2 py-1 text-left text-yellow-400 font-semibold whitespace-nowrap ${className}`}>
    {children}
  </th>
);

const LayoutTable: React.FC<{ rows: readonly D890LayoutRow[] }> = ({ rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs border-collapse">
      <thead className="border-b border-yellow-600/30">
        <tr>
          <TH className="w-[92px]">Offset</TH>
          <TH className="w-[150px]">Vendor name</TH>
          <TH className="w-[170px]">CPS column</TH>
          <TH className="w-[150px]">NeonPlug field</TH>
          <TH>Encoding</TH>
          <TH className="w-[90px]">Source</TH>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={`${r.offset}-${r.bits ?? ''}-${r.vendorName}`}
            className="border-b border-yellow-600/10 align-top"
            title={r.note}
          >
            <td className="px-2 py-1 font-mono text-white whitespace-nowrap">{span(r)}</td>
            <td className="px-2 py-1 font-mono text-neon-cyan">{r.vendorName}</td>
            <td className="px-2 py-1 text-cool-gray">{r.cpsColumn ?? '—'}</td>
            <td className="px-2 py-1 font-mono text-white">{r.field ?? '—'}</td>
            <td className="px-2 py-1 text-cool-gray">
              {r.encoding}
              {r.note && <div className="text-[11px] text-cool-gray/70 mt-0.5">{r.note}</div>}
            </td>
            <td className="px-2 py-1">
              <Badge provenance={r.provenance} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * Every byte of the settings region, in one table.
 *
 * Three tiers, and the difference between them is the whole point: a placed
 * field (offset AND meaning, from six passes of fingerprint codeplugs), a byte
 * the vendor's settings marshaller merely NAMES, and a byte nothing claims.
 */
interface SettingsRow {
  offset: number;
  length: number;
  label: string;
  vendorName?: string;
  group?: string;
  tier: 'placed' | 'derived' | 'named' | 'unknown';
  observedChanging?: boolean;
}

function buildSettingsRows(): SettingsRow[] {
  const rows: SettingsRow[] = [];
  for (const f of D890_SETTINGS_FIELDS) {
    rows.push({
      offset: f.offset,
      length: 1,
      label: f.label,
      vendorName: f.vendorField,
      group: f.group,
      // A field carrying `confidence` came from the vendor's software, not from
      // a radio. Badging it the same as one that six fingerprint codeplugs
      // pinned would undo the only thing this table is for.
      tier: f.confidence ? 'derived' : 'placed',
    });
  }
  for (const f of D890_SETTINGS_FREQUENCIES) {
    rows.push({
      offset: f.offset,
      length: 4,
      label: f.label,
      vendorName: f.vendorField,
      group: f.group,
      tier: 'placed',
    });
  }
  for (const b of D890_SETTINGS_BITFIELDS) {
    rows.push({ offset: b.offset, length: 1, label: b.label, group: b.group, tier: 'placed' });
  }
  for (const g of D890_ALERT_TONE_GROUPS) {
    rows.push({
      offset: g.frequencies,
      length: 10,
      label: `Alert tone ${g.id} — frequencies`,
      group: g.tab,
      tier: 'placed',
    });
    rows.push({
      offset: g.durations,
      length: 10,
      label: `Alert tone ${g.id} — durations`,
      group: g.tab,
      tier: 'placed',
    });
  }
  for (const u of D890_UNMAPPED_BYTES) {
    rows.push({
      offset: u.offset,
      length: 1,
      label: u.vendorName ? `(named only) ${u.vendorName}` : '(unclaimed)',
      vendorName: u.vendorName,
      tier: u.vendorName ? 'named' : 'unknown',
      observedChanging: u.observedChanging,
    });
  }
  return rows.sort((a, b) => a.offset - b.offset);
}

const TIER_STYLE: Record<SettingsRow['tier'], { label: string; className: string; title: string }> = {
  placed: {
    label: 'placed',
    className: 'text-green-400 border-green-600/40',
    title:
      'Offset AND meaning established by writing fingerprint codeplugs and diffing read-only dumps. Independently confirmed by the vendor settings marshaller.',
  },
  derived: {
    label: 'from CPS',
    className: 'text-neon-cyan border-neon-cyan/40',
    title:
      "Identity derived from the vendor's own artefacts — its settings marshaller, its captured before/after sweep, its help file and string table — then put through an adversarial audit that rejected 35 of 118 candidates. Never watched changing on a radio.",
  },
  named: {
    label: 'named',
    className: 'text-neon-cyan border-neon-cyan/40',
    title:
      'The vendor settings marshaller supplies a name for this byte. A name is not a decode — the value range, units and option list are all still unknown.',
  },
  unknown: {
    label: 'unclaimed',
    className: 'text-cool-gray border-cool-gray/40',
    title: 'Read off the radio and nothing names it.',
  },
};

/** Built once at module load — it depends on nothing but the static tables. */
const SETTINGS_ROWS = buildSettingsRows();

const SettingsMapTable: React.FC = () => {
  const rows = SETTINGS_ROWS;
  const [filter, setFilter] = useState<'all' | SettingsRow['tier']>('all');
  const shown = filter === 'all' ? rows : rows.filter((r) => r.tier === filter);
  const counts = {
    placed: rows.filter((r) => r.tier === 'placed').length,
    derived: rows.filter((r) => r.tier === 'derived').length,
    named: rows.filter((r) => r.tier === 'named').length,
    unknown: rows.filter((r) => r.tier === 'unknown').length,
  };

  return (
    <>
      <p className="text-xs text-cool-gray mb-3">
        {counts.placed} placed from hardware · {counts.derived} derived from the vendor CPS ·{' '}
        {counts.named} named only · {counts.unknown} unclaimed, across{' '}
        <span className="font-mono">
          {hex(D890_ADDR.SETTINGS, 7)}–{hex(D890_ADDR.SETTINGS + D890_ADDR.SETTINGS_SIZE - 1, 7)}
        </span>
        .
      </p>
      <div className="flex gap-2 mb-3">
        {(['all', 'placed', 'derived', 'named', 'unknown'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={`px-2 py-0.5 text-xs border rounded transition-colors ${
              filter === t
                ? 'border-yellow-500 text-yellow-300'
                : 'border-yellow-600/30 text-cool-gray hover:text-yellow-300'
            }`}
          >
            {t === 'all' ? `all (${rows.length})` : `${TIER_STYLE[t].label} (${counts[t]})`}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="border-b border-yellow-600/30 sticky top-0 bg-deep-gray">
            <tr>
              <TH className="w-[100px]">Offset</TH>
              <TH className="w-[110px]">Address</TH>
              <TH>Field</TH>
              <TH className="w-[160px]">Vendor name</TH>
              <TH className="w-[120px]">CPS tab</TH>
              <TH className="w-[90px]">Source</TH>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.offset}-${r.label}`} className="border-b border-yellow-600/10">
                <td className="px-2 py-1 font-mono text-white whitespace-nowrap">
                  {hex(r.offset, 3)}
                  {r.length > 1 && `–${hex(r.offset + r.length - 1, 3)}`}
                </td>
                <td className="px-2 py-1 font-mono text-cool-gray whitespace-nowrap">
                  {hex(D890_ADDR.SETTINGS + r.offset, 7)}
                </td>
                <td className="px-2 py-1 text-white">
                  {r.label}
                  {r.tier !== 'placed' && r.observedChanging && (
                    <span
                      className="ml-2 text-[10px] text-yellow-400"
                      title="This byte differed across the six fingerprint codeplugs, so it is carrying something."
                    >
                      seen changing
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 font-mono text-neon-cyan">{r.vendorName ?? '—'}</td>
                <td className="px-2 py-1 text-cool-gray">{r.group ?? '—'}</td>
                <td className="px-2 py-1">
                  <span
                    className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wide border rounded ${TIER_STYLE[r.tier].className}`}
                    title={TIER_STYLE[r.tier].title}
                  >
                    {TIER_STYLE[r.tier].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const MemoryMapTable: React.FC = () => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs border-collapse">
      <thead className="border-b border-yellow-600/30">
        <tr>
          <TH className="w-[110px]">Address</TH>
          <TH className="w-[180px]">Region</TH>
          <TH className="w-[90px]">Stride/size</TH>
          <TH>Contents</TH>
          <TH className="w-[70px]">Read</TH>
          <TH className="w-[90px]">Source</TH>
        </tr>
      </thead>
      <tbody>
        {D890_MEMORY_MAP.map((r) => (
          <tr key={r.name} className="border-b border-yellow-600/10 align-top">
            <td className="px-2 py-1 font-mono text-white whitespace-nowrap">{hex(r.address, 7)}</td>
            <td className="px-2 py-1 text-neon-cyan">{r.name}</td>
            <td className="px-2 py-1 font-mono text-cool-gray whitespace-nowrap">
              {r.stride !== undefined ? `${hex(r.stride)}/rec` : r.size !== undefined ? `${r.size} B` : '—'}
            </td>
            <td className="px-2 py-1 text-cool-gray">
              {r.contents}
              {r.note && <div className="text-[11px] text-cool-gray/70 mt-0.5">{r.note}</div>}
            </td>
            <td className="px-2 py-1">
              {r.read ? (
                <span className="text-green-400">yes</span>
              ) : (
                <span
                  className="text-cool-gray"
                  title="NeonPlug does not read this during a normal codeplug read. The region dump above can capture it by address."
                >
                  no
                </span>
              )}
            </td>
            <td className="px-2 py-1">
              <Badge provenance={r.provenance} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ProtocolReference: React.FC = () => (
  <div className="space-y-4 text-xs">
    <div>
      <div className="text-yellow-400 font-semibold mb-1">Session</div>
      <table className="w-full border-collapse">
        <tbody>
          {D890_PROTOCOL_NOTES.session.map((s) => (
            <tr key={s.step} className="border-b border-yellow-600/10">
              <td className="px-2 py-1 font-mono text-white w-[110px] align-top">{s.step}</td>
              <td className="px-2 py-1 text-cool-gray">{s.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div>
      <div className="text-yellow-400 font-semibold mb-1">Frames</div>
      <table className="w-full border-collapse">
        <tbody>
          {D890_PROTOCOL_NOTES.frames.map((f) => (
            <tr key={f.name} className="border-b border-yellow-600/10 align-top">
              <td className="px-2 py-1 text-neon-cyan w-[130px]">{f.name}</td>
              <td className="px-2 py-1 font-mono text-white w-[300px]">{f.bytes}</td>
              <td className="px-2 py-1 text-cool-gray">{f.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div>
      <div className="text-yellow-400 font-semibold mb-1">Checksum</div>
      <p className="text-cool-gray">{D890_PROTOCOL_NOTES.checksum}</p>
      <p className="text-cool-gray mt-1">{D890_PROTOCOL_NOTES.checksumNote}</p>
    </div>
    <p className="text-cool-gray/70">
      Link speed {D890_PROTOCOL_NOTES.baud.toLocaleString()} baud. Writing is not implemented in
      NeonPlug and no write has ever been performed against this radio, here or in the analysis this
      is built on — the write frame is documented, not exercised.
    </p>
  </div>
);

/**
 * Decodes the currently loaded channels against the layout table.
 *
 * This is the only part that needs data. It does not re-read the radio: it
 * reports which fields the loaded codeplug actually varies, which is exactly the
 * question that decides whether a captured codeplug can confirm a field at all.
 * A field every channel agrees on cannot be correlated against anything.
 */
const FieldCoverage: React.FC = () => {
  const { channels } = useChannelsStore();
  const rows = useMemo(() => {
    const decoded = D890_CHANNEL_LAYOUT.filter((r) => r.field);
    return decoded.map((r) => {
      const values = new Set(
        channels.map((c) => JSON.stringify((c as unknown as Record<string, unknown>)[r.field!] ?? null)),
      );
      return { row: r, distinct: values.size };
    });
  }, [channels]);

  if (channels.length === 0) {
    return (
      <p className="text-xs text-cool-gray">
        No channels loaded. Read a codeplug, or import one, to see which channel fields it varies.
      </p>
    );
  }

  const constant = rows.filter((r) => r.distinct <= 1);
  return (
    <>
      <p className="text-xs text-cool-gray mb-3">
        Across {channels.length} loaded channels, {rows.length - constant.length} of {rows.length}{' '}
        decoded fields take more than one value. The rest cannot be confirmed from this codeplug at
        all — correlation needs a field to move.
      </p>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="border-b border-yellow-600/30 sticky top-0 bg-deep-gray">
            <tr>
              <TH className="w-[92px]">Offset</TH>
              <TH className="w-[160px]">NeonPlug field</TH>
              <TH className="w-[170px]">CPS column</TH>
              <TH className="w-[110px]">Distinct values</TH>
              <TH className="w-[90px]">Source</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, distinct }) => (
              <tr key={`${row.offset}-${row.bits ?? ''}-${row.field}`} className="border-b border-yellow-600/10">
                <td className="px-2 py-1 font-mono text-white whitespace-nowrap">{span(row)}</td>
                <td className="px-2 py-1 font-mono text-white">{row.field}</td>
                <td className="px-2 py-1 text-cool-gray">{row.cpsColumn ?? '—'}</td>
                <td className={`px-2 py-1 ${distinct <= 1 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {distinct}
                  {distinct <= 1 && <span className="text-cool-gray"> — constant</span>}
                </td>
                <td className="px-2 py-1">
                  <Badge provenance={row.provenance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export const RecordLayoutPanel: React.FC = () => {
  const { caps } = useRadioCapabilities();
  // Same capability the region dump uses: this is the reference material for a
  // sparse address-addressed radio, and the clone radios have their own panels.
  if (!caps?.supportsRawRegionDump) return null;

  const decoded = D890_CHANNEL_LAYOUT.filter((r) => r.field).length;
  const fromHardware = D890_CHANNEL_LAYOUT.filter((r) => r.provenance === 'hardware').length;

  return (
    <div className="space-y-4 mb-6">
      <CollapsibleSection title="Memory map" defaultOpen>
        <p className="text-xs text-cool-gray mb-3">
          Every region of the address space this driver has a name for, including the ones it does
          not read — the region dump above can capture any of them by address.
        </p>
        <MemoryMapTable />
      </CollapsibleSection>

      <CollapsibleSection title={`Channel record (0x80 bytes · ${decoded} fields decoded · ${fromHardware} confirmed on hardware)`}>
        <p className="text-xs text-cool-gray mb-3">
          The vendor CPS’s writer and reader touch exactly the same 54 offsets, which is what makes
          this map checkable without a radio. Hover a row for its caveats.
        </p>
        <LayoutTable rows={D890_CHANNEL_LAYOUT} />
      </CollapsibleSection>

      <CollapsibleSection title="Scan-list record (0x200 bytes, 0x98 used)">
        <LayoutTable rows={D890_SCAN_LIST_LAYOUT} />
      </CollapsibleSection>

      <CollapsibleSection title="Settings region">
        <SettingsMapTable />
      </CollapsibleSection>

      <CollapsibleSection title="Field coverage in the loaded codeplug">
        <FieldCoverage />
      </CollapsibleSection>

      <CollapsibleSection title="Serial protocol">
        <ProtocolReference />
      </CollapsibleSection>
    </div>
  );
};
