import React from 'react';
import { useScanListsStore } from '../../store/scanListsStore';
import { formatPlural } from '../../utils/formatPlural';
import { ScanListsList } from './ScanListsList';
import { PageHeader } from '../ui/PageHeader';

export const ScanListsTab: React.FC = () => {
  const { scanLists } = useScanListsStore();

  return (
    <div className="h-full">
      <PageHeader
        title="Scan Lists"
        actions={<span>{scanLists.length} {formatPlural(scanLists.length, 'scan list')}</span>}
      />
      <ScanListsList />
    </div>
  );
};

