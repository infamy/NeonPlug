import React, { useState } from 'react';
import { parseFrequencyInput } from '../../utils/frequencyInput';
import { FIELD, FIELD_INVALID } from '../ui/controlStyles';

interface FrequencyInputProps {
  value: number;
  onChange: (mhz: number) => void;
  /** Size and layout only. The look comes from here: FIELD, or FIELD_INVALID when something is wrong. */
  className?: string;
  /** What is wrong with the saved value on this radio, like being outside its bands. */
  problem?: string | null;
  /** Show what is wrong under the field as well as in its tooltip. */
  showMessage?: boolean;
  /** Told when the typed text stops or starts being a frequency, so a dialog can refuse to save. */
  onValidityChange?: (error: string | null) => void;
  'aria-label'?: string;
}

const format = (mhz: number) => mhz.toFixed(4);

/**
 * A frequency in MHz, saved on blur or Enter. Text that isn't a frequency stays
 * in the field, marked, until it is fixed or Escape brings back the saved value.
 * The grid and the channel editor each had a copy of this, and both reverted
 * such text without a word.
 */
export const FrequencyInput: React.FC<FrequencyInputProps> = ({
  value,
  onChange,
  className = '',
  problem,
  showMessage = false,
  onValidityChange,
  'aria-label': ariaLabel,
}) => {
  // What is being typed; null while the field shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValidity = (next: string | null) => {
    setError(next);
    onValidityChange?.(next);
  };

  const commit = () => {
    if (draft === null) return;
    const parsed = parseFrequencyInput(draft);
    if (!parsed.ok) {
      setValidity(parsed.error);
      return;
    }
    setDraft(null);
    setValidity(null);
    if (Math.abs(parsed.mhz - value) > 1e-9) onChange(parsed.mhz);
  };

  const message = error ?? problem ?? null;
  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? format(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            setValidity(null);
          }
        }}
        aria-invalid={message ? true : undefined}
        aria-label={ariaLabel}
        title={message ?? undefined}
        className={`${message ? FIELD_INVALID : FIELD} ${className}`}
      />
      {showMessage && message && <p className="text-xs text-red-300 mt-0.5">{message}</p>}
    </>
  );
};
