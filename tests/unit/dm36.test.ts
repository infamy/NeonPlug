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

describe('telling a DM-36 from a DM-32', () => {
  it('cannot use PSEARCH: both accept the DP570UV answer', async () => {
    const { DM32_VARIANT, DM36_VARIANT } = await import('../../src/radios/dm3x/protocol');
    expect(DM32_VARIANT.psearchNames.some((n) => 'DP570UV'.includes(n))).toBe(true);
    expect(DM36_VARIANT.psearchNames.some((n) => 'DP570UV'.includes(n))).toBe(true);
  });

  it('goes by the firmware string, so each entry refuses the other radio', async () => {
    const { DM32_VARIANT, DM36_VARIANT } = await import('../../src/radios/dm3x/protocol');
    // Firmware strings read from real radios.
    for (const fw of ['DM32.01.L01.048', 'DM32.NRF.01.049', 'DM32.01.01.046']) {
      expect(DM32_VARIANT.ownsFirmware(fw)).toBe(true);
      expect(DM36_VARIANT.ownsFirmware(fw)).toBe(false);
    }
    expect(DM36_VARIANT.ownsFirmware('DM36.NRFB.01.020')).toBe(true);
    expect(DM32_VARIANT.ownsFirmware('DM36.NRFB.01.020')).toBe(false);
  });
});
