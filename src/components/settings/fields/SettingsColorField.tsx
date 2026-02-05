import React from 'react';
import type { SettingsColorFieldDescriptor } from '../../../types/settingsProfile';
import { getOptionsForId, getColorHex } from '../settingsConstants';
import type { OptionItem } from '../settingsConstants';

const selectClass = 'flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan';
const labelClass = 'block text-cool-gray text-sm mb-2';

interface Props {
  field: SettingsColorFieldDescriptor;
  value: number;
  onChange: (value: number) => void;
}

function getOptions(field: SettingsColorFieldDescriptor): OptionItem[] {
  if (field.options && field.options.length > 0) return field.options;
  if (field.optionsId) return getOptionsForId(field.optionsId);
  return getOptionsForId('color');
}

export const SettingsColorField: React.FC<Props> = ({ field, value, onChange }) => {
  const options = getOptions(field);
  const num = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return (
    <div>
      <label className={labelClass}>{field.label}</label>
      <div className="flex items-center gap-2">
        <select
          value={num}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
          className={selectClass}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div
          className="w-9 h-9 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
          style={{ backgroundColor: getColorHex(num) }}
        />
      </div>
    </div>
  );
};
