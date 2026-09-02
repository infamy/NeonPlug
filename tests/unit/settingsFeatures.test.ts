import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RADIO_DESCRIPTORS } from '../../src/radios';
import { getSettingsProfileForModel } from '../../src/data/settingsProfiles';
import { FEATURE_AREAS } from '../../src/components/settings/featureAreas';
import type { SettingsFeature } from '../../src/types/settingsProfile';

const TAB = readFileSync(
  join(__dirname, '../../src/components/settings/SettingsTab.tsx'),
  'utf8'
);

/**
 * A settings "feature" is an area rendered by hand rather than generated from
 * field descriptors — a boot image picker, a geofence editor, a tone list. Its
 * name is the only link between three places: the profile that declares it, the
 * jump-nav chip, and the anchor the chip scrolls to.
 *
 * `SettingsFeature` (a union) makes the compiler check the first two. It cannot
 * check the third, because the anchor is a template string: the chip scrolls to
 * `settings-section-${tab.id}` and each area hard-codes its own
 * `id="settings-section-feature-…"`. A mismatch there is silent — the chip
 * renders, the click does nothing.
 */
describe('settings feature areas', () => {
  const navIds = [...TAB.matchAll(/id: '(feature-[A-Za-z]+)'/g)].map((m) => m[1]);
  const anchors = new Set(
    [...TAB.matchAll(/id="settings-section-(feature-[A-Za-z]+)"/g)].map((m) => m[1])
  );

  it('finds the jump-nav entries', () => {
    expect(navIds.length).toBeGreaterThan(5);
  });

  it('gives every jump-nav chip something to scroll to', () => {
    // Two ways an area can exist. Registered in FEATURE_AREAS, in which case
    // the anchor is generated from the same tab id the chip uses and cannot
    // drift; or still inline in SettingsTab, in which case the anchor is
    // hand-written and has to be checked.
    for (const id of navIds) {
      const feature = id.replace(/^feature-/, '') as SettingsFeature;
      const registered = feature in FEATURE_AREAS;
      expect(
        registered || anchors.has(id),
        `chip "${id}" is neither registered in FEATURE_AREAS nor given an inline anchor`
      ).toBe(true);
    }
  });

  it('does not leave an inline anchor no chip points at', () => {
    for (const anchor of anchors) {
      expect(navIds.includes(anchor), `anchor "${anchor}" has no jump-nav chip`).toBe(true);
    }
  });

  it('registers an area for every feature that is not inline', () => {
    // Guards the other direction: a registered area whose feature no longer
    // appears in the nav would render with no way to reach it.
    for (const feature of Object.keys(FEATURE_AREAS)) {
      expect(
        navIds.includes(`feature-${feature}`),
        `FEATURE_AREAS has "${feature}" but no jump-nav chip points at it`
      ).toBe(true);
    }
  });

  it('names features after what they are, not after a radio', () => {
    // The union used to read d890Images / d890Tones / d890Roaming. A shared type
    // naming one radio is how radio-specific assumptions spread into shared UI.
    for (const d of RADIO_DESCRIPTORS) {
      const profile = getSettingsProfileForModel(d.modelIds[0]);
      for (const feature of profile?.features ?? []) {
        expect(feature, `"${feature}" names a radio`).not.toMatch(/^(d890|dm32|ft65|uv5r)/i);
      }
    }
  });
});
