import { describe, it, test, expect, beforeEach, jest } from '@jest/globals';
import { extractAgentId, extractSessionId } from '../src/utils/agentDetection';

// Mock logger for testing
const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};

describe('extractAgentId()', () => {
  beforeEach(() => {
    // Clear mock calls before each test
    jest.clearAllMocks();
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

  test('should handle system block with valid text type', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const req = {
      body: {
        system: [
          { type: 'text', text: `<!-- CCR-AGENT-ID: ${validId} -->` }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBe(validId);  // Valid text type should return the ID
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

// ============ START: Story 2.3 Tests - Router.default Fallback ============
// These tests verify the agent routing logic that falls back to Router.default
// when an agent has no specific model configured.

describe('Story 2.3: Router.default Fallback', () => {
  // Note: Full routing integration tests are in integration/routing.test.ts
  // These tests focus on the extractAgentId function which is the core of agent detection

  test('should extract valid agent ID for routing lookup', () => {
    const agentId = '550e8400-e29b-41d4-a716-446655440000';
    const req = {
      body: {
        system: [
          { type: 'text', text: `<!-- CCR-AGENT-ID: ${agentId} -->` }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBe(agentId);
    // This agent ID would be used to call projectManager.getModelByAgentId()
    // If the agent has no model configured, undefined is returned and Router.default is used
  });

  test('should return undefined for non-agent requests (vanilla routing)', () => {
    const req = {
      body: {
        system: [
          { type: 'text', text: 'Regular Claude Code request without agent' }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    // Non-agent requests should use existing vanilla routing (backward compatibility)
  });

  test('should handle malformed agent ID tag gracefully', () => {
    // Use UUID v1 format (matches regex but fails UUID v4 validation)
    const req = {
      body: {
        system: [
          { type: 'text', text: '<!-- CCR-AGENT-ID: 00000000-0000-1000-8000-000000000000 -->' }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalled();
    // Malformed IDs should fallback to Router.default (graceful degradation)
  });

  test('should validate UUID v4 format for security', () => {
    // Test various invalid UUID formats
    const invalidUUIDs = [
      'not-a-uuid',
      '12345678-1234-1234-1234-123456789abc',  // v1 format
      '550e8400-e29b-51d4-a716-446655440000',  // v5 format
      '',                                        // empty string
      'g50e8400-e29b-41d4-a716-446655440000',  // invalid hex char
    ];

    for (const invalidId of invalidUUIDs) {
      const req = {
        body: {
          system: [
            { type: 'text', text: `<!-- CCR-AGENT-ID: ${invalidId} -->` }
          ]
        }
      };

      const result = extractAgentId(req, mockLogger);
      expect(result).toBeUndefined();
      // Invalid UUIDs should be rejected for security (NFR-S3)
    }
  });

  test('should support multiple agents with same Router.default', () => {
    const agentId1 = '550e8400-e29b-41d4-a716-446655440000';
    const agentId2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

    const req1 = {
      body: {
        system: [{ type: 'text', text: `<!-- CCR-AGENT-ID: ${agentId1} -->` }]
      }
    };

    const req2 = {
      body: {
        system: [{ type: 'text', text: `<!-- CCR-AGENT-ID: ${agentId2} -->` }]
      }
    };

    const result1 = extractAgentId(req1, mockLogger);
    const result2 = extractAgentId(req2, mockLogger);

    expect(result1).toBe(agentId1);
    expect(result2).toBe(agentId2);
    // Both agent IDs would be used for lookups; if neither has a model configured,
    // both would use the same Router.default (consistent behavior)
  });

  test('should work with message history fallback for agent ID', () => {
    const agentId = '550e8400-e29b-41d4-a716-446655440000';
    const req = {
      body: {
        system: [],
        messages: [
          { role: 'user', content: `<!-- CCR-AGENT-ID: ${agentId} -->` }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBe(agentId);
    // Message history fallback ensures agent routing works even when
    // CCR-AGENT-ID is not in system prompt (reflection loops)
  });

  test('should prefer system prompt over message history', () => {
    const systemAgentId = '550e8400-e29b-41d4-a716-446655440000';
    const messageAgentId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

    const req = {
      body: {
        system: [
          { type: 'text', text: `<!-- CCR-AGENT-ID: ${systemAgentId} -->` }
        ],
        messages: [
          { role: 'user', content: `<!-- CCR-AGENT-ID: ${messageAgentId} -->` }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBe(systemAgentId);
    // System prompt takes priority for consistent behavior
  });
});

// ============ START: Story 3.1 Tests - Session-Based Caching ============
// These tests verify session ID extraction and session-based caching functionality

describe('Story 3.1: Session-Based Caching', () => {
  describe('extractSessionId()', () => {
    test('should extract session ID from metadata.user_id with _session_ delimiter', () => {
      const req = {
        body: {
          metadata: {
            user_id: 'user_123_session_abc456'
          }
        }
      };

      const result = extractSessionId(req);
      expect(result).toBe('abc456');
    });

    test('should trim whitespace from extracted session ID', () => {
      const req = {
        body: {
          metadata: {
            user_id: 'user_123_session_  spaces  '
          }
        }
      };

      const result = extractSessionId(req);
      expect(result).toBe('spaces');
    });

    test('should return default when no _session_ delimiter found', () => {
      const req = {
        body: {
          metadata: {
            user_id: 'user_123_without_session'
          }
        }
      };

      const result = extractSessionId(req);
      expect(result).toBe('default');
    });

    test('should return default when metadata.user_id is missing', () => {
      const req = {
        body: {
          metadata: {}
        }
      };

      const result = extractSessionId(req);
      expect(result).toBe('default');
    });

    test('should return default when metadata is missing', () => {
      const req = {
        body: {}
      };

      const result = extractSessionId(req);
      expect(result).toBe('default');
    });

    test('should return default when body is missing', () => {
      const req = {};

      const result = extractSessionId(req);
      expect(result).toBe('default');
    });

    test('should handle empty session ID after delimiter', () => {
      const req = {
        body: {
          metadata: {
            user_id: 'user_123_session_'
          }
        }
      };

      const result = extractSessionId(req);
      expect(result).toBe('default');
    });

    test('should extract session ID with complex formats', () => {
      const testCases = [
        { input: 'user_123_session_session-id-123', expected: 'session-id-123' },
        { input: 'user_abc_session_456', expected: '456' },
        { input: 'client_001_session_session-001', expected: 'session-001' },
      ];

      for (const testCase of testCases) {
        const req = {
          body: {
            metadata: {
              user_id: testCase.input
            }
          }
        };

        const result = extractSessionId(req);
        expect(result).toBe(testCase.expected);
      }
    });

    test('should handle multiple _session_ occurrences (use first split)', () => {
      const req = {
        body: {
          metadata: {
            user_id: 'user_session_123_session_456'
          }
        }
      };

      const result = extractSessionId(req);
      // Implementation splits by "_session_" which creates ["user", "123", "456"]
      // Taking parts[1].trim() gives "123"
      expect(result).toBe('123');
    });
  });

  describe('Session ID Performance Requirements', () => {
    test('should extract session ID in less than 1ms (NFR-P1 target)', () => {
      const req = {
        body: {
          metadata: {
            user_id: 'user_123_session_test-session'
          }
        }
      };

      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        extractSessionId(req);
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(1);
    });
  });
});
