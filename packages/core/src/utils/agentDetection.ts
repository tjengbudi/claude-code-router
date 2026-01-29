import { Validators } from "@CCR/shared";

// Story 6.3: Pre-compiled regex patterns for routing ID extraction (performance optimization)
// Support both HTML comments (<!-- ... -->) and hash comments (# ...)
const AGENT_ID_PATTERN = /(?:<!--\s*CCR-AGENT-ID:\s*([a-fA-F0-9-]+)\s*-->|#\s*CCR-AGENT-ID:\s*([a-fA-F0-9-]+))/i;
const WORKFLOW_ID_PATTERN = /(?:<!--\s*CCR-WORKFLOW-ID:\s*([a-fA-F0-9-]+)\s*-->|#\s*CCR-WORKFLOW-ID:\s*([a-fA-F0-9-]+))/i;

// Story 7.6: Inline model override directive pattern (case-insensitive)
// Allows whitespace before and after colon
// Non-greedy (.+?) ensures we capture content until FIRST closing tag, preventing cross-comment extraction
const INLINE_MODEL_OVERRIDE_PATTERN = /<!--\s*CCR-MODEL-OVERRIDE\s*:\s*(.+?)\s*-->/i;
// Metadata tag override (legacy CCR custom): <!-- CCR-AGENT-MODEL: provider,model -->
const AGENT_MODEL_OVERRIDE_PATTERN = /<!--\s*CCR-AGENT-MODEL\s*:\s*(.+?)\s*-->/i;

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
          if (match) {
            // match[1] is HTML format, match[2] is hash format
            const id = match[1] || match[2];
            if (id && Validators.isValidWorkflowId(id)) {
              workflowId = id;
            } else if (log?.warn) {
              log.warn({ workflowId: id }, 'Invalid workflow ID format');
            }
          }
        }
        if (!agentId && block.text.includes('CCR-AGENT-ID')) {
          const match = block.text.match(AGENT_ID_PATTERN);
          if (match) {
            // match[1] is HTML format, match[2] is hash format
            const id = match[1] || match[2];
            if (id && Validators.isValidAgentId(id)) {
              agentId = id;
            } else if (log?.warn) {
              log.warn({ agentId: id }, 'Invalid agent ID format');
            }
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
          if (match) {
            const id = match[1] || match[2];
            if (id && Validators.isValidWorkflowId(id)) {
              workflowId = id;
            } else if (log?.warn) {
              log.warn({ workflowId: id }, 'Invalid workflow ID format');
            }
          }
        }
        if (!agentId && message.content.includes('CCR-AGENT-ID')) {
          const match = message.content.match(AGENT_ID_PATTERN);
          if (match) {
            const id = match[1] || match[2];
            if (id && Validators.isValidAgentId(id)) {
              agentId = id;
            } else if (log?.warn) {
              log.warn({ agentId: id }, 'Invalid agent ID format');
            }
          }
        }
      } else if (Array.isArray(message.content)) {
        for (const item of message.content) {
          let textContent: string | undefined;

          // Handle both string items and structured objects
          if (typeof item === 'string') {
            textContent = item;
          } else if (typeof item === 'object' && item !== null && item.type === 'text' && item.text) {
            textContent = item.text;
          }

          if (textContent) {
            if (!workflowId && textContent.includes('CCR-WORKFLOW-ID')) {
              const match = textContent.match(WORKFLOW_ID_PATTERN);
              if (match) {
                const id = match[1] || match[2];
                if (id && Validators.isValidWorkflowId(id)) {
                  workflowId = id;
                } else if (log?.warn) {
                  log.warn({ workflowId: id }, 'Invalid workflow ID format');
                }
              }
            }
            if (!agentId && textContent.includes('CCR-AGENT-ID')) {
              const match = textContent.match(AGENT_ID_PATTERN);
              if (match) {
                const id = match[1] || match[2];
                if (id && Validators.isValidAgentId(id)) {
                  agentId = id;
                } else if (log?.warn) {
                  log.warn({ agentId: id }, 'Invalid agent ID format');
                }
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

/**
 * Extract inline model override directive from text - Story 7.6
 * Extracts `<!-- CCR-MODEL-OVERRIDE: provider,model -->` directive from any text
 * Directive can appear at any position (beginning, middle, or end)
 * Case-insensitive and whitespace-tolerant
 *
 * @param text - Text to search for inline override directive
 * @returns Model string (e.g., "kiro,claude-sonnet-4") or undefined if not found
 *
 * @performance <1ms extraction time (simple regex match)
 *
 * @example
 * extractInlineModelOverride("<!-- CCR-MODEL-OVERRIDE: kiro,claude-sonnet-4 -->")
 * // Returns: "kiro,claude-sonnet-4"
 */
export const extractInlineModelOverride = (text: string): string | undefined => {
  if (!text || typeof text !== 'string') {
    return undefined;
  }

  const match = text.match(INLINE_MODEL_OVERRIDE_PATTERN);
  if (match && match[1]) {
    return match[1].trim();
  }

  return undefined;
};

/**
 * Extract metadata model override tag from text - Story 7.6
 * Extracts `<!-- CCR-AGENT-MODEL: provider,model -->` directive from text
 *
 * @param text - Text to search for metadata model override tag
 * @returns Model string or undefined if not found
 */
export const extractAgentModelOverride = (text: string): string | undefined => {
  if (!text || typeof text !== 'string') {
    return undefined;
  }

  const match = text.match(AGENT_MODEL_OVERRIDE_PATTERN);
  if (match && match[1]) {
    return match[1].trim();
  }

  return undefined;
};

const extractTextFromContent = (content: string | any[]): string | undefined => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (item && typeof item === 'object' && item.type === 'text' && item.text) {
        parts.push(item.text);
      }
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
  }

  return undefined;
};

/**
 * Extract current prompt text from request - Story 7.6
 * Uses the latest message content to enforce prompt-level scope
 *
 * @param req - Claude Code API request object
 * @returns Text for the current prompt or undefined
 */
export const extractCurrentPromptText = (req: AgentDetectionRequest): string | undefined => {
  if (!req?.body) {
    return undefined;
  }

  const parts: string[] = [];

  if (Array.isArray(req.body.messages) && req.body.messages.length > 0) {
    const lastMessage = req.body.messages[req.body.messages.length - 1];
    const text = extractTextFromContent(lastMessage?.content);
    if (text) {
      parts.push(text);
    }
  }

  if (Array.isArray(req.body.system)) {
    for (const block of req.body.system) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
};

/**
 * Extract all text content from request for inline override detection - Story 7.6
 * Searches both system prompt and message history for inline override directive
 *
 * @param req - Claude Code API request object
 * @returns Concatenated text from system and messages, or undefined if no content
 *
 * @performance <1ms extraction time
 */
export const extractTextFromRequest = (req: AgentDetectionRequest): string | undefined => {
  if (!req?.body) {
    return undefined;
  }

  const textParts: string[] = [];

  // Extract from system prompt
  if (req.body.system && Array.isArray(req.body.system)) {
    for (const block of req.body.system) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      }
    }
  }

  // Extract from message history
  if (req.body.messages && Array.isArray(req.body.messages)) {
    for (const message of req.body.messages) {
      if (typeof message.content === 'string') {
        textParts.push(message.content);
      } else if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (typeof item === 'string') {
            textParts.push(item);
          } else if (item && typeof item === 'object' && item.type === 'text' && item.text) {
            textParts.push(item.text);
          }
        }
      }
    }
  }

  return textParts.length > 0 ? textParts.join('\n') : undefined;
};

/**
 * Extract inline model override from request - Story 7.6
 * Convenience function that extracts text from request then searches for override
 *
 * @param req - Claude Code API request object
 * @returns Model string (e.g., "kiro,claude-sonnet-4") or undefined if not found
 *
 * @performance <2ms extraction time
 */
export const extractInlineModelOverrideFromRequest = (req: AgentDetectionRequest): string | undefined => {
  const text = extractCurrentPromptText(req);
  return text ? extractInlineModelOverride(text) : undefined;
};

/**
 * Extract metadata model override from request - Story 7.6
 * Uses current prompt text to enforce prompt-level scope
 *
 * @param req - Claude Code API request object
 * @returns Model string or undefined if not found
 */
export const extractAgentModelOverrideFromRequest = (req: AgentDetectionRequest): string | undefined => {
  const text = extractCurrentPromptText(req);
  return text ? extractAgentModelOverride(text) : undefined;
};

/**
 * Validate model format for inline override - Story 7.6
 * Validates that model string follows "provider,modelname" pattern
 * Both provider and model must be non-empty after trimming whitespace
 *
 * @param model - Model string to validate (e.g., "kiro,claude-sonnet-4")
 * @returns true if format is valid, false otherwise
 *
 * @performance <0.1ms validation time (simple string split)
 *
 * @example
 * validateModelFormat("kiro,claude-sonnet-4")  // Returns: true
 * validateModelFormat("invalid-format")         // Returns: false
 * validateModelFormat(",claude-sonnet-4")       // Returns: false
 */
export const validateModelFormat = (model: string): boolean => {
  if (!model || typeof model !== 'string') {
    return false;
  }

  const parts = model.split(',');
  if (parts.length !== 2) {
    return false;
  }

  const [provider, modelName] = parts;
  return provider.trim().length > 0 && modelName.trim().length > 0;
};
