import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  D890_SETTINGS_FIELDS,
  D890_SETTINGS_BITFIELDS,
  D890_KEY_FUNCTIONS,
  D890_KEY_FUNCTION_FIELDS,
  D890_SETTINGS_FREQUENCIES,
  D890_UNMAPPED_BYTES,
  D890_ALERT_TONE_GROUPS,
  D890_ALERT_TONE_STEPS,
} from '../../src/radios/d890uv/settingsMap';
import { parseD890Settings, encodeD890Settings } from '../../src/radios/d890uv/settingsFormat';
import { D890_ADDR } from '../../src/radios/d890uv/constants';
import { D890UV_SETTINGS_PROFILE } from '../../src/radios/d890uv/settingsProfile';
import { D890_APRS_PROFILE_FIELDS } from '../../src/radios/d890uv/aprs';

/**
 * Real bytes read off a DA-7X2 at 0x3500000 before any NeonPlug-authored
 * codeplug was written to it. This is the radio's own state, not a synthesised
 * buffer, so a regression here means the parser drifted from hardware.
 */
const SETTINGS = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/d890uv/settings.bin')),
);

describe('D890 settings map', () => {
  it('fits inside the declared region', () => {
    for (const f of D890_SETTINGS_FIELDS) {
      expect(f.offset).toBeLessThan(D890_ADDR.SETTINGS_SIZE);
    }
    for (const g of D890_ALERT_TONE_GROUPS) {
      expect(g.durations + D890_ALERT_TONE_STEPS * 2).toBeLessThanOrEqual(D890_ADDR.SETTINGS_SIZE);
    }
  });

  it('assigns every field a distinct key and a distinct offset', () => {
    const keys = D890_SETTINGS_FIELDS.map((f) => f.key);
    const offsets = D890_SETTINGS_FIELDS.map((f) => f.offset);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it('keeps bitfield bytes out of the plain field table', () => {
    const plain = new Set(D890_SETTINGS_FIELDS.map((f) => f.offset));
    for (const b of D890_SETTINGS_BITFIELDS) expect(plain.has(b.offset)).toBe(false);
  });

  it('never claims a bit twice within one bitfield', () => {
    for (const b of D890_SETTINGS_BITFIELDS) {
      const used = [...b.bits.map((x) => x.bitIndex), ...(b.unresolvedBits ?? [])];
      expect(new Set(used).size).toBe(used.length);
    }
  });

  it('never overlaps a settings byte with an alert-tone array', () => {
    const tone = new Set<number>();
    for (const g of D890_ALERT_TONE_GROUPS) {
      for (let i = 0; i < D890_ALERT_TONE_STEPS * 2; i += 1) {
        tone.add(g.frequencies + i);
        tone.add(g.durations + i);
      }
    }
    for (const f of D890_SETTINGS_FIELDS) expect(tone.has(f.offset)).toBe(false);
  });
});

describe('parseD890Settings', () => {
  it('rejects a short buffer instead of reporting every setting as Off', () => {
    expect(parseD890Settings(SETTINGS.subarray(0, 0x40))).toBeNull();
    expect(parseD890Settings(new Uint8Array(0))).toBeNull();
  });

  it('decodes the hardware fixture', () => {
    const s = parseD890Settings(SETTINGS);
    expect(s).not.toBeNull();
    // Spot values confirmed against the vendor CPS for this same codeplug.
    expect(s!.tot).toBe(0x04); // 120s on a 30..240 list
    expect(s!.frequencyStep).toBe(0x05);
    expect(s!.sqlLevelA).toBe(0x01);
    expect(s!.voxDelay).toBe(0x0a); // 1.5s in 0.1s units
    expect(s!.pf2ShortKey).toBe(0x12);
    expect(s!.pf3ShortKey).toBe(0x0c);
    expect(s!.timeZone).toBe(0x18); // UTC+07:00
  });

  it('decodes alert-tone steps, converting the radio 10 ms unit to ms', () => {
    const s = parseD890Settings(SETTINGS)!;
    const g0 = s.alertTones.group0;
    expect(g0).toHaveLength(D890_ALERT_TONE_STEPS);
    // Fixture holds 1000/0/1000/0/1000 Hz with every duration at 100 ms.
    expect(g0.map((t) => t.frequencyHz)).toEqual([1000, 0, 1000, 0, 1000]);
    expect(g0.every((t) => t.durationMs === 100)).toBe(true);
  });
});

describe('encodeD890Settings', () => {
  it('round-trips the hardware fixture byte for byte', () => {
    const s = parseD890Settings(SETTINGS)!;
    const out = encodeD890Settings(SETTINGS, s);
    expect(Array.from(out)).toEqual(Array.from(SETTINGS));
  });

  it('leaves bytes it was given no value for untouched', () => {
    const out = encodeD890Settings(SETTINGS, { tot: 8 });
    expect(out[0x004]).toBe(8);
    const unchanged = Array.from(SETTINGS).filter((_, i) => i !== 0x004);
    expect(Array.from(out).filter((_, i) => i !== 0x004)).toEqual(unchanged);
  });

  it('rescales alert-tone durations back into the radio 10 ms unit', () => {
    const s = parseD890Settings(SETTINGS)!;
    s.alertTones.group0[0] = { frequencyHz: 1234, durationMs: 250 };
    const out = encodeD890Settings(SETTINGS, s);
    const g = D890_ALERT_TONE_GROUPS[0];
    expect(out[g.frequencies] | (out[g.frequencies + 1] << 8)).toBe(1234);
    expect(out[g.durations] | (out[g.durations + 1] << 8)).toBe(25);
  });
});

describe('D890 settings profile', () => {
  it('exposes every mapped field exactly once', () => {
    const keys = D890UV_SETTINGS_PROFILE.sections.flatMap((s) => s.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
    // APRS is counted separately because it is not part of the settings block —
    // it is its own region at 0x3501000, folded into the same profile so the
    // user sees one Settings tab rather than two places to look.
    expect(keys.length).toBe(
      D890_SETTINGS_FIELDS.length +
        D890_SETTINGS_BITFIELDS.length +
        D890_SETTINGS_FREQUENCIES.length +
        D890_UNMAPPED_BYTES.length +
        D890_APRS_PROFILE_FIELDS.length,
    );
    for (const f of D890_APRS_PROFILE_FIELDS) {
      expect(keys).toContain(`radioSpecific.${f.key}`);
    }
    for (const f of D890_SETTINGS_FREQUENCIES) {
      expect(keys).toContain(`radioSpecific.${f.key}`);
    }
    for (const f of D890_SETTINGS_FIELDS) {
      expect(keys).toContain(`radioSpecific.${f.key}`);
    }
    for (const b of D890_SETTINGS_BITFIELDS) {
      expect(keys).toContain(`radioSpecific.${b.key}`);
    }
  });

  it('renders a verified option list as a select, not a checkbox or number', () => {
    const byKey = new Map(
      D890UV_SETTINGS_PROFILE.sections.flatMap((s) => s.fields.map((f) => [f.key, f] as const)),
    );
    const withOptions = D890_SETTINGS_FIELDS.filter((f) => f.options);
    expect(withOptions.length).toBeGreaterThan(0);
    for (const f of withOptions) {
      const d = byKey.get(`radioSpecific.${f.key}`)!;
      expect(d.type).toBe('select');
      // Index order is load-bearing: options[i] is the label for stored value i.
      expect((d as { options: { value: number; label: string }[] }).options).toEqual(
        f.options!.map((label, value) => ({ value, label })),
      );
    }
  });

  it('sizes every option list to the observed list length', () => {
    // max is the highest value the CPS was seen to store, and the sweep drove
    // each dropdown to its LAST item - so max is N-1 and the list must hold
    // exactly max+1 entries. A list that disagrees was matched against the wrong
    // run in the vendor string table.
    for (const f of D890_SETTINGS_FIELDS) {
      if (!f.options) continue;
      expect(f.options.length).toBe(f.max + 1);
      expect(new Set(f.options).size).toBe(f.options.length);
      for (const o of f.options) expect(o.trim().length).toBeGreaterThan(0);
    }
  });

  it('renders unlabelled 0/1 fields as checkboxes and the rest as numbers', () => {
    const byKey = new Map(
      D890UV_SETTINGS_PROFILE.sections.flatMap((s) => s.fields.map((f) => [f.key, f] as const)),
    );
    const partial = new Set<string>(D890_KEY_FUNCTION_FIELDS);
    for (const f of D890_SETTINGS_FIELDS) {
      if (f.options || f.valueRule || partial.has(f.key)) continue;
      const d = byKey.get(`radioSpecific.${f.key}`)!;
      expect(d.type).toBe(f.max <= 1 ? 'checkbox' : 'number');
    }
    for (const b of D890_SETTINGS_BITFIELDS) {
      expect(byKey.get(`radioSpecific.${b.key}`)!.type).toBe('bitfield');
    }
  });
});

describe('settings profile registry', () => {
  it('resolves for every DA-7X2 / AT-D890UV model id', async () => {
    const { getSettingsProfileForModel } = await import('../../src/data/settingsProfiles');
    const { D890_MODEL_IDS } = await import('../../src/radios/d890uv/constants');
    for (const id of D890_MODEL_IDS) {
      expect(getSettingsProfileForModel(id)).toBe(D890UV_SETTINGS_PROFILE);
    }
  });
});

describe('measured list lengths', () => {
  it('agrees with the observed maximum wherever both are known', () => {
    // Both come from the same {END} sweep, so a disagreement means one of them
    // was derived from the wrong record.
    for (const f of D890_SETTINGS_FIELDS) {
      if (f.listLength === undefined) continue;
      expect(f.max).toBe(f.listLength - 1);
    }
  });

  it('bounds numeric fields to the real list length, not 0-255', () => {
    const byKey = new Map(
      D890UV_SETTINGS_PROFILE.sections.flatMap((s) => s.fields.map((f) => [f.key, f] as const)),
    );
    let bounded = 0;
    for (const f of D890_SETTINGS_FIELDS) {
      const d = byKey.get(`radioSpecific.${f.key}`)!;
      if (d.type !== 'number' || f.listLength === undefined) continue;
      expect(f.listLength).toBeDefined();
      expect((d as { max?: number }).max).toBe(f.listLength! - 1);
      bounded += 1;
    }
    expect(bounded).toBeGreaterThan(25);
  });
});

describe('the settings region is fully accounted for', () => {
  it('covers every byte of 0x000-0x15f exactly once', () => {
    // The Diagnostics tab renders these five tables as ONE map of the region, so
    // a byte claimed twice inflates the "placed" count and a byte claimed by
    // nothing disappears from the map entirely. Neither is visible by reading
    // the tables; both are obvious here.
    const owner = new Map<number, string[]>();
    const claim = (name: string, offset: number, span = 1) => {
      for (let i = 0; i < span; i++) {
        owner.set(offset + i, [...(owner.get(offset + i) ?? []), name]);
      }
    };
    for (const f of D890_SETTINGS_FIELDS) claim(`field:${f.key}`, f.offset);
    for (const f of D890_SETTINGS_FREQUENCIES) claim(`freq:${f.key}`, f.offset, 4);
    for (const b of D890_SETTINGS_BITFIELDS) claim(`bitfield:${b.key}`, b.offset);
    for (const g of D890_ALERT_TONE_GROUPS) {
      claim(`alert:${g.id}:freq`, g.frequencies, 10);
      claim(`alert:${g.id}:dur`, g.durations, 10);
    }
    for (const u of D890_UNMAPPED_BYTES) claim(`unmapped:0x${u.offset.toString(16)}`, u.offset);

    const doubleClaimed = [...owner.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([offset, names]) => `0x${offset.toString(16)}: ${names.join(' + ')}`);
    expect(doubleClaimed).toEqual([]);

    const unclaimed: string[] = [];
    for (let o = 0; o < D890_ADDR.SETTINGS_SIZE; o++) {
      if (!owner.has(o)) unclaimed.push(`0x${o.toString(16)}`);
    }
    expect(unclaimed).toEqual([]);

    // And nothing may claim a byte past the region the driver reads.
    const past = [...owner.keys()].filter((o) => o >= D890_ADDR.SETTINGS_SIZE);
    expect(past.map((o) => `0x${o.toString(16)}`)).toEqual([]);
  });
});

describe('vendor names from the settings marshaller', () => {
  const byOffset = new Map(D890_UNMAPPED_BYTES.map((u) => [u.offset, u] as const));

  it('turned most of the named bytes into real fields', () => {
    // The marshaller named 78 bytes the fingerprint passes could not place. An
    // adversarial audit then rejected 35 of 118 candidates, and what survived
    // became fields carrying a `confidence` tag.
    const derived = D890_SETTINGS_FIELDS.filter((f) => f.confidence);
    expect(derived.length).toBeGreaterThanOrEqual(80);
    // A byte cannot be both a field and an unattributed byte.
    const fieldOffsets = new Set(D890_SETTINGS_FIELDS.map((f) => f.offset));
    for (const u of D890_UNMAPPED_BYTES) expect(fieldOffsets.has(u.offset)).toBe(false);
  });

  it('marks every derived field in the UI', () => {
    // The whole point of keeping `confidence` is that the Settings tab can say
    // which fields were watched moving on a radio and which were read out of the
    // vendor's software. An unmarked derived field is worse than no field.
    const derivedLabels = new Set(
      D890_SETTINGS_FIELDS.filter((f) => f.confidence).map((f) => f.label),
    );
    const rendered = D890UV_SETTINGS_PROFILE.sections.flatMap((s) => s.fields);
    for (const d of rendered) {
      const bare = d.label.replace(/ \[[^\]]+\]$/, '');
      if (bare.endsWith(' *')) continue;
      expect(derivedLabels.has(bare), `${bare} is derived but rendered unmarked`).toBe(false);
    }
    // And the hardware-placed ones must NOT be marked.
    for (const f of D890_SETTINGS_FIELDS.filter((x) => !x.confidence)) {
      expect(f.label.endsWith('*'), `${f.label} carries a marker it has not earned`).toBe(false);
    }
  });

  it('gives every option list a matching listLength', () => {
    // A select renders one entry per option, so a listLength that disagrees with
    // the list is a claim about the radio that the UI then contradicts.
    for (const f of D890_SETTINGS_FIELDS) {
      if (!f.options) continue;
      expect(f.listLength ?? f.options.length, `${f.key}`).toBe(f.options.length);
      expect(f.max, `${f.key} max should be the last index`).toBe(f.options.length - 1);
    }
  });

  it('places the two frequency runs where the marshaller loops sit', () => {
    // The whole alignment between this table and the marshaller's turns on
    // these two runs: `for i = 0 to 3` loops over four u32s, which the static
    // trace counted as four single bytes. If either run moves, every vendorName
    // after it is off by 12.
    const freq = new Map(D890_SETTINGS_FREQUENCIES.map((f) => [f.vendorField, f.offset] as const));
    expect(freq.get('VfoScanFreq0')).toBe(0x058);
    expect(freq.get('VfoScanFreq3')).toBe(0x064);
    expect(freq.get('AutoRepFreq0')).toBe(0x0c4);
    expect(freq.get('AutoRepFreq3')).toBe(0x0d0);
    // Nothing else may claim the 16 bytes each run covers.
    for (const base of [0x058, 0x0c4]) {
      for (let i = 0; i < 16; i++) expect(byOffset.has(base + i)).toBe(false);
    }
  });

  it('puts PF3 Long Key between PF2 Long Key and P1 Long Key', () => {
    const byKey = new Map(D890_SETTINGS_FIELDS.map((f) => [f.key, f] as const));
    expect(byKey.get('pf2LongKey')?.offset).toBe(0x042);
    expect(byKey.get('pf3LongKey')?.offset).toBe(0x043);
    expect(byKey.get('p1LongKey')?.offset).toBe(0x044);
    // It used to be an unmapped byte, and must not be listed as both.
    expect(byOffset.has(0x043)).toBe(false);
  });
});

describe('key-function vocabulary', () => {
  it('holds all 67 entries with no gaps', () => {
    expect(D890_KEY_FUNCTIONS).toHaveLength(67);
    for (const o of D890_KEY_FUNCTIONS) expect(o.trim().length).toBeGreaterThan(0);
    expect(new Set(D890_KEY_FUNCTIONS).size).toBe(67);
  });

  it('matches every point measured on hardware', () => {
    // These six came off a radio, independently of the vendor string table the
    // list was recovered from. They are the reason the list is trusted.
    const anchors: [number, string][] = [
      [0, 'Off'], [1, 'Voltage'], [8, 'V/M'],
      [18, 'Monitor'], [19, 'Main Channel Switch'], [66, 'NOAA Alert'],
    ];
    for (const [i, label] of anchors) expect(D890_KEY_FUNCTIONS[i]).toBe(label);
  });

  it('covers all ten controls that share it', () => {
    const byKey = new Map(D890_SETTINGS_FIELDS.map((f) => [f.key, f] as const));
    // Ten, not nine: PF3 Long Key (0x043) was invisible to the CPS sweep and
    // only surfaced when the vendor settings marshaller named it PF3_L.
    expect(D890_KEY_FUNCTION_FIELDS).toHaveLength(10);
    expect(D890_KEY_FUNCTION_FIELDS).toContain('pf3LongKey');
    for (const k of D890_KEY_FUNCTION_FIELDS) {
      const f = byKey.get(k);
      expect(f, `unknown field ${k}`).toBeDefined();
      // The list length measured from the radio must match the vocabulary size.
      expect(f!.listLength).toBe(D890_KEY_FUNCTIONS.length);
    }
  });
});

describe('unmapped placeholders', () => {
  it('covers every settings byte exactly once, with no overlaps', () => {
    const claimed = new Map<number, string>();
    const claim = (o: number, who: string) => {
      expect(claimed.has(o), `0x${o.toString(16)} claimed by ${claimed.get(o)} and ${who}`).toBe(false);
      claimed.set(o, who);
    };
    for (const f of D890_SETTINGS_FIELDS) claim(f.offset, f.key);
    for (const b of D890_SETTINGS_BITFIELDS) claim(b.offset, b.key);
    for (const f of D890_SETTINGS_FREQUENCIES) for (let i = 0; i < 4; i += 1) claim(f.offset + i, f.key);
    for (const g of D890_ALERT_TONE_GROUPS) {
      for (let i = 0; i < D890_ALERT_TONE_STEPS * 2; i += 1) {
        claim(g.frequencies + i, `${g.id}.freq`);
        claim(g.durations + i, `${g.id}.dur`);
      }
    }
    for (const u of D890_UNMAPPED_BYTES) claim(u.offset, 'unmapped');
    // Every byte of the region is now accounted for - named or explicitly not.
    expect(claimed.size).toBe(0x160);
  });
});

describe('derived value rules', () => {
  it('reproduces every measured point it was derived from', () => {
    // Each rule was fitted to observed (index, displayed value) pairs from the
    // vendor CPS. If a rule stops predicting its own evidence, it is wrong.
    const CHECK: [string, number, number][] = [
      ['voxDelay', 10, 1.5], ['voxDelay', 25, 3.0],
      ['txPreambleDuration', 5, 300], ['txPreambleDuration', 40, 2400],
      ['menuExitTimeS', 2, 15], ['menuExitTimeS', 11, 60],
      ['recordDelay', 0, 0], ['recordDelay', 25, 5],
      ['steTime', 25, 250], ['steTime', 100, 1000],
      ['autoShutdown', 4, 120],
      ['analogCallHoldTimeS', 30, 30],
      ['longKeyTimeS', 4, 5],
    ];
    for (const [key, index, want] of CHECK) {
      const f = D890_SETTINGS_FIELDS.find((x) => x.key === key);
      expect(f, `no field ${key}`).toBeDefined();
      expect(f!.valueRule, `${key} has no valueRule`).toBeDefined();
      const { scale, offset } = f!.valueRule!;
      expect(index * scale + offset, `${key} at index ${index}`).toBeCloseTo(want, 5);
    }
  });

  it('never attaches a rule to a list known to be non-uniform', () => {
    // Time Zone runs UTC-12..UTC+13 with half-hour zones, and NOAA frequency is
    // a channel list. A line through two of their points is wrong in between.
    for (const key of ['timeZone', 'noaaChannel']) {
      const f = D890_SETTINGS_FIELDS.find((x) => x.key === key);
      if (f) expect(f.valueRule, `${key} must not carry a fitted rule`).toBeUndefined();
    }
  });

  it('renders a rule-bearing field as a select sized to its list', () => {
    const byKey = new Map(
      D890UV_SETTINGS_PROFILE.sections.flatMap((s) => s.fields.map((f) => [f.key, f] as const)),
    );
    const withRule = D890_SETTINGS_FIELDS.filter((f) => f.valueRule);
    expect(withRule.length).toBeGreaterThan(10);
    for (const f of withRule) {
      const d = byKey.get(`radioSpecific.${f.key}`)! as { type: string; options?: unknown[] };
      expect(d.type).toBe('select');
      expect(d.options).toHaveLength(f.listLength!);
    }
  });
});
