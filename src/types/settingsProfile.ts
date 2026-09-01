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
}

export interface SettingsProfile {
  radioType: string;
  sections: SettingsSection[];
  features?: string[];
}
