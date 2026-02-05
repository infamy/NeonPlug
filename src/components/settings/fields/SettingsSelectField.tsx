import React from 'react';
import type { SettingsSelectFieldDescriptor } from '../../../types/settingsProfile';
import { getOptionsForId } from '../settingsConstants';
import type { OptionItem } from '../settingsConstants';

const selectClass = 'w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan';
const labelClass = 'block text-cool-gray text-sm mb-2';

interface Props {
  field: SettingsSelectFieldDescriptor;
  value: number;
  onChange: (value: number) => void;
}

function getOptions(field: SettingsSelectFieldDescriptor): OptionItem[] {
  if (field.options && field.options.length > 0) return field.options;
  if (field.optionsId) return getOptionsForId(field.optionsId);
  return [];
}

export const SettingsSelectField: React.FC<Props> = ({ field, value, onChange }) => {
  const options = getOptions(field);
  const num = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return (
    <div>
      <label className={labelClass}>{field.label}</label>
      <select
        value={num}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className={selectClass}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
};
