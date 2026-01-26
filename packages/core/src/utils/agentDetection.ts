import { Validators } from "@CCR/shared";

// ============ WORKFLOW SPAWN POINTS (Story 7.2) ============
// The following are identified workflow spawn points where parent context
// metadata should ideally be injected. Note: CCR does not control these spawn
// points - they are managed by Claude Code upstream. This documentation is
// provided for reference and potential future upstream coordination.
//
// 1. SKILL TOOL INVOCATION:
//    - Workflows are invoked via /workflow-name commands (e.g., /party-mode)
//    - Spawn point: Claude Code's Skill tool implementation
//    - Metadata injection would happen in Claude Code's request builder
//
// 2. TASK TOOL WORKFLOW EXECUTION:
//    - Task tool can spawn workflows with specific parameters
//    - Spawn point: Claude Code's Task tool implementation
//    - Metadata injection would happen in Claude Code's request builder
//
// 3. AGENT → WORKFLOW TRANSITIONS:
//    - When an agent calls a workflow via Skill/Task tool
//    - Spawn point: Agent's tool invocation handler
//    - Metadata injection would use agent's current ID and model
//
// METADATA INJECTION EXAMPLE (for upstream implementation):
// When spawning workflow from agent, Claude Code should inject:
//   req.body.metadata = {
//     ...req.body.metadata,
//     parent_id: currentAgentId,
//     parent_model: currentModel,
//     parent_type: 'agent'
//   };
//
// PARENT CONTEXT EXTRACTION:
// The extractParentContext() function below reads this metadata (if present)
// to enable workflow model inheritance via Router.default or explicit configuration.
// ============ END: WORKFLOW SPAWN POINTS ============

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
          if (match) {
            if (Validators.isValidWorkflowId(match[1])) {
              workflowId = match[1];
            } else if (log?.warn) {
              log.warn({ workflowId: match[1] }, 'Invalid workflow ID format');
            }
          }
        }
        if (!agentId && block.text.includes('CCR-AGENT-ID')) {
          const match = block.text.match(AGENT_ID_PATTERN);
          if (match) {
            if (Validators.isValidAgentId(match[1])) {
              agentId = match[1];
            } else if (log?.warn) {
              log.warn({ agentId: match[1] }, 'Invalid agent ID format');
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
            if (Validators.isValidWorkflowId(match[1])) {
              workflowId = match[1];
            } else if (log?.warn) {
              log.warn({ workflowId: match[1] }, 'Invalid workflow ID format');
            }
          }
        }
        if (!agentId && message.content.includes('CCR-AGENT-ID')) {
          const match = message.content.match(AGENT_ID_PATTERN);
          if (match) {
            if (Validators.isValidAgentId(match[1])) {
              agentId = match[1];
            } else if (log?.warn) {
              log.warn({ agentId: match[1] }, 'Invalid agent ID format');
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
                if (Validators.isValidWorkflowId(match[1])) {
                  workflowId = match[1];
                } else if (log?.warn) {
                  log.warn({ workflowId: match[1] }, 'Invalid workflow ID format');
                }
              }
            }
            if (!agentId && textContent.includes('CCR-AGENT-ID')) {
              const match = textContent.match(AGENT_ID_PATTERN);
              if (match) {
                if (Validators.isValidAgentId(match[1])) {
                  agentId = match[1];
                } else if (log?.warn) {
                  log.warn({ agentId: match[1] }, 'Invalid agent ID format');
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
 * Extract parent context from request metadata - Story 7.2
 * Extracts parent routing information (parent_id, parent_model, parent_type) from request metadata
 * Used for workflow model inheritance when workflows are spawned from agents
 *
 * @param req - Claude Code API request object
 * @param log - Logger instance for debugging
 * @returns Object with parentId, parentModel, parentType if valid, undefined if missing/invalid
 *
 * @performance < 1ms extraction time (simple property access)
 * @security Validates parent_model format to prevent injection attacks
 *
 * @example
 * // Request with parent context metadata
 * const parentContext = extractParentContext(req);
 * if (parentContext) {
 *   // Workflow was spawned from agent with model configuration
 *   console.log(`Parent: ${parentContext.parentId} using ${parentContext.parentModel}`);
 * }
 *
 * @example
 * // Request without parent context (direct workflow invocation)
 * const parentContext = extractParentContext(req);
 * if (!parentContext) {
 *   // Use default routing behavior
 * }
 */
export const extractParentContext = (
  req: AgentDetectionRequest,
  log?: Logger
): { parentId: string; parentModel: string; parentType: 'agent' | 'workflow' } | undefined => {
  // Graceful handling: missing metadata is not an error
  if (!req?.body?.metadata) {
    return undefined;
  }

  const parentId = req.body.metadata.parent_id;
  const parentModel = req.body.metadata.parent_model;
  const parentType = req.body.metadata.parent_type;

  // Validate all required fields are present
  if (!parentId || !parentModel || !parentType) {
    if (log?.debug) {
      log.debug({ metadata: req.body.metadata }, 'Parent context incomplete (missing required fields)');
    }
    return undefined;
  }

  // Validate parent_model format (e.g., "provider,model")
  // Using Validators from @CCR/shared
  if (!Validators.isValidModel(parentModel)) {
    if (log?.warn) {
      log.warn({ parentModel }, 'Invalid parent_model format in metadata');
    }
    return undefined;
  }

  // Validate parent_type is either 'agent' or 'workflow'
  if (parentType !== 'agent' && parentType !== 'workflow') {
    if (log?.warn) {
      log.warn({ parentType }, 'Invalid parent_type in metadata (must be "agent" or "workflow")');
    }
    return undefined;
  }

  return {
    parentId,
    parentModel,
    parentType
  };
};
