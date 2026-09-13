/**
 * What the DA-7X2 reports about itself, on the Settings device card.
 *
 * The card showed three values that were not what their rows said: Firmware
 * "V100" (the identify reply's PROTOCOL version — it stayed V100 across a
 * firmware update), Radio Version "IDMR-7X2" (the radio's model string) and
 * Codeplug Version "read=240B" (the negotiated frame size). The radio exposes no
 * firmware, radio or codeplug version over this protocol and the vendor CPS
 * shows none, so neither does NeonPlug. The two diagnostics are in the connect
 * log instead.
 */

import { describe, it, expect } from 'vitest';
import { D890UVProtocol } from '../../src/radios/d890uv/protocol';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';

async function radioInfo() {
  const protocol = new D890UVProtocol();
  // getRadioInfo answers for a connected radio only, but nothing it returns
  // comes from the session, so a stand-in connection is enough.
  Object.assign(protocol, { connection: {} });
  return protocol.getRadioInfo();
}

describe('DA-7X2 radio info', () => {
  it('reports no firmware version: V100 is the protocol version', async () => {
    expect((await radioInfo()).firmware).toBe('');
  });

  it('reports no radio, DSP or codeplug version, and no build date', async () => {
    const info = await radioInfo();
    expect(info.radioVersion).toBeUndefined();
    expect(info.dspVersion).toBeUndefined();
    expect(info.codeplugVersion).toBeUndefined();
    expect(info.buildDate).toBe('');
  });

  it('still reports a model that resolves, and the contact capacity', async () => {
    const info = await radioInfo();
    expect(getCapabilitiesForModel(info.model)).toBeTruthy();
    expect(info.maxContacts).toBe(500000);
  });

  it('refuses to answer for a radio that is not connected', async () => {
    await expect(new D890UVProtocol().getRadioInfo()).rejects.toThrow('Not connected');
  });
});
