/**
 * Re-export shared protocol logger for DM-32UV.
 * All radio implementations can use the same logger from utils/protocolLogger.
 */
export { LogLevel, setLogStore, logger, log } from '../../utils/protocolLogger';
export type { LoggerConfig } from '../../utils/protocolLogger';
