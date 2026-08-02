/**
 * Declarative hex-layout annotations for DM-32UV memory blocks, delivered to
 * the Diagnostics tab via caps.diagnostics.blockLayouts. Display-only — the
 * authoritative parse/encode lives in structures.ts.
 *
 * Offsets here mirror what the Diagnostics tab has always displayed (offset
 * inspectors, structure-reference tables); only verified offsets are listed.
 */
import type { BlockLayoutSpec } from '../../types/radioCapabilities';
import { decodeBCDFrequency } from './structures';
import {
  POWER_ON_INTERFACE_OPTIONS,
  COLOR_OPTIONS,
  UTC_ZONE_OPTIONS,
  BUTTON_FUNCTION_OPTIONS,
} from './displayOptions';

type LabelOption = { value: number; label: string };

/** Decode a byte via a value→label table, falling back to the raw number. */
const label = (options: LabelOption[]) => (b: Uint8Array) =>
  options.find((o) => o.value === b[0])?.label ?? `${b[0]}`;

/** Same, but only the low nibble carries the value (color fields). */
const labelNibble = (options: LabelOption[]) => (b: Uint8Array) =>
  options.find((o) => o.value === (b[0] & 0x0f))?.label ?? `${b[0] & 0x0f}`;

/** Null-terminated ASCII, printable chars only. */
function ascii(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  const text = new TextDecoder('ascii', { fatal: false })
    .decode(bytes.subarray(0, end >= 0 ? end : bytes.length))
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
  return text || 'Empty';
}

function bcdMHz(bytes: Uint8Array): string {
  return `${decodeBCDFrequency(bytes).toFixed(4)} MHz`;
}

/** TX Contact record: high nibble of byte 0 + byte 1 = talk-group index; bit 0 = digital. */
function txContact(bytes: Uint8Array): string {
  const idx = ((bytes[0] >> 4) << 8) | bytes[1];
  return `TG index ${idx}${(bytes[0] & 0x01) !== 0 ? ' (digital)' : ''}`;
}

const RADIO_SETTINGS_LAYOUT: BlockLayoutSpec = {
  label: 'Radio Settings',
  fields: [
    { at: 0xfff, name: 'Block metadata byte' },
    { at: 0x00, name: 'Power On Interface', decode: label(POWER_ON_INTERFACE_OPTIONS) },
    { at: 0x01, len: 14, name: 'Power On Display Line 1', decode: ascii },
    { at: 0x0f, len: 14, name: 'Power On Display Line 2', decode: ascii },
    { at: 0x30, name: 'Backlight Brightness', decode: (b) => `${b[0] + 1}`, notes: 'stored 0-5, displayed 1-6' },
    { at: 0x34, name: 'Callsign Color', decode: labelNibble(COLOR_OPTIONS), notes: 'low nibble' },
    { at: 0x35, name: 'Standby Text Color', decode: labelNibble(COLOR_OPTIONS) },
    { at: 0x38, name: 'Channel A Color', decode: labelNibble(COLOR_OPTIONS) },
    { at: 0x39, name: 'Channel B Color', decode: labelNibble(COLOR_OPTIONS) },
    { at: 0x3a, name: 'Zone A Color', decode: labelNibble(COLOR_OPTIONS) },
    { at: 0x3b, name: 'Zone B Color', decode: labelNibble(COLOR_OPTIONS) },
    { at: 0x41, name: 'UTC Zone', decode: label(UTC_ZONE_OPTIONS) },
    {
      at: 0x85,
      name: 'Key Lock Flags',
      decode: (b) => {
        const bits = [(b[0] & 0x01) === 0 ? 'Manual' : 'Auto'];
        if ((b[0] & 0x02) !== 0) bits.push('Knob On');
        if ((b[0] & 0x04) !== 0) bits.push('Side Key On');
        return bits.join(', ');
      },
      notes: 'bit 0 lock key, bit 1 knob lock, bit 2 side key lock',
    },
    { at: 0x86, name: 'Auto Keypad Lock Delay', decode: (b) => `${b[0]}s` },
    { at: 0x87, name: 'SK1 Short', decode: label(BUTTON_FUNCTION_OPTIONS) },
    { at: 0x88, name: 'SK1 Long', decode: label(BUTTON_FUNCTION_OPTIONS) },
    { at: 0x89, name: 'SK2 Short', decode: label(BUTTON_FUNCTION_OPTIONS) },
    { at: 0x8a, name: 'SK2 Long', decode: label(BUTTON_FUNCTION_OPTIONS) },
    { at: 0x8d, name: 'P1 Short', decode: label(BUTTON_FUNCTION_OPTIONS) },
    { at: 0x8e, name: 'P1 Long', decode: label(BUTTON_FUNCTION_OPTIONS) },
    { at: 0x8f, name: 'P2 Short', decode: label(BUTTON_FUNCTION_OPTIONS) },
    { at: 0x90, name: 'P2 Long', decode: label(BUTTON_FUNCTION_OPTIONS) },
    { at: 0x93, name: 'Long Press Time', decode: (b) => `${b[0] + 1}`, notes: '+1 for display' },
    { at: 0x120, name: 'Analog Call — Call Type', repeat: { count: 4, stride: 2 } },
    { at: 0x121, name: 'Analog Call — Call ID', repeat: { count: 4, stride: 2 } },
    { at: 0x200, name: 'One Touch Call 1 — Call Type' },
    { at: 0x201, name: 'One Touch Call 1 — Call Object (low)' },
    { at: 0x202, name: 'One Touch Call 1 — Call Object (high)' },
    { at: 0x203, name: 'One Touch Call 1 — Digital Call Type' },
    { at: 0x204, name: 'One Touch Call 1 — SMS' },
    { at: 0x230, name: 'Fun+0 — Number Key' },
    { at: 0x231, name: 'Fun+0 — Operate Mode' },
    { at: 0x232, name: 'Fun+0 — Menu Select' },
    { at: 0x233, name: 'Fun+0 — Call Way' },
    { at: 0x234, name: 'Fun+0 — Call Object' },
    { at: 0x235, name: 'Fun+0 — Digital Call Type' },
    { at: 0x236, name: 'Fun+0 — SMS' },
  ],
};

