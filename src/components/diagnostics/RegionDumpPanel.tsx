import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { Button } from '../ui/Button';
import { HexDump } from './HexDump';
import { D890ImagePreview } from './D890ImagePreview';
import { D890_IMAGE, type D890ImageKind } from '../../radios/d890uv/bootImage';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { createProtocolForModel } from '../../radios';
import { D890_ADDR, D890_LIMITS } from '../../radios/d890uv/constants';
import { D890UVProtocol } from '../../radios/d890uv/protocol';

/**
 * Raw memory region dump, for radios that address memory sparsely rather than
 * exposing whole clone blocks (currently the D890UV family).
 *
 * This exists to capture test fixtures. Every layout in the D890 driver is
 * transcribed from documentation and unverified, and the only way to close that
 * gap is to dump real bytes and snapshot-test the parsers against them — the
 * same Layer-2 approach planned for the DM-32.
 *
 * It owns its own connect/read/disconnect cycle because no other diagnostics
 * panel does live I/O; they all read from the store, which this radio never
 * populates. Disconnect runs in a finally block: leaving the port open and
 * locked makes the next port.open() throw.
 */

interface RegionChoice {
  key: string;
  label: string;
  address: number;
  length: number;
  note?: string;
}

/**
 * Small, safe spans by default. The channel and talkgroup *data* regions are
 * megabytes and would take a long time at 16-byte write framing / negotiated
 * read sizes, so the presets cover the masks and a first record of each type —
 * enough to verify every layout assumption.
 */
const REGIONS: RegionChoice[] = [
  {
    key: 'local-info',
    label: 'LocalInfo (device block)',
    address: D890_ADDR.LOCAL_INFO,
    length: D890_ADDR.LOCAL_INFO_SIZE,
    note: 'Also the read-size negotiation probe target.',
  },
  {
    key: 'channel-set',
    label: 'Channel occupancy mask',
    address: D890_ADDR.CHANNEL_SET,
    length: D890_ADDR.CHANNEL_SET_SIZE,
    note: 'Set bit = channel present.',
  },
  {
    key: 'channel-0',
    label: 'Channel 1 (both 0x40 halves)',
    address: D890_ADDR.CHANNEL_DATA,
    length: D890_ADDR.CHANNEL_STRIDE,
    note: 'Verify name at 0x44 and frequency at 0x00.',
  },
  {
    key: 'channel-128',
    label: 'Channel 129 (block-stride check)',
    address: D890_ADDR.CHANNEL_DATA + D890_ADDR.CHANNEL_BLOCK_STRIDE,
    length: D890_ADDR.CHANNEL_STRIDE,
    note: 'Should be channel 129, not 129 * 0x80. Confirms the block stride.',
  },
  {
    key: 'zone-set',
    label: 'Zone occupancy mask',
    address: D890_ADDR.ZONE_SET,
    length: D890_ADDR.ZONE_SET_SIZE,
    note: `${D890_ADDR.ZONE_SET_SIZE * 8} bits — confirms the 250-zone cap.`,
  },
  {
    key: 'zone-names',
    label: 'Zone names (first 8)',
    address: D890_ADDR.ZONE_NAMES,
    length: D890_ADDR.ZONE_NAME_STRIDE * 8,
    note: 'Settles wide-char endianness: expect 5A 00, not 00 5A.',
  },
  {
    key: 'zone-0-channels',
    label: 'Zone 1 membership',
    address: D890_ADDR.ZONE_CHANNELS,
    length: D890_ADDR.ZONE_CHANNELS_STRIDE,
  },
  {
    key: 'scanlist-set',
    label: 'Scan list occupancy mask',
    address: D890_ADDR.SCAN_LIST_SET,
    length: D890_ADDR.SCAN_LIST_SET_SIZE,
  },
  {
    key: 'scanlist-0',
    label: 'Scan list 1',
    address: D890_ADDR.SCAN_LIST_DATA,
    length: D890_ADDR.SCAN_LIST_STRIDE,
  },
  {
    key: 'talkgroup-set',
    label: 'Talkgroup mask (first 256 bytes)',
    address: D890_ADDR.TALKGROUP_SET,
    length: 0x100,
    note: 'INVERTED: set bit = empty. With 3 TGs expect 0xf8, not 0x07.',
  },
  {
    key: 'talkgroup-0',
    label: 'Talkgroup 1',
    address: D890_ADDR.TALKGROUP_DATA,
    length: D890_ADDR.TALKGROUP_STRIDE,
  },
  {
    key: 'rxgroup-set',
    label: 'RX group occupancy mask',
    address: D890_ADDR.RX_GROUP_SET,
    length: D890_ADDR.RX_GROUP_SET_SIZE,
  },
  {
    key: 'rxgroup-0',
    label: 'RX group 1',
    address: D890_ADDR.RX_GROUP_DATA,
    length: D890_ADDR.RX_GROUP_STRIDE,
  },
  {
    key: 'radio-ids',
    label: 'Radio ID records (first 4)',
    address: D890_ADDR.RADIO_ID_DATA,
    length: D890_ADDR.RADIO_ID_STRIDE * 4,
  },
  // Located by dumping the radio 2026-08-30, at addresses the RE bundle named
  // but could not resolve. Presets rather than hand-typed addresses because
  // typing one wrong and re-reading a stale dump is exactly how a region gets
  // "confirmed" at the wrong place.
  {
    key: 'roaming-channel-set',
    label: 'Roaming channel mask',
    address: D890_ADDR.ROAMING_CHANNEL_SET,
    length: D890_ADDR.ROAMING_CHANNEL_SET_SIZE,
    note: 'One bit per roaming channel. NOT the per-zone roam mask at 0x4c00000.',
  },
  {
    key: 'roaming-channel',
    label: 'Roaming channel 1',
    address: D890_ADDR.ROAMING_CHANNEL_DATA,
    length: D890_ADDR.ROAMING_CHANNEL_STRIDE,
    note: 'RX/TX as BCD u32, then colour code and slot, then a UTF-16LE name.',
  },
  {
    key: 'roaming-zone',
    label: 'Roaming zone 1',
    address: D890_ADDR.ROAMING_ZONE_DATA,
    length: D890_ADDR.ROAMING_ZONE_STRIDE,
    note: 'One-byte members at +0x00 indexing the roaming-channel table; name at +0x40.',
  },
  {
    key: 'boot-image',
    label: 'Boot',
    address: D890_ADDR.BOOT_IMAGE,
    length: D890_IMAGE.BYTES,
    note: 'Decoded and shown below. 40 KB, so this read takes a moment.',
  },
  {
    key: 'bk1-image',
    label: 'Standby Background',
    address: D890_ADDR.STANDBY_BK1,
    length: D890_IMAGE.BYTES,
    note: 'Same format as the boot image.',
  },
  {
    key: 'bk2-image',
    label: 'Standby Background Alternate',
    address: D890_ADDR.STANDBY_BK2,
    length: D890_IMAGE.BYTES,
    note: 'Same format as the boot image.',
  },
  {
    key: 'aprs',
    label: 'APRS settings',
    address: D890_ADDR.APRS_SETTINGS,
    length: D890_ADDR.APRS_SETTINGS_SIZE,
    note: 'Callsigns, digipeater path and symbol pair are visible as plain text.',
  },
];

