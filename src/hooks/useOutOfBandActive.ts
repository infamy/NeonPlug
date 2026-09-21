import { useRadioCapabilities } from './useRadioCapabilities';
import { useOutOfBandStore } from '../store/outOfBandStore';

/** True while the hidden out-of-band switch is on and the current radio allows it (the DM-32 for now). */
export function useOutOfBandActive(): boolean {
  const { caps } = useRadioCapabilities();
  const allow = useOutOfBandStore((s) => s.allowOutOfBandFrequencies);
  return allow && caps?.supportsOutOfBandFrequencies === true;
}