const VFO_LAYOUT: BlockLayoutSpec = {
  label: 'VFO Channels',
  fields: [
    { at: 0xfff, name: 'Block metadata byte' },
    { at: 0x0f9f, len: 16, name: 'VFO A Channel (4001) — Name', decode: ascii },
    { at: 0x0faf, len: 4, name: 'VFO A — RX Frequency (BCD)', decode: bcdMHz },
    { at: 0x0fb3, len: 4, name: 'VFO A — TX Frequency (BCD)', decode: bcdMHz },
    { at: 0x0fb7, name: 'VFO A — Mode Flags' },
    { at: 0x0fcf, len: 16, name: 'VFO B Channel (4002) — Name', decode: ascii },
    { at: 0x0fdf, len: 4, name: 'VFO B — RX Frequency (BCD)', decode: bcdMHz },
    { at: 0x0fe3, len: 4, name: 'VFO B — TX Frequency (BCD)', decode: bcdMHz },
    { at: 0x0fe7, name: 'VFO B — Mode Flags' },
  ],
};

const TX_CONTACT_LOW_LAYOUT: BlockLayoutSpec = {
  label: 'TX Contacts (channels 1–2047)',
  fields: [
    { at: 0xfff, name: 'Block metadata byte' },
    {
      at: 0x000,
      len: 2,
      name: 'TX Contact — channel',
      repeat: { count: 2047, stride: 2 },
      decode: txContact,
      notes: '2 bytes per channel; occurrence N = channel N',
    },
  ],
};

const TX_CONTACT_HIGH_LAYOUT: BlockLayoutSpec = {
  label: 'TX Contacts (channels 2048+ and VFOs)',
  fields: [
    { at: 0xfff, name: 'Block metadata byte' },
    {
      at: 0x000,
      len: 2,
      name: 'TX Contact — channel 2047+N',
      repeat: { count: 2047, stride: 2 },
      decode: txContact,
      notes: '2 bytes per channel, continuing from block 0x42',
    },
  ],
};

export const DM32_BLOCK_LAYOUTS: Record<number, BlockLayoutSpec> = {
  0x04: RADIO_SETTINGS_LAYOUT,
  0x41: VFO_LAYOUT,
  0x42: TX_CONTACT_LOW_LAYOUT,
  0x43: TX_CONTACT_HIGH_LAYOUT,
};
