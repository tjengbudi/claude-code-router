/**
 * Story 6.3: Router Extension for Workflow Detection - Test Suite
 *
 * Tests the unified routing system that handles both agent and workflow IDs.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  extractRoutingId,
  extractAgentId,
  extractSessionId,
  type RoutingId,
  type AgentDetectionRequest,
  type Logger
} from '../src/utils/agentDetection';

// Valid UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
// where y is one of 8, 9, a, or b
const VALID_WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_AGENT_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

// Mock Logger
const mockLogger: Logger = {
  debug: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};

describe('Story 6.3: extractRoutingId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // AC1: Unified Routing ID Extraction - workflow-only
  it('should extract workflow ID from system prompt', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          {
            type: 'text',
            text: `<!-- CCR-WORKFLOW-ID: ${VALID_WORKFLOW_ID} -->\nSome content`
          }
        ]
      }
    };

    const result = extractRoutingId(req, mockLogger);

    expect(result).toEqual({
      type: 'workflow',
      id: VALID_WORKFLOW_ID
    });
  });

  // AC1: Unified Routing ID Extraction - agent-only
  it('should extract agent ID from system prompt', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          {
            type: 'text',
            text: `<!-- CCR-AGENT-ID: ${VALID_AGENT_ID} -->\nSome content`
          }
        ]
      }
    };

    const result = extractRoutingId(req, mockLogger);

    expect(result).toEqual({
      type: 'agent',
      id: VALID_AGENT_ID
    });
  });

  // AC3: Priority Handling - workflow ID prioritized over agent ID
  it('should prioritize workflow ID when both IDs are present', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          {
            type: 'text',
            text: `<!-- CCR-AGENT-ID: ${VALID_AGENT_ID} -->\n<!-- CCR-WORKFLOW-ID: ${VALID_WORKFLOW_ID} -->`
          }
        ]
      }
    };

    const result = extractRoutingId(req, mockLogger);

    expect(result).toEqual({
      type: 'workflow',
      id: VALID_WORKFLOW_ID
    });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { workflowId: VALID_WORKFLOW_ID, agentId: VALID_AGENT_ID },
      'Both IDs found, prioritizing workflow'
    );
  });

  // AC1: No routing ID found
  it('should return undefined when no routing ID is found', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          {
            type: 'text',
            text: 'Some content without IDs'
          }
        ]
      }
    };

    const result = extractRoutingId(req, mockLogger);

    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('No routing ID found');
  });

  // Invalid workflow ID format
  it('should reject invalid workflow ID format', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          {
            type: 'text',
            text: '<!-- CCR-WORKFLOW-ID: not-a-uuid -->'
          }
        ]
      }
    };

    const result = extractRoutingId(req, mockLogger);

    expect(result).toBeUndefined();
  });

  // Invalid agent ID format
  it('should reject invalid agent ID format', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          {
            type: 'text',
            text: '<!-- CCR-AGENT-ID: not-a-uuid -->'
          }
        ]
      }
    };

    const result = extractRoutingId(req, mockLogger);

    expect(result).toBeUndefined();
  });

  // AC1: Extract from message history (string content)
  it('should extract workflow ID from message history with string content', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          {
            role: 'user',
            content: `<!-- CCR-WORKFLOW-ID: ${VALID_WORKFLOW_ID} -->\nHello`
          }
        ]
      }
    };

    const result = extractRoutingId(req, mockLogger);

    expect(result).toEqual({
      type: 'workflow',
      id: VALID_WORKFLOW_ID
    });
  });

  // AC1: Extract from message history (array content)
  it('should extract workflow ID from message history with array content', () => {
    const req: AgentDetectionRequest = {
      body: {
        messages: [
          {
            role: 'user',
            content: [
              `<!-- CCR-WORKFLOW-ID: ${VALID_WORKFLOW_ID} -->`,
              'Hello'
            ]
          }
        ]
      }
    };

    const result = extractRoutingId(req, mockLogger);

    expect(result).toEqual({
      type: 'workflow',
      id: VALID_WORKFLOW_ID
    });
  });

  // Malformed request - missing body
  it('should return undefined for malformed request (missing body)', () => {
    const req: AgentDetectionRequest = {};

    const result = extractRoutingId(req, mockLogger);

    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('Malformed request: missing body');
  });

  // extractAgentId wrapper - returns agent ID
  it('extractAgentId wrapper should return agent ID when type is agent', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          {
            type: 'text',
            text: `<!-- CCR-AGENT-ID: ${VALID_AGENT_ID} -->`
          }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);

    expect(result).toBe(VALID_AGENT_ID);
  });

  // extractAgentId wrapper - returns undefined for workflow
  it('extractAgentId wrapper should return undefined when type is workflow', () => {
    const req: AgentDetectionRequest = {
      body: {
        system: [
          {
            type: 'text',
            text: `<!-- CCR-WORKFLOW-ID: ${VALID_WORKFLOW_ID} -->`
          }
        ]
      }
    };

    const result = extractAgentId(req, mockLogger);

    expect(result).toBeUndefined();
  });
});

describe('Story 6.3: extractSessionId', () => {
  it('should extract session ID from metadata', () => {
    const req: AgentDetectionRequest = {
      body: {
        metadata: {
          user_id: 'user_123_session_abc456'
        }
      }
    };

    const result = extractSessionId(req);

    expect(result).toBe('abc456');
  });

  it('should return default when no session ID found', () => {
    const req: AgentDetectionRequest = {
      body: {}
    };

    const result = extractSessionId(req);

    expect(result).toBe('default');
  });
});
