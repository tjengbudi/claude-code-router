import { get_encoding } from "tiktoken";
import { sessionUsageCache, Usage } from "./cache";
import { readFile } from "fs/promises";
import { opendir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { CLAUDE_PROJECTS_DIR, HOME_DIR, PROJECTS_FILE, ProjectManager, Validators } from "@CCR/shared";

// ============ START: Agent System Integration (Story 2.3) ============
// Singleton ProjectManager instance for agent-to-model lookups
// Story 2.3: Router.default fallback mechanism
const projectManager = new ProjectManager(PROJECTS_FILE);
const FALLBACK_DEFAULT_MODEL = 'anthropic,claude-sonnet-4';
// ============ END: Agent System Integration ============
import { LRUCache } from "lru-cache";
import { ConfigService } from "../services/config";
import { TokenizerService } from "../services/tokenizer";

// Types from @anthropic-ai/sdk
interface Tool {
  name: string;
  description?: string;
  input_schema: object;
}

interface ContentBlockParam {
  type: string;
  [key: string]: any;
}

interface MessageParam {
  role: string;
  content: string | ContentBlockParam[];
}

interface MessageCreateParamsBase {
  messages?: MessageParam[];
  system?: string | any[];
  tools?: Tool[];
  [key: string]: any;
}

const enc = get_encoding("cl100k_base");

// Helper function to resolve tilde (~) in file paths
function resolveTildePath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

export const calculateTokenCount = (
  messages: MessageParam[],
  system: any,
  tools: Tool[]
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(contentPart.input)).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};


import { extractRoutingId, extractAgentId, extractSessionId, extractInlineModelOverrideFromRequest, validateModelFormat } from "./agentDetection";

const getProjectSpecificRouter = async (
  req: any,
  configService: ConfigService
) => {
  // Check if there is project-specific configuration
  if (req.sessionId) {
    const project = await searchProjectBySession(req.sessionId);
    if (project) {
      const projectConfigPath = join(HOME_DIR, project, "config.json");
      const sessionConfigPath = join(
        HOME_DIR,
        project,
        `${req.sessionId}.json`
      );

      // First try to read sessionConfig file
      try {
        const sessionConfig = JSON.parse(await readFile(sessionConfigPath, "utf8"));
        if (sessionConfig && sessionConfig.Router) {
          return sessionConfig.Router;
        }
      } catch {}
      try {
        const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8"));
        if (projectConfig && projectConfig.Router) {
          return projectConfig.Router;
        }
      } catch {}
    }
  }
  return undefined; // Return undefined to use original configuration
};

