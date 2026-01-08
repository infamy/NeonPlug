import React, { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioStore } from '../../store/radioStore';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { ContactsTable } from './ContactsTable';
import { ProgressBar } from '../ui/ProgressBar';
import { getContactCapacityWithFallback } from '../../utils/firmware';
import type { Contact } from '../../models/Contact';

// RadioID User interface
interface RadioIDUser {
  id: number;
  callsign?: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
}

// Countries organized by region
export interface CountryRegion {
  name: string;
  countries: string[];
}

export const COUNTRIES_BY_REGION: CountryRegion[] = [
  {
    name: 'North America',
    countries: ['United States', 'Canada', 'Mexico'],
  },
  {
    name: 'Central & South America',
    countries: [
      'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela',
      'Ecuador', 'Guatemala', 'Cuba', 'Costa Rica', 'Panama', 'Uruguay',
      'Paraguay', 'Bolivia',
    ],
  },
  {
    name: 'Europe - Western',
    countries: [
      'United Kingdom', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands',
      'Belgium', 'Switzerland', 'Austria', 'Portugal', 'Ireland', 'Greece',
      'Luxembourg',
    ],
  },
  {
    name: 'Europe - Northern',
    countries: [
      'Sweden', 'Norway', 'Denmark', 'Finland', 'Iceland', 'Estonia',
      'Latvia', 'Lithuania',
    ],
  },
  {
    name: 'Europe - Eastern',
    countries: [
      'Poland', 'Czech Republic', 'Romania', 'Bulgaria', 'Hungary', 'Slovakia',
      'Slovenia', 'Croatia', 'Serbia', 'Ukraine', 'Belarus', 'Russia',
    ],
  },
  {
    name: 'Asia Pacific',
    countries: [
      'Australia', 'New Zealand', 'Japan', 'South Korea', 'India', 'Thailand',
      'Philippines', 'Indonesia', 'Malaysia', 'Singapore', 'Vietnam', 'Taiwan',
      'Hong Kong', 'China',
    ],
  },
  {
    name: 'Middle East & Africa',
    countries: [
      'Israel', 'Turkey', 'South Africa', 'Egypt', 'United Arab Emirates',
      'Saudi Arabia', 'Kenya', 'Morocco', 'Tunisia',
    ],
  },
];

// Cache for CSV data
let csvCache: RadioIDUser[] | null = null;
let csvCachePromise: Promise<RadioIDUser[]> | null = null;

/**
 * Parse CSV line into RadioIDUser
 */
function parseCSVLine(line: string, lineNumber: number): RadioIDUser | null {
  if (lineNumber === 0) return null; // Skip header

  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField.trim());

  if (fields.length < 6) return null;

  const [radioIdStr, callsign, firstName, lastName, city, state, country] = fields;
  const radioId = parseInt(radioIdStr, 10);
  if (isNaN(radioId)) return null;

  const nameParts: string[] = [];
  if (firstName) nameParts.push(firstName);
  if (lastName) nameParts.push(lastName);
  const name = nameParts.length > 0 ? nameParts.join(' ').trim() : undefined;

  return {
    id: radioId,
    callsign: callsign || undefined,
    name: name,
    city: city || undefined,
    state: state || undefined,
    country: country || undefined,
  };
}

/**
 * Load and parse CSV file
 */
