import React from 'react';
import { useRadioStore } from '../../store/radioStore';

/**
 * A slim progress strip for long radio operations, shown wherever you are.
 *
 * Reads from the store rather than from whichever component started the job:
 * a contact download runs for minutes, the Contacts tab unmounts the moment you
 * switch tabs, and losing the only indication that the radio is busy is both
 * confusing and unsafe — it is exactly when someone starts a second operation
 * and locks the port.
 *
 * Renders nothing for short operations, which never publish progress.
 */
export const RadioProgressBar: React.FC = () => {
  const { radioProgress } = useRadioStore();
  if (!radioProgress) return null;

  const { label, percent, message } = radioProgress;
  return (
    <div className="w-full bg-deep-gray border-b border-neon-cyan border-opacity-30">
      <div className="px-4 py-1.5 flex items-center gap-3 text-xs">
        <span className="text-neon-cyan font-medium whitespace-nowrap">{label}</span>
        <div className="flex-1 h-1.5 bg-black bg-opacity-40 rounded overflow-hidden min-w-[80px]">
          <div
            className="h-full bg-neon-cyan transition-[width] duration-300"
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        </div>
        <span className="text-cool-gray tabular-nums whitespace-nowrap">{percent}%</span>
        {/* Truncated, not wrapped: this strip must not change height mid-read
            and push the whole page around. */}
        <span className="text-muted truncate max-w-[46ch] hidden sm:inline">{message}</span>
      </div>
    </div>
  );
};
