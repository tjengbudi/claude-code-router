/**
 * Tests for retry mechanism (Story 3.4)
 *
 * Tests the automatic retry functionality for transient API errors
 * with exponential backoff and proper error handling.
 */

import { isRetryableError, withRetry } from '../src/utils/retry';
import { RETRY_CONFIG } from '@CCR/shared';

// Mock console methods to avoid cluttering test output
jest.spyOn(console, 'info').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('Retry Mechanism', () => {
  describe('isRetryableError', () => {
    // Priority: P0
    test('3.4-AC1-001: should identify network errors as retryable', () => {
      // Given: Network error codes (ECONNRESET, ETIMEDOUT, ECONNREFUSED)
      // When: Checking if errors are retryable
      // Then: All network errors should be identified as retryable

      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
    });

    // Priority: P0
    test('3.4-AC1-002: should identify HTTP status codes as retryable', () => {
      // Given: HTTP 5xx and 429 status codes
      // When: Checking if errors are retryable
      // Then: Server errors and rate limits should be retryable

      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 502 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
      expect(isRetryableError({ status: 504 })).toBe(true);
    });

    // Priority: P1
    test('3.4-AC1-003: should identify status as string (number converted to string)', () => {
      // Given: HTTP status codes as strings instead of numbers
      // When: Checking if errors are retryable
      // Then: String status codes should be handled correctly

      expect(isRetryableError({ status: '429' as any })).toBe(true);
      expect(isRetryableError({ status: '500' as any })).toBe(true);
    });

    // Priority: P0
    test('3.4-AC1-004: should identify API rate limit error as retryable', () => {
      // Given: API rate limit error codes
      // When: Checking if errors are retryable
      // Then: Rate limit errors should be retryable

      expect(isRetryableError({ code: 'rate_limit_exceeded' })).toBe(true);
      expect(isRetryableError({ error: { code: 'rate_limit_exceeded' } })).toBe(true);
    });

    // Priority: P0
    test('3.4-AC1-005: should identify authentication errors as non-retryable', () => {
      // Given: Authentication error codes (401, 403, INVALID_API_KEY)
      // When: Checking if errors are retryable
      // Then: Authentication errors should NOT be retryable

      expect(isRetryableError({ code: 'INVALID_API_KEY' })).toBe(false);
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ status: 403 })).toBe(false);
    });

    // Priority: P1
    test('3.4-AC1-006: should identify bad request errors as non-retryable', () => {
      // Given: Bad request error codes (400, BAD_REQUEST)
      // When: Checking if errors are retryable
      // Then: Bad request errors should NOT be retryable

      expect(isRetryableError({ code: 'BAD_REQUEST' })).toBe(false);
      expect(isRetryableError({ status: 400 })).toBe(false);
    });

    // Priority: P1
    test('3.4-AC1-007: should handle errors with nested error object', () => {
      // Given: Errors with nested error.code property
      // When: Checking if errors are retryable
      // Then: Nested error codes should be correctly identified

      expect(isRetryableError({ error: { code: 'ECONNRESET' } })).toBe(true);
      expect(isRetryableError({ error: { code: 'INVALID_API_KEY' } })).toBe(false);
    });

    // Priority: P2
    test('3.4-AC1-008: should handle errors with type field', () => {
      // Given: Errors with type field instead of code
      // When: Checking if errors are retryable
      // Then: Type field should be checked as fallback

      expect(isRetryableError({ type: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ type: 'INVALID_API_KEY' })).toBe(false);
    });

    // Priority: P1
    test('3.4-AC1-009: should return false for unknown error formats', () => {
      // Given: Unknown or malformed error objects
      // When: Checking if errors are retryable
      // Then: Unknown errors should default to non-retryable

      expect(isRetryableError({})).toBe(false);
      expect(isRetryableError({ message: 'Some error' })).toBe(false);
      expect(isRetryableError(null as any)).toBe(false);
      expect(isRetryableError(undefined as any)).toBe(false);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    // Priority: P0
    test('3.4-AC2-001: should succeed on first attempt if no error', async () => {
      // Given: A function that succeeds on first call
      // When: Executing with retry wrapper
      // Then: Should return success without any retries

      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    // Priority: P0
    test('3.4-AC2-002: should retry on retryable error and succeed on attempt 2', async () => {
      // Given: A function that fails once then succeeds
      // When: Executing with retry wrapper
      // Then: Should retry and succeed on second attempt

      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Retry attempt 1'));
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Request succeeded on retry attempt 2'));
    });

    // Priority: P0
    test('3.4-AC2-003: should retry on retryable error and succeed on attempt 3', async () => {
      // Given: A function that fails twice then succeeds
      // When: Executing with retry wrapper
      // Then: Should retry twice and succeed on third attempt

      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    // Priority: P0
    test('3.4-AC2-004: should throw after max attempts exhausted', async () => {
      // Given: A function that always fails with retryable error
      // When: Executing with retry wrapper
      // Then: Should exhaust all retry attempts and throw error

      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, 'test operation')).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(RETRY_CONFIG.maxAttempts);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('failed after 3 retry attempts'));
    });

    // Priority: P0
    test('3.4-AC2-005: should not retry non-retryable errors', async () => {
      // Given: A function that fails with non-retryable error
      // When: Executing with retry wrapper
      // Then: Should fail immediately without retries

      const error = { code: 'INVALID_API_KEY', message: 'Invalid API key' };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, 'test operation')).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(1); // No retries
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Non-retryable error'));
    });

    // Priority: P1
    test('3.4-AC3-001: should use exponential backoff delays', async () => {
      // Given: A function that always fails with retryable error
      // When: Executing with retry wrapper
      // Then: Should wait with exponential backoff between retries (1s, 2s)

      const fn = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });
      const startTime = Date.now();

      await expect(withRetry(fn, 'test operation')).rejects.toEqual(expect.any(Object));
      const duration = Date.now() - startTime;

      // Should take ~3 seconds (1s + 2s) - we don't wait after the final failed attempt
      // 3 attempts: 0 -> wait 1s -> 1 -> wait 2s -> 2 (final, fails immediately)
      expect(duration).toBeGreaterThanOrEqual(3000);
      expect(duration).toBeLessThan(4500); // Allow some tolerance for test execution time
      expect(fn).toHaveBeenCalledTimes(3);
    });

    // Priority: P1
    test('3.4-AC4-001: should log retry attempts at info level', async () => {
      // Given: A function that fails once then succeeds
      // When: Executing with retry wrapper
      // Then: Should log retry attempts and success at info level

      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      await withRetry(fn, 'test operation');

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Retry attempt 1'));
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Request succeeded on retry attempt 2'));
    });

    // Priority: P1
    test('3.4-AC2-006: should preserve original error through all retry attempts', async () => {
      // Given: A function that always fails with same error
      // When: Executing with retry wrapper and exhausting retries
      // Then: Should throw the original error unchanged

      const originalError = { code: 'ECONNRESET', message: 'Connection reset by peer', stack: 'Error: Connection reset' };
      const fn = jest.fn().mockRejectedValue(originalError);

      try {
        await withRetry(fn, 'test operation');
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toEqual(originalError);
      }
    });

    // Priority: P0
    test('3.4-AC2-007: should handle HTTP status 429 (rate limit) as retryable', async () => {
      // Given: A function that fails with 429 rate limit then succeeds
      // When: Executing with retry wrapper
      // Then: Should retry and succeed

      const fn = jest.fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    // Priority: P0
    test('3.4-AC2-008: should handle HTTP status 500 (internal server error) as retryable', async () => {
      // Given: A function that fails with 500 error twice then succeeds
      // When: Executing with retry wrapper
      // Then: Should retry twice and succeed

      const fn = jest.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    // Priority: P0
    test('3.4-AC2-009: should handle non-retryable 401 authentication error immediately', async () => {
      // Given: A function that fails with 401 authentication error
      // When: Executing with retry wrapper
      // Then: Should fail immediately without retries

      const error = { status: 401, message: 'Unauthorized' };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, 'test operation')).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    // Priority: P1
    test('3.4-AC2-010: should handle errors with nested error.code property', async () => {
      // Given: A function that fails with nested error.code then succeeds
      // When: Executing with retry wrapper
      // Then: Should detect nested error code and retry

      const fn = jest.fn()
        .mockRejectedValueOnce({ error: { code: 'rate_limit_exceeded' } })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    // Priority: P2
    test('3.4-AC4-002: should include context in log messages', async () => {
      // Given: A function that fails once with custom context
      // When: Executing with retry wrapper with context string
      // Then: Should include context in log messages

      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      await withRetry(fn, 'LLM API request');

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('LLM API request'));
    });

    // Priority: P2
    test('3.4-AC2-011: should handle Response objects with non-OK status (integration test)', async () => {
      // Given: A function that returns HTTP response objects
      // When: Executing with retry wrapper
      // Then: Should retry on 503 and succeed on OK response

      // Simulate actual HTTP response behavior where non-OK responses throw errors
      const mockResponse = {
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      };

      const fn = jest.fn()
        .mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
        .mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await withRetry(fn, 'HTTP request');
      expect(result).toEqual({ ok: true, status: 200 });
      expect(fn).toHaveBeenCalledTimes(3);
    });

    // Priority: P1
    test('3.4-AC2-012: should retry HTTP 502 Bad Gateway errors', async () => {
      // Given: A function that fails with 502 Bad Gateway then succeeds
      // When: Executing with retry wrapper
      // Then: Should retry and succeed

      const fn = jest.fn()
        .mockRejectedValueOnce({ status: 502, message: 'Bad Gateway' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    // Priority: P2
    test('3.4-AC4-003: should handle nested error.code in logging', async () => {
      // Given: A function that fails with nested error.code
      // When: Executing with retry wrapper
      // Then: Should log nested error code correctly

      const fn = jest.fn()
        .mockRejectedValueOnce({ error: { code: 'rate_limit_exceeded' } })
        .mockResolvedValueOnce('success');

      await withRetry(fn, 'test operation');

      // Verify that nested error code is properly logged
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('rate_limit_exceeded'));
    });
  });
});
