/**
 * Only a radio whose reads were measured at full speed in a hidden tab drops
 * the read popup's "keep this tab in the foreground" note.
 *
 * Chrome throttles timers in a background tab to about one a second. The shared
 * serial read stopped sleeping on one (839d3ee) and a DA-7X2 read measured
 * 3.58 s hidden against 3.51 s in front (4cdf9d4). Radios whose read path still
 * sleeps on a timer must keep the note.
 */

import { describe, it, expect } from 'vitest';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';

describe('readsSurviveBackgroundTab', () => {
  it('is set for the DA-7X2 family, where it was measured', () => {
    for (const model of ['DA-7X2', 'DA-7XR', 'AT-D890UV']) {
      expect(getCapabilitiesForModel(model)?.readsSurviveBackgroundTab, model).toBe(true);
    }
  });

  it('is not set where the read still sleeps on a timer', () => {
    // DM-32: 150 ms between blocks. UV5R-Mini: delays between BLE chunks.
    for (const model of ['DM-32UV', 'DP570UV', 'UV5R-Mini']) {
      expect(getCapabilitiesForModel(model)?.readsSurviveBackgroundTab, model).toBeFalsy();
    }
  });
});
