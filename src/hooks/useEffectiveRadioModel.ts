import { useRadioStore } from '../store/radioStore';

/**
 * Returns the effective radio model for UI: device model when known (from read),
 * otherwise the model selected in the pick-a-radio modal.
 * Use this so tabs, settings, and Channel Wizard reflect the current/converted radio.
 */
export function useEffectiveRadioModel(): string | null {
  const { radioInfo, selectedRadioModel } = useRadioStore();
  return radioInfo?.model ?? selectedRadioModel ?? null;
}
