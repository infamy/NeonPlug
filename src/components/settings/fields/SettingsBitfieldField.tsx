import React from 'react';
import type { SettingsBitfieldFieldDescriptor } from '../../../types/settingsProfile';

const checkboxClass = 'w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan';
const labelClass = 'text-cool-gray text-sm';

interface Props {
  field: SettingsBitfieldFieldDescriptor;
  value: number;
  onChange: (value: number) => void;
}

export const SettingsBitfieldField: React.FC<Props> = ({ field, value, onChange }) => {
  const num = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return (
    <div className="space-y-2">
      {field.bits.map(({ bitIndex, label }) => {
        const checked = (num & (1 << bitIndex)) !== 0;
        const inputId = `settings-bitfield-${field.key}-${bitIndex}`;
        return (
          <div key={bitIndex} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={inputId}
              checked={checked}
              onChange={(e) => {
                const newValue = e.target.checked
                  ? num | (1 << bitIndex)
                  : num & ~(1 << bitIndex);
                onChange(newValue);
              }}
              className={checkboxClass}
            />
            <label htmlFor={inputId} className={labelClass}>{label}</label>
          </div>
        );
      })}
    </div>
  );
};
