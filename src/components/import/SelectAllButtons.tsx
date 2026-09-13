import React from 'react';
import { BUTTON } from '../ui/controlStyles';

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
    <button onClick={onSelectAll} className={`${BUTTON.link} text-sm`}>
      {selectAllLabel}
    </button>
    <button onClick={onDeselectAll} className={`${BUTTON.link} text-sm`}>
      Deselect All
    </button>
  </div>
);