const getUseModel = async (
  req: any,
  tokenCount: number,
  configService: ConfigService,
  lastUsage?: Usage | undefined
): Promise<{ model: string; scenarioType: RouterScenarioType }> => {
  // ============ START: Story 7.6 - Priority 0: Inline Model Override ============
  // Extract inline directive from request (system prompt or messages)
  const inlineOverride = extractInlineModelOverrideFromRequest(req);

  if (inlineOverride) {
    if (validateModelFormat(inlineOverride)) {
      req.log.info({ override: inlineOverride }, '🔧 Inline model override');
      return { model: inlineOverride, scenarioType: 'default' };
    } else {
      req.log.warn({ override: inlineOverride }, '⚠️ Invalid model format, falling back to next priority');
    }
  }
  // ============ END: Story 7.6 - Inline Model Override ============

  const projectSpecificRouter = await getProjectSpecificRouter(req, configService);
  const providers = configService.get<any[]>("providers") || [];
  const Router = projectSpecificRouter || configService.get("Router");

  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const finalProvider = providers.find(
      (p: any) => p.name.toLowerCase() === provider
    );
    const finalModel = finalProvider?.models?.find(
      (m: any) => m.toLowerCase() === model
    );
    if (finalProvider && finalModel) {
      return { model: `${finalProvider.name},${finalModel}`, scenarioType: 'default' };
    }
    return { model: req.body.model, scenarioType: 'default' };
  }

  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = Router?.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if ((lastUsageThreshold || tokenCountThreshold) && Router?.longContext) {
    req.log.info(
      `Using long context model due to token count: ${tokenCount}, threshold: ${longContextThreshold}`
    );
    return { model: Router.longContext, scenarioType: 'longContext' };
  }
  if (
    req.body?.system?.length > 1 &&
    req.body?.system[1]?.text?.startsWith("<CCR-SUBAGENT-MODEL>")
  ) {
    const model = req.body?.system[1].text.match(
      /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s
    );
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(
        `<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`,
        ""
      );
      return { model: model[1], scenarioType: 'default' };
    }
  }
  // Use the background model for any Claude Haiku variant
  const globalRouter = configService.get("Router");
  if (
    req.body.model?.includes("claude") &&
    req.body.model?.includes("haiku") &&
    globalRouter?.background
  ) {
    req.log.info(`Using background model for ${req.body.model}`);
    return { model: globalRouter.background, scenarioType: 'background' };
  }
  // The priority of websearch must be higher than thinking.
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    Router?.webSearch
  ) {
    return { model: Router.webSearch, scenarioType: 'webSearch' };
  }
  // if exits thinking, use the think model
  if (req.body.thinking && Router?.think) {
    req.log.info(`Using think model for ${req.body.thinking}`);
    return { model: Router.think, scenarioType: 'think' };
  }

  // ============ START: Workflow Inheritance Logic (Story 7.3 - Epic 7) ============
  // Priority 6.5a: Workflow model inheritance check (before unified routing)
  // Simple 2-mode system:
  // - inherit: Skip workflow model, use Router.default (keep current routing)
  // - default: Use workflow's configured model (handled by unified routing below)
  const routingIdForInheritance = extractRoutingId(req, req.log);
  if (routingIdForInheritance?.type === 'workflow') {
    try {
      // Detect project for workflow
      const projectId = await projectManager.detectProjectByWorkflowId(routingIdForInheritance.id);
      if (projectId) {
        // Load workflow config to check inheritance mode
        const workflowConfig = await projectManager.getWorkflowById(routingIdForInheritance.id, projectId);

        if (workflowConfig) {
          const mode = workflowConfig.modelInheritance || 'default';

          if (mode === 'inherit') {
            // Inherit mode: Don't use workflow model, fall through to Router.default
            // This allows workflow to "inherit" whatever routing would normally apply
            req.log.info({ workflow: workflowConfig.name, mode: 'inherit' },
              'Workflow using inherit mode - using Router.default');
            // Skip unified routing below by falling through to Router.default
            const defaultModel = Router?.default || FALLBACK_DEFAULT_MODEL;
            if (!Router?.default) {
              req.log.warn(`Router.default not configured, using fallback: ${FALLBACK_DEFAULT_MODEL}`);
            }
            return { model: defaultModel, scenarioType: 'default' };
          }
          // Default mode: Continue with unified routing below (will use workflow model)
          req.log.debug({ workflow: workflowConfig.name, mode: 'default' },
            'Workflow using default mode - proceeding with model lookup');
        }
      }
    } catch (error) {
      req.log.debug({ error: (error as Error).message }, 'Workflow inheritance check failed, continuing routing');
    }
  }
  // ============ END: Workflow Inheritance Logic (Story 7.3) ============

  // ============ START: Unified Routing System Integration (Story 6.3) ============
  // Priority 6.5b: Agent/Workflow-based routing (between "think model" and Router.default)
  // Story 2.3 AC: When agent/workflow has no model configured, fall back to Router.default
  // Story 2.5: Auto-registration for zero-config team onboarding
  // Story 3.1: Session-based caching and project detection for multi-project support
  // Story 6.3: Unified routing for both agents and workflows
  // Note: Performance metric 'agentDetection' at line 226 is legacy name for backward compatibility

  // Story 3.6: Measure total routing latency
  const routingStart = performance.now();

  // Early exit optimization: Check for routing tags (< 1ms for non-BMM users)
  const hasRoutingTag =
    (Array.isArray(req.body.system) &&
      req.body.system.some(
        (block: any) =>
          block?.type === 'text' &&
          typeof block.text === 'string' &&
          block.text.includes('CCR-')
      )) ||
    (Array.isArray(req.body.messages) &&
      req.body.messages.some((message: any) => {
        if (typeof message.content === 'string') {
          return message.content.includes('CCR-');
        }
        if (Array.isArray(message.content)) {
          return message.content.some((item: any) => {
            if (typeof item === 'string') {
              return item.includes('CCR-');
            }
            return (
              item &&
              typeof item === 'object' &&
              item.type === 'text' &&
              typeof item.text === 'string' &&
              item.text.includes('CCR-')
            );
          });
        }
        return false;
      }));

  if (hasRoutingTag) {
    const routingDetectionStart = performance.now();
    const routingId = extractRoutingId(req, req.log);
    performanceMonitoring.record('agentDetection', performance.now() - routingDetectionStart);

    if (routingId) {
      try {
        const sessionId = extractSessionId(req);

        // Detect project based on routing type
        let projectId: string | undefined;
        if (routingId.type === 'agent') {
          projectId = await projectManager.detectProject(routingId.id);
        } else {
          projectId = await projectManager.detectProjectByWorkflowId(routingId.id);
        }

        if (projectId) {
          // Enhanced cache key with type namespace (AC5: ${sessionId}:${type}:${projectId}:${id})
          const cacheKey = `${sessionId}:${routingId.type}:${projectId}:${routingId.id}`;

          // Check cache first (90%+ hit rate target)
          try {
            const cacheLookupStart = performance.now();
            const cachedModel = sessionAgentModelCache.get(cacheKey);
            performanceMonitoring.record('cache', performance.now() - cacheLookupStart);

            if (cachedModel) {
              cacheMetrics.hits++;
              performanceMonitoring.record('totalRouting', performance.now() - routingStart);
              return { model: cachedModel, scenarioType: 'default' };
            }
          } catch (cacheError) {
            req.log.warn({ error: (cacheError as Error).message, cacheKey }, 'Cache get failed');
          }

          // Cache miss - lookup based on routing type
          let routingModel: string | undefined;
          if (routingId.type === 'agent') {
            routingModel = await projectManager.getModelByAgentId(routingId.id, projectId);
          } else {
            routingModel = await projectManager.getModelByWorkflowId(routingId.id, projectId);
          }

          if (routingModel) {
            cacheMetrics.misses++;
            try {
              sessionAgentModelCache.set(cacheKey, routingModel);
            } catch (cacheError) {
              req.log.warn({ error: (cacheError as Error).message, cacheKey }, 'Cache set failed');
            }
            performanceMonitoring.record('totalRouting', performance.now() - routingStart);
            return { model: routingModel, scenarioType: 'default' };
          }

          req.log.debug({ routingId, projectId }, `${routingId.type} found but no model configured`);
        } else {
          // PRESERVE: Auto-registration logic for agents (Story 2.5)
          if (routingId.type === 'agent') {
            const existingProject = await projectManager.findProjectByAgentId(routingId.id);
            if (!existingProject) {
              req.log.debug({ agentId: routingId.id }, 'Agent not registered, attempting auto-registration');
              const agentFilePath = await projectManager.findAgentFileById(routingId.id, CLAUDE_PROJECTS_DIR);
              if (agentFilePath) {
                req.log.info({ agentId: routingId.id, agentFilePath }, 'Found agent file, triggering auto-registration');
                const registeredProject = await projectManager.autoRegisterFromAgentFile(agentFilePath);
                if (registeredProject) {
                  req.log.info({ agentId: routingId.id, projectId: registeredProject.id }, 'Project auto-registered successfully');
                  // Retry with registered project
                  const agentModel = await projectManager.getModelByAgentId(routingId.id, registeredProject.id);
                  if (agentModel) {
                    const cacheKey = `${sessionId}:agent:${registeredProject.id}:${routingId.id}`;
                    try {
                      sessionAgentModelCache.set(cacheKey, agentModel);
                    } catch {}
                    performanceMonitoring.record('totalRouting', performance.now() - routingStart);
                    return { model: agentModel, scenarioType: 'default' };
                  }
                }
              }
            }
          }
          req.log.debug({ routingId }, `${routingId.type} not found in any registered project`);
        }
      } catch (error) {
        req.log.debug({ error: (error as Error).message }, 'Routing system error, using Router.default');
      }
    }
  }
  // ============ END: Unified Routing System Integration ============

  // Story 2.3 AC: Handle edge case where Router.default is not configured
  // Use hardcoded fallback as last resort
  const defaultModel = Router?.default || FALLBACK_DEFAULT_MODEL;
  if (!Router?.default) {
    req.log.warn(`Router.default not configured in config.json, using hardcoded fallback: ${FALLBACK_DEFAULT_MODEL}`);
  }
  return { model: defaultModel, scenarioType: 'default' };
};

