import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { DebugPanel } from './components/ui/DebugPanel';
import { StartupModal } from './components/ui/StartupModal';

// Lazy load tabs for better code splitting - only load when tab is active
const ChannelsTab = lazy(() => import('./components/channels/ChannelsTab').then(m => ({ default: m.ChannelsTab })));
const ZonesTab = lazy(() => import('./components/zones/ZonesTab').then(m => ({ default: m.ZonesTab })));
const ScanListsTab = lazy(() => import('./components/scanlists/ScanListsTab').then(m => ({ default: m.ScanListsTab })));
const ContactsTab = lazy(() => import('./components/contacts/ContactsTab').then(m => ({ default: m.ContactsTab })));
const DigitalTab = lazy(() => import('./components/digital/DigitalTab').then(m => ({ default: m.DigitalTab })));
const SettingsTab = lazy(() => import('./components/settings/SettingsTab').then(m => ({ default: m.SettingsTab })));
const SmartImportTab = lazy(() => import('./components/import/SmartImportTab').then(m => ({ default: m.SmartImportTab })));
const AboutTab = lazy(() => import('./components/about/AboutTab').then(m => ({ default: m.AboutTab })));
const DiagnosticsTab = lazy(() => import('./components/diagnostics/DiagnosticsTab').then(m => ({ default: m.DiagnosticsTab })));
import { useChannelsStore } from './store/channelsStore';
import { useContactsStore } from './store/contactsStore';
import { useZonesStore } from './store/zonesStore';
import { useScanListsStore } from './store/scanListsStore';
import { useRadioSettingsStore } from './store/radioSettingsStore';
import { useDigitalEmergencyStore } from './store/digitalEmergencyStore';
import { useAnalogEmergencyStore } from './store/analogEmergencyStore';
import { useRadioConnection } from './hooks/useRadioConnection';
import { importChannelsFromCSV, importContactsFromCSV } from './services/csv';
import { sampleChannels, sampleContacts, sampleZones } from './utils/sampleData';
import { setLogStore } from './protocol/dm32uv/logger';
import { useLogStore } from './store/logStore';

