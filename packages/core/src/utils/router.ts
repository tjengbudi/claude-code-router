import { get_encoding } from "tiktoken";
import { sessionUsageCache, Usage } from "./cache";
import { readFile } from "fs/promises";
import { opendir, stat } from "fs/promises";
import { join } from "path";
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


import { extractAgentId, extractSessionId } from "./agentDetection";

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

  // ============ START: Agent System Integration (Story 2.3, enhanced for Story 3.1) ============
  // Priority 6.5: Agent-based routing (between "think model" and Router.default)
  // Story 2.3 AC: When agent has no model configured, fall back to Router.default
  // Story 2.5: Auto-registration for zero-config team onboarding
  // Story 3.1: Session-based caching and project detection for multi-project support

  // Early exit optimization: Check for tag presence first (fast string search)
  // This ensures non-BMM users have < 1ms overhead (NFR-P3)
  const hasAgentTag = req.body.system?.[0]?.text?.includes('CCR-AGENT-ID');
  if (hasAgentTag) {
    const agentId = extractAgentId(req, req.log);
    if (agentId) {
      try {
        // Story 3.1: Extract session ID for cache key
        const sessionId = extractSessionId(req);

        // Story 3.1: Detect project for this agent (multi-project support)
        const projectId = await projectManager.detectProject(agentId);

        if (projectId) {
          // Story 3.1: Enhanced cache key with project context for multi-project isolation
          const cacheKey = `${sessionId}:${projectId}:${agentId}`;

          // Story 3.1: Check cache first (90%+ hit rate target per NFR-P2)
          const cachedModel = sessionAgentModelCache.get(cacheKey);
          if (cachedModel) {
            // Story 3.2: Track cache hit metric
            cacheMetrics.hits++;
            req.log.debug({ cacheKey, model: cachedModel }, 'Agent model cache hit');
            return { model: cachedModel, scenarioType: 'default' };
          }

          // Story 3.1: Cache miss - lookup with project context
          const agentModel = await projectManager.getModelByAgentId(agentId, projectId);
          if (agentModel) {
            // Story 3.1: Store result in cache for subsequent requests
            // Story 3.2: Track cache miss metric
            cacheMetrics.misses++;
            sessionAgentModelCache.set(cacheKey, agentModel);
            req.log.debug({ cacheKey, model: agentModel }, 'Agent model cache miss, stored');
            return { model: agentModel, scenarioType: 'default' };
          }

          // Agent found but no model configured
          req.log.debug({ agentId, projectId }, 'Agent found in project but no model configured');
        } else {
        // Story 2.5: Agent ID found but not registered - try auto-registration
        // Optimization: First check if agent is already registered but has no model
        // This avoids expensive filesystem scans for known agents
        const existingProject = await projectManager.findProjectByAgentId(agentId);

        if (existingProject) {
           req.log.debug({ agentId, projectId: existingProject.id }, 'Agent is registered but has no model configured');
        } else {
           req.log.debug({ agentId }, 'Agent not registered, attempting auto-registration');

           // Find agent file in Claude projects directory
           const agentFilePath = await projectManager.findAgentFileById(agentId, CLAUDE_PROJECTS_DIR);
           if (agentFilePath) {
             req.log.info({ agentId, agentFilePath }, 'Found agent file, triggering auto-registration');

             // Auto-register the project
             const registeredProject = await projectManager.autoRegisterFromAgentFile(agentFilePath);
             if (registeredProject) {
               req.log.info({ agentId, projectId: registeredProject.id }, 'Project auto-registered successfully');

               // After registration, try again with enhanced caching
               const newProjectId = registeredProject.id;
               const newCacheKey = `${sessionId}:${newProjectId}:${agentId}`;

               const agentModelAfterRegistration = await projectManager.getModelByAgentId(agentId, newProjectId);
               if (agentModelAfterRegistration) {
                 sessionAgentModelCache.set(newCacheKey, agentModelAfterRegistration);
                 req.log.info({ agentId, model: agentModelAfterRegistration }, 'Agent using configured model after auto-registration');
                 return { model: agentModelAfterRegistration, scenarioType: 'default' };
               }
             }
           } else {
             req.log.debug({ agentId }, 'Agent file not found in Claude projects directory');
           }
        }
      }

        // Agent exists (or auto-registration finished) but no model configured → use Router.default
        req.log.debug({ agentId }, 'Agent using Router.default (no model configured)');
        // Fall through to Router.default below
      } catch (error) {
        // Unexpected failure - log error and fallback to Router.default (graceful degradation)
        req.log.error({ error: (error as Error).message, agentId }, 'Agent routing failed, using Router.default');
        // Fall through to Router.default below
      }
    }
  }
  // ============ END: Agent System Integration ============

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
        const customRouter = require(customRouterPath);
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
const sessionAgentModelCache = new LRUCache<string, string>({
  max: 1000,
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
