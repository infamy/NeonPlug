import React from 'react';
import type { SettingsCheckboxFieldDescriptor } from '../../../types/settingsProfile';

const checkboxClass = 'w-4 h-4 text-neon-cyan bg-dark-charcoal border-neon-cyan rounded focus:ring-neon-cyan';
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
