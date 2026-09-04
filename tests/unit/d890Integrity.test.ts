import { describe, it, expect } from 'vitest';
import {
  isErasedMask,
  checkPresenceMask,
  checkMaskAgainstRecords,
  blocksWriting,
  describeFindings,
  D890_MASK_CHECKS,
} from '../../src/radios/d890uv/integrity';
import { D890_LIMITS } from '../../src/radios/d890uv/constants';

/**
 * Corrupt-codeplug detection.
 *
 * The real case: a radio whose zone presence and hidden masks both read 32
 * bytes of 0xFF. Decoded literally that is 250 zones, all hidden, 242 of them
 * empty placeholders — and a write from that read would have marked 250 slots
 * present and written 242 invented zones onto the radio.
 *
 * Every gate that already existed passed, because they check references and
 * originals rather than whether the read itself is credible. That is the gap
 * these checks close.
 *
 * The mask bytes below are the vendor's own, taken from its programming
 * session: `ff 00 00 ...` for the zone mask (8 zones) and zeros for hidden.
 * All-0xFF is therefore NOT a state the vendor produces.
 */

const erased = (bytes: number) => new Uint8Array(bytes).fill(0xff);
const vendorZoneMask = () => { const m = new Uint8Array(0x20); m[0] = 0xff; return m; };

describe('isErasedMask', () => {
  it('is true only when every byte covering the slots is 0xFF', () => {
    expect(isErasedMask(erased(32), 250)).toBe(true);
    expect(isErasedMask(vendorZoneMask(), 250)).toBe(false);
  });

  it('ignores bytes past the slot count', () => {
    // A mask read is 16-byte aligned and routinely wider than its table, so
    // trailing bytes must not decide the verdict.
    const m = erased(32);
    m.fill(0x00, 1);
    expect(isErasedMask(m, 8)).toBe(true);
    expect(isErasedMask(m, 250)).toBe(false);
  });

  it('does not call a short buffer erased', () => {
    expect(isErasedMask(new Uint8Array(2).fill(0xff), 250)).toBe(false);
  });
});

describe('presence mask checks', () => {
  it('blocks a write when the zone mask is erased', () => {
    const finding = D890_MASK_CHECKS.zones(erased(32))!;
    expect(finding.level).toBe('blocker');
    expect(finding.problem).toMatch(/erased flash, not data/);
    expect(blocksWriting([finding])).toBe(true);
  });

  it('passes the vendor mask silently', () => {
    expect(D890_MASK_CHECKS.zones(vendorZoneMask())).toBeNull();
    expect(D890_MASK_CHECKS.hiddenZones(new Uint8Array(0x20))).toBeNull();
  });

  it('blocks an erased CHANNEL mask too — 4000 channels is no more plausible', () => {
    const finding = D890_MASK_CHECKS.channels(erased(512))!;
    expect(finding.level).toBe('blocker');
    expect(finding.problem).toMatch(/channel presence mask/);
  });

  it('warns rather than blocks on an erased hidden mask', () => {
    // Wrong, but not destructive: it cannot invent zones, only mislabel them.
    const finding = D890_MASK_CHECKS.hiddenZones(erased(32))!;
    expect(finding.level).toBe('warning');
    expect(blocksWriting([finding])).toBe(false);
  });

  it('says what it means for the user, not just what is wrong', () => {
    const finding = checkPresenceMask('zone', erased(32), D890_LIMITS.ZONES_MAX)!;
    expect(finding.consequence).toMatch(/writing is refused/i);
    expect(finding.consequence).toMatch(/can still be exported/i);
  });
});

describe('mask versus records', () => {
  it('warns when a mask claims far more than the records support', () => {
    const finding = checkMaskAgainstRecords('zone', 250, 8)!;
    expect(finding.level).toBe('warning');
    expect(finding.problem).toMatch(/claims 250 entries but only 8/);
  });

  it('stays quiet about a few empty-but-present slots', () => {
    // Ordinary: a user can keep an empty zone. Only an order of magnitude is
    // evidence of a mask that has lost its meaning.
    expect(checkMaskAgainstRecords('zone', 10, 8)).toBeNull();
  });

  it('stays quiet on small tables, where the ratio proves nothing', () => {
    expect(checkMaskAgainstRecords('zone', 4, 1)).toBeNull();
  });

  it('stays quiet when everything claimed has content', () => {
    expect(checkMaskAgainstRecords('zone', 8, 8)).toBeNull();
  });
});

describe('reporting', () => {
  it('marks blockers and warnings differently', () => {
    const text = describeFindings([
      D890_MASK_CHECKS.zones(erased(32))!,
      D890_MASK_CHECKS.hiddenZones(erased(32))!,
    ]);
    expect(text).toContain('⛔');
    expect(text).toContain('⚠️');
  });

  it('reports nothing for a healthy codeplug', () => {
    expect(describeFindings([])).toBe('');
    expect(blocksWriting([])).toBe(false);
  });
});
