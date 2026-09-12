import React from 'react';
import type { SettingsTextFieldDescriptor } from '../../../types/settingsProfile';
import { FIELD } from '../../ui/controlStyles';

const inputClass = `${FIELD} w-full border rounded px-3 py-2`;
const labelClass = 'block text-cool-gray text-sm mb-2';

interface Props {
  field: SettingsTextFieldDescriptor;
  value: string;
  onChange: (value: string) => void;
}

export const SettingsTextField: React.FC<Props> = ({ field, value, onChange }) => {
  const maxLen = field.maxLength;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(maxLen != null ? v.substring(0, maxLen) : v);
  };
  return (
    <div>
      <label className={labelClass}>{field.label}</label>
      <input
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        className={inputClass}
        maxLength={maxLen}
        placeholder={field.label}
      />
    </div>
  );
};
