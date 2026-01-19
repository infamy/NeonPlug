import React from 'react';
import { useDebugStore } from '../../store/debugStore';

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'channels', label: 'Channels' },
  { id: 'zones', label: 'Zones' },
  { id: 'scanlists', label: 'Scan Lists' },
  { id: 'contacts', label: 'CSV Contacts' },
  { id: 'digital', label: 'Digital' },
  { id: 'settings', label: 'Settings' },
  { id: 'import', label: 'Channel Wizard' },
  { id: 'about', label: 'About' },
  { id: 'diagnostics', label: '🐛', title: 'Diagnostics' },
];

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  const { debugMode } = useDebugStore();

  return (
    <div className="border-b border-deep-gray bg-deep-gray">
      <div className="flex space-x-1 px-4">
        {tabs.map((tab) => {
          const isHidden = tab.id === 'diagnostics' && !debugMode;
          if (isHidden) return null;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                px-6 py-3 font-medium transition-all duration-200
                ${
                  activeTab === tab.id
                    ? 'text-neon-magenta border-b-2 border-neon-magenta shadow-glow-magenta'
                    : 'text-cool-gray hover:text-white'
                }
              `}
              title={tab.title}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

