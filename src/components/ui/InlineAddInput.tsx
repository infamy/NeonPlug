import React from 'react';
import { Button } from './Button';
import { FIELD } from './controlStyles';

interface InlineAddInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
  maxLength?: number;
  buttonLabel?: string;
  inputClassName?: string;
}

const INPUT_CLASS =
  `${FIELD} border rounded px-2 py-1 text-xs w-32`;

export const InlineAddInput: React.FC<InlineAddInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  maxLength,
  buttonLabel = 'Add',
  inputClassName = '',
}) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit();
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        className={`${INPUT_CLASS} ${inputClassName}`.trim()}
        maxLength={maxLength}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="primary"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="px-3 py-1 text-xs"
      >
        {buttonLabel}
      </Button>
    </div>
  );
};
