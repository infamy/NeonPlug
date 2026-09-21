import React, { useMemo, useEffect } from 'react';
import { useDebugStore } from '../../store/debugStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const ALL_TABS = [
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
  const { caps } = useRadioCapabilities();

  const tabs = useMemo(() => {
    return ALL_TABS.filter((tab) => {
      if (tab.id === 'diagnostics' && !debugMode) return false;
      if (tab.id === 'zones' && caps?.supportsZones === false) return false;
      if (tab.id === 'scanlists' && caps?.supportsScanLists === false) return false;
      if (tab.id === 'contacts' && caps?.supportsContacts === false) return false;
      if (tab.id === 'digital' && caps?.analogOnly === true) return false;
      return true;
    });
  }, [debugMode, caps?.supportsZones, caps?.supportsScanLists, caps?.supportsContacts, caps?.analogOnly]);

  useEffect(() => {
    const visibleIds = tabs.map((t) => t.id);
    if (!visibleIds.includes(activeTab)) {
      onTabChange('channels');
    }
  }, [tabs, activeTab, onTabChange]);

  return (
    <div className="border-b border-deep-gray bg-deep-gray">
      {/* Wraps onto a second row rather than running off the edge of a narrow
          window, and each label stays on one line. */}
      <div className="flex flex-wrap gap-x-1 px-4" role="tablist" aria-label="Codeplug sections">
        {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-label={tab.title}
              onClick={() => onTabChange(tab.id)}
              // Every tab carries its 2px bottom border ALL the time — transparent
              // when inactive — and only colours and the glow animate. The border
              // used to appear on the active tab only, under transition-all, so
              // its WIDTH animated: the tab bar changed height mid-transition and
              // everything below it jumped a pixel about 200ms after each click.
              className={`
                px-4 xl:px-6 py-3 whitespace-nowrap font-medium border-b-2 transition-[color,border-color,box-shadow] duration-200
                ${
                  activeTab === tab.id
                    ? 'text-neon-magenta border-neon-magenta shadow-glow-magenta'
                    : 'text-cool-gray border-transparent hover:text-white'
                }
              `}
              title={tab.title}
            >
              {tab.label}
            </button>
        ))}
      </div>
    </div>
  );
};

