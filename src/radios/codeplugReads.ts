/**
 * The optional reads that make up a codeplug, declared in the order the radio
 * is asked for them.
 *
 * This replaced thirteen hand-written blocks in `useRadioConnection`. Each was
 * the same shape — check the protocol has the method, call it, put the result
 * somewhere, warn and record the section name on failure — and each new table
 * meant editing the hook again. The hook now iterates this array and no longer
 * names a single table.
 *
 * **Order is significant and is the array order.** Not because the radio is
 * known to care — it is addressed by absolute region and probably does not —
 * but because nothing here can be verified without hardware, so the sequence
 * that has been seen working is the sequence that ships. Zone A/B is genuinely
 * last: it is indexed by hardware zone slot and is only meaningful once the
 * zones themselves have been read.
 *
 * Adding a table is one entry here plus a field on `RadioTables`. It used to be
 * an edit in seven files.
 */

import { alignZoneCurrentChannels } from './d890uv/structures';
import type { OptionalDigitalReads } from './optionalReads';
import type { RadioTables, RadioTableId } from '../types/radioTables';
import type { EncryptionKey } from '../models/EncryptionKey';
import type { QuickTextMessage } from '../models/QuickTextMessage';
import type { RXGroup } from '../models/RXGroup';
import type { QuickContact } from '../models/QuickContact';

/**
 * Where a read's result goes.
 *
 * Declared structurally rather than imported from the store, so `radios/` does
 * not depend on `store/`. The hook passes its own setters in.
 */
export interface CodeplugReadSinks {
  setTable<K extends RadioTableId>(id: K, value: RadioTables[K] | null): void;
  setEncryptionKeys(keys: EncryptionKey[]): void;
  setMessages(messages: QuickTextMessage[]): void;
  setMessagesLoaded(loaded: boolean): void;
  setRXGroups(groups: RXGroup[]): void;
  setQuickContacts(contacts: QuickContact[]): void;
}

export interface CodeplugRead {
  /**
   * Section name. Shown to the user in the completion message when this read
   * fails, so it reads as a thing the radio holds, not a method name.
   */
  label: string;
  /**
   * Returns the work to do, or null when this radio does not implement the
   * read — which is normal and silent, not a failure.
   *
   * Methods must be called on `proto`, not detached: they are class methods
   * that use `this`, so a bare reference typechecks and fails at runtime.
   */
  plan(
    proto: Partial<OptionalDigitalReads>
  ): ((sinks: CodeplugReadSinks) => Promise<void>) | null;
}

/**
 * A read that simply stores its result under a table id — the common case.
 */
function table<K extends RadioTableId>(
  id: K,
  label: string,
  read: (proto: Partial<OptionalDigitalReads>) => (() => Promise<RadioTables[K]>) | null
): CodeplugRead {
  return {
    label,
    plan: (proto) => {
      const run = read(proto);
      return run ? async (sinks) => sinks.setTable(id, await run()) : null;
    },
  };
}

export const CODEPLUG_READS: CodeplugRead[] = [
  {
    label: 'RX Groups',
    plan: (p) => (p.readRXGroups ? async (s) => s.setRXGroups(await p.readRXGroups!()) : null),
  },
  {
    label: 'Talk Groups',
    plan: (p) =>
      p.readQuickContacts ? async (s) => s.setQuickContacts(await p.readQuickContacts!()) : null,
  },
  {
    label: 'Encryption keys',
    plan: (p) =>
      p.readEncryptionKeys ? async (s) => s.setEncryptionKeys(await p.readEncryptionKeys!()) : null,
  },

  // Roaming is only meaningful as a pair, so it is gated on both halves being
  // present and recorded as a single section.
  table('roaming', 'Roaming', (p) =>
    p.readRoamingChannels && p.readRoamingZones
      ? async () => ({ channels: await p.readRoamingChannels!(), zones: await p.readRoamingZones!() })
      : null
  ),

  {
    label: 'Pre-defined SMS',
    plan: (p) =>
      p.readQuickMessages
        ? async (s) => {
            s.setMessages(await p.readQuickMessages!());
            s.setMessagesLoaded(true);
          }
        : null,
  },

  // Satellites are NOT here on purpose. The table is 12,800 bytes — about 1.3 s
  // on a ~10 KB/s link — for something most users never open, and the vendor
  // CPS does not read it with a codeplug either: it sits behind its Tools menu,
  // which is why it never appears in a CPS codeplug capture. Read on demand
  // from the Satellites area instead, like the pictures.
  table('emergencyAlarm', 'Emergency', (p) => p.readEmergency?.bind(p) ?? null),

  // AM and FM are separate tables from the channel list and from each other.
  // Read together so a radio with only one of them populated still shows the
  // one it has rather than nothing.
  table('broadcast', 'AM/FM broadcast', (p) =>
    p.readBroadcastChannels
      ? async () => ({
          am: await p.readBroadcastChannels!('am'),
          fm: await p.readBroadcastChannels!('fm'),
          amVfo: p.readAmVfo ? await p.readAmVfo() : null,
          fmVfo: p.readFmVfo ? await p.readFmVfo() : null,
        })
      : null
  ),

  table('powerOnDisplay', 'Power-on display', (p) => p.readPowerOnDisplay?.bind(p) ?? null),
  table('toneLists', '2-Tone / 5-Tone', (p) => p.readTones?.bind(p) ?? null),
  table('amZones', 'AM zones', (p) => p.readAmZones?.bind(p) ?? null),
  table('gpsRoaming', 'GPS roaming', (p) => p.readGpsRoaming?.bind(p) ?? null),
  table('masterRadioId', 'Master radio ID', (p) => p.readMasterRadioId?.bind(p) ?? null),
  table('autoRepeaterOffsets', 'Auto-repeater offsets',
    (p) => p.readAutoRepeaterOffsets?.bind(p) ?? null),

  // Last deliberately: the radio's table is indexed by hardware zone SLOT, and
  // the zones array has empty slots dropped. Aligning them needs the zones to
  // have been read already.
  table('zoneCurrentChannels', 'Zone A/B channels', (p) =>
    p.readZoneCurrentChannels
      ? async () => {
          const raw = await p.readZoneCurrentChannels!();
          const slots = p.rawZoneIndices;
          return slots && slots.length > 0 ? alignZoneCurrentChannels(raw, slots) : raw;
        }
      : null
  ),
];
