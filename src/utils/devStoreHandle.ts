/**
 * A console handle on the stores, in DEV BUILDS ONLY.
 *
 * This exists because of a specific, recurring problem: almost everything
 * interesting in this app is gated on having read a radio. The Settings tab
 * renders nothing without `radioInfo`, and every DA-7X2 table area returns null
 * until its table is in the store. So a UI change to any of them cannot be
 * looked at — by a person or by an agent driving a browser — without either a
 * radio on the desk or a way to put state in by hand.
 *
 * That gap has a cost beyond convenience. The hardware round-trip protocol says
 * "change exactly one thing, write, read back NEXT session", and reading mid-
 * write reboots the radio, so radio time is expensive and serial. Anything that
 * can be settled at the bench before plugging in should be.
 *
 * ⚠️ Guarded by `import.meta.env.DEV`, so it is absent from `npm run build` and
 * from the single-file offline build. It is a debugging affordance, not an API:
 * nothing in `src/` may import it or depend on `window.neonplug` existing.
 *
 * Usage, from the browser console:
 *
 *   neonplug.radio.setState({ radioInfo: { model: 'DA-7X2' } })
 *   neonplug.radio.setState((s) => ({ tables: { ...s.tables, statusMessages: [] } }))
 *   neonplug.radio.getState().tables
 */

import { useRadioStore } from '../store/radioStore';
import { useRadioSettingsStore } from '../store/radioSettingsStore';
import { useChannelsStore } from '../store/channelsStore';
import { useZonesStore } from '../store/zonesStore';
import { useQuickMessagesStore } from '../store/quickMessagesStore';
import { useScanListsStore } from '../store/scanListsStore';
import { useDMRRadioIDsStore } from '../store/dmrRadioIdsStore';

export function installDevStoreHandle(): void {
  if (!import.meta.env.DEV) return;
  (window as unknown as { neonplug?: unknown }).neonplug = {
    radio: useRadioStore,
    settings: useRadioSettingsStore,
    channels: useChannelsStore,
    zones: useZonesStore,
    quickMessages: useQuickMessagesStore,
    scanLists: useScanListsStore,
    radioIds: useDMRRadioIDsStore,
  };
  console.log('[NeonPlug] dev store handle at window.neonplug (dev builds only)');
}