function App() {
  const [activeTab, setActiveTab] = useState('channels');
  const [showStartupModal, setShowStartupModal] = useState(true);
  const { setChannels, channels } = useChannelsStore();
  const { setContacts } = useContactsStore();
  const { setZones } = useZonesStore();
  const { setScanLists } = useScanListsStore();
  const { setSettings: setRadioSettings } = useRadioSettingsStore();
  const { setSystems: setDigitalEmergencies, setConfig: setDigitalEmergencyConfig } = useDigitalEmergencyStore();
  const { setSystems: setAnalogEmergencies } = useAnalogEmergencyStore();
  const { isConnecting, error: radioError } = useRadioConnection();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize logger with log store
  const logStore = useLogStore();
  useEffect(() => {
    setLogStore({
      addLog: (entry) => logStore.addLog(entry),
    });
  }, [logStore]);

  const handleReadFromRadio = () => {
    // Close startup modal - the Toolbar's handleRead will show the progress modal
    setShowStartupModal(false);
    // Small delay to ensure modal closes, then trigger the read button
    setTimeout(() => {
      // Find and click the "Read from Radio" button in the toolbar
      const readButton = document.querySelector('button') as HTMLButtonElement;
      if (readButton && readButton.textContent?.includes('Read from Radio')) {
        readButton.click();
      } else {
        // Fallback: try to find by looking for buttons with that text
        const buttons = Array.from(document.querySelectorAll('button'));
        const readBtn = buttons.find(btn => btn.textContent?.trim() === 'Read from Radio');
        if (readBtn) {
          (readBtn as HTMLButtonElement).click();
        }
      }
    }, 100);
  };

  const handleLoadFile = () => {
    setShowStartupModal(false);
    // Small delay to ensure modal closes before file dialog opens
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 100);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop()?.toLowerCase();

    // Check if it's a codeplug XLSX file
    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      try {
        // Lazy load XLSX library only when needed
        const { importCodeplug } = await import('./services/codeplugExport');
        const codeplugData = await importCodeplug(file);
        
        // Populate all stores with imported data
        setChannels(codeplugData.channels);
        setZones(codeplugData.zones);
        setScanLists(codeplugData.scanLists);
        setContacts(codeplugData.contacts);
        setDigitalEmergencies(codeplugData.digitalEmergencies);
        if (codeplugData.digitalEmergencyConfig) {
          setDigitalEmergencyConfig(codeplugData.digitalEmergencyConfig);
        }
        setAnalogEmergencies(codeplugData.analogEmergencies);
        if (codeplugData.radioSettings) {
          setRadioSettings(codeplugData.radioSettings);
        }
        
        setShowStartupModal(false);
        alert(
          `Successfully imported codeplug!\n\n` +
          `• ${codeplugData.channels.length} channels\n` +
          `• ${codeplugData.zones.length} zones\n` +
          `• ${codeplugData.scanLists.length} scan lists\n` +
          `• ${codeplugData.contacts.length} contacts`
        );
      } catch (error) {
        alert(`Failed to import codeplug: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // Legacy CSV import support
      const text = await file.text();

      if (fileName.includes('channel')) {
        const result = importChannelsFromCSV(text);
        if (result.success && result.channels) {
          setChannels(result.channels);
          setShowStartupModal(false);
          alert(`Successfully imported ${result.channels.length} channels`);
        } else {
          alert(`Import failed: ${result.errors?.join(', ') || 'Unknown error'}`);
        }
      } else if (fileName.includes('contact')) {
        const result = importContactsFromCSV(text);
        if (result.success && result.contacts) {
          setContacts(result.contacts);
          setShowStartupModal(false);
          alert(`Successfully imported ${result.contacts.length} contacts`);
        } else {
          alert(`Import failed: ${result.errors?.join(', ') || 'Unknown error'}`);
        }
      } else {
        alert('File must be a codeplug (.xlsx/.xls) or CSV file containing "channel" or "contact" in the filename');
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDismissStartup = () => {
    setShowStartupModal(false);
    // Load sample data if user dismisses
    setChannels(sampleChannels);
    setContacts(sampleContacts);
    setZones(sampleZones);
  };

  // Don't show startup modal if we're already reading
  // Show it again if reading stops and there's an error or no data loaded
  useEffect(() => {
    if (isConnecting) {
      setShowStartupModal(false);
    } else if (!isConnecting && (radioError || channels.length === 0)) {
      // If we're not connecting and there's an error or no data, show startup modal again
      // This handles the case where radio wasn't found
      if (radioError && radioError.includes('Radio not found')) {
        setShowStartupModal(true);
      }
    }
  }, [isConnecting, radioError, channels.length]);

  const renderTabContent = () => {
    const TabComponent = (() => {
      switch (activeTab) {
        case 'channels': return ChannelsTab;
        case 'zones': return ZonesTab;
        case 'scanlists': return ScanListsTab;
        case 'contacts': return ContactsTab;
        case 'digital': return DigitalTab;
        case 'settings': return SettingsTab;
        case 'import': return SmartImportTab;
        case 'diagnostics': return DiagnosticsTab;
        case 'about': return AboutTab;
        default: return ChannelsTab;
      }
    })();
    
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-full text-neon-cyan">Loading...</div>}>
        <TabComponent />
      </Suspense>
    );
  };

  return (
    <>
      <MainLayout activeTab={activeTab} onTabChange={setActiveTab}>
        {renderTabContent()}
      </MainLayout>
      <DebugPanel />
      <StartupModal
        isOpen={showStartupModal && !isConnecting}
        onReadFromRadio={handleReadFromRadio}
        onLoadFile={handleLoadFile}
        onDismiss={handleDismissStartup}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
      />
    </>
  );
}

export default App;
