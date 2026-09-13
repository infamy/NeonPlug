import { describe, it, expect } from 'vitest';
import { BaseAnalogProtocol } from '../../src/radios/shared/BaseProtocols';
import { D890UVProtocol } from '../../src/radios/d890uv/protocol';
import { DM32UVProtocol } from '../../src/radios/dm32uv/protocol';
import { UV5RMiniProtocol } from '../../src/radios/uv5rmini/protocol';
import { FT65Protocol } from '../../src/radios/ft65/protocol';
import type { RadioSettings } from '../../src/models/RadioSettings';

/**
 * A settings write must never SILENTLY do nothing.
 *
 * `BaseAnalogProtocol.writeRadioSettings` was an empty no-op until 2026-09-02.
 * `useRadioConnection` calls it and then runs `clearChanges()`, so on the one
 * radio that never overrode it — the DA-7X2 — every settings edit was discarded
 * while the UI reported success and advanced the baseline. Write-path invariant
 * #2 in CLAUDE.md exists for exactly this, and a no-op base is what hid it.
 *
 * The contract now: implement the method, or declare
 * `settingsWriteUnsupported` so the hook can refuse before sending any bytes.
 * Doing neither throws.
 */
describe('settings writes cannot silently succeed', () => {
  class Silent extends BaseAnalogProtocol {}

  it('the base throws rather than resolving as a no-op', async () => {
    await expect(
      new Silent().writeRadioSettings({} as RadioSettings)
    ).rejects.toThrow(/must either implement/i);
  });

  it('the DA-7X2 buffers settings into the codeplug write', () => {
    // Not a direct write: the settings region is a read-modify-write and the
    // original bytes live in the staged read log, which only writeCodeplug has.
    // The hook depends on this flag to call writeRadioSettings BEFORE the write
    // and to clear the change flags only after it.
    const p = new D890UVProtocol();
    expect(p.bufferedSettingsWrite).toBe(true);
    expect(p.settingsWriteUnsupported).toBeUndefined();
  });

  it('stages numbers and coerces checkbox booleans', async () => {
    // The Settings profile renders any field with max <= 1 as a checkbox, so
    // two real fields arrive as booleans — and encodeD890Settings skips
    // anything that is not a number. Silently dropping them would be the same
    // bug as the no-op this replaced.
    const p = new D890UVProtocol();
    await p.writeRadioSettings(
      { radioSpecific: { dateDisplayFormat: true, squelchLevelA: 3 } } as never,
      { changedFields: ['radioSpecific.dateDisplayFormat'] }
    );
    const staged = (p as unknown as { stagedSettings: Record<string, number> }).stagedSettings;
    expect(staged.dateDisplayFormat).toBe(1);
    expect(staged.squelchLevelA).toBe(3);
  });

  it('refuses APRS fields rather than dropping them', async () => {
    // aprsToRadioSpecific folds APRS into the settings list on READ and has no
    // inverse, so there is nothing to encode from. Passing them through would
    // let the encoder ignore them while the UI reported success.
    await expect(
      new D890UVProtocol().writeRadioSettings(
        { radioSpecific: { aprsSourceCall: 'N0CALL' } } as never,
        { changedFields: ['radioSpecific.aprsSourceCall'] }
      )
    ).rejects.toThrow(/APRS settings cannot be written/i);
  });

  it('every radio either implements the write or declares it unsupported', () => {
    const protocols = [
      new D890UVProtocol(),
      new DM32UVProtocol(),
      new UV5RMiniProtocol(),
      new FT65Protocol(),
    ];
    for (const p of protocols) {
      const overrides =
        p.writeRadioSettings !== BaseAnalogProtocol.prototype.writeRadioSettings;
      expect(
        overrides || p.settingsWriteUnsupported === true,
        `${p.constructor.name} neither implements writeRadioSettings nor declares settingsWriteUnsupported`
      ).toBe(true);
    }
  });
});
