import React from 'react';
import { TabNavigation } from './TabNavigation';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';

interface MainLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="h-screen overflow-hidden bg-dark-charcoal flex flex-col">
      <StatusBar />
      <Toolbar />
      <TabNavigation activeTab={activeTab} onTabChange={onTabChange} />
      {/* Single scroll surface for tabs that overflow; tabs that manage their
          own height (Channels) fit exactly and produce no scrollbar here. */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
};

