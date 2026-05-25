import React from 'react';

interface SelectAllButtonsProps {
  onSelectAll: () => void;
  onDeselectAll: () => void;
  selectAllLabel?: string;
}

export const SelectAllButtons: React.FC<SelectAllButtonsProps> = ({
  onSelectAll,
  onDeselectAll,
  selectAllLabel = 'Select All',
}) => (
  <div className="flex gap-2">
    <button onClick={onSelectAll} className="text-sm text-neon-cyan hover:text-neon-cyan-bright">
      {selectAllLabel}
    </button>
    <button onClick={onDeselectAll} className="text-sm text-neon-cyan hover:text-neon-cyan-bright">
      Deselect All
    </button>
  </div>
);
