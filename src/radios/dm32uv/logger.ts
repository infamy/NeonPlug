/**
 * Configurable Logger for Protocol Operations
 * 
 * Provides structured logging that can be enabled/disabled and filtered by level.
 * This replaces scattered console.log statements throughout the codebase.
 * 
 * Logs are also stored in a Zustand store for display in the diagnostics tab.
 */

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  VERBOSE = 5,
}

// Lazy import to avoid circular dependencies
// Store reference will be set by the app initialization
let logStore: { addLog: (entry: { level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE'; message: string; context?: string; error?: unknown }) => void } | null = null;

/**
 * Set the log store reference (called from app initialization)
 * This avoids circular dependencies
 */
export function setLogStore(store: { addLog: (entry: { level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE'; message: string; context?: string; error?: unknown }) => void }): void {
  logStore = store;
}

function getLogStore() {
  return logStore;
}

export interface LoggerConfig {
  level: LogLevel;
  enableTimestamps: boolean;
  enablePrefixes: boolean;
}

class ProtocolLogger {
  private config: LoggerConfig = {
    level: LogLevel.INFO, // Default to INFO in production
    enableTimestamps: false,
    enablePrefixes: true,
  };

  /**
   * Configure the logger
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current log level (useful for conditional logging)
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Format log message with optional prefix and timestamp
   */
  private formatMessage(level: string, message: string, context?: string): string {
    const parts: string[] = [];
    
    if (this.config.enableTimestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    if (this.config.enablePrefixes) {
      parts.push(`[${level}]`);
    }
    
    if (context) {
      parts.push(`[${context}]`);
    }
    
    parts.push(message);
    
    return parts.join(' ');
  }

  error(message: string, context?: string, error?: unknown): void {
    if (this.config.level >= LogLevel.ERROR) {
      const formatted = this.formatMessage('ERROR', message, context);
      console.error(formatted, error || '');
      
      // Also store in log store for diagnostics tab
      const store = getLogStore();
      if (store) {
        store.addLog({ level: 'ERROR', message, context, error });
      }
    }
  }

  warn(message: string, context?: string, error?: unknown): void {
    if (this.config.level >= LogLevel.WARN) {
      const formatted = this.formatMessage('WARN', message, context);
      console.warn(formatted, error || '');
      
      // Also store in log store for diagnostics tab
      const store = getLogStore();
      if (store) {
        store.addLog({ level: 'WARN', message, context, error });
      }
    }
  }

  info(message: string, context?: string): void {
    if (this.config.level >= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message, context);
      console.log(formatted);
      
      // Also store in log store for diagnostics tab
      const store = getLogStore();
      if (store) {
        store.addLog({ level: 'INFO', message, context });
      }
    }
  }

  debug(message: string, context?: string, error?: unknown): void {
    if (this.config.level >= LogLevel.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message, context);
      console.log(formatted, error || '');
      
      // Also store in log store for diagnostics tab
      const store = getLogStore();
      if (store) {
        store.addLog({ level: 'DEBUG', message, context, error });
      }
    }
  }

  verbose(message: string, context?: string): void {
    if (this.config.level >= LogLevel.VERBOSE) {
      const formatted = this.formatMessage('VERBOSE', message, context);
      console.log(formatted);
      
      // Also store in log store for diagnostics tab
      const store = getLogStore();
      if (store) {
        store.addLog({ level: 'VERBOSE', message, context });
      }
    }
  }

  /**
   * Log operation start/end with timing
   */
  operation(operation: string, fn: () => Promise<void> | void, context?: string): Promise<void> | void {
    const startTime = Date.now();
    this.debug(`Starting: ${operation}`, context);
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result
          .then(() => {
            const duration = Date.now() - startTime;
            this.debug(`Completed: ${operation} (${duration}ms)`, context);
          })
          .catch((error) => {
            const duration = Date.now() - startTime;
            this.error(`Failed: ${operation} (${duration}ms)`, context, error);
            throw error;
          });
      } else {
        const duration = Date.now() - startTime;
        this.debug(`Completed: ${operation} (${duration}ms)`, context);
        return result;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(`Failed: ${operation} (${duration}ms)`, context, error);
      throw error;
    }
  }
}

// Export singleton instance
export const logger = new ProtocolLogger();

// Export convenience functions for common use cases
export const log = {
  error: (msg: string, ctx?: string, err?: unknown) => logger.error(msg, ctx, err),
  warn: (msg: string, ctx?: string, err?: unknown) => logger.warn(msg, ctx, err),
  info: (msg: string, ctx?: string) => logger.info(msg, ctx),
  debug: (msg: string, ctx?: string, err?: unknown) => logger.debug(msg, ctx, err),
  verbose: (msg: string, ctx?: string) => logger.verbose(msg, ctx),
};

