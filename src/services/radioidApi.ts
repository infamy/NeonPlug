/**
 * RadioID.net API Service
 * Fetches DMR user contacts from https://radioid.net/database/api
 */

export interface RadioIDUser {
  id: number;              // DMR ID
  callsign?: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface RadioIDApiResponse {
  results: RadioIDUser[];
  count?: number;
}

/**
 * Fetch DMR users from RadioID.net API by country
 * @param countries - Array of country names to fetch
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to array of RadioIDUser objects
 */
export async function fetchRadioIDUsers(
  countries: string[],
  onProgress?: (message: string, progress: number) => void
): Promise<RadioIDUser[]> {
  if (countries.length === 0) {
    return [];
  }

  const allUsers: RadioIDUser[] = [];
  const baseUrl = 'https://radioid.net/api/dmr/user/';

  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    const baseProgress = (i / countries.length) * 90; // Use 90% for fetching, 10% for deduplication

    try {
      onProgress?.(`Fetching contacts from ${country}... (${i + 1}/${countries.length})`, baseProgress + 5);

      // Build URL with single country parameter
      const url = new URL(baseUrl);
      url.searchParams.append('country', country);

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'NeonPlug/1.0',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(`Rate limited by RadioID.net. Please wait before trying again.`);
        }
        throw new Error(`Failed to fetch from RadioID.net: ${response.status} ${response.statusText}`);
      }

      const data: RadioIDApiResponse = await response.json();
      
      if (data.results && Array.isArray(data.results)) {
        // Avoid spread operator for large arrays to prevent stack overflow
        // Push items individually for arrays > 10k, use spread for smaller ones
        if (data.results.length > 10000) {
          for (const user of data.results) {
            allUsers.push(user);
          }
        } else {
          allUsers.push(...data.results);
        }
        onProgress?.(`Fetched ${data.results.length} contacts from ${country}`, baseProgress + 8);
      }

      // Add a small delay to avoid rate limiting (be respectful of the API)
      if (i < countries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between requests
      }
    } catch (error) {
      console.error(`Error fetching contacts from ${country}:`, error);
      throw error;
    }
  }

  onProgress?.(`Removing duplicates...`, 92);

  // Remove duplicates based on DMR ID - process in batches for large datasets
  const uniqueMap = new Map<number, RadioIDUser>();
  const BATCH_SIZE = 10000;
  
  for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
    const batch = allUsers.slice(i, i + BATCH_SIZE);
    for (const user of batch) {
      if (!uniqueMap.has(user.id)) {
        uniqueMap.set(user.id, user);
      }
    }
  }
  
  const uniqueUsers = Array.from(uniqueMap.values());

  onProgress?.(`Fetched ${uniqueUsers.length} unique contacts`, 100);
  return uniqueUsers;
}

/**
 * Countries organized by region
 */
export interface CountryRegion {
  name: string;
  countries: string[];
}

export const COUNTRIES_BY_REGION: CountryRegion[] = [
  {
    name: 'North America',
    countries: [
      'United States',
      'Canada',
      'Mexico',
    ],
  },
  {
    name: 'Central & South America',
    countries: [
      'Brazil',
      'Argentina',
      'Chile',
      'Colombia',
      'Peru',
      'Venezuela',
      'Ecuador',
      'Guatemala',
      'Cuba',
      'Costa Rica',
      'Panama',
      'Uruguay',
      'Paraguay',
      'Bolivia',
    ],
  },
  {
    name: 'Europe - Western',
    countries: [
      'United Kingdom',
      'Germany',
      'France',
      'Italy',
      'Spain',
      'Netherlands',
      'Belgium',
      'Switzerland',
      'Austria',
      'Portugal',
      'Ireland',
      'Greece',
      'Luxembourg',
    ],
  },
  {
    name: 'Europe - Northern',
    countries: [
      'Sweden',
      'Norway',
      'Denmark',
      'Finland',
      'Iceland',
      'Estonia',
      'Latvia',
      'Lithuania',
    ],
  },
  {
    name: 'Europe - Eastern',
    countries: [
      'Poland',
      'Czech Republic',
      'Romania',
      'Bulgaria',
      'Hungary',
      'Slovakia',
      'Slovenia',
      'Croatia',
      'Serbia',
      'Ukraine',
      'Belarus',
      'Russia',
    ],
  },
  {
    name: 'Asia Pacific',
    countries: [
      'Australia',
      'New Zealand',
      'Japan',
      'South Korea',
      'India',
      'Thailand',
      'Philippines',
      'Indonesia',
      'Malaysia',
      'Singapore',
      'Vietnam',
      'Taiwan',
      'Hong Kong',
      'China',
    ],
  },
  {
    name: 'Middle East & Africa',
    countries: [
      'Israel',
      'Turkey',
      'South Africa',
      'Egypt',
      'United Arab Emirates',
      'Saudi Arabia',
      'Kenya',
      'Morocco',
      'Tunisia',
    ],
  },
];

/**
 * Flattened list of all countries (for backward compatibility)
 */
export const COMMON_COUNTRIES = COUNTRIES_BY_REGION.flatMap(region => region.countries);
