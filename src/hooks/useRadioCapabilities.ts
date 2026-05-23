import { useMemo } from 'react';
import { useEffectiveRadioModel } from './useEffectiveRadioModel';
import { getCapabilitiesForModel } from '../radios/capabilities';
import type { RadioCapabilities } from '../types/radioCapabilities';

export function useRadioCapabilities(): { caps: RadioCapabilities | null; model: string | null } {
  const model = useEffectiveRadioModel();
  const caps = useMemo(() => getCapabilitiesForModel(model), [model]);
  return { caps, model };
}
