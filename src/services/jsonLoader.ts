/**
 * Dynamic JSON Loader Service with Fallback Paths
 * Tries multiple locations to find JSON files:
 * 1. Same directory as index.html (./filename.json)
 * 2. Public directory (./public/filename.json)
 * 3. Root directory (/filename.json)
 * 
 * This works for both single-file builds and regular builds
 */

export interface LoadProgress {
  loaded: number; // bytes loaded
  total: number; // total bytes (if available from Content-Length header)
  percent: number; // percentage (0-100)
}

export type ProgressCallback = (progress: LoadProgress) => void;

/**
 * Try to load a JSON file from a specific URL
 */
async function tryLoadFromUrl(
  url: string,
  onProgress?: ProgressCallback
): Promise<any> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  
  // Get content length if available
  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  if (!response.body) {
    throw new Error(`No response body for ${url}`);
  }
  
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  
  // Read the stream with progress tracking
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) {
      break;
    }
    
    chunks.push(value);
    loaded += value.length;
    
    // Report progress if callback provided
    if (onProgress) {
      const percent = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
      onProgress({
        loaded,
        total,
        percent,
      });
    }
  }
  
  // Combine all chunks into a single Uint8Array
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Decode to string and parse JSON
  const text = new TextDecoder().decode(combined);
  return JSON.parse(text);
}

/**
 * Get the GitHub repository URL from the current page location
 * Returns null if not on GitHub Pages
 */
function getGitHubRepoUrl(): string | null {
  // Try to detect GitHub Pages URL pattern
  // e.g., https://username.github.io/repo-name/ or https://custom-domain.com/
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  
  // Check if we're on GitHub Pages (github.io or custom domain)
  // Extract repo name from pathname if on github.io
  if (hostname.includes('github.io')) {
    const parts = pathname.split('/').filter(p => p);
    if (parts.length > 0) {
      const repoName = parts[0];
      // Extract username from hostname (username.github.io)
      const username = hostname.split('.')[0];
      return `https://raw.githubusercontent.com/${username}/${repoName}/refs/heads/main/src/data`;
    }
  }
  
  // For custom domains or if we can't detect, try the known repo
  // This is a fallback - you might want to make this configurable
  return 'https://raw.githubusercontent.com/infamy/NeonPlug/refs/heads/main/src/data';
}

/**
 * Load a JSON file with fallback paths
 * Tries multiple locations in order:
 * 1. Same directory as index.html (./filename.json)
 * 2. Public directory (./public/filename.json)
 * 3. Root directory (/filename.json)
 * 4. Raw GitHub file URL (from src/data/)
 * 
 * @param filename - Name of the JSON file (e.g., 'tafl_min.json')
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to the parsed JSON data
 */
export async function loadJsonFile<T = any>(
  filename: string,
  onProgress?: ProgressCallback
): Promise<T> {
  // Get GitHub repo URL for fallback
  const githubBaseUrl = getGitHubRepoUrl();
  
  // List of paths to try in order
  const pathsToTry = [
    `./${filename}`,           // Same directory as index.html (for single-file builds)
    `./public/${filename}`,    // Public directory
    `/${filename}`,            // Root directory
  ];
  
  // Add GitHub raw URL as fallback if available
  if (githubBaseUrl) {
    pathsToTry.push(`${githubBaseUrl}/${filename}`);
  }
  
  let lastError: Error | null = null;
  
  // Try each path in order
  for (const path of pathsToTry) {
    try {
      const data = await tryLoadFromUrl(path, onProgress);
      console.log(`Successfully loaded ${filename} from ${path}`);
      return data as T;
    } catch (error) {
      // Store the error but continue trying other paths
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Failed to load ${filename} from ${path}:`, lastError.message);
      // Continue to next path
    }
  }
  
  // If all paths failed, throw the last error
  throw new Error(
    `Failed to load ${filename} from all attempted paths: ${pathsToTry.join(', ')}. ` +
    `Last error: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Cache for loaded JSON files
 */
const jsonCache = new Map<string, Promise<any>>();

/**
 * Load a JSON file with caching and fallback paths (only loads once)
 * @param filename - Name of the JSON file
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to the parsed JSON data
 */
export function loadJsonFileCached<T = any>(
  filename: string,
  onProgress?: ProgressCallback
): Promise<T> {
  // Check cache first
  if (jsonCache.has(filename)) {
    // Return cached promise (but still call progress callback if provided)
    const cachedPromise = jsonCache.get(filename)!;
    if (onProgress) {
      // If already loaded, report 100% immediately
      cachedPromise.then(() => {
        onProgress({ loaded: 1, total: 1, percent: 100 });
      }).catch(() => {
        // Ignore errors in progress callback
      });
    }
    return cachedPromise;
  }
  
  // Load and cache
  const promise = loadJsonFile<T>(filename, onProgress);
  jsonCache.set(filename, promise);
  
  return promise;
}
