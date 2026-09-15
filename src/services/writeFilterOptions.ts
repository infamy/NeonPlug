/**
 * The write filter's options for the radio a write runs as, read from the stores
 * the way the write reads them. The write and its confirmation both come here,
 * so the confirmation lists exactly what the write leaves out, and the channel
 * grid marks channels by the same rule (hooks/useChannelWriteRule.ts).
 */

import { getCapabilitiesForModel } from '../radios/capabilities';
import { D890_MODEL_IDS } from '../radios/d890uv/constants';
import { useOutOfBandStore } from '../store/outOfBandStore';
import { useRadioStore } from '../store/radioStore';
import type { RadioCapabilities } from '../types/radioCapabilities';
import type { WriteFilterOptions } from './validation/writeFilter';

/** The options for one radio, given whether the hidden out-of-band switch is on for it. */
export function writeFilterOptionsFor(
  model: string | null,
  caps: RadioCapabilities | null | undefined,
  outOfBand: boolean
): WriteFilterOptions {
  return {
    // ⚠️ NOT applied to the DA-7X2.
    //
    // On that radio the presence mask is computed from the channels this
    // write plans, so a channel filtered out here is a channel DELETED from
    // the radio — silently, behind a console.warn. And the filter fires on
    // exactly the channels a real DA-7X2 carries: one was read from hardware
    // with an airband entry at 118 MHz and an FM broadcast entry at 98.5 MHz
    // sitting in the main list. Filtering them would have wiped both.
    //
    // `planChannelWrite` does this check properly instead: it refuses loudly,
    // and only for a channel whose TX frequency was CHANGED to something out
    // of band. One already on the radio is left alone.
    filterBand: !(model != null && (D890_MODEL_IDS as readonly string[]).includes(model)),
    bandLimits: caps?.bandLimits,
    blankTxAnyBand: caps?.blankTxAnyBand,
    outOfBand,
  };
}

export function currentWriteFilterOptions(): WriteFilterOptions {
  const { radioInfo, selectedRadioModel } = useRadioStore.getState();
  const model = radioInfo?.model ?? selectedRadioModel ?? null;
  const caps = getCapabilitiesForModel(model);
  // The hidden out-of-band switch in About, on a radio that allows it (the DM-32 for now).
  const outOfBand =
    caps?.supportsOutOfBandFrequencies === true && useOutOfBandStore.getState().allowOutOfBandFrequencies;
  return writeFilterOptionsFor(model, caps, outOfBand);
}
