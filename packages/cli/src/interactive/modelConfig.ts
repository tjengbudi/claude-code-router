import { select, confirm } from '@inquirer/prompts';
import { ProjectManager, Validators, PROJECTS_FILE } from '@CCR/shared';
import type { ProjectConfig, AgentConfig } from '@CCR/shared';
import fs from 'fs/promises';
import path from 'path';
import { HOME_DIR } from '@CCR/shared';

// ANSI color codes (matching existing CLI style)
const RESET = "\x1B[0m";
const DIM = "\x1B[2m";
const CYAN = "\x1B[36m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const RED = "\x1B[31m";

// Special action values for agent selection (HIGH-3: centralized constants)
export const ACTION_DONE = 'DONE';
export const ACTION_CANCEL = 'CANCEL';
export const VALUE_DEFAULT = 'default';

/**
 * Model option interface for interactive selection
 */
interface ModelOption {
  value: string;  // "provider,model" or "default" for Router.default
  label: string;  // Display label with description
}

/**
 * Configuration change tracking
 */
interface ConfigurationChange {
  agentId: string;
  agentName: string;
  oldModel: string | undefined;
  newModel: string | undefined;
}

/**
 * Configuration session for tracking changes with transaction safety
 */
class ConfigurationSession {
  private changes: Map<string, ConfigurationChange> = new Map();
  private savedAgentIds: Set<string> = new Set();

  addChange(agentId: string, agentName: string, oldModel: string | undefined, newModel: string | undefined): void {
    this.changes.set(agentId, { agentId, agentName, oldModel, newModel });
  }

  async save(projectId: string): Promise<void> {
    const pm = new ProjectManager(PROJECTS_FILE);
    this.savedAgentIds.clear();

    try {
      for (const [agentId, change] of this.changes) {
        await pm.setAgentModel(projectId, agentId, change.newModel);
        this.savedAgentIds.add(agentId);
      }
    } catch (error) {
      // Rollback: clear saved agent IDs on failure for potential retry
      this.savedAgentIds.clear();
      throw error;
    }
  }

  getSummary(): string[] {
    return Array.from(this.changes.values()).map(change =>
      `  - ${change.agentName} → ${change.newModel || '[default]'}`
    );
  }

  getCount(): number {
    return this.changes.size;
  }

  getSavedCount(): number {
    return this.savedAgentIds.size;
  }
}

/**
 * Load available models from config.json Providers section
 * Returns default models if config.json is missing or corrupted
 */
export async function getAvailableModels(): Promise<ModelOption[]> {
  const configFile = path.join(HOME_DIR, 'config.json');

  try {
    const content = await fs.readFile(configFile, 'utf-8');
    const config = JSON.parse(content);

    if (config.Providers && Array.isArray(config.Providers)) {
      const models: ModelOption[] = [];

      for (const provider of config.Providers) {
        const providerName = provider.name || 'unknown';
        if (provider.models && Array.isArray(provider.models)) {
          for (const model of provider.models) {
            const modelValue = `${providerName},${model}`;
            const description = getModelDescription(modelValue);
            models.push({
              value: modelValue,
              label: `${modelValue} (${description})`
            });
          }
        }
      }

      if (models.length > 0) {
        return models;
      }
    }
  } catch (error) {
    // Config file missing or corrupted - use defaults
    console.debug(`Could not load config.json: ${(error as Error).message}`);
  }

  // Default models if config.json is unavailable
  return getDefaultModels();
}

/**
 * Get human-readable description for a model
 */
function getModelDescription(model: string): string {
  const descriptions: Record<string, string> = {
    'gpt-4o': 'powerful for coding',
    'gpt-4o-mini': 'fast and efficient',
    'claude-haiku': 'cost-effective planning',
    'claude-sonnet': 'balanced performance',
    'claude-opus': 'high capability',
    'deepseek-r1': 'reasoning for architecture',
    'deepseek-chat': 'efficient coding',
  };

  // Extract model name from "provider,model" format
  const parts = model.split(',');
  if (parts.length === 2) {
    const modelName = parts[1];
    // Check for exact match
    if (descriptions[modelName]) {
      return descriptions[modelName];
    }
    // Check for partial match (e.g., claude-haiku-20241022 -> claude-haiku)
    for (const [key, value] of Object.entries(descriptions)) {
      if (modelName.includes(key)) {
        return value;
      }
    }
  }

  return 'general purpose';
}

/**
 * Get default model options when config.json is unavailable
 */
function getDefaultModels(): ModelOption[] {
  return [
    { value: 'openai,gpt-4o', label: 'openai,gpt-4o (powerful for coding)' },
    { value: 'openai,gpt-4o-mini', label: 'openai,gpt-4o-mini (fast and efficient)' },
    { value: 'anthropic,claude-haiku', label: 'anthropic,claude-haiku (cost-effective planning)' },
    { value: 'anthropic,claude-sonnet', label: 'anthropic,claude-sonnet (balanced performance)' },
    { value: 'deepseek,deepseek-r1', label: 'deepseek,deepseek-r1 (reasoning for architecture)' },
  ];
}

/**
 * Interactive model configuration for a project
 * Allows users to assign models to agents via CLI prompts
 *
 * @param projectId - UUID v4 of the project to configure
 * @returns Promise that resolves when configuration is complete
 *
 * @throws {Error} If project ID is invalid UUID format
 * @throws {Error} If project is not found in projects.json
 *
 * Workflow:
 * 1. Validates project ID and loads project
 * 2. Presents agent selection with current model display
 * 3. For each agent: presents model selection from config.json
 * 4. Tracks changes in memory (ConfigurationSession)
 * 5. On "Done": saves all changes atomically
 * 6. On "Cancel" or Ctrl+C: discards all changes
 */
export async function interactiveModelConfiguration(projectId: string): Promise<void> {
  const pm = new ProjectManager(PROJECTS_FILE);
  const session = new ConfigurationSession();

  // Validate project ID format
  if (!Validators.isValidAgentId(projectId)) {
    console.error(`${RED}✗ Error: Invalid project ID: ${projectId}${RESET}`);
    console.log(`${DIM}  Project ID must be a valid UUID v4 format${RESET}`);
    console.log(`${DIM}  List available projects with: ccr project list${RESET}`);
    process.exit(1);
  }

  // Load project
  const project = await pm.getProject(projectId);
  if (!project) {
    console.error(`${RED}✗ Error: Project not found: ${projectId}${RESET}`);
    console.log(`${DIM}  List available projects with: ccr project list${RESET}`);
    process.exit(1);
  }

  // Check if project has agents
  if (!project.agents || project.agents.length === 0) {
    console.log(`${YELLOW}No agents found in project.${RESET}`);
    console.log(`${DIM}Add agents first with: ccr project scan ${projectId}${RESET}`);
    return;
  }

  console.log(`${CYAN}\nConfiguring agents for project: ${project.name}${RESET}`);

  // Main configuration loop
  let configuring = true;
  while (configuring) {
    try {
      // Build agent selection choices without ANSI codes in choice names (MED-1 fix)
      const agentChoices = project.agents.map(agent => ({
        value: agent.id,
        name: `${agent.name} → ${agent.model || '[not configured]'}`
      }));

      // Add special options
      agentChoices.push(
        { value: ACTION_DONE, name: '[Done - Save changes]' },
        { value: ACTION_CANCEL, name: '[Cancel]' }
      );

      // Agent selection prompt
      const selectedAgentId = await select({
        message: 'Select agent to configure:',
        choices: agentChoices
      });

      // Handle special options
      if (selectedAgentId === ACTION_CANCEL) {
        console.log(`${YELLOW}\nConfiguration cancelled, no changes saved${RESET}`);
        return;
      }

      if (selectedAgentId === ACTION_DONE) {
        configuring = false;
        break;
      }

      // Get selected agent
      const agent = project.agents.find(a => a.id === selectedAgentId);
      if (!agent) {
        console.error(`${RED}✗ Error: Agent not found${RESET}`);
        continue;
      }

      // Load available models
      const availableModels = await getAvailableModels();
      const modelChoices = availableModels.map(m => ({
        value: m.value,
        name: m.label
      }));
      modelChoices.push({
        value: VALUE_DEFAULT,
        name: '[Use Router.default]'
      });

      // Model selection prompt - fix default selection (HIGH-2 fix)
      // Default should match the actual choice value, not fall back to 'default' string
      const defaultModel = agent.model || VALUE_DEFAULT;
      const selectedModel = await select({
        message: `Select model for ${agent.name}:`,
        choices: modelChoices,
        default: defaultModel
      });

      // Validate selection before storing (HIGH-4 fix)
      const actualModel = selectedModel === VALUE_DEFAULT ? undefined : selectedModel;
      if (actualModel !== undefined && !Validators.isValidModelString(actualModel)) {
        console.error(`${RED}✗ Error: Invalid model format: ${actualModel}${RESET}`);
        console.log(`${DIM}  Model must be in format: provider,modelname${RESET}`);
        continue; // Skip this change and return to agent selection
      }

      // Track the change
      session.addChange(agent.id, agent.name, agent.model, actualModel);

      // Update in-memory cloned agent state for display
      agent.model = actualModel;

      // Show confirmation
      const modelDisplay = actualModel || '[default]';
      console.log(`${GREEN}✓ ${agent.name} → ${modelDisplay}${RESET}`);

      // Ask if user wants to configure another agent
      const continueConfig = await confirm({
        message: 'Configure another agent?',
        default: true
      });

      if (!continueConfig) {
        configuring = false;
      }

    } catch (error: any) {
      if (error.name === 'ExitPromptError') {
        // User pressed Ctrl+C
        console.log(`${YELLOW}\nConfiguration interrupted, no changes saved${RESET}`);
        return;
      }
      throw error;
    }
  }

  // Save changes
  if (session.getCount() > 0) {
    try {
      await session.save(projectId);
      const savedCount = session.getSavedCount();
      console.log(`${GREEN}\n✓ Configuration complete!${RESET}`);
      console.log(`\nConfigured ${savedCount} agent${savedCount === 1 ? '' : 's'}:`);
      for (const line of session.getSummary()) {
        console.log(`${DIM}${line}${RESET}`);
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`${RED}✗ Error saving configuration: ${errorMsg}${RESET}`);
      console.error(`${DIM}  ${session.getCount()} agent(s) configured but not saved${RESET}`);
      process.exit(1);
    }
  } else {
    console.log(`${DIM}\nNo changes to save${RESET}`);
  }
}
