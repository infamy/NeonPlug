import React from 'react';
import { TabNavigation } from './TabNavigation';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { RadioProgressBar } from './RadioProgressBar';

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
      <RadioProgressBar />
      <TabNavigation activeTab={activeTab} onTabChange={onTabChange} />
      {/* Single scroll surface for tabs that overflow; tabs that manage their
          own height (Channels) fit exactly and produce no scrollbar here. */}
      {/* The ONLY scroll container for tab content, with its scrollbar gutter
          reserved whether or not a tab overflows. On a system that draws real
          scrollbars (10px here) content used to shift sideways switching
          between tabs that scroll and tabs that do not — and several tabs
          scrolled inside their own roots instead, a second scrollbar in a
          different place. */}
      <main className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] p-6">
        {children}
      </main>
    </div>
  );
};

