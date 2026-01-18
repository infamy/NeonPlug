/**
 * Public type definitions for NeonPlug Library
 */

// Re-export Contact type from main app
export type { Contact } from '../../src/models/Contact';

/**
 * Progress callback function type
 * @param progress Progress percentage (0-100)
 * @param message Status message
 */
export type ProgressCallback = (progress: number, message: string) => void;

/**
 * Radio model identifier
 * Currently supported: 'dm32uv'
 * Extensible for future radio models
 */
export type RadioModel = 'dm32uv' | string;
