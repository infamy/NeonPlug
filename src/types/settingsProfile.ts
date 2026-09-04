/**
 * Settings profile schema for radio-driven Settings tab.
 * No radio-specific imports; profiles reference option-set ids and field keys.
 */

export type SettingsFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'color'
  | 'checkbox'
  | 'range'
  | 'bitfield';

export interface OptionItem {
  value: number;
  label: string;
  hex?: string;
}

/** Descriptor for one bit in a bitfield (checkbox group that reads/writes a number) */
export interface BitfieldBit {
  bitIndex: number;
  label: string;
}

export interface SettingsFieldDescriptorBase {
  key: string;
  label: string;
  type: SettingsFieldType;
  /**
   * One-line explanation shown under the control.
   *
   * Only ever sourced from the radio's own documentation — never from guessing
   * what a field name implies. A wrong explanation is worse than none.
   */
  hint?: string;
}

export interface SettingsTextFieldDescriptor extends SettingsFieldDescriptorBase {
  type: 'text';
  maxLength?: number;
}

export interface SettingsNumberFieldDescriptor extends SettingsFieldDescriptorBase {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface SettingsSelectFieldDescriptor extends SettingsFieldDescriptorBase {
  type: 'select';
  optionsId?: string;
  options?: OptionItem[];
}

export interface SettingsColorFieldDescriptor extends SettingsFieldDescriptorBase {
  type: 'color';
  optionsId?: string;
  options?: OptionItem[];
}

export interface SettingsCheckboxFieldDescriptor extends SettingsFieldDescriptorBase {
  type: 'checkbox';
}

export interface SettingsRangeFieldDescriptor extends SettingsFieldDescriptorBase {
  type: 'range';
  min: number;
  max: number;
  step?: number;
}

export interface SettingsBitfieldFieldDescriptor extends SettingsFieldDescriptorBase {
  type: 'bitfield';
  bits: BitfieldBit[];
}

export type SettingsFieldDescriptor =
  | SettingsTextFieldDescriptor
  | SettingsNumberFieldDescriptor
  | SettingsSelectFieldDescriptor
  | SettingsColorFieldDescriptor
  | SettingsCheckboxFieldDescriptor
  | SettingsRangeFieldDescriptor
  | SettingsBitfieldFieldDescriptor;

export interface SettingsSection {
  id: string;
  title: string;
  fields: SettingsFieldDescriptor[];
  /**
   * An area rendered inside this section, below its fields.
   *
   * For a block that belongs WITH a group of settings rather than beside them —
   * the power-on text sits under Power-on Interface because that field decides
   * whether the text is shown at all. An area named here gets no jump-nav chip
   * of its own; the section's chip already points at it.
   */
  area?: SettingsFeature;
}

/**
 * Settings areas that are rendered by hand in `SettingsTab` rather than
 * generated from a section's field descriptors — a boot image picker, a
 * geofence editor, a tone list. A profile opts in by naming them.
 *
 * This is a union rather than `string[]` because the string is the ONLY link
 * between three files: the profile that declares it, the `featureTabs` entry
 * that puts a chip in the jump nav, and the `features?.includes(...)` that
 * renders the area. A typo in any one of them silently renders nothing — no
 * error, no warning, just a missing panel. Adding a member here makes the
 * compiler check all three agree.
 */
export type SettingsFeature =
  | 'bootImage'
  | 'oneKeyOperation'
  | 'gpsAprs'
  | 'pictures'
  | 'powerOnScreen'
  | 'roaming'
  | 'gpsRoaming'
  | 'satellites'
  | 'toneLists'
  | 'autoRepeaterOffsets'
  | 'emergencyAlarm';

export interface SettingsProfile {
  radioType: string;
  sections: SettingsSection[];
  features?: SettingsFeature[];
}
