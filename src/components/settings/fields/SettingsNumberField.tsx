import React from 'react';
import type { SettingsNumberFieldDescriptor } from '../../../types/settingsProfile';

const inputClass = 'w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan';
const labelClass = 'block text-cool-gray text-sm mb-2';

interface Props {
  field: SettingsNumberFieldDescriptor;
  value: number;
  onChange: (value: number) => void;
}

export const SettingsNumberField: React.FC<Props> = ({ field, value, onChange }) => {
  const num = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10) || 0;
    let clamped = v;
    if (field.min != null) clamped = Math.max(field.min, clamped);
    if (field.max != null) clamped = Math.min(field.max, clamped);
    onChange(clamped);
  };
  return (
    <div>
      <label className={labelClass}>{field.label}</label>
      <input
        type="number"
        value={num}
        onChange={handleChange}
        className={inputClass}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
      />
    </div>
  );
};
