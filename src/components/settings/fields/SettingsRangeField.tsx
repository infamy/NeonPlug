import React from 'react';
import type { SettingsRangeFieldDescriptor } from '../../../types/settingsProfile';

const labelClass = 'block text-cool-gray text-sm mb-2';
const rangeClass = 'w-full h-2 bg-deep-gray rounded-lg appearance-none cursor-pointer accent-neon-cyan';

interface Props {
  field: SettingsRangeFieldDescriptor;
  value: number;
  onChange: (value: number) => void;
}

export const SettingsRangeField: React.FC<Props> = ({ field, value, onChange }) => {
  const num = typeof value === 'number' && !Number.isNaN(value) ? value : field.min;
  const clamped = Math.max(field.min, Math.min(field.max, num));
  const step = field.step ?? 1;
  const pct = ((clamped - field.min) / (field.max - field.min)) * 100;
  return (
    <div>
      <label className={labelClass}>
        {field.label}: {clamped}
      </label>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={step}
        value={clamped}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || field.min)}
        className={rangeClass}
        style={{
          background: `linear-gradient(to right, #00FFF7 0%, #00FFF7 ${pct}%, #1a1a1a ${pct}%, #1a1a1a 100%)`,
        }}
      />
    </div>
  );
};