export interface RouterContext {
  configService: ConfigService;
  tokenizerService?: TokenizerService;
  event?: any;
}

export type RouterScenarioType = 'default' | 'background' | 'think' | 'longContext' | 'webSearch';

export interface RouterFallbackConfig {
  default?: string[];
  background?: string[];
  think?: string[];
  longContext?: string[];
  webSearch?: string[];
}

export const router = async (req: any, _res: any, context: RouterContext) => {
  const { configService, event } = context;
  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
    }
  }
  const lastMessageUsage = sessionUsageCache.get(req.sessionId);
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  const rewritePrompt = configService.get("REWRITE_SYSTEM_PROMPT");
  if (
    rewritePrompt &&
    system.length > 1 &&
    system[1]?.text?.includes("<env>")
  ) {
    const prompt = await readFile(rewritePrompt, "utf-8");
    system[1].text = `${prompt}<env>${system[1].text.split("<env>").pop()}`;
  }

  try {
    // Try to get tokenizer config for the current model
    const [providerName, modelName] = req.body.model.split(",");
    const tokenizerConfig = context.tokenizerService?.getTokenizerConfigForModel(
      providerName,
      modelName
    );

    // Use TokenizerService if available, otherwise fall back to legacy method
    let tokenCount: number;

    if (context.tokenizerService) {
      const result = await context.tokenizerService.countTokens(
        {
          messages: messages as MessageParam[],
          system,
          tools: tools as Tool[],
        },
        tokenizerConfig
      );
      tokenCount = result.tokenCount;
    } else {
      // Legacy fallback
      tokenCount = calculateTokenCount(
        messages as MessageParam[],
        system,
        tools as Tool[]
      );
    }

    let model;
    const customRouterPath = configService.get("CUSTOM_ROUTER_PATH");
    if (customRouterPath) {
      try {
        // Resolve tilde (~) in path before require
        const resolvedPath = resolveTildePath(customRouterPath);
        const customRouter = require(resolvedPath);
        req.tokenCount = tokenCount; // Pass token count to custom router
        model = await customRouter(req, configService.getAll(), {
          event,
        });
      } catch (e: any) {
        req.log.error(`failed to load custom router: ${e.message}`);
      }
    }
    if (!model) {
      const result = await getUseModel(req, tokenCount, configService, lastMessageUsage);
      model = result.model;
      req.scenarioType = result.scenarioType;
    } else {
      // Custom router doesn't provide scenario type, default to 'default'
      req.scenarioType = 'default';
    }
    req.body.model = model;
  } catch (error: any) {
    req.log.error(`Error in router middleware: ${error.message}`);
    const Router = configService.get("Router");
    req.body.model = Router?.default;
    req.scenarioType = 'default';
  }
  return;
};

