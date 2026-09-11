/**
 * The write confirmation must describe the write it authorises.
 *
 * Settings reach a D890 plan by being STAGED on the protocol before planning —
 * `bufferedSettingsWrite` is true, so the settings bytes ride out inside the
 * codeplug rather than in a write of their own. The write path staged them;
 * `previewChannelWrite` did not. On 2026-09-11 the panel therefore offered 41
 * bytes for a 43-byte plan, and the guard comparing the two aborted a write the
 * user had already approved.
 *
 * `stageSettings` is the sync half both paths now call. These tests pin that it
 * actually changes the plan (so the preview's call has the effect the panel
 * needs), that the async `writeRadioSettings` stages identically (so the two
 * cannot drift apart again), and that the APRS refusal still fires through the
 * sync path — the preview has to refuse what the write would refuse.
 */

import { describe, it, expect } from 'vitest';
import { D890UVProtocol } from '../../src/radios/d890uv/protocol';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import type { RadioSettings } from '../../src/models/RadioSettings';
import type { D890CodeplugWritePlan } from '../../src/radios/d890uv/codeplugWrite';

/** `keyTone` is settings offset 0x000 (a checkbox) and `tot` is 0x004. */
const SETTINGS = { keyTone: 0x000, tot: 0x004 };

const settings = { radioSpecific: { tot: 5, keyTone: true } } as unknown as RadioSettings;

function staged() {
  const proto = new D890UVProtocol();
  const readLog = new Map<number, Uint8Array>();
  readLog.set(D890_ADDR.ZONE_SET, new Uint8Array(D890_ADDR.ZONE_SET_SIZE));
  // Zeroed originals, so any non-zero byte in the plan came from the staging.
  readLog.set(D890_ADDR.SETTINGS, new Uint8Array(D890_ADDR.SETTINGS_SIZE));
  proto.setWriteOriginals({
    channelRecords: new Map(),
    channelMask: new Uint8Array(D890_ADDR.CHANNEL_SET_SIZE ?? 512),
    counts: {
      DMRTalkGroups: 0, ScanList: 0, DMRReceiveGroupCallList: 0,
      RadioIDList: 0, AESEncryptionCode: 0,
    },
    referencingTables: [],
    readLog,
  });
  return proto;
}

const plan = (p: D890UVProtocol) => p.planCodeplug([], [], [], {});
const regions = (pl: D890CodeplugWritePlan) => pl.written.map((w) => w.region);

function byteAt(pl: D890CodeplugWritePlan, address: number): number | undefined {
  for (const f of pl.frames) {
    if (address >= f.address && address < f.address + f.data.length) {
      return f.data[address - f.address];
    }
  }
  return undefined;
}

describe('staged settings reach the plan', () => {
  it('plans NO settings region when nothing is staged', () => {
    // The baseline the preview used to produce — and why it under-reported.
    expect(regions(plan(staged()))).not.toContain('settings');
  });

  it('plans the settings region once they are staged', () => {
    const p = staged();
    p.stageSettings(settings, ['radioSpecific.tot']);
    const pl = plan(p);
    expect(regions(pl)).toContain('settings');
    expect(byteAt(pl, D890_ADDR.SETTINGS + SETTINGS.tot)).toBe(5);
  });

  it('stages a checkbox field as a number rather than skipping it', () => {
    const p = staged();
    p.stageSettings(settings, ['radioSpecific.keyTone']);
    expect(byteAt(plan(p), D890_ADDR.SETTINGS + SETTINGS.keyTone)).toBe(1);
  });
});

describe('the preview and the write cannot drift apart', () => {
  it('stages identical bytes through writeRadioSettings and stageSettings', async () => {
    const viaWrite = staged();
    await viaWrite.writeRadioSettings(settings, { changedFields: ['radioSpecific.tot'] });
    const viaPreview = staged();
    viaPreview.stageSettings(settings, ['radioSpecific.tot']);

    const a = plan(viaWrite);
    const b = plan(viaPreview);
    expect(b.payloadBytes).toBe(a.payloadBytes);
    expect(byteAt(b, D890_ADDR.SETTINGS + SETTINGS.tot))
      .toBe(byteAt(a, D890_ADDR.SETTINGS + SETTINGS.tot));
  });

  it('refuses APRS through the sync path too', () => {
    // The preview must refuse what the write refuses: APRS is read through a
    // one-way mapping, so there is nothing to encode from.
    expect(() => staged().stageSettings(settings, ['radioSpecific.aprsSourceCall']))
      .toThrow(/APRS/);
  });
});
