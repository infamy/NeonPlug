import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { StartupModal } from './components/ui/StartupModal';
import { ConfirmModal } from './components/ui/ConfirmModal';

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
import { useQuickMessagesStore } from './store/quickMessagesStore';
import { useDMRRadioIDsStore } from './store/dmrRadioIdsStore';
import { useQuickContactsStore } from './store/quickContactsStore';
import { useRXGroupsStore } from './store/rxGroupsStore';
import { useEncryptionKeysStore } from './store/encryptionKeysStore';
import { useRadioStore } from './store/radioStore';
import { useRadioConnection } from './hooks/useRadioConnection';
import { importChannelsFromCSV, importContactsFromCSV } from './services/csv';
import { sampleChannels, sampleContacts, sampleZones } from './utils/sampleData';
import { setLogStore } from './utils/protocolLogger';
import { useLogStore } from './store/logStore';

function App() {
  const [activeTab, setActiveTab] = useState('channels');
  const [showStartupModal, setShowStartupModal] = useState(true);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const { setChannels, channels } = useChannelsStore();
  const { setContacts } = useContactsStore();
  const { setZones } = useZonesStore();
  const { setScanLists } = useScanListsStore();
  const { setSettings: setRadioSettings } = useRadioSettingsStore();
  const { setSystems: setDigitalEmergencies, setConfig: setDigitalEmergencyConfig } = useDigitalEmergencyStore();
  const { setSystems: setAnalogEmergencies } = useAnalogEmergencyStore();
  const { setMessages } = useQuickMessagesStore();
  const { setRadioIds } = useDMRRadioIDsStore();
  const { setContacts: setQuickContacts } = useQuickContactsStore();
  const { setGroups: setRXGroups } = useRXGroupsStore();
  const { setKeys: setEncryptionKeys } = useEncryptionKeysStore();
  const { setRadioInfo } = useRadioStore();
  const { isConnecting, error: radioError } = useRadioConnection();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize logger with log store
  const logStore = useLogStore();
  useEffect(() => {
    setLogStore({
      addLog: (entry) => logStore.addLog(entry),
    });
  }, [logStore]);

  // Tell password managers (LastPass, 1Password, Bitwarden) to ignore all input fields in this app
  useEffect(() => {
    const addPasswordManagerIgnore = (input: HTMLInputElement) => {
      // Add all three attributes to ignore password managers
      if (!input.hasAttribute('data-lpignore')) {
        input.setAttribute('data-lpignore', 'true');
      }
      if (!input.hasAttribute('data-1p-ignore')) {
        input.setAttribute('data-1p-ignore', 'true');
      }
      if (!input.hasAttribute('data-bwignore')) {
        input.setAttribute('data-bwignore', 'true');
      }
    };

    // Add to all existing inputs
    document.querySelectorAll('input').forEach(addPasswordManagerIgnore);

    // Watch for new inputs added dynamically
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            // Check if the added node is an input
            if (element.tagName === 'INPUT') {
              addPasswordManagerIgnore(element as HTMLInputElement);
            }
            // Check for inputs within the added node
            element.querySelectorAll?.('input').forEach(addPasswordManagerIgnore);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  const handleReadFromRadio = () => {
    // Close startup modal - the Toolbar's handleRead will show the progress modal
    setShowStartupModal(false);
    // Small delay to ensure modal closes, then trigger the read button
    setTimeout(() => {
      const readButton = document.querySelector('[data-action="read-from-radio"]') as HTMLButtonElement;
      if (readButton && !readButton.disabled) {
        readButton.click();
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

    // Check if it's a codeplug file (.neonplug = zipped JSON)
    if (fileExtension === 'neonplug') {
      try {
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
        setRadioInfo(codeplugData.radioInfo ?? null);
        setMessages(codeplugData.messages ?? []);
        setRadioIds(codeplugData.radioIds ?? []);
        setQuickContacts(codeplugData.quickContacts ?? []);
        setRXGroups(codeplugData.rxGroups ?? []);
        setEncryptionKeys(codeplugData.encryptionKeys ?? []);
        
        setShowStartupModal(false);
        const lines = [
          `• ${codeplugData.channels.length} channels`,
          `• ${codeplugData.zones.length} zones`,
          `• ${codeplugData.scanLists.length} scan lists`,
          `• ${codeplugData.contacts.length} contacts`,
          `• ${codeplugData.digitalEmergencies?.length ?? 0} digital emergency system(s)`,
          `• ${codeplugData.analogEmergencies?.length ?? 0} analog emergency system(s)`,
          codeplugData.radioSettings ? '• Radio settings' : null,
          `• ${codeplugData.messages?.length ?? 0} quick message(s)`,
          `• ${codeplugData.radioIds?.length ?? 0} DMR radio ID(s)`,
          `• ${codeplugData.quickContacts?.length ?? 0} talk group(s)`,
          `• ${codeplugData.rxGroups?.length ?? 0} RX group(s)`,
          `• ${codeplugData.encryptionKeys?.length ?? 0} encryption key(s)`,
        ].filter(Boolean);
        setAlertMessage(`Successfully imported codeplug!\n\n${lines.join('\n')}`);
        setAlertOpen(true);
      } catch (error) {
        setAlertMessage(`Failed to import codeplug: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setAlertOpen(true);
      }
    } else {
      // Legacy CSV import support
      const text = await file.text();

      if (fileName.includes('channel')) {
        const result = importChannelsFromCSV(text);
        if (result.success && result.channels) {
          setChannels(result.channels);
          setShowStartupModal(false);
          setAlertMessage(`Successfully imported ${result.channels.length} channels`);
          setAlertOpen(true);
        } else {
          setAlertMessage(`Import failed: ${result.errors?.join(', ') || 'Unknown error'}`);
          setAlertOpen(true);
        }
      } else if (fileName.includes('contact')) {
        const result = importContactsFromCSV(text);
        if (result.success && result.contacts) {
          setContacts(result.contacts);
          setShowStartupModal(false);
          setAlertMessage(`Successfully imported ${result.contacts.length} contacts`);
          setAlertOpen(true);
        } else {
          setAlertMessage(`Import failed: ${result.errors?.join(', ') || 'Unknown error'}`);
          setAlertOpen(true);
        }
      } else {
        setAlertMessage('File must be a codeplug (.neonplug) or CSV file containing "channel" or "contact" in the filename');
        setAlertOpen(true);
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

  // Don't show startup modal if we're already reading; show it again if reading stops with error or no data
  useEffect(() => {
    if (isConnecting) {
      setShowStartupModal(false);
    } else if (!isConnecting && (radioError || channels.length === 0)) {
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
      <StartupModal
        isOpen={showStartupModal && !isConnecting}
        onReadFromRadio={handleReadFromRadio}
        onLoadFile={handleLoadFile}
        onDismiss={handleDismissStartup}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.neonplug"
        onChange={handleFileSelect}
        className="hidden"
      />
      <ConfirmModal
        isOpen={alertOpen}
        onClose={() => setAlertOpen(false)}
        title="Import"
        message={alertMessage}
        confirmLabel="OK"
        variant="alert"
      />
    </>
  );
}

export default App;
