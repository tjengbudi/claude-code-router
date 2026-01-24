import { Validators } from "@CCR/shared";

// Story 6.3: Pre-compiled regex patterns for routing ID extraction (performance optimization)
const AGENT_ID_PATTERN = /<!-- CCR-AGENT-ID: ([a-fA-F0-9-]+) -->/i;
const WORKFLOW_ID_PATTERN = /<!-- CCR-WORKFLOW-ID: ([a-fA-F0-9-]+) -->/i;

// Story 6.3: RoutingId interface for unified agent/workflow detection
export interface RoutingId {
  type: 'agent' | 'workflow';
  id: string;
}

// Story 2.3 Review Fix: Type definitions for safety
export interface AgentDetectionRequest {
  body?: {
    system?: Array<{
      type: string;
      text?: string;
    }>;
    messages?: Array<{
      role?: string;
      content: string | any[];
    }>;
    metadata?: {
      user_id?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface Logger {
  debug: (obj: object | string, msg?: string) => void;
  warn: (obj: object | string, msg?: string) => void;
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
}

/**
 * Extract routing ID (agent or workflow) from Claude Code request - Story 6.3
 * Priority: Workflow ID > Agent ID (workflows are more specific)
 * Searches both system prompt and message history for CCR-AGENT-ID or CCR-WORKFLOW-ID patterns
 *
 * @param req - Claude Code API request object
 * @param log - Logger instance for debugging
 * @returns RoutingId object with type and id, or undefined if not found
 *
 * @performance ~2ms extraction time (part of <50ms total routing target per NFR-P1)
 * @security UUID validation prevents injection attacks (NFR-S3)
 */
export const extractRoutingId = (req: AgentDetectionRequest, log?: Logger): RoutingId | undefined => {
  // Request validation and graceful degradation
  if (!req?.body) {
    if (log?.debug) log.debug('Malformed request: missing body');
    return undefined;
  }

  let workflowId: string | undefined;
  let agentId: string | undefined;

  // Search system prompt for both ID types
  if (req.body.system && Array.isArray(req.body.system)) {
    for (const block of req.body.system) {
      if (block.type === 'text' && block.text) {
        // Fast check before expensive regex (optimization)
        if (!workflowId && block.text.includes('CCR-WORKFLOW-ID')) {
          const match = block.text.match(WORKFLOW_ID_PATTERN);
          if (match && Validators.isValidWorkflowId(match[1])) {
            workflowId = match[1];
          }
        }
        if (!agentId && block.text.includes('CCR-AGENT-ID')) {
          const match = block.text.match(AGENT_ID_PATTERN);
          if (match && Validators.isValidAgentId(match[1])) {
            agentId = match[1];
          }
        }
      }
    }
  }

  // Fallback to message history (handle both string and array content) - AC1 fix
  if ((!workflowId || !agentId) && req.body.messages && Array.isArray(req.body.messages)) {
    for (const message of req.body.messages) {
      if (typeof message.content === 'string') {
        if (!workflowId && message.content.includes('CCR-WORKFLOW-ID')) {
          const match = message.content.match(WORKFLOW_ID_PATTERN);
          if (match && Validators.isValidWorkflowId(match[1])) {
            workflowId = match[1];
          }
        }
        if (!agentId && message.content.includes('CCR-AGENT-ID')) {
          const match = message.content.match(AGENT_ID_PATTERN);
          if (match && Validators.isValidAgentId(match[1])) {
            agentId = match[1];
          }
        }
      } else if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (typeof item === 'string') {
            if (!workflowId && item.includes('CCR-WORKFLOW-ID')) {
              const match = item.match(WORKFLOW_ID_PATTERN);
              if (match && Validators.isValidWorkflowId(match[1])) {
                workflowId = match[1];
              }
            }
            if (!agentId && item.includes('CCR-AGENT-ID')) {
              const match = item.match(AGENT_ID_PATTERN);
              if (match && Validators.isValidAgentId(match[1])) {
                agentId = match[1];
              }
            }
          }
        }
      }
    }
  }

  // Priority: workflow > agent (AC3)
  if (workflowId && agentId) {
    if (log?.debug) log.debug({ type: 'workflow', id: workflowId, agentId }, 'Both IDs found, prioritizing workflow');
    return { type: 'workflow', id: workflowId };
  }
  if (workflowId) return { type: 'workflow', id: workflowId };
  if (agentId) return { type: 'agent', id: agentId };

  if (log?.debug) log.debug('No routing ID found');
  return undefined;
};

/**
 * Extract session ID from Claude Code request - Story 3.1
 * Extracts session ID from metadata.user_id format: "user_123_session_abc456"
 * Used for session-based caching of agent model lookups
 *
 * @param req - Claude Code API request object
 * @returns Session ID string, or 'default' if not found
 *
 * @performance < 1ms extraction time (simple string split)
 */
export const extractSessionId = (req: AgentDetectionRequest): string => {
  if (req?.body?.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1 && parts[1]?.trim()) {
      return parts[1].trim();
    }
  }
  return 'default';
};

/**
 * Extract agent ID from Claude Code request - Story 1.5
 * Story 6.3: Now a backward compatibility wrapper for extractRoutingId()
 * Checks both system prompt and message history per Architecture
 *
 * @param req - Claude Code API request object
 * @param log - Logger instance for debugging
 * @returns Agent UUID or undefined if not found/invalid
 *
 * @performance ~2ms extraction time (via extractRoutingId)
 * @security UUID validation prevents injection attacks (NFR-S3)
 *
 * @deprecated Use extractRoutingId() for new code - Story 6.3
 */
export const extractAgentId = (req: AgentDetectionRequest, log?: Logger): string | undefined => {
  const result = extractRoutingId(req, log);
  return result?.type === 'agent' ? result.id : undefined;
};
