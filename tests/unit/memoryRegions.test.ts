import { describe, it, expect } from 'vitest';
import { getCapabilitiesForModel } from '../../src/radios/capabilities';
import { FT65_MEM_SIZE } from '../../src/radios/ft65/constants';
import { BAOFENG_MEM_TOTAL } from '../../src/radios/uv5rmini/constants';
import type { MemoryRegionSpec } from '../../src/types/radioCapabilities';

/**
 * The Diagnostics memory-image viewer renders these spans against the image
 * cached from a real read. A region pointing past the end of the image renders
 * as "outside image" rather than throwing — but it is still a lie about the
 * radio, so pin the maps against each radio's actual image size.
 */

function regionsFor(model: string): MemoryRegionSpec[] {
  const caps = getCapabilitiesForModel(model);
  expect(caps, `no capabilities for ${model}`).toBeTruthy();
  const regions = caps?.memoryRegions;
  expect(regions, `no memoryRegions for ${model}`).toBeTruthy();
  return regions!;
}

function assertWithinImage(regions: MemoryRegionSpec[], imageSize: number, model: string) {
  for (const r of regions) {
    expect(r.start, `${model}: ${r.label} starts negative`).toBeGreaterThanOrEqual(0);
    expect(r.length, `${model}: ${r.label} has non-positive length`).toBeGreaterThan(0);
    expect(
      r.start + r.length,
      `${model}: ${r.label} (0x${r.start.toString(16)}+${r.length}) runs past the ${imageSize}-byte image`
    ).toBeLessThanOrEqual(imageSize);
  }
}

/**
 * Regions must not overlap unless the map says so explicitly. A region whose
 * notes call out the nesting is a documented quirk; a silent overlap is a map
 * that lies about the radio.
 */
function assertNoUndocumentedOverlap(regions: MemoryRegionSpec[], model: string) {
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.start >= prev.start + prev.length) continue;
    expect(
      cur.notes ?? '',
      `${model}: "${cur.label}" overlaps "${prev.label}" without documenting it`
    ).toMatch(/nested/i);
  }
}

describe('FT-65 family memory map', () => {
  const regions = regionsFor('FT-65');

  it('fits inside the clone image', () => {
    assertWithinImage(regions, FT65_MEM_SIZE, 'FT-65');
  });

  it("has no undocumented overlapping regions", () => {
    assertNoUndocumentedOverlap(regions, 'FT-65');
  });

  it('flags block 0 as read-only, which the write loop depends on', () => {
    // The write loop starts at block 1 because block 0 holds the radio type ID.
    // Anyone reading a dump needs that stated, not inferred.
    const block0 = regions.find((r) => r.start === 0);
    expect(block0).toBeTruthy();
    expect(block0!.notes ?? '').toMatch(/read-only/i);
  });

  it('covers channels, the enable bitmap and settings', () => {
    const labels = regions.map((r) => r.label.toLowerCase()).join(' ');
    expect(labels).toContain('channel');
    expect(labels).toContain('enable');
    expect(labels).toContain('settings');
  });

  it('applies to every radio in the family, including the VHF-only variants', () => {
    for (const model of ['FT-65', 'FT-4', 'FT-4VR', 'FT-25R']) {
      expect(getCapabilitiesForModel(model)?.memoryRegions?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('UV5R-Mini memory map', () => {
  const regions = regionsFor('UV5R-Mini');

  it('fits inside the assembled clone image', () => {
    assertWithinImage(regions, BAOFENG_MEM_TOTAL, 'UV5R-Mini');
  });

  it("has no undocumented overlapping regions", () => {
    assertNoUndocumentedOverlap(regions, 'UV5R-Mini');
  });

  it('places settings after the channel region', () => {
    const channels = regions.find((r) => /channel/i.test(r.label))!;
    const settings = regions.find((r) => /settings/i.test(r.label))!;
    expect(settings.start).toBeGreaterThanOrEqual(channels.start + channels.length);
  });
});

describe('radios without a contiguous image', () => {
  it('the DM-32 has no memory map — it uses metadata-tagged blocks instead', () => {
    expect(getCapabilitiesForModel('DM-32UV')?.memoryRegions).toBeUndefined();
  });

  it('the D890 has no memory map — it is addressed sparsely, not cloned', () => {
    const caps = getCapabilitiesForModel('DA-7X2');
    expect(caps?.memoryRegions).toBeUndefined();
    // It gets the region dump instead; the two are mutually exclusive by design.
    expect(caps?.supportsRawRegionDump).toBe(true);
  });
});
