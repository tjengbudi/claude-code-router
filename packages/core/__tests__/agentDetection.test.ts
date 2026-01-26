import { describe, it, test, expect, beforeEach, vi } from 'vitest';
import { extractAgentId, extractSessionId, extractParentContext } from '../src/utils/agentDetection';

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
    vi.clearAllMocks();
  });

  // Priority: P0
  test('3.3-AC1-001: should extract agent ID from system prompt', () => {
    // Given: A request with valid agent ID in system prompt
    // When: Extracting agent ID from the request
    // Then: Should return the valid UUID v4 agent ID

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

  // Priority: P0
  test('3.3-AC1-002: should extract agent ID from message history', () => {
    // Given: A request with agent ID in message history (reflection loop scenario)
    // When: Extracting agent ID from the request
    // Then: Should return the agent ID from message history

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

  // Priority: P0
  test('3.3-AC2-001: should return undefined for invalid UUID format', () => {
    // Given: A request with invalid UUID format (UUID v1)
    // When: Extracting agent ID from the request
    // Then: Should return undefined and log warning (security validation)

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
    // Story 5.2 AC3: Invalid agent IDs log at debug level (expected scenario)
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Invalid agent ID format: 00000000-0000-1000-8000-000000000000'
    );
  });

  // Priority: P0
  test('3.3-AC1-003: should return undefined when no agent ID found', () => {
    // Given: A regular request without agent ID marker
    // When: Extracting agent ID from the request
    // Then: Should return undefined (vanilla routing)

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

  // Priority: P1
  test('3.3-AC1-004: should return first valid UUID when multiple IDs present', () => {
    // Given: A request with multiple agent ID markers
    // When: Extracting agent ID from the request
    // Then: Should return the first valid UUID found

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

  // Priority: P1
  test('3.3-AC3-001: should handle empty system and messages arrays', () => {
    // Given: A request with empty system and messages arrays
    // When: Extracting agent ID from the request
    // Then: Should return undefined gracefully

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

  // Priority: P1
  test('3.3-AC3-002: should handle missing body fields gracefully', () => {
    // Given: A request with missing body fields
    // When: Extracting agent ID from the request
    // Then: Should return undefined without throwing errors

    const req = { body: {} };

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('No agent ID found in request');
  });

  // Priority: P1
  test('3.3-AC3-003: should handle missing req.body', () => {
    // Given: A malformed request without body
    // When: Extracting agent ID from the request
    // Then: Should return undefined and log malformed request

    const req = {};

    const result = extractAgentId(req, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('Malformed request: missing body');
  });

  // Priority: P0
  test('3.3-AC1-005: should prefer system prompt over message history', () => {
    // Given: A request with agent IDs in both system prompt and message history
    // When: Extracting agent ID from the request
    // Then: Should return the agent ID from system prompt (priority order)

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

  // Priority: P0
  test('3.3-AC2-002: should validate extracted UUID format', () => {
    // Given: A request with UUID v5 format (invalid for agent IDs)
    // When: Extracting agent ID from the request
    // Then: Should return undefined and log warning (only UUID v4 allowed)

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
    // Story 5.2 AC3: Invalid agent IDs log at debug level (expected scenario)
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Invalid agent ID format: 550e8400-e29b-51d4-a716-446655440000'
    );
  });

  // Priority: P2
  test('3.3-AC3-004: should work without logger parameter', () => {
    // Given: A request with valid agent ID and no logger provided
    // When: Extracting agent ID without logger
    // Then: Should not throw and return the agent ID

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

  // Priority: P1
  test('3.3-AC1-006: should handle system block with valid text type', () => {
    // Given: A request with system block containing text type
    // When: Extracting agent ID from the request
    // Then: Should successfully extract agent ID from text type block

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

  // Priority: P1
  test('3.3-AC1-007: should handle system block with non-text type', () => {
    // Given: A request with system block containing non-text type (e.g., image)
    // When: Extracting agent ID from the request
    // Then: Should return undefined (only text blocks are searched)

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

  // Priority: P1
  test('3.3-AC1-008: should handle message with non-string content', () => {
    // Given: A request with message containing array content (not string)
    // When: Extracting agent ID from the request
    // Then: Should return undefined (only string content is searched)

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

  // Priority: P0
  test('2.3-AC1-001: should extract valid agent ID for routing lookup', () => {
    // Given: A request with valid agent ID for routing
    // When: Extracting agent ID for model lookup
    // Then: Should return valid agent ID to be used with projectManager.getModelByAgentId()

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

  // Priority: P0
  test('2.3-AC1-002: should return undefined for non-agent requests (vanilla routing)', () => {
    // Given: A regular request without agent ID marker
    // When: Extracting agent ID from the request
    // Then: Should return undefined to use existing vanilla routing (backward compatibility)

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

  // Priority: P1
  test('2.3-AC4-001: should handle malformed agent ID tag gracefully', () => {
    // Given: A request with malformed agent ID (UUID v1 format)
    // When: Extracting agent ID from the request
    // Then: Should return undefined and fallback to Router.default (graceful degradation)

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
    // Story 5.2 AC3: Invalid agent IDs log at debug level (expected scenario)
    expect(mockLogger.debug).toHaveBeenCalled();
    // Malformed IDs should fallback to Router.default (graceful degradation)
  });

  // Priority: P0
  test('2.3-AC5-001: should validate UUID v4 format for security', () => {
    // Given: Various invalid UUID formats
    // When: Extracting agent ID from requests
    // Then: Should reject all invalid UUIDs for security (NFR-S3)

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

  // Priority: P0
  test('2.3-AC1-003: should support multiple agents with same Router.default', () => {
    // Given: Two different agent IDs
    // When: Extracting agent IDs from separate requests
    // Then: Both should be extracted correctly (both can use same Router.default if unconfigured)

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

  // Priority: P0
  test('2.3-AC1-004: should work with message history fallback for agent ID', () => {
    // Given: A request with agent ID in message history (reflection loop scenario)
    // When: Extracting agent ID from the request
    // Then: Should extract from message history to support reflection loops

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

  // Priority: P0
  test('2.3-AC1-005: should prefer system prompt over message history', () => {
    // Given: A request with different agent IDs in system prompt and message history
    // When: Extracting agent ID from the request
    // Then: Should prefer system prompt for consistent behavior

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
    // Priority: P0
    test('3.1-AC1-001: should extract session ID from metadata.user_id with _session_ delimiter', () => {
      // Given: A request with user_id containing _session_ delimiter
      // When: Extracting session ID from the request
      // Then: Should return the session ID after _session_ delimiter

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

    // Priority: P1
    test('3.1-AC1-002: should trim whitespace from extracted session ID', () => {
      // Given: A request with session ID containing whitespace
      // When: Extracting session ID from the request
      // Then: Should return trimmed session ID

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

    // Priority: P0
    test('3.1-AC2-001: should return default when no _session_ delimiter found', () => {
      // Given: A request without _session_ delimiter in user_id
      // When: Extracting session ID from the request
      // Then: Should return 'default' as fallback

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

    // Priority: P1
    test('3.1-AC2-002: should return default when metadata.user_id is missing', () => {
      // Given: A request with empty metadata
      // When: Extracting session ID from the request
      // Then: Should return 'default' as fallback

      const req = {
        body: {
          metadata: {}
        }
      };

      const result = extractSessionId(req);
      expect(result).toBe('default');
    });

    // Priority: P1
    test('3.1-AC2-003: should return default when metadata is missing', () => {
      // Given: A request without metadata field
      // When: Extracting session ID from the request
      // Then: Should return 'default' as fallback

      const req = {
        body: {}
      };

      const result = extractSessionId(req);
      expect(result).toBe('default');
    });

    // Priority: P1
    test('3.1-AC2-004: should return default when body is missing', () => {
      // Given: A malformed request without body
      // When: Extracting session ID from the request
      // Then: Should return 'default' as fallback (graceful degradation)

      const req = {};

      const result = extractSessionId(req);
      expect(result).toBe('default');
    });

    // Priority: P1
    test('3.1-AC2-005: should handle empty session ID after delimiter', () => {
      // Given: A request with empty string after _session_ delimiter
      // When: Extracting session ID from the request
      // Then: Should return 'default' as fallback

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

    // Priority: P1
    test('3.1-AC1-003: should extract session ID with complex formats', () => {
      // Given: Various complex session ID formats
      // When: Extracting session IDs from requests
      // Then: Should correctly parse all formats

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

    // Priority: P2
    test('3.1-AC1-004: should handle multiple _session_ occurrences (use first split)', () => {
      // Given: A user_id with multiple _session_ delimiters
      // When: Extracting session ID from the request
      // Then: Should use the first occurrence after split

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
    // Priority: P1
    test('3.1-NFR-P1-001: should extract session ID in less than 1ms (NFR-P1 target)', () => {
      // Given: A request with session ID
      // When: Extracting session ID 1000 times
      // Then: Average extraction time should be < 1ms (performance requirement)

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

// ============ START: Story 7.2 Tests - Parent Context Propagation ============
// These tests verify parent context extraction for workflow model inheritance

describe('Story 7.2: Parent Context Propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractParentContext()', () => {
    // Priority: P0 - AC5.1: Test valid metadata case
    test('7.2-AC5-001: should extract parent context from valid metadata', () => {
      // Given: A request with valid parent context metadata
      // When: Extracting parent context from the request
      // Then: Should return parent context with all fields

      const req = {
        body: {
          metadata: {
            parent_id: '550e8400-e29b-41d4-a716-446655440000',
            parent_model: 'anthropic,claude-sonnet-4',
            parent_type: 'agent'
          }
        }
      };

      const result = extractParentContext(req, mockLogger);
      expect(result).toEqual({
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        parentModel: 'anthropic,claude-sonnet-4',
        parentType: 'agent'
      });
    });

    // Priority: P0 - AC5.2: Test missing metadata case
    test('7.2-AC5-002: should return undefined when metadata is missing', () => {
      // Given: A request without metadata field
      // When: Extracting parent context from the request
      // Then: Should return undefined gracefully (not an error)

      const req = { body: {} };

      const result = extractParentContext(req, mockLogger);
      expect(result).toBeUndefined();
    });

    // Priority: P0 - AC5.3: Test invalid parent_model case
    test('7.2-AC5-003: should return undefined for invalid parent_model format', () => {
      // Given: A request with invalid parent_model format
      // When: Extracting parent context from the request
      // Then: Should return undefined and log warning

      const req = {
        body: {
          metadata: {
            parent_id: '550e8400-e29b-41d4-a716-446655440000',
            parent_model: 'invalid-format',
            parent_type: 'agent'
          }
        }
      };

      const result = extractParentContext(req, mockLogger);
      expect(result).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { parentModel: 'invalid-format' },
        'Invalid parent_model format in metadata'
      );
    });

    // Priority: P0 - AC5.4: Test malformed metadata case
    test('7.2-AC5-004: should return undefined for incomplete metadata', () => {
      // Given: A request with only some parent context fields
      // When: Extracting parent context from the request
      // Then: Should return undefined and log debug message

      const req = {
        body: {
          metadata: {
            parent_id: '550e8400-e29b-41d4-a716-446655440000',
            parent_model: 'anthropic,claude-sonnet-4'
            // Missing parent_type
          }
        }
      };

      const result = extractParentContext(req, mockLogger);
      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { metadata: req.body.metadata },
        'Parent context incomplete (missing required fields)'
      );
    });

    // Priority: P1 - AC4.1: Test graceful handling without errors
    test('7.2-AC4-001: should not throw errors for malformed request', () => {
      // Given: A completely malformed request
      // When: Extracting parent context from the request
      // Then: Should return undefined without throwing

      const req = undefined;

      expect(() => extractParentContext(req, mockLogger)).not.toThrow();
      const result = extractParentContext(req, mockLogger);
      expect(result).toBeUndefined();
    });

    // Priority: P1 - AC4.2: Test invalid parent_type handling
    test('7.2-AC4-002: should return undefined for invalid parent_type', () => {
      // Given: A request with invalid parent_type value
      // When: Extracting parent context from the request
      // Then: Should return undefined and log warning

      const req = {
        body: {
          metadata: {
            parent_id: '550e8400-e29b-41d4-a716-446655440000',
            parent_model: 'anthropic,claude-sonnet-4',
            parent_type: 'invalid'
          }
        }
      };

      const result = extractParentContext(req, mockLogger);
      expect(result).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { parentType: 'invalid' },
        'Invalid parent_type in metadata (must be "agent" or "workflow")'
      );
    });

    // Priority: P1 - AC2: Test different parent types
    test('7.2-AC2-001: should extract parent context for workflow parent', () => {
      // Given: A request with workflow as parent type
      // When: Extracting parent context from the request
      // Then: Should return parent context with parent_type="workflow"

      const req = {
        body: {
          metadata: {
            parent_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
            parent_model: 'openai,gpt-4o',
            parent_type: 'workflow'
          }
        }
      };

      const result = extractParentContext(req, mockLogger);
      expect(result).toEqual({
        parentId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        parentModel: 'openai,gpt-4o',
        parentType: 'workflow'
      });
    });

    // Priority: P1 - Test various valid model formats
    test('7.2-AC3-001: should accept various valid model formats', () => {
      // Given: Requests with different valid model formats
      // When: Extracting parent context from the requests
      // Then: Should extract all valid formats

      const validModels = [
        'anthropic,claude-sonnet-4',
        'openai,gpt-4o',
        'google,gemini-2.0-flash',
        'deepseek,deepseek-chat'
      ];

      for (const model of validModels) {
        const req = {
          body: {
            metadata: {
              parent_id: '550e8400-e29b-41d4-a716-446655440000',
              parent_model: model,
              parent_type: 'agent'
            }
          }
        };

        const result = extractParentContext(req, mockLogger);
        expect(result?.parentModel).toBe(model);
      }
    });

    // Priority: P1 - Test empty string handling
    test('7.2-AC4-003: should return undefined for empty string fields', () => {
      // Given: A request with empty string in required fields
      // When: Extracting parent context from the request
      // Then: Should return undefined (empty strings are falsy)

      const req = {
        body: {
          metadata: {
            parent_id: '550e8400-e29b-41d4-a716-446655440000',
            parent_model: '',  // Empty string
            parent_type: 'agent'
          }
        }
      };

      const result = extractParentContext(req, mockLogger);
      expect(result).toBeUndefined();
    });

    // Priority: P2 - Test without logger
    test('7.2-AC4-004: should work without logger parameter', () => {
      // Given: A request with valid metadata and no logger
      // When: Extracting parent context without logger
      // Then: Should not throw and return parent context

      const req = {
        body: {
          metadata: {
            parent_id: '550e8400-e29b-41d4-a716-446655440000',
            parent_model: 'anthropic,claude-sonnet-4',
            parent_type: 'agent'
          }
        }
      };

      expect(() => extractParentContext(req)).not.toThrow();
      const result = extractParentContext(req);
      expect(result).toEqual({
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        parentModel: 'anthropic,claude-sonnet-4',
        parentType: 'agent'
      });
    });

    // Priority: P1 - Performance test
    test('7.2-NFR-P1-001: should extract parent context in less than 1ms', () => {
      // Given: A request with valid parent context
      // When: Extracting parent context 1000 times
      // Then: Average extraction time should be < 1ms

      const req = {
        body: {
          metadata: {
            parent_id: '550e8400-e29b-41d4-a716-446655440000',
            parent_model: 'anthropic,claude-sonnet-4',
            parent_type: 'agent'
          }
        }
      };

      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        extractParentContext(req);
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(1);
    });

    // Priority: P0 - Backward compatibility test
    test('7.2-AC2-003: existing workflows without metadata should still work', () => {
      // Given: A request from direct workflow invocation (no parent context)
      // When: Extracting parent context from the request
      // Then: Should return undefined without errors (backward compatibility)

      const req = {
        body: {
          system: [{ type: 'text', text: 'Direct workflow request' }],
          messages: [{ role: 'user', content: 'Run workflow' }]
          // No metadata field
        }
      };

      const result = extractParentContext(req, mockLogger);
      expect(result).toBeUndefined();
      // No errors should be logged (this is expected scenario)
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });
});
