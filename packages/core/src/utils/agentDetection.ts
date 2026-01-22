import { Validators } from "@CCR/shared";

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
 * Extract agent ID from Claude Code request
 * Checks both system prompt and message history per Architecture
 *
 * Story 1.5: Agent ID Extraction & Detection
 *
 * @param req - Claude Code API request object
 * @param log - Logger instance for debugging
 * @returns Agent UUID or undefined if not found/invalid
 *
 * @performance ~1ms extraction time (well under 50ms NFR-P1 target)
 * @security UUID validation prevents injection attacks (NFR-S3)
 */
export const extractAgentId = (req: AgentDetectionRequest, log?: Logger): string | undefined => {
  // Story 1.5, Task 1.2 & 1.6: Request validation and graceful degradation
  if (!req?.body) {
    if (log?.debug) log.debug('Malformed request: missing body');
    return undefined;
  }

  // Story 1.5, Task 1.2 & 1.4: Extract UUID from first match in system prompt
  if (req.body.system && Array.isArray(req.body.system)) {
    for (const block of req.body.system) {
      if (block.type === 'text' && block.text) {
        // Optimization: Fast check before expensive regex (Story 2.3 Review Fix)
        if (!block.text.includes('CCR-AGENT-ID')) {
          continue;
        }

        const match = block.text.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);
        if (match) {
          const agentId = match[1];

          // Story 1.5, Task 2.2 & 2.4: Validate UUID format (NFR-S3)
          if (!Validators.isValidAgentId(agentId)) {
            // Story 5.2 AC3: Use debug level for invalid agent ID (expected scenario)
            if (log?.debug) log.debug(`Invalid agent ID format: ${agentId}`);
            return undefined;
          }

          if (log?.debug) log.debug({ agentId }, 'Agent ID extracted from system prompt');
          return agentId;
        }
      }
    }
  }

  // Story 1.5, Task 1.5: Fallback to message history if not in system prompt
  if (req.body.messages && Array.isArray(req.body.messages)) {
    for (const message of req.body.messages) {
      if (typeof message.content === 'string') {
        // Optimization: Fast check before expensive regex (Story 3.1 Review Fix)
        if (!message.content.includes('CCR-AGENT-ID')) {
          continue;
        }

        const match = message.content.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);
        if (match) {
          const agentId = match[1];

          // Story 1.5, Task 2.2 & 2.4: Validate UUID format (NFR-S3)
          if (!Validators.isValidAgentId(agentId)) {
            // Story 5.2 AC3: Use debug level for invalid agent ID (expected scenario)
            if (log?.debug) log.debug(`Invalid agent ID format: ${agentId}`);
            return undefined;
          }

          if (log?.debug) log.debug({ agentId }, 'Agent ID extracted from message history');
          return agentId;
        }
      }
    }
  }

  // Story 1.5, Task 3.1 & 4.4: No agent ID found (graceful degradation)
  if (log?.debug) log.debug('No agent ID found in request');
  return undefined;
};
