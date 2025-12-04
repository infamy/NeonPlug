import React from 'react';
import { useContactsStore } from '../../store/contactsStore';

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'channels', label: 'Channels' },
  { id: 'zones', label: 'Zones' },
  { id: 'scanlists', label: 'Scan Lists' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'settings', label: 'Settings' },
  { id: 'import', label: 'Smart Import' },
  { id: 'about', label: 'About' },
];

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  const { contactsLoaded } = useContactsStore();
  const contactsTab = tabs.find(t => t.id === 'contacts');
  const isContactsDisabled = !contactsLoaded;

  return (
    <div className="border-b border-deep-gray bg-deep-gray">
      <div className="flex space-x-1 px-4">
        {tabs.map((tab) => {
          const isDisabled = tab.id === 'contacts' && isContactsDisabled;
          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && onTabChange(tab.id)}
              disabled={isDisabled}
              className={`
                px-6 py-3 font-medium transition-all duration-200
                ${
                  isDisabled
                    ? 'text-gray-600 cursor-not-allowed opacity-50'
                    : activeTab === tab.id
                    ? 'text-neon-magenta border-b-2 border-neon-magenta shadow-glow-magenta'
                    : 'text-cool-gray hover:text-white'
                }
              `}
              title={isDisabled ? 'Contacts not loaded. Read from radio first.' : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

