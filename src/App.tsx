import { useState, useEffect, useRef } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { ChannelsTab } from './components/channels/ChannelsTab';
import { ZonesTab } from './components/zones/ZonesTab';
import { ScanListsTab } from './components/scanlists/ScanListsTab';
import { ContactsTab } from './components/contacts/ContactsTab';
import { SettingsTab } from './components/settings/SettingsTab';
import { SmartImportTab } from './components/import/SmartImportTab';
import { AboutTab } from './components/about/AboutTab';
import { MessagesAndGroupsTab } from './components/messages/MessagesAndGroupsTab';
import { DebugPanel } from './components/ui/DebugPanel';
import { StartupModal } from './components/ui/StartupModal';
import { useChannelsStore } from './store/channelsStore';
import { useContactsStore } from './store/contactsStore';
import { useZonesStore } from './store/zonesStore';
import { useRadioConnection } from './hooks/useRadioConnection';
import { importChannelsFromCSV, importContactsFromCSV } from './services/csv';
import { sampleChannels, sampleContacts, sampleZones } from './utils/sampleData';

function App() {
  const [activeTab, setActiveTab] = useState('channels');
  const [showStartupModal, setShowStartupModal] = useState(true);
  const { setChannels, channels } = useChannelsStore();
  const { setContacts } = useContactsStore();
  const { setZones } = useZonesStore();
  const { isConnecting, error: radioError } = useRadioConnection();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const text = await file.text();
    const fileName = file.name.toLowerCase();

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
      alert('File name must contain "channel" or "contact" to determine import type');
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
    switch (activeTab) {
      case 'channels':
        return <ChannelsTab />;
      case 'zones':
        return <ZonesTab />;
      case 'scanlists':
        return <ScanListsTab />;
      case 'contacts':
        return <ContactsTab />;
      case 'settings':
        return <SettingsTab />;
      case 'import':
        return <SmartImportTab />;
      case 'about':
        return <AboutTab />;
      case 'messages':
        return <MessagesAndGroupsTab />;
      default:
        return <ChannelsTab />;
    }
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
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />
    </>
  );
}

export default App;