/**
 * Which presets decode to a picture. Keyed off the preset rather than the
 * address so a custom dump of the same address does not silently claim to be an
 * image when the user asked for a partial span.
 */
const IMAGE_REGIONS: Record<string, D890ImageKind> = {
  'boot-image': 'boot',
  'bk1-image': 'bk1',
  'bk2-image': 'bk2',
};

const MAX_CUSTOM_LENGTH = 0x4000; // 16 KB — keeps an accidental typo from hanging the UI

interface RegionDumpPanelProps {
  showAlert: (message: string, title?: string) => void;
}

export const RegionDumpPanel: React.FC<RegionDumpPanelProps> = ({ showAlert }) => {
  const { caps, model } = useRadioCapabilities();
  const [selected, setSelected] = useState<string>(REGIONS[0].key);
  const [customAddress, setCustomAddress] = useState('');
  const [customLength, setCustomLength] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [result, setResult] = useState<{ address: number; data: Uint8Array; regionKey: string } | null>(null);

  // Capability-gated, never model-string-gated (golden rule #3).
  if (!caps?.supportsRawRegionDump) return null;

  const region = REGIONS.find((r) => r.key === selected) ?? REGIONS[0];

  const resolveTarget = (): { address: number; length: number } | null => {
    if (selected !== 'custom') return { address: region.address, length: region.length };

    const address = parseInt(customAddress.replace(/^0x/i, ''), 16);
    const length = parseInt(customLength.replace(/^0x/i, ''), 16);
    if (!Number.isFinite(address) || !Number.isFinite(length)) {
      showAlert('Enter the address and length as hex, e.g. 3482a00 and 200.', 'Region dump');
      return null;
    }
    if (length <= 0 || length > MAX_CUSTOM_LENGTH) {
      showAlert(`Length must be between 1 and 0x${MAX_CUSTOM_LENGTH.toString(16)} bytes.`, 'Region dump');
      return null;
    }
    if (length % 0x10 !== 0) {
      showAlert('Length must be a multiple of 16 — the radio requires aligned spans.', 'Region dump');
      return null;
    }
    return { address, length };
  };

  const handleDump = async () => {
    const target = resolveTarget();
    if (!target) return;

    const protocol = createProtocolForModel(model ?? '');
    if (!(protocol instanceof D890UVProtocol)) {
      showAlert('Raw region dump is only available for the DA-7X2 / D890UV family.', 'Region dump');
      return;
    }

    setBusy(true);
    setProgress('Connecting…');
    setResult(null);
    try {
      await protocol.connect();
      setProgress(`Reading 0x${target.length.toString(16)} bytes…`);
      const data = await protocol.readRawRegion(target.address, target.length, (read, total) => {
        setProgress(`Reading ${read}/${total} bytes…`);
      });
      setResult({ address: target.address, data, regionKey: selected });
      setProgress('');
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Region dump failed', 'Region dump');
      setProgress('');
    } finally {
      // Always disconnect: a port left open and locked makes the next
      // port.open() throw, which looks like a hardware fault.
      try {
        await protocol.disconnect();
      } catch {
        /* already closed */
      }
      setBusy(false);
    }
  };

  return (
    <Card className="!border-yellow-600/30 mb-6">
      <SectionTitle>Raw region dump</SectionTitle>
      <p className="text-cool-gray text-sm mb-1">
        Reads memory by address and shows the bytes exactly as the radio sent them.
      </p>
      <p className="text-xs text-muted mb-4">
        Every layout in this driver is transcribed from documentation and{' '}
        <span className="text-yellow-400">not verified on hardware</span>. Dump these
        regions, save them as fixtures, and snapshot-test the parsers against them. This
        panel only reads — it never writes.
      </p>

      <div className="flex flex-col gap-3">
        <label className="text-sm text-cool-gray">
          Region
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
            className="mt-1 w-full bg-black border border-panel rounded px-2 py-1 text-neon-cyan text-sm"
          >
            {REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label} — 0x{r.address.toString(16)} ({r.length} B)
              </option>
            ))}
            <option value="custom">Custom address…</option>
          </select>
        </label>

        {selected === 'custom' ? (
          <div className="flex gap-3">
            <label className="text-sm text-cool-gray flex-1">
              Address (hex)
              <input
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                placeholder="3482a00"
                disabled={busy}
                className="mt-1 w-full bg-black border border-panel rounded px-2 py-1 text-neon-cyan text-sm font-mono"
              />
            </label>
            <label className="text-sm text-cool-gray flex-1">
              Length (hex, multiple of 16)
              <input
                value={customLength}
                onChange={(e) => setCustomLength(e.target.value)}
                placeholder="200"
                disabled={busy}
                className="mt-1 w-full bg-black border border-panel rounded px-2 py-1 text-neon-cyan text-sm font-mono"
              />
            </label>
          </div>
        ) : (
          region.note && <p className="text-xs text-muted">{region.note}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleDump} disabled={busy} variant="primary">
            {busy ? 'Reading…' : 'Connect and dump'}
          </Button>
          {progress && <span className="text-xs text-neon-cyan font-mono">{progress}</span>}
        </div>
      </div>

      {result && (
        <div className="mt-4">
          <p className="text-xs text-muted mb-2 font-mono">
            0x{result.address.toString(16)} — {result.data.length} bytes
          </p>
          {IMAGE_REGIONS[result.regionKey] && (
            <D890ImagePreview
              kind={IMAGE_REGIONS[result.regionKey]}
              data={result.data}
            />
          )}
          {/* downloadName gives the Hex/Bin download buttons; the filename encodes
              the address so a saved fixture is self-describing. */}
          <HexDump
            data={result.data}
            idPrefix={`d890-dump-${result.address.toString(16)}`}
            downloadName={`d890uv-0x${result.address.toString(16)}-${result.data.length}b`}
            withOffsetJump
            scrollable
          />
        </div>
      )}

      <p className="text-xs text-muted mt-4">
        Max channels {D890_LIMITS.CHANNELS_MAX}, zones {D890_LIMITS.ZONES_MAX}, talkgroups{' '}
        {D890_LIMITS.TALK_GROUPS_MAX} — all documented, none confirmed.
      </p>
    </Card>
  );
};
