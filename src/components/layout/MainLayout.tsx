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
    <div className="min-h-screen bg-dark-charcoal flex flex-col">
      <StatusBar />
      <Toolbar />
      <TabNavigation activeTab={activeTab} onTabChange={onTabChange} />
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
};

