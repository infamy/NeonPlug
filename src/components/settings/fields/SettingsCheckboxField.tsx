import React from 'react';
import type { SettingsCheckboxFieldDescriptor } from '../../../types/settingsProfile';

const checkboxClass = '';
const labelClass = 'text-cool-gray text-sm';

interface Props {
  field: SettingsCheckboxFieldDescriptor;
  value: boolean;
  onChange: (value: boolean) => void;
  id?: string;
}

export const SettingsCheckboxField: React.FC<Props> = ({ field, value, onChange, id }) => {
  const inputId = id ?? `settings-${field.key}`;
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={inputId}
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className={checkboxClass}
      />
      <label htmlFor={inputId} className={labelClass}>{field.label}</label>
    </div>
  );
};
