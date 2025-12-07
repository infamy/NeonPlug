/**
 * Dynamic JSON Loader Service
 * Loads large JSON files on-demand with progress tracking
 * Files are loaded from the same location as index.html (public/dist directory)
 */

export interface LoadProgress {
  loaded: number; // bytes loaded
  total: number; // total bytes (if available from Content-Length header)
  percent: number; // percentage (0-100)
}

export type ProgressCallback = (progress: LoadProgress) => void;

/**
 * Load a JSON file dynamically with progress tracking
 * @param filename - Name of the JSON file (e.g., 'airports_min.json')
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to the parsed JSON data
 */
export async function loadJsonFile<T = any>(
  filename: string,
  onProgress?: ProgressCallback
): Promise<T> {
  // Load from the same location as index.html (relative path)
  const url = `./${filename}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to load ${filename}: ${response.status} ${response.statusText}`);
  }
  
  // Get content length if available
  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  if (!response.body) {
    throw new Error(`No response body for ${filename}`);
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
  return JSON.parse(text) as T;
}

/**
 * Cache for loaded JSON files
 */
const jsonCache = new Map<string, Promise<any>>();

/**
 * Load a JSON file with caching (only loads once)
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
      });
    }
    return cachedPromise;
  }
  
  // Load and cache
  const promise = loadJsonFile<T>(filename, onProgress);
  jsonCache.set(filename, promise);
  
  return promise;
}

