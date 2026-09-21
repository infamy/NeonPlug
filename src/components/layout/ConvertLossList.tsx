/** What converting a codeplug removes or changes, as a list. The wording is convertLoss.ts. */

import React from 'react';
import type { MigrationLoss } from '../../services/codeplugMigration';
import { describeMigrationLoss } from './convertLoss';

export const ConvertLossList: React.FC<{ loss: MigrationLoss }> = ({ loss }) => {
  const items = describeMigrationLoss(loss);
  if (items.length === 0) return <p className="text-xs text-cool-gray">Nothing is removed or changed.</p>;
  return (
    <ul className="ml-4 list-disc space-y-0.5 text-xs text-cool-gray">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
};
