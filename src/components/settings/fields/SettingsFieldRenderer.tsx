import React from 'react';
import type { SettingsFieldDescriptor } from '../../../types/settingsProfile';
import { SettingsTextField } from './SettingsTextField';
import { SettingsNumberField } from './SettingsNumberField';
import { SettingsSelectField } from './SettingsSelectField';
import { SettingsColorField } from './SettingsColorField';
import { SettingsCheckboxField } from './SettingsCheckboxField';
import { SettingsRangeField } from './SettingsRangeField';
import { SettingsBitfieldField } from './SettingsBitfieldField';

interface Props {
  field: SettingsFieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
}

export const SettingsFieldRenderer: React.FC<Props> = ({ field, value, onChange }) => {
  switch (field.type) {
    case 'text':
      return (
        <SettingsTextField
          field={field}
          value={value as string}
          onChange={onChange as (v: string) => void}
        />
      );
    case 'number':
      return (
        <SettingsNumberField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    case 'select':
      return (
        <SettingsSelectField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    case 'color':
      return (
        <SettingsColorField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    case 'checkbox':
      return (
        <SettingsCheckboxField
          field={field}
          value={value as boolean}
          onChange={onChange as (v: boolean) => void}
        />
      );
    case 'range':
      return (
        <SettingsRangeField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    case 'bitfield':
      return (
        <SettingsBitfieldField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    default:
      return null;
  }
};
