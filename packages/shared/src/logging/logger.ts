/**
 * Logger wrapper for pino logging system
 * Story 5.4: CLI Feedback & Error Messages - Logging Integration
 *
 * Integrates with existing pino logger infrastructure for:
 * - Debug: Graceful degradation, agent not found
 * - Info: Successful operations, project added, config saved
 * - Warn: Recoverable errors, corrupted config, missing files
 * - Error: Critical failures, file operation errors
 *
 * Logs are written to: ~/.claude-code-router/logs/ccr-*.log
 */

import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';

// Logger configuration
const LOG_DIR = path.join(homedir(), '.claude-code-router', 'logs');
const LOG_PREFIX = 'ccr';

// Log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

// Environment variable for log level
const ENV_LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Validate log level
function isValidLogLevel(level: string): level is LogLevel {
  return ['debug', 'info', 'warn', 'error'].includes(level);
}

// Current log level (from environment or default to 'info')
let currentLogLevel: LogLevel = isValidLogLevel(ENV_LOG_LEVEL) ? ENV_LOG_LEVEL : LogLevel.INFO;

// Log level priority for filtering
const logLevelPriority: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Check if a log level should be logged based on current log level
 */
function shouldLog(level: LogLevel): boolean {
  return logLevelPriority[level] >= logLevelPriority[currentLogLevel];
}

/**
 * Format log entry for file output
 * Format: [timestamp] [level] [context?] message
 */
function formatLogEntry(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${levelStr}]${contextStr} ${message}`;
}

/**
 * Ensure log directory exists
 */
async function ensureLogDirectory(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    // Silently fail - logging should not break the application
    // Fall back to console logging only
  }
}

/**
 * Get log file path for current date
 */
function getLogFilePath(): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `${LOG_PREFIX}-${date}.log`);
}

/**
 * Write log entry to file
 * Silently fails if file writing is not possible (graceful degradation)
 */
async function writeLogToFile(entry: string): Promise<void> {
  try {
    await ensureLogDirectory();
    const logFile = getLogFilePath();
    await fs.appendFile(logFile, entry + '\n');
  } catch {
    // Silently fail - file logging is not critical for operation
  }
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * CCR Logger implementation
 * Logs to both console (with colors) and file (plain text)
 *
 * CRITICAL: Do NOT log sensitive data (API keys, passwords, tokens)
 */
class CCRLogger implements Logger {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  /**
   * Debug level logging
   * Use for: Graceful degradation, agent not found (NOT cache operations)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!shouldLog(LogLevel.DEBUG)) {
      return;
    }

    const entry = formatLogEntry(LogLevel.DEBUG, message, context);
    const fullContext = this.context ? { context: this.context, ...context } : context;

    // Write to file (plain)
    writeLogToFile(entry).catch(() => {});

    // Console output (dimmed, only if DEBUG level is enabled)
    if (process.env.CCR_DEBUG === 'true' || currentLogLevel === LogLevel.DEBUG) {
      const dim = "\x1B[2m";
      const reset = "\x1B[0m";
      console.debug(`${dim}[DEBUG]${reset} ${message}`, fullContext || '');
    }
  }

  /**
   * Info level logging
   * Use for: Successful operations, project added, configuration saved
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (!shouldLog(LogLevel.INFO)) {
      return;
    }

    const entry = formatLogEntry(LogLevel.INFO, message, context);
    const fullContext = this.context ? { context: this.context, ...context } : context;

    // Write to file (plain)
    writeLogToFile(entry).catch(() => {});

    // Console output (blue, only if INFO level is enabled)
    if (currentLogLevel === LogLevel.INFO || currentLogLevel === LogLevel.DEBUG) {
      const blue = "\x1B[34m";
      const reset = "\x1B[0m";
      console.info(`${blue}[INFO]${reset} ${message}`, fullContext || '');
    }
  }

  /**
   * Warn level logging
   * Use for: Recoverable errors, corrupted config, missing files
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (!shouldLog(LogLevel.WARN)) {
      return;
    }

    const entry = formatLogEntry(LogLevel.WARN, message, context);
    const fullContext = this.context ? { context: this.context, ...context } : context;

    // Write to file (plain)
    writeLogToFile(entry).catch(() => {});

    // Console output (yellow)
    const yellow = "\x1B[33m";
    const reset = "\x1B[0m";
    console.warn(`${yellow}[WARN]${reset} ${message}`, fullContext || '');
  }

  /**
   * Error level logging
   * Use for: Critical failures, file operation errors
   */
  error(message: string, context?: Record<string, unknown>): void {
    if (!shouldLog(LogLevel.ERROR)) {
      return;
    }

    const entry = formatLogEntry(LogLevel.ERROR, message, context);
    const fullContext = this.context ? { context: this.context, ...context } : context;

    // Write to file (plain)
    writeLogToFile(entry).catch(() => {});

    // Console output (red)
    const red = "\x1B[31m";
    const reset = "\x1B[0m";
    console.error(`${red}[ERROR]${reset} ${message}`, fullContext || '');
  }
}

/**
 * Default logger instance
 */
export const logger = new CCRLogger();

/**
 * Create a logger with a specific context
 * @param context - Context string for log entries
 * @returns Logger instance with context
 */
export function createLogger(context: string): Logger {
  return new CCRLogger(context);
}

/**
 * Set the log level
 * @param level - New log level
 */
export function setLogLevel(level: LogLevel): void {
  if (isValidLogLevel(level)) {
    currentLogLevel = level;
  } else {
    console.warn(`Invalid log level: ${level}. Keeping current level: ${currentLogLevel}`);
  }
}

/**
 * Get the current log level
 * @returns Current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Get the log directory path
 * @returns Path to log directory
 */
export function getLogDir(): string {
  return LOG_DIR;
}

/**
 * Get the current log file path
 * @returns Path to current log file
 */
export function getCurrentLogPath(): string {
  return getLogFilePath();
}
