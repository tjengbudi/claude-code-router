import { Validators } from "@CCR/shared";

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
export const extractAgentId = (req: any, log?: any): string | undefined => {
  // Story 1.5, Task 1.2 & 1.6: Request validation and graceful degradation
  if (!req?.body) {
    if (log?.debug) log.debug('Malformed request: missing body');
    return undefined;
  }

  // Story 1.5, Task 1.2 & 1.4: Extract UUID from first match in system prompt
  if (req.body.system && Array.isArray(req.body.system)) {
    for (const block of req.body.system) {
      if (block.type === 'text' && block.text) {
        const match = block.text.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);
        if (match) {
          const agentId = match[1];

          // Story 1.5, Task 2.2 & 2.4: Validate UUID format (NFR-S3)
          if (!Validators.isValidAgentId(agentId)) {
            if (log?.warn) log.warn({ agentId }, 'Invalid agent ID format in system prompt');
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
        const match = message.content.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);
        if (match) {
          const agentId = match[1];

          // Story 1.5, Task 2.2 & 2.4: Validate UUID format (NFR-S3)
          if (!Validators.isValidAgentId(agentId)) {
            if (log?.warn) log.warn({ agentId }, 'Invalid agent ID format in message history');
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
