import { describe, it, expect } from 'vitest';
import { firmwareWarning } from '../../src/utils/firmware';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';

const dm32 = getCapabilitiesForModel('DM-32UV');

describe('the DM-32 firmware warning', () => {
  it('stays quiet on the known-good firmware', () => {
    expect(firmwareWarning(dm32, 'DM32.01.L01.048')).toEqual({ isNewerFirmware: false, needsFirmwareUpdate: false });
  });

  it('stays quiet on the Taiwan 50k build, though it is numbered 049', () => {
    expect(firmwareWarning(dm32, 'DM32.NRF.01.049')).toEqual({ isNewerFirmware: false, needsFirmwareUpdate: false });
  });

  it('still warns about other 049-and-newer firmware, and older firmware', () => {
    expect(firmwareWarning(dm32, 'DM32.01.01.049').isNewerFirmware).toBe(true);
    expect(firmwareWarning(dm32, 'DM32.01.01.046').needsFirmwareUpdate).toBe(true);
  });

  it('says nothing without a firmware string, or for a radio with no opinion', () => {
    expect(firmwareWarning(dm32, '-')).toEqual({ isNewerFirmware: false, needsFirmwareUpdate: false });
    expect(firmwareWarning(getCapabilitiesForModel('UV5R-Mini'), 'anything')).toEqual({ isNewerFirmware: false, needsFirmwareUpdate: false });
  });
});
