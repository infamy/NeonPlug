import { describe, it, expect } from 'vitest';
import { createProtocolForModel, getRadioPickerOptions } from '../../src/radios';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';
import { DM3xRadio } from '../../src/radios/dm3x/protocol';
import { DM36_MODEL_ID } from '../../src/radios/dm3x/descriptor';

describe('DM-36', () => {
  it('is its own picker entry, marked alpha, beside the DM-32UV', () => {
    const options = getRadioPickerOptions();
    const dm32 = options.find((o) => o.modelId === 'DM-32UV');
    const dm36 = options.find((o) => o.modelId === DM36_MODEL_ID);
    expect(dm32?.status).toBeUndefined();
    expect(dm36).toMatchObject({ label: 'DM-36', group: 'Baofeng', status: 'alpha' });
  });

  it('runs the DM-3x driver', () => {
    expect(createProtocolForModel(DM36_MODEL_ID)).toBeInstanceOf(DM3xRadio);
  });

  it('carries no DM-32 firmware opinions', () => {
    const caps = getCapabilitiesForModel(DM36_MODEL_ID);
    expect(caps.expectedFirmware).toBeUndefined();
    expect(caps.supportedFirmware).toBeUndefined();
    expect(caps.isFirmware049OrNewer).toBeUndefined();
    expect(caps.supportsZones).toBe(true);
    expect(getCapabilitiesForModel('DM-32UV').expectedFirmware).toBe('DM32.01.L01.048');
  });
});
