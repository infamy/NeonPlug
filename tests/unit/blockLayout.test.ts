import { describe, it, expect } from 'vitest';
import { resolveFieldAt, describeField } from '../../src/utils/blockLayout';
import { DM32_BLOCK_LAYOUTS } from '../../src/radios/dm32uv/blockLayouts';
import type { BlockLayoutSpec } from '../../src/types/radioCapabilities';

describe('resolveFieldAt', () => {
  const layout: BlockLayoutSpec = {
    label: 'test',
    fields: [
      { at: 0x10, name: 'Single byte' },
      { at: 0x20, len: 4, name: 'Word' },
      { at: 0x100, len: 2, name: 'Record', repeat: { count: 3, stride: 4 } },
    ],
  };

  it('resolves single-byte and multi-byte fields, including interior bytes', () => {
    expect(resolveFieldAt(layout, 0x10)?.spec.name).toBe('Single byte');
    expect(resolveFieldAt(layout, 0x20)?.spec.name).toBe('Word');
    expect(resolveFieldAt(layout, 0x23)?.spec.name).toBe('Word');
    expect(resolveFieldAt(layout, 0x24)).toBeNull();
  });

  it('resolves repeated records with occurrence index and gaps between strides', () => {
    // Records at 0x100, 0x104, 0x108; each 2 bytes wide within a 4-byte stride.
    expect(resolveFieldAt(layout, 0x100)).toMatchObject({ index: 0, start: 0x100 });
    expect(resolveFieldAt(layout, 0x105)).toMatchObject({ index: 1, start: 0x104 });
    expect(resolveFieldAt(layout, 0x106)).toBeNull(); // gap inside stride
    expect(resolveFieldAt(layout, 0x109)).toMatchObject({ index: 2, start: 0x108 });
    expect(resolveFieldAt(layout, 0x10c)).toBeNull(); // past count
  });

  it('unannotated offsets resolve to null', () => {
    expect(resolveFieldAt(layout, 0x00)).toBeNull();
    expect(resolveFieldAt(layout, 0xfff)).toBeNull();
  });
});

describe('DM-32 block layouts', () => {
  it('radio settings layout resolves known offsets', () => {
    const settings = DM32_BLOCK_LAYOUTS[0x04];
    expect(resolveFieldAt(settings, 0x30)?.spec.name).toBe('Backlight Brightness');
    expect(resolveFieldAt(settings, 0x08)?.spec.name).toBe('Power On Display Line 1');
    expect(resolveFieldAt(settings, 0x123)).toMatchObject({ index: 1 }); // Analog Call 2 — Call ID
    expect(resolveFieldAt(settings, 0xfff)?.spec.name).toBe('Block metadata byte');
  });

  it('TX contact layout maps offsets to channel occurrences and decodes records', () => {
    const tx = DM32_BLOCK_LAYOUTS[0x42];
    const at1024 = resolveFieldAt(tx, 1023 * 2); // channel 1024 record start
    expect(at1024).toMatchObject({ index: 1023, start: 2046 });

    const block = new Uint8Array(0x1000);
    block[2046] = (2 << 4) | 0x01; // TG index high nibble 2, digital
    block[2047] = 0x05; // TG index low byte
    const text = describeField(at1024!, block);
    expect(text).toContain('#1024');
    expect(text).toContain(`TG index ${(2 << 8) | 5}`);
    expect(text).toContain('(digital)');
  });

  it('radio settings layout decodes labels from the DM-32 display options', () => {
    const settings = DM32_BLOCK_LAYOUTS[0x04];
    const block = new Uint8Array(0x1000);
    block[0x00] = 1; // Custom Message
    block[0x34] = 0xf6; // high nibble noise + color 6 (Cyan)
    block[0x41] = 12; // UTC
    block[0x87] = 18; // Scan

    const decodeAt = (offset: number) => {
      const r = resolveFieldAt(settings, offset)!;
      return describeField(r, block);
    };
    expect(decodeAt(0x00)).toContain('Custom Message');
    expect(decodeAt(0x34)).toContain('Cyan');
    expect(decodeAt(0x41)).toContain('= UTC');
    expect(decodeAt(0x87)).toContain('Scan');
  });

  it('VFO layout decodes ASCII names', () => {
    const vfo = DM32_BLOCK_LAYOUTS[0x41];
    const resolved = resolveFieldAt(vfo, 0x0fa0); // interior of VFO A name
    expect(resolved?.spec.name).toContain('VFO A');

    const block = new Uint8Array(0x1000);
    const name = 'CALLING';
    for (let i = 0; i < name.length; i++) block[0x0f9f + i] = name.charCodeAt(i);
    expect(describeField(resolved!, block)).toContain('CALLING');
  });
});
