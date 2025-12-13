/**
 * Debug utility - wraps console methods for conditional logging
 */

const DEBUG_ENABLED = import.meta.env.DEV || false;

export const debug = {
  log: (...args: any[]) => {
    if (DEBUG_ENABLED) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (DEBUG_ENABLED) console.warn(...args);
  },
  error: (...args: any[]) => {
    // Always log errors
    console.error(...args);
  },
  info: (...args: any[]) => {
    if (DEBUG_ENABLED) console.info(...args);
  },
};
