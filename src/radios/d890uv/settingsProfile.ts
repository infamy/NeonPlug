/**
 * Settings profile for the DA-7X2 / AT-D890UV.
 *
 * Sections mirror the vendor CPS's own tab layout, so a user comparing NeonPlug
 * against the OEM software finds each control where they expect it.
 *
 * Generated from D890_SETTINGS_FIELDS rather than hand-written, because the
 * field table is hardware-derived and will grow as more of the CPS is swept —
 * hand-maintaining a second copy of it is exactly the duplication the four
 * registries in CLAUDE.md exist to avoid.
 *
 * ⚠️ Multi-value fields render as raw numbers. The CPS sweep captured each
 * control's current value, not its dropdown contents, so the option labels are
 * genuinely unknown. Showing "3" is honest; inventing "Medium" is not. When the
 * option lists land, give those fields `options` and they become selects with no
 * other change.
 */
import type { SettingsProfile, SettingsFieldDescriptor } from '../../types/settingsProfile';
import {
  D890_SETTINGS_BITFIELDS,
  D890_SETTINGS_FIELDS,
  D890_SETTINGS_FREQUENCIES,
  D890_KEY_FUNCTIONS,
  D890_KEY_FUNCTION_FIELDS,
  D890_UNMAPPED_BYTES,
} from './settingsMap';
import { D890_APRS_PROFILE_FIELDS } from './aprs';

/** The ten PF/P controls all render the same 67-entry vocabulary. */
const KEY_FUNCTION_FIELDS = new Set<string>(D890_KEY_FUNCTION_FIELDS);

/** CPS tab order, so the UI matches the vendor software tab for tab. */
const SECTION_ORDER: readonly string[] = [
  'Other',
  // The CPS has 18 tabs and this list covered 16. 'Work Mode' had no NeonPlug
  // coverage at all until its eight controls were placed; without it here, every
  // one of them would be decoded and then silently dropped from the UI.
  'Work Mode',
  'Display',
  'Key Function',
  'Volume/Audio',
  'Digital Func',
  'Auto repeater',
  'Alert Tone',
  'Alert Tone1',
  'Power Save',
  'Power-on',
  'GPS/Ranging',
  'Satellite',
  'Vox/BT',
  'STE',
  'VFO Scan',
  'AM/FM',
  'Record',
  'APRS'
];

/**
 * Fields whose identity came from the vendor CPS rather than from a radio get a
 * trailing marker, the same convention the channel grid uses.
 *
 * Without it the Settings tab would present a byte the marshaller merely NAMES
 * exactly like one that six fingerprint codeplugs pinned — and a user comparing
 * NeonPlug against the OEM software has no other way to tell them apart.
 */
function labelFor(f: (typeof D890_SETTINGS_FIELDS)[number]): string {
  return f.confidence ? `${f.label} *` : f.label;
}

function fieldFor(f: (typeof D890_SETTINGS_FIELDS)[number]): SettingsFieldDescriptor {
  const key = `radioSpecific.${f.key}`;
  // A confirmed two-item list becomes a real select. This matters beyond
  // cosmetics: Key Lock is Manual/Auto and Digital Monitor CC is Any/Same, so
  // rendering either as a checkbox states something false about the radio.
  if (f.options) {
    return {
      key,
      label: labelFor(f),
      type: 'select',
      options: f.options.map((label, value) => ({ value, label })),
    };
  }
  // max is a lower bound on the CPS range, so a "boolean" here means "only ever
  // seen 0 and 1" - good enough for a checkbox, and corrected if a wider value
  // ever turns up.
  if (KEY_FUNCTION_FIELDS.has(f.key)) {
    return {
      key,
      label: labelFor(f),
      type: 'select',
      options: D890_KEY_FUNCTIONS.map((label, value) => ({ value, label })),
    };
  }
  // A derived value rule turns the raw index into what the vendor CPS shows,
  // e.g. VOX Delay index 10 renders as "1.5 s" instead of "10".
  if (f.valueRule && f.listLength !== undefined) {
    const { scale, offset, unit, zeroLabel } = f.valueRule;
    return {
      key,
      label: unit ? `${labelFor(f)} [${unit}]` : labelFor(f),
      type: 'select',
      options: Array.from({ length: f.listLength }, (_, value) => {
        if (value === 0 && zeroLabel) return { value, label: zeroLabel };
        const n = value * scale + offset;
        // Keep one decimal only where the step actually needs it.
        const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
        return { value, label: unit ? `${text} ${unit}` : text };
      }),
    };
  }
  if (f.max <= 1) return { key, label: labelFor(f), type: 'checkbox' };
  // listLength is measured, not assumed: {END} lands on the dropdown's last
  // item, so the byte it produced is exactly N-1. Bounding the input to that
  // beats offering 0-255 and letting someone type a value the radio has no
  // meaning for.
  const max = f.listLength !== undefined ? f.listLength - 1 : 255;
  return { key, label: labelFor(f), type: 'number', min: 0, max, step: 1 };
}

export const D890UV_SETTINGS_PROFILE: SettingsProfile = {
  radioType: 'DA-7X2',
  sections: SECTION_ORDER.map((title) => ({
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title,
    fields: [
      ...D890_SETTINGS_FIELDS.filter((f) => f.group === title).map(fieldFor),
      ...D890_SETTINGS_FREQUENCIES.filter((f) => f.group === title).map(
        (f): SettingsFieldDescriptor => ({
          key: `radioSpecific.${f.key}`,
          label: `${f.label} [MHz]`,
          type: 'number',
          min: 0,
          max: 600,
          step: 0.00001,
        }),
      ),
      ...D890_SETTINGS_BITFIELDS.filter((b) => b.group === title).map(
        (b): SettingsFieldDescriptor => ({
          key: `radioSpecific.${b.key}`,
          label: b.label,
          type: 'bitfield',
          bits: b.bits.map((bit) => ({ bitIndex: bit.bitIndex, label: bit.label })),
        }),
      ),
    ],
  }))
    .filter((s) => s.fields.length > 0)
    .concat([
      {
        // Its own region (0x3501000), not part of the settings block, but it is
        // still settings from the user's point of view — so it renders through
        // the same declarative profile rather than a bespoke component.
        id: 'aprs',
        title: 'APRS',
        fields: D890_APRS_PROFILE_FIELDS.map(
          (f): SettingsFieldDescriptor => ({ ...f, key: `radioSpecific.${f.key}` }) as SettingsFieldDescriptor,
        ),
      },
    ])
    .concat([
      {
        id: 'unmapped',
        // Named so nobody mistakes it for a feature. These bytes come off the
        // radio and are shown because concealing them would overstate how much
        // of this radio we understand.
        title: 'Unmapped bytes (vendor name only)',
        fields: D890_UNMAPPED_BYTES.map(
          (u): SettingsFieldDescriptor => ({
            key: `radioSpecific.unmapped.0x${u.offset.toString(16).padStart(3, '0')}`,
            label:
              `0x${(0x3500000 + u.offset).toString(16)}` +
              (u.vendorName ? ` — ${u.vendorName}` : '') +
              (u.observedChanging ? ' — seen changing' : ''),
            type: 'number',
            min: 0,
            max: 255,
            step: 1,
          }),
        ),
      },
    ]),
};