// Memory cache for sessionId to project name mapping
// null value indicates previously searched but not found
// Uses LRU cache with max 1000 entries
const sessionProjectCache = new LRUCache<string, string>({
  max: 1000,
});

// Story 3.1: Session-based LRU cache for agent model lookups
// Cache key: ${sessionId}:${projectId}:${agentId}
// Enables multi-project cache isolation and 90%+ hit rate (NFR-P2)
// Story 3.2: Cache configuration per AC #1 - max: 1000, ttl: 0, updateAgeOnGet: true
const sessionAgentModelCache = new LRUCache<string, string>({
  max: 1000,
  ttl: 0, // No expiration - cache entries never expire based on time
  updateAgeOnGet: true, // Update LRU position on cache hits for optimal eviction
});

// Story 3.2: Cache metrics for monitoring and validation
interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
}

const cacheMetrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

/**
 * Get current cache metrics and calculate hit rate
 */
export const getCacheMetrics = (): CacheMetrics & { hitRate: number; size: number } => {
  const total = cacheMetrics.hits + cacheMetrics.misses;
  const hitRate = total > 0 ? (cacheMetrics.hits / total) * 100 : 0;
  return {
    ...cacheMetrics,
    hitRate,
    size: sessionAgentModelCache.size,
  };
};

