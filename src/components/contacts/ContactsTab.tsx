import React, { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioStore } from '../../store/radioStore';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { ContactsTable } from './ContactsTable';
import { ProgressBar } from '../ui/ProgressBar';
import { getContactCapacityWithFallback } from '../../utils/firmware';
import { fetchRadioIDUsers, COUNTRIES_BY_REGION, type CountryRegion } from '../../services/radioidApi';
import type { Contact } from '../../models/Contact';

// Component for region selector with indeterminate checkbox support
const RegionSelector: React.FC<{
  region: CountryRegion;
  selectedCountries: string[];
  allRegionSelected: boolean;
  someRegionSelected: boolean;
  regionSelectedCount: number;
  onToggleRegion: () => void;
  onToggleCountry: (country: string) => void;
}> = ({ region, selectedCountries, allRegionSelected, someRegionSelected, regionSelectedCount, onToggleRegion, onToggleCountry }) => {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someRegionSelected;
    }
  }, [someRegionSelected]);

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-2 pb-1 border-b border-neon-cyan border-opacity-20">
        <h4 className="text-sm font-semibold text-neon-cyan">
          {region.name}
        </h4>
        <label className="flex items-center cursor-pointer hover:text-neon-cyan">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allRegionSelected}
            onChange={onToggleRegion}
            className="mr-2 w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan border-opacity-30 rounded focus:ring-neon-cyan focus:ring-1"
          />
          <span className="text-xs text-cool-gray">
            {allRegionSelected ? 'Deselect All' : 'Select All'} ({regionSelectedCount}/{region.countries.length})
          </span>
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 ml-2">
        {region.countries.map(country => (
          <label key={country} className="flex items-center cursor-pointer hover:text-neon-cyan">
            <input
              type="checkbox"
              checked={selectedCountries.includes(country)}
              onChange={() => onToggleCountry(country)}
              className="mr-2 w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan border-opacity-30 rounded focus:ring-neon-cyan focus:ring-1"
            />
            <span className="text-sm text-cool-gray">{country}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export const ContactsTab: React.FC = () => {
  const { contacts, contactsLoaded, setContacts } = useContactsStore();
  const { radioInfo } = useRadioStore();
  const { readContacts, isConnecting } = useRadioConnection();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [customCountry, setCustomCountry] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null);
  
  const contactCapacity = radioInfo 
    ? getContactCapacityWithFallback(
        radioInfo.vframes.get(0x0F),
        radioInfo.firmware
      )
    : 50000;

  const handleReadContacts = async () => {
    setProgress(0);
    setProgressMessage('');
    try {
      await readContacts((progress, message) => {
        setProgress(progress);
        setProgressMessage(message);
      });
    } catch (err) {
      console.error('Error reading contacts:', err);
    } finally {
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
      }, 2000);
    }
  };

  const handleDownloadFromRadioID = async () => {
    const countriesToFetch = [...selectedCountries];
    if (customCountry.trim()) {
      countriesToFetch.push(customCountry.trim());
    }

    if (countriesToFetch.length === 0) {
      setDownloadError('Please select at least one country');
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);
    setTruncationWarning(null);
    setProgress(0);
    setProgressMessage('');

    try {
      const radioIDUsers = await fetchRadioIDUsers(countriesToFetch, (message, progress) => {
        setProgressMessage(message);
        setProgress(progress);
      });

      // Convert RadioID users to Contact format in batches to avoid stack overflow
      // Assign sequential IDs starting from 1
      setProgressMessage('Converting contacts...');
      setProgress(95);
      
      const allContacts: Contact[] = [];
      let contactId = 1;
      
      // Filter and convert in batches with async breaks to prevent stack overflow
      // Process in smaller chunks and yield frequently to prevent call stack buildup
      const SMALL_BATCH = 1000; // Process 1k at a time for conversion
      for (let i = 0; i < radioIDUsers.length; i += SMALL_BATCH) {
        const batch = radioIDUsers.slice(i, i + SMALL_BATCH);
        
        // Filter and convert in one pass to avoid intermediate arrays
        for (const user of batch) {
          if (user.id && user.id > 0) {
            allContacts.push({
              id: contactId++,
              name: (user.name || user.callsign || `DMR ${user.id}`).substring(0, 16), // Max 16 chars
              dmrId: user.id,
              callSign: user.callsign || undefined,
            });
          }
        }
        
        // Update progress and yield to event loop every small batch
        if (i % (SMALL_BATCH * 10) === 0 || i + SMALL_BATCH >= radioIDUsers.length) {
          setProgressMessage(`Converting contacts... ${Math.min(i + SMALL_BATCH, radioIDUsers.length).toLocaleString()} / ${radioIDUsers.length.toLocaleString()}`);
        }
        
        // Yield to event loop every batch to prevent stack overflow
        if (i % (SMALL_BATCH * 5) === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      // Check if we need to truncate
      const totalContacts = allContacts.length;
      const contactsToSave = allContacts.slice(0, contactCapacity); // Limit to contact capacity
      const truncated = totalContacts > contactCapacity;

      // Replace all contacts with downloaded ones
      // For very large arrays, update in a way that doesn't block
      setProgressMessage('Saving contacts...');
      setProgress(99);
      
      // Use requestIdleCallback or setTimeout to defer the update
      // This prevents blocking the main thread with a huge state update
      await new Promise<void>((resolve) => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            startTransition(() => {
              setContacts(contactsToSave);
            });
            resolve();
          }, { timeout: 1000 });
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(() => {
            startTransition(() => {
              setContacts(contactsToSave);
            });
            resolve();
          }, 50);
        }
      });

      if (truncated) {
        const removed = totalContacts - contactCapacity;
        setTruncationWarning(
          `Warning: ${removed.toLocaleString()} contact${removed === 1 ? '' : 's'} were removed due to limited space. ` +
          `Your radio supports ${contactCapacity.toLocaleString()} contacts, but ${totalContacts.toLocaleString()} were downloaded.`
        );
      }

      setProgressMessage(`Successfully downloaded ${contacts.length.toLocaleString()} contact${contacts.length === 1 ? '' : 's'} from ${countriesToFetch.length} countr${countriesToFetch.length === 1 ? 'y' : 'ies'}`);
      setProgress(100);

      // Clear selection after successful download
      setSelectedCountries([]);
      setCustomCountry('');

      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
      }, 5000); // Show message longer if there's a warning
    } catch (error) {
      console.error('Error downloading from RadioID.net:', error);
      setDownloadError(error instanceof Error ? error.message : 'Failed to download contacts from RadioID.net');
      setProgress(0);
      setProgressMessage('');
    } finally {
      setIsDownloading(false);
    }
  };

  const toggleCountry = useCallback((country: string) => {
    setSelectedCountries(prev => 
      prev.includes(country)
        ? prev.filter(c => c !== country)
        : [...prev, country]
    );
  }, []);

  const toggleRegion = useCallback((regionCountries: string[]) => {
    setSelectedCountries(prev => {
      const allSelected = regionCountries.every(country => prev.includes(country));
      
      if (allSelected) {
        // Deselect all countries in this region
        return prev.filter(c => !regionCountries.includes(c));
      } else {
        // Select all countries in this region (add missing ones)
        const newSelection = [...prev];
        regionCountries.forEach(country => {
          if (!newSelection.includes(country)) {
            newSelection.push(country);
          }
        });
        return newSelection;
      }
    });
  }, []);

  // Memoize region toggle handlers to prevent infinite re-renders
  const regionToggleHandlers = useMemo(() => {
    const handlers = new Map<string, () => void>();
    COUNTRIES_BY_REGION.forEach(region => {
      handlers.set(region.name, () => toggleRegion(region.countries));
    });
    return handlers;
  }, [toggleRegion]);

  if (!contactsLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-neon-cyan mb-4">Contacts Not Loaded</h2>
          <p className="text-cool-gray mb-4">
            Contacts have not been read from the radio yet. Reading contacts can take a long time
            as it requires discovering and reading contact blocks from a large memory range.
          </p>
          {radioInfo && (
            <p className="text-cool-gray mb-6 text-sm">
              Firmware: {radioInfo.firmware} - Capacity: {contactCapacity.toLocaleString()} contacts
            </p>
          )}
          <button
            onClick={handleReadContacts}
            disabled={isConnecting}
            className="px-6 py-3 bg-neon-cyan text-dark-charcoal font-semibold rounded-lg hover:bg-neon-cyan-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? 'Reading Contacts...' : 'Read Contacts from Radio'}
          </button>
          {isConnecting && (
            <div className="mt-4">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* RadioID.net Download Section */}
      <div className="mb-6 bg-deep-gray rounded-lg border border-neon-cyan border-opacity-30 p-4">
        <h3 className="text-lg font-semibold text-neon-cyan mb-3">Download from RadioID.net</h3>
        <p className="text-cool-gray text-sm mb-4">
          Select countries to download DMR contacts. This will replace all current contacts.
        </p>
        
        <div className="mb-4">
          <label className="block text-sm text-cool-gray mb-2">Select Countries by Region:</label>
          <div className="max-h-96 overflow-y-auto border border-neon-cyan border-opacity-20 rounded p-3 bg-dark-charcoal">
            {COUNTRIES_BY_REGION.map(region => {
              const regionSelectedCount = region.countries.filter(c => selectedCountries.includes(c)).length;
              const allRegionSelected = regionSelectedCount === region.countries.length;
              const someRegionSelected = regionSelectedCount > 0 && regionSelectedCount < region.countries.length;
              
              return (
                <RegionSelector
                  key={region.name}
                  region={region}
                  selectedCountries={selectedCountries}
                  allRegionSelected={allRegionSelected}
                  someRegionSelected={someRegionSelected}
                  regionSelectedCount={regionSelectedCount}
                  onToggleRegion={regionToggleHandlers.get(region.name)!}
                  onToggleCountry={toggleCountry}
                />
              );
            })}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-cool-gray mb-2">Or enter custom country name:</label>
          <input
            type="text"
            value={customCountry}
            onChange={(e) => setCustomCountry(e.target.value)}
            placeholder="e.g., United States, Canada"
            className="w-full px-3 py-2 bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleDownloadFromRadioID}
            disabled={isDownloading || (selectedCountries.length === 0 && !customCountry.trim())}
            className="px-4 py-2 bg-neon-cyan text-dark-charcoal font-semibold rounded hover:bg-neon-cyan-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? 'Downloading...' : 'Download Contacts'}
          </button>
          
          {selectedCountries.length > 0 && (
            <span className="text-sm text-cool-gray">
              {selectedCountries.length} countr{selectedCountries.length === 1 ? 'y' : 'ies'} selected
            </span>
          )}
        </div>

        {downloadError && (
          <div className="mt-3 p-2 bg-red-900 bg-opacity-30 border border-red-600 border-opacity-50 rounded text-red-300 text-sm">
            {downloadError}
          </div>
        )}

        {truncationWarning && (
          <div className="mt-3 p-2 bg-yellow-900 bg-opacity-30 border border-yellow-600 border-opacity-50 rounded text-yellow-300 text-sm">
            {truncationWarning}
          </div>
        )}

        {(isDownloading || progressMessage) && (
          <div className="mt-3">
            <ProgressBar progress={progress} message={progressMessage} />
          </div>
        )}
      </div>

      {/* Contacts Table Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-neon-cyan">DMR Contacts</h2>
          <div className="text-cool-gray">
            {contacts.length} / {contactCapacity.toLocaleString()} contact{contacts.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="mb-4 text-cool-gray text-sm">
          DMR contacts are primarily imported from CSV or read from the radio. Use Import to load contacts.
        </div>
        <div className="flex-1 min-h-0">
          <ContactsTable />
        </div>
      </div>
    </div>
  );
};

