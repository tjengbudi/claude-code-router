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
    it('should identify network errors as retryable', () => {
      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
    });

    it('should identify HTTP status codes as retryable', () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 502 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
      expect(isRetryableError({ status: 504 })).toBe(true);
    });

    it('should identify status as string (number converted to string)', () => {
      expect(isRetryableError({ status: '429' as any })).toBe(true);
      expect(isRetryableError({ status: '500' as any })).toBe(true);
    });

    it('should identify API rate limit error as retryable', () => {
      expect(isRetryableError({ code: 'rate_limit_exceeded' })).toBe(true);
      expect(isRetryableError({ error: { code: 'rate_limit_exceeded' } })).toBe(true);
    });

    it('should identify authentication errors as non-retryable', () => {
      expect(isRetryableError({ code: 'INVALID_API_KEY' })).toBe(false);
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ status: 403 })).toBe(false);
    });

    it('should identify bad request errors as non-retryable', () => {
      expect(isRetryableError({ code: 'BAD_REQUEST' })).toBe(false);
      expect(isRetryableError({ status: 400 })).toBe(false);
    });

    it('should handle errors with nested error object', () => {
      expect(isRetryableError({ error: { code: 'ECONNRESET' } })).toBe(true);
      expect(isRetryableError({ error: { code: 'INVALID_API_KEY' } })).toBe(false);
    });

    it('should handle errors with type field', () => {
      expect(isRetryableError({ type: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ type: 'INVALID_API_KEY' })).toBe(false);
    });

    it('should return false for unknown error formats', () => {
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

    it('should succeed on first attempt if no error', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed on attempt 2', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Retry attempt 1'));
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Request succeeded on retry attempt 2'));
    });

    it('should retry on retryable error and succeed on attempt 3', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts exhausted', async () => {
      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, 'test operation')).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(RETRY_CONFIG.maxAttempts);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('failed after 3 retry attempts'));
    });

    it('should not retry non-retryable errors', async () => {
      const error = { code: 'INVALID_API_KEY', message: 'Invalid API key' };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, 'test operation')).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(1); // No retries
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Non-retryable error'));
    });

    it('should use exponential backoff delays', async () => {
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

    it('should log retry attempts at info level', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      await withRetry(fn, 'test operation');

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Retry attempt 1'));
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Request succeeded on retry attempt 2'));
    });

    it('should preserve original error through all retry attempts', async () => {
      const originalError = { code: 'ECONNRESET', message: 'Connection reset by peer', stack: 'Error: Connection reset' };
      const fn = jest.fn().mockRejectedValue(originalError);

      try {
        await withRetry(fn, 'test operation');
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toEqual(originalError);
      }
    });

    it('should handle HTTP status 429 (rate limit) as retryable', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle HTTP status 500 (internal server error) as retryable', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should handle non-retryable 401 authentication error immediately', async () => {
      const error = { status: 401, message: 'Unauthorized' };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, 'test operation')).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle errors with nested error.code property', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ error: { code: 'rate_limit_exceeded' } })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should include context in log messages', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      await withRetry(fn, 'LLM API request');

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('LLM API request'));
    });

    it('should handle Response objects with non-OK status (integration test)', async () => {
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

    it('should retry HTTP 502 Bad Gateway errors', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ status: 502, message: 'Bad Gateway' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, 'test operation');
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle nested error.code in logging', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ error: { code: 'rate_limit_exceeded' } })
        .mockResolvedValueOnce('success');

      await withRetry(fn, 'test operation');

      // Verify that nested error code is properly logged
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('rate_limit_exceeded'));
    });
  });
});