async function loadRadioIDCSV(
  onProgress?: (message: string, progress: number) => void
): Promise<RadioIDUser[]> {
  if (csvCache) return csvCache;
  if (csvCachePromise) return csvCachePromise;

  csvCachePromise = (async () => {
    try {
      onProgress?.('Loading RadioID.net database...', 10);

      const pathsToTry = [
        'https://neonplug.app/radioid-users.csv',  // Production domain (first priority)
        './radioid-users.csv',
        './data/radioid-users.csv',
        '/radioid-users.csv',
        '/data/radioid-users.csv',
      ];

      let response: Response | null = null;
      let lastError: Error | null = null;

      for (const path of pathsToTry) {
        try {
          response = await fetch(path);
          if (response.ok) {
            console.log(`Loaded radioid-users.csv from ${path}`);
            break;
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      if (!response || !response.ok) {
        throw new Error(
          `Failed to load radioid-users.csv. ` +
          `Last error: ${lastError?.message || 'Unknown error'}. ` +
          `Please ensure radioid-users.csv is in the public directory.`
        );
      }

      onProgress?.('Parsing CSV data...', 30);
      const text = await response.text();
      const lines = text.split('\n');
      onProgress?.(`Processing ${lines.length.toLocaleString()} lines...`, 40);

      const users: RadioIDUser[] = [];
      const BATCH_SIZE = 10000;
      const uniqueMap = new Map<number, RadioIDUser>();

      for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batch = lines.slice(i, i + BATCH_SIZE);
        for (let j = 0; j < batch.length; j++) {
          const line = batch[j];
          if (!line.trim()) continue;

          const user = parseCSVLine(line, i + j);
          if (user && !uniqueMap.has(user.id)) {
            uniqueMap.set(user.id, user);
            users.push(user);
          }
        }

        const progress = 40 + Math.floor((i / lines.length) * 50);
        onProgress?.(`Processed ${Math.min(i + BATCH_SIZE, lines.length).toLocaleString()} / ${lines.length.toLocaleString()} lines...`, progress);
      }

      onProgress?.(`Loaded ${users.length.toLocaleString()} unique contacts`, 100);
      csvCache = users;
      return users;
    } catch (error) {
      csvCachePromise = null;
      throw error;
    }
  })();

  return csvCachePromise;
}

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
  const { contacts, setContacts } = useContactsStore();
  const { radioInfo } = useRadioStore();
  const { readContacts, writeContacts, isConnecting } = useRadioConnection();
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [customCountry, setCustomCountry] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  
  const contactCapacity = radioInfo 
    ? getContactCapacityWithFallback(
        radioInfo.vframes.get(0x0F),
        radioInfo.firmware
      )
    : 50000;

  // Estimate time based on 150k contacts = 6 minutes
  const estimateTime = (contactCount: number): string => {
    // 150,000 contacts = 6 minutes = 360 seconds
    const seconds = Math.ceil((contactCount / 150000) * 360);
    if (seconds < 60) {
      return `~${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
      return `~${minutes}m`;
    }
    return `~${minutes}m ${remainingSeconds}s`;
  };

  const handleReadContacts = async () => {
    setIsReading(true);
    setProgress(0);
    setProgressMessage('');
    setDownloadError(null);
    const startTime = Date.now();
    
    try {
      await readContacts((progress, message) => {
        setProgress(progress);
        
        // Calculate ETA based on progress, or use initial estimate if no progress yet
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        let etaMessage = message;
        
        if (progress > 0 && progress < 100) {
          // Use actual progress-based ETA
          const estimatedTotal = elapsed / (progress / 100);
          const remaining = estimatedTotal - elapsed;
          
          if (remaining > 0) {
            const minutes = Math.floor(remaining / 60);
            const seconds = Math.floor(remaining % 60);
            
            if (minutes > 0) {
              etaMessage = `${message} - ETA: ${minutes}m ${seconds}s`;
            } else {
              etaMessage = `${message} - ETA: ${seconds}s`;
            }
          }
        } else if (progress === 0) {
          // Show initial estimate before progress starts
          etaMessage = `${message} - Estimated time: ${estimateTime(contactCapacity)}`;
        }
        
        setProgressMessage(etaMessage);
      });
    } catch (err) {
      console.error('Error reading contacts:', err);
      setDownloadError(err instanceof Error ? err.message : 'Failed to read contacts from radio');
    } finally {
      setIsReading(false);
      setTimeout(() => {
        setProgress(0);
        setProgressMessage('');
      }, 2000);
    }
  };

  const handleWriteContacts = async () => {
    if (contacts.length === 0) {
      setDownloadError('No contacts to write. Please load contacts first.');
      return;
    }

    setIsWriting(true);
    setProgress(0);
    setProgressMessage('');
    setDownloadError(null);
    const startTime = Date.now();
    
    try {
      await writeContacts(contacts, (progress, message) => {
        setProgress(progress);
        
        // Calculate ETA based on progress, or use initial estimate if no progress yet
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        let etaMessage = message;
        
        if (progress > 0 && progress < 100) {
          // Use actual progress-based ETA
          const estimatedTotal = elapsed / (progress / 100);
          const remaining = estimatedTotal - elapsed;
          
          if (remaining > 0) {
            const minutes = Math.floor(remaining / 60);
            const seconds = Math.floor(remaining % 60);
            
            if (minutes > 0) {
              etaMessage = `${message} - ETA: ${minutes}m ${seconds}s`;
            } else {
              etaMessage = `${message} - ETA: ${seconds}s`;
            }
          }
        } else if (progress === 0) {
          // Show initial estimate before progress starts
          etaMessage = `${message} - Estimated time: ${estimateTime(contacts.length)}`;
        }
        
        setProgressMessage(etaMessage);
      });
    } catch (err) {
      console.error('Error writing contacts:', err);
      setDownloadError(err instanceof Error ? err.message : 'Failed to write contacts to radio');
    } finally {
      setIsWriting(false);
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
      // Load CSV and filter by countries
      const allUsers = await loadRadioIDCSV((message, progress) => {
        setProgressMessage(message);
        setProgress(progress);
      });

      setProgressMessage('Filtering by selected countries...');
      setProgress(95);
      const countrySet = new Set(countriesToFetch.map(c => c.toLowerCase()));
      const radioIDUsers = allUsers.filter(user => 
        user.country && countrySet.has(user.country.toLowerCase())
      );

      setProgressMessage(`Found ${radioIDUsers.length.toLocaleString()} contacts from selected countries`);
      setProgress(95);

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
              city: user.city || undefined,
              province: user.state || undefined, // RadioID uses "state" but we call it "province"
              country: user.country || undefined,
              // callType, repeater, and remark are not available from RadioID API, so they remain undefined
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

      // Keep selection checked so user can download again if needed
      // Don't clear selectedCountries or customCountry

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

  // Always show the main UI - contacts can be loaded from RadioID.net, CSV, or radio

  return (
    <div className="h-full flex flex-col pb-12">
      {/* Radio Read/Write Section */}
      <div className="mb-6 bg-deep-gray rounded-lg border border-yellow-600 border-opacity-30 p-4">
        <h3 className="text-lg font-semibold text-yellow-400 mb-3">⚠️ Radio Read/Write (Very Slow)</h3>
        <p className="text-cool-gray text-sm mb-4">
          Reading and writing contacts directly from/to the radio is VERY SLOW (can take 10+ minutes for large databases).
          Use the RadioID.net download or CSV import for faster loading.
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={handleReadContacts}
            disabled={isReading || isWriting || isConnecting}
            className="px-4 py-2 bg-yellow-600 text-dark-charcoal font-semibold rounded hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReading ? 'Reading from Radio...' : 'Read Contacts from Radio'}
          </button>
          
          <button
            onClick={handleWriteContacts}
            disabled={isReading || isWriting || isConnecting || contacts.length === 0}
            className="px-4 py-2 bg-yellow-600 text-dark-charcoal font-semibold rounded hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={contacts.length === 0 ? 'No contacts to write' : ''}
          >
            {isWriting ? 'Writing to Radio...' : 'Write Contacts to Radio'}
          </button>
        </div>

        {(isReading || isWriting) && progressMessage && (
          <div className="mt-3">
            <ProgressBar progress={progress} message={progressMessage} />
          </div>
        )}

        {downloadError && (
          <div className="mt-3 p-2 bg-red-900 bg-opacity-30 border border-red-600 rounded text-red-400 text-sm">
            {downloadError}
          </div>
        )}
      </div>

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