/**
 * Reset cache metrics (useful for testing or manual measurement periods)
 */
export const resetCacheMetrics = (): void => {
  cacheMetrics.hits = 0;
  cacheMetrics.misses = 0;
  cacheMetrics.evictions = 0;
};

/**
 * Log cache metrics summary (call periodically to monitor cache performance)
 */
export const logCacheMetrics = (context?: string): void => {
  const metrics = getCacheMetrics();
  const prefix = context ? `[${context}]` : '';
  console.log(`${prefix} Cache Metrics:`, {
    hits: metrics.hits,
    misses: metrics.misses,
    hitRate: `${metrics.hitRate.toFixed(2)}%`,
    size: metrics.size,
    evictions: metrics.evictions,
  });
};

// ============ START: Performance Monitoring (Story 3.6) ============
// Optional performance monitoring for production use (disabled by default)
// Enable by setting environment variable: CCR_PERFORMANCE_MONITORING=true
//

/**
 * Performance monitoring statistics for a single metric type
 */
export interface PerformanceStat {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

/**
 * Performance monitoring data structure
 */
export interface PerformanceMetricsData {
  agentDetectionLatency: number[];
  cacheLatency: number[];
  totalRoutingLatency: number[];
}

/**
 * Performance monitoring configuration and state
 */
const performanceMonitoring = {
  enabled: process.env.CCR_PERFORMANCE_MONITORING === 'true',
  maxSamples: 1000, // Keep only last 1000 measurements per metric
  metrics: {
    agentDetectionLatency: [] as number[],
    cacheLatency: [] as number[],
    totalRoutingLatency: [] as number[],
  } as PerformanceMetricsData,

  /**
   * Record a performance metric (only if monitoring is enabled)
   * @param metric - The metric type to record
   * @param latency - The latency value in milliseconds
   */
  record(metric: 'agentDetection' | 'cache' | 'totalRouting', latency: number): void {
    if (!this.enabled) return;

    const key = `${metric}Latency` as keyof PerformanceMetricsData;
    this.metrics[key].push(latency);

    // Keep only last maxSamples measurements to prevent unbounded memory growth
    if (this.metrics[key].length > this.maxSamples) {
      this.metrics[key].shift();
    }
  },

  /**
   * Get statistics for a specific metric
   * @param metric - The metric type to get statistics for
   * @returns Performance statistics or null if no data available
   */
  getStats(metric: 'agentDetection' | 'cache' | 'totalRouting'): PerformanceStat | null {
    if (!this.enabled) return null;

    const key = `${metric}Latency` as keyof PerformanceMetricsData;
    const data = this.metrics[key];

    if (data.length === 0) return null;

    const sorted = [...data].sort((a, b) => a - b);
    const sum = data.reduce((a, b) => a + b, 0);
    const avg = sum / data.length;

    return {
      avg,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      count: data.length,
    };
  },

  /**
   * Export all current performance metrics
   * @returns Object containing all metrics statistics
   */
  export(): {
    agentDetection: PerformanceStat | null;
    cache: PerformanceStat | null;
    totalRouting: PerformanceStat | null;
    enabled: boolean;
  } {
    return {
      agentDetection: this.getStats('agentDetection'),
      cache: this.getStats('cache'),
      totalRouting: this.getStats('totalRouting'),
      enabled: this.enabled,
    };
  },

  /**
   * Reset all performance metrics (useful for testing or starting a new measurement period)
   */
  reset(): void {
    this.metrics.agentDetectionLatency = [];
    this.metrics.cacheLatency = [];
    this.metrics.totalRoutingLatency = [];
  },

  /**
   * Log performance metrics summary to console
   * @param context - Optional context string to prefix the log output
   */
  log(context?: string): void {
    if (!this.enabled) return;

    const data = this.export();
    const prefix = context ? `[${context}]` : '';

    console.log(`${prefix} Performance Monitoring Metrics:`);

    if (data.agentDetection) {
      console.log(`  Agent Detection: avg=${data.agentDetection.avg.toFixed(4)}ms, p95=${data.agentDetection.p95.toFixed(4)}ms, p99=${data.agentDetection.p99.toFixed(4)}ms (${data.agentDetection.count} samples)`);
    }

    if (data.cache) {
      console.log(`  Cache Lookup: avg=${data.cache.avg.toFixed(4)}ms, p95=${data.cache.p95.toFixed(4)}ms, p99=${data.cache.p99.toFixed(4)}ms (${data.cache.count} samples)`);
    }

    if (data.totalRouting) {
      console.log(`  Total Routing: avg=${data.totalRouting.avg.toFixed(4)}ms, p95=${data.totalRouting.p95.toFixed(4)}ms, p99=${data.totalRouting.p99.toFixed(4)}ms (${data.totalRouting.count} samples)`);
    }
  },
};

/**
 * Export performance monitoring utilities for external use
 * Usage in production:
 * 1. Set environment variable: export CCR_PERFORMANCE_MONITORING=true
 * 2. Import and use in your code:
 *    import { getPerformanceStats, exportPerformanceMetrics, resetPerformanceMetrics, logPerformanceMetrics } from './router';
 *
 * Example:
 * ```typescript
 * // Get current statistics
 * const stats = getPerformanceStats('cache');
 * console.log('Cache p95 latency:', stats?.p95);
 *
 * // Export all metrics
 * const allMetrics = exportPerformanceMetrics();
 *
 * // Reset metrics (e.g., before a benchmark)
 * resetPerformanceMetrics();
 *
 * // Log summary to console
 * logPerformanceMetrics('my-context');
 * ```
 */
export const getPerformanceStats = (metric: 'agentDetection' | 'cache' | 'totalRouting'): PerformanceStat | null => {
  return performanceMonitoring.getStats(metric);
};

export const exportPerformanceMetrics = () => {
  return performanceMonitoring.export();
};

export const resetPerformanceMetrics = (): void => {
  performanceMonitoring.reset();
};

export const logPerformanceMetrics = (context?: string): void => {
  performanceMonitoring.log(context);
};

// Internal: Export performance monitoring instance for use in router code
export { performanceMonitoring };
// ============ END: Performance Monitoring ============

export const searchProjectBySession = async (
  sessionId: string
): Promise<string | null> => {
  // Check cache first
  if (sessionProjectCache.has(sessionId)) {
    const result = sessionProjectCache.get(sessionId);
    if (!result || result === '') {
      return null;
    }
    return result;
  }

  try {
    const dir = await opendir(CLAUDE_PROJECTS_DIR);
    const folderNames: string[] = [];

    // Collect all folder names
    for await (const dirent of dir) {
      if (dirent.isDirectory()) {
        folderNames.push(dirent.name);
      }
    }

    // Concurrently check each project folder for sessionId.jsonl file
    const checkPromises = folderNames.map(async (folderName) => {
      const sessionFilePath = join(
        CLAUDE_PROJECTS_DIR,
        folderName,
        `${sessionId}.jsonl`
      );
      try {
        const fileStat = await stat(sessionFilePath);
        return fileStat.isFile() ? folderName : null;
      } catch {
        // File does not exist, continue checking next
        return null;
      }
    });

    const results = await Promise.all(checkPromises);

    // Return the first existing project directory name
    for (const result of results) {
      if (result) {
        // Cache the found result
        sessionProjectCache.set(sessionId, result);
        return result;
      }
    }

    // Cache not found result (null value means previously searched but not found)
    sessionProjectCache.set(sessionId, '');
    return null; // No matching project found
  } catch (error) {
    console.error("Error searching for project by session:", error);
    // Cache null result on error to avoid repeated errors
    sessionProjectCache.set(sessionId, '');
    return null;
  }
};
