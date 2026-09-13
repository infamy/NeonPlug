import React from 'react';
import { useScanListsStore } from '../../store/scanListsStore';
import { formatPlural } from '../../utils/formatPlural';
import { ScanListsList } from './ScanListsList';
import { PageHeader } from '../ui/PageHeader';

export const ScanListsTab: React.FC = () => {
  const { scanLists } = useScanListsStore();

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Scan Lists"
        actions={<span>{scanLists.length} {formatPlural(scanLists.length, 'scan list')}</span>}
      />
      {/* Fills the tab like Zones: the list and the editor each scroll inside a
          pane sized to the window. Both were capped at a guessed 100vh-250px,
          which let the page scroll as well. */}
      <div className="flex-1 min-h-0">
        <ScanListsList />
      </div>
    </div>
  );
};

