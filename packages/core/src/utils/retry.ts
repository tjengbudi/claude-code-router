/**
 * Retry utility functions for automatic LLM API request retry
 *
 * Story 3.4: Automatic Retry Mechanism
 * NFR-R2: Automatic retry 3x with exponential backoff for transient API errors
 *
 * Provides:
 * - isRetryableError(): Check if error should trigger retry
 * - withRetry(): Higher-order function wrapping async operations with retry logic
 * - delay(): Promise-based setTimeout wrapper for backoff delays
 */

import { RETRY_CONFIG } from '@CCR/shared';

/**
 * Error types that can occur from API calls
 */
interface ApiError {
  code?: string;
  error?: { code?: string };
  type?: string;
  status?: number | string;
  message?: string;
  stack?: string;
}

/**
 * Check if an error is retryable based on error code, type, or HTTP status
 *
 * Checks multiple properties of the error object:
 * - error.code: Direct error code
 * - error.error?.code: Nested error code (common in API responses)
 * - error.type: Error type field
 * - error.status: HTTP status code (as number or string)
 *
 * @param error - The error object to check
 * @returns true if error is retryable, false otherwise
 */
export const isRetryableError = (error: ApiError | null | undefined): boolean => {
  if (!error) return false;

  // Check error.code (direct code)
  if (error.code && RETRY_CONFIG.retryableErrors.includes(error.code as any)) {
    return true;
  }

  // Check error.error?.code (nested code, common in API responses)
  if (error.error?.code && RETRY_CONFIG.retryableErrors.includes(error.error.code as any)) {
    return true;
  }

  // Check error.type (some APIs use type field)
  if (error.type && RETRY_CONFIG.retryableErrors.includes(error.type as any)) {
    return true;
  }

  // Check error.status (HTTP status code - can be number or string)
  if (error.status !== undefined) {
    const statusStr = String(error.status);
    if (RETRY_CONFIG.retryableErrors.includes(statusStr as any)) {
      return true;
    }
  }

  return false;
};

/**
 * Create a delay promise for backoff between retry attempts
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the specified delay
 */
const delay = (ms: number): Promise<void> => {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
};

/**
 * Extract error code/status from error object for logging
 * Handles multiple error formats: code, error.code, type, status
 */
const getErrorIdentifier = (error: ApiError): string => {
  if (error.code) return error.code;
  if (error.error?.code) return error.error.code;
  if (error.type) return error.type;
  if (error.status !== undefined) return String(error.status);
  if (error.message) return error.message;
  return 'Unknown error';
};

/**
 * Wrap an async function with automatic retry logic
 *
 * Retries the function on retryable errors up to maxAttempts,
 * using exponential backoff between attempts. Logs retry attempts
 * and final failure with appropriate log levels.
 *
 * @param fn - Async function to wrap with retry logic
 * @param context - Description of the operation (for logging)
 * @returns Promise that resolves with the function result or rejects with the original error
 *
 * @example
 * ```ts
 * const response = await withRetry(
 *   async () => await llmProvider.sendRequest(req),
 *   'LLM API request to claude-3-5-sonnet'
 * );
 * ```
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  context: string = 'operation'
): Promise<T> => {
  const maxAttempts = RETRY_CONFIG.maxAttempts;
  const backoffMs = RETRY_CONFIG.backoffMs;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Attempt the operation
      const result = await fn();

      // If we retried and succeeded, log success
      if (attempt > 0) {
        console.info(`[${context}] Request succeeded on retry attempt ${attempt + 1}`);
      }

      return result;
    } catch (error) {
      lastError = error as Error;
      const errorId = getErrorIdentifier(error as ApiError);

      // Check if error is retryable
      if (!isRetryableError(error as ApiError)) {
        // Non-retryable error - fail immediately
        console.error(`[${context}] Non-retryable error: ${errorId}`);
        throw error;
      }

      // If this was the last attempt, don't delay - just throw
      if (attempt === maxAttempts - 1) {
        console.error(`[${context}] Request failed after ${maxAttempts} retry attempts. Error: ${errorId}`);
        throw error;
      }

      // Log retry attempt
      const backoffDelay = backoffMs[attempt] || backoffMs[backoffMs.length - 1];
      console.info(`[${context}] Retry attempt ${attempt + 1} after ${backoffDelay}ms delay. Error: ${errorId}`);

      // Wait before next attempt (exponential backoff)
      await delay(backoffDelay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
};
