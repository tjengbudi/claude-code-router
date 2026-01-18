import { describe, it, expect, beforeEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { extractAgentId } from '../src/utils/router';

// Mock logger for testing
const mockLogger = {
  debug: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
};

describe('extractAgentId()', () => {
  beforeEach(() => {
    // Clear mock calls before each test
    mockLogger.debug.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
  });

  test('should extract agent ID from system prompt', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const req = {
      body: {
        system: [
          {
            type: 'text',
            text: `Agent instructions\n\n<!-- CCR-AGENT-ID: ${validId} -->`
          }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBe(validId);
    expect(mockLogger.debug).toHaveBeenCalledWith({ agentId: validId }, 'Agent ID extracted from system prompt');
  });

  test('should extract agent ID from message history', () => {
    const validId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const req = {
      body: {
        system: [],
        messages: [
          {
            role: 'user',
            content: `Request with agent\n<!-- CCR-AGENT-ID: ${validId} -->`
          }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBe(validId);
    expect(mockLogger.debug).toHaveBeenCalledWith({ agentId: validId }, 'Agent ID extracted from message history');
  });

  test('should return undefined for invalid UUID format', () => {
    // UUID v1 format - matches regex pattern but fails validation
    const req = {
      body: {
        system: [
          {
            type: 'text',
            text: '<!-- CCR-AGENT-ID: 00000000-0000-1000-8000-000000000000 -->'
          }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { agentId: '00000000-0000-1000-8000-000000000000' },
      'Invalid agent ID format in system prompt'
    );
  });

  test('should return undefined when no agent ID found', () => {
    const req = {
      body: {
        system: [
          { type: 'text', text: 'Regular Claude Code request without agent' }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('No agent ID found in request');
  });

  test('should return first valid UUID when multiple IDs present', () => {
    const firstId = '550e8400-e29b-41d4-a716-446655440000';
    const secondId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const req = {
      body: {
        system: [
          {
            type: 'text',
            text: `<!-- CCR-AGENT-ID: ${firstId} -->\n<!-- CCR-AGENT-ID: ${secondId} -->`
          }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBe(firstId);
  });

  test('should handle empty system and messages arrays', () => {
    const req = {
      body: {
        system: [],
        messages: []
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('No agent ID found in request');
  });

  test('should handle missing body fields gracefully', () => {
    const req = { body: {} };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('No agent ID found in request');
  });

  test('should handle missing req.body', () => {
    const req = {};

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('Malformed request: missing body');
  });

  test('should prefer system prompt over message history', () => {
    const systemId = '550e8400-e29b-41d4-a716-446655440000';
    const messageId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const req = {
      body: {
        system: [
          { type: 'text', text: `<!-- CCR-AGENT-ID: ${systemId} -->` }
        ],
        messages: [
          { role: 'user', content: `<!-- CCR-AGENT-ID: ${messageId} -->` }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBe(systemId);
  });

  test('should validate extracted UUID format', () => {
    // UUID v5 format - matches regex pattern but fails validation
    const req = {
      body: {
        system: [
          {
            type: 'text',
            text: '<!-- CCR-AGENT-ID: 550e8400-e29b-51d4-a716-446655440000 -->'
          }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { agentId: '550e8400-e29b-51d4-a716-446655440000' },
      'Invalid agent ID format in system prompt'
    );
  });

  test('should work without logger parameter', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const req = {
      body: {
        system: [
          {
            type: 'text',
            text: `<!-- CCR-AGENT-ID: ${validId} -->`
          }
        ]
      }
    };

    // Should not throw when logger is not provided
    expect(() => extractAgentId(req)).not.toThrow();
    const result = extractAgentId(req);
    expect(result).toBe(validId);
  });

  test('should handle system block without type field', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const req = {
      body: {
        system: [
          { text: `<!-- CCR-AGENT-ID: ${validId} -->` }  // Missing type field
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();  // Should not match without type: 'text'
  });

  test('should handle system block with non-text type', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const req = {
      body: {
        system: [
          { type: 'image', text: `<!-- CCR-AGENT-ID: ${validId} -->` }  // Not text type
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();  // Should not match non-text blocks
  });

  test('should handle message with non-string content', () => {
    const req = {
      body: {
        system: [],
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Some content' }] }  // Array content, not string
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();  // Should not match non-string content
  });
});
