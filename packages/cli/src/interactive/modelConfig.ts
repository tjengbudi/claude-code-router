import { select, confirm } from '@inquirer/prompts';
import { ProjectManager, Validators, PROJECTS_FILE } from '@CCR/shared';
import type { ProjectConfig, AgentConfig, WorkflowConfig } from '@CCR/shared';
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

// Special action values for entity selection
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
 * Entity type for configuration changes
 */
type EntityType = 'agent' | 'workflow';

/**
 * Configuration change tracking - Story 6.4: Extended for workflows
 * Story 7.4: Added inheritance mode tracking
 */
interface ConfigurationChange {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  oldModel: string | undefined;
  newModel: string | undefined;
  oldInheritanceMode?: 'inherit' | 'default';  // Story 7.4
  newInheritanceMode?: 'inherit' | 'default';  // Story 7.4
}

/**
 * Configuration session for tracking changes with transaction safety
 * Story 6.4: Extended to support both agents and workflows
 */
export class ConfigurationSession {
  private changes: Map<string, ConfigurationChange> = new Map();
  private savedIds: Set<string> = new Set();

  addAgentChange(agentId: string, agentName: string, oldModel: string | undefined, newModel: string | undefined): void {
    this.changes.set(`agent:${agentId}`, { entityType: 'agent', entityId: agentId, entityName: agentName, oldModel, newModel });
  }

  addWorkflowChange(
    workflowId: string,
    workflowName: string,
    oldModel: string | undefined,
    newModel: string | undefined,
    oldInheritanceMode?: 'inherit' | 'default',  // Story 7.4
    newInheritanceMode?: 'inherit' | 'default'   // Story 7.4
  ): void {
    // Story 7.4: Always track inheritance mode
    // We keep oldInheritanceMode as-is to detect transition from undefined -> default (normalization)
    const effectiveNewMode = newInheritanceMode || 'default';

    this.changes.set(`workflow:${workflowId}`, {
      entityType: 'workflow',
      entityId: workflowId,
      entityName: workflowName,
      oldModel,
      newModel,
      oldInheritanceMode,
      newInheritanceMode: effectiveNewMode
    });
  }

  async save(projectId: string): Promise<void> {
    const pm = new ProjectManager(PROJECTS_FILE);
    this.savedIds.clear();

    for (const change of this.changes.values()) {
      try {
        if (change.entityType === 'agent') {
          await pm.setAgentModel(projectId, change.entityId, change.newModel);
          this.savedIds.add(change.entityId);
        } else if (change.entityType === 'workflow') {
          // Story 7.4: Use atomic setWorkflowConfig for both model AND inheritance mode
          // Pass null for values that didn't change
          const modelChanged = change.newModel !== change.oldModel;
          const modeChanged = change.newInheritanceMode !== change.oldInheritanceMode;

          // Use atomic setWorkflowConfig method (Story 7.4 fix)
          await pm.setWorkflowConfig(
            projectId,
            change.entityId,
            modelChanged ? change.newModel : null,
            modeChanged ? change.newInheritanceMode : null
          );
          this.savedIds.add(change.entityId);
        }
      } catch (error) {
        // Rollback: clear saved IDs on failure for potential retry
        this.savedIds.clear();
        const entityTypeLabel = change.entityType === 'agent' ? 'agent' : 'workflow';
        throw new Error(`Failed to save ${entityTypeLabel} "${change.entityName}": ${(error as Error).message}`);
      }
    }
  }

  getSummary(): string[] {
    return Array.from(this.changes.values()).map(change => {
      // Story 7.4: Show inheritance mode for workflows
      if (change.entityType === 'workflow' && change.newInheritanceMode) {
        return `  - ${change.entityName} → ${change.newModel || '[default]'} [${change.newInheritanceMode}]`;
      }
      return `  - ${change.entityName} → ${change.newModel || '[default]'}`;
    });
  }

  getCount(): number {
    return this.changes.size;
  }

  getSavedCount(): number {
    return this.savedIds.size;
  }

  getAgentCount(): number {
    return Array.from(this.changes.values()).filter(c => c.entityType === 'agent').length;
  }

  getWorkflowCount(): number {
    return Array.from(this.changes.values()).filter(c => c.entityType === 'workflow').length;
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
 * Story 6.4: Extended to support both agents and workflows
 * Allows users to assign models to agents and workflows via CLI prompts
 *
 * @param projectId - UUID v4 of the project to configure
 * @returns Promise that resolves when configuration is complete
 *
 * @throws {Error} If project ID is invalid UUID format
 * @throws {Error} If project is not found in projects.json
 *
 * Workflow:
 * 1. Validates project ID and loads project
 * 2. Presents entity selection (agents and workflows) with current model display
 * 3. For each entity: presents model selection from config.json
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

  // Check if project has any entities to configure
  const hasAgents = project.agents && project.agents.length > 0;
  const hasWorkflows = project.workflows && project.workflows.length > 0;

  if (!hasAgents && !hasWorkflows) {
    console.log(`${YELLOW}No agents or workflows found in project.${RESET}`);
    console.log(`${DIM}Add agents with: ccr project scan ${projectId}${RESET}`);
    console.log(`${DIM}Workflows will be auto-discovered from .bmad/bmm/workflows/${RESET}`);
    return;
  }

  console.log(`${CYAN}\nConfiguring project: ${project.name}${RESET}`);

  // Helper function to format workflow display (Story 7.4 UX refinement)
  const formatWorkflowDisplay = (workflow: WorkflowConfig): string => {
    const mode = workflow.modelInheritance || 'default';

    if (mode === 'inherit') {
      // Inherit mode: model is ignored, show [inherit] only
      return '[inherit]';
    } else {
      // Default mode: show model (or [default] if undefined)
      const model = workflow.model || '[default]';
      return model;
    }
  };

  // Display current configuration
  if (hasAgents) {
    console.log(`\n${DIM}--- Agents ---${RESET}`);
    project.agents.forEach(agent => {
      const model = agent.model || '[default]';
      console.log(`  ${agent.name} → ${model}`);
    });
  }

  if (hasWorkflows) {
    console.log(`\n${DIM}--- Workflows ---${RESET}`);
    project.workflows!.forEach(workflow => {
      console.log(`  ${workflow.name} → ${formatWorkflowDisplay(workflow)}`);
    });
  }

  // Main configuration loop
  let configuring = true;
  while (configuring) {
    try {
      // Build entity selection choices
      const entityChoices: Array<{ value: string; name: string }> = [];

      // Add agent choices
      if (hasAgents) {
        for (const agent of project.agents!) {
          entityChoices.push({
            value: `agent:${agent.id}`,
            name: `${agent.name} (agent) → ${agent.model || '[default]'}`
          });
        }
      }

      // Add workflow choices
      if (hasWorkflows) {
        for (const workflow of project.workflows!) {
          // Story 7.4 UX refinement: Use smart display format
          entityChoices.push({
            value: `workflow:${workflow.id}`,
            name: `${workflow.name} (workflow) → ${formatWorkflowDisplay(workflow)}`
          });
        }
      }

      // Add special options
      entityChoices.push(
        { value: ACTION_DONE, name: '[Done - Save changes]' },
        { value: ACTION_CANCEL, name: '[Cancel]' }
      );

      // Add visual spacing before prompt (Story 7.4 UX refinement)
      console.log('');

      // Entity selection prompt
      const selectedEntity = await select({
        message: 'Select entity to configure:',
        choices: entityChoices
      });

      // Handle special options
      if (selectedEntity === ACTION_CANCEL) {
        console.log(`${YELLOW}\nConfiguration cancelled, no changes saved${RESET}`);
        return;
      }

      if (selectedEntity === ACTION_DONE) {
        configuring = false;
        break;
      }

      // Parse entity selection
      const [entityType, entityId] = selectedEntity.split(':');

      if (entityType === 'agent') {
        // Handle agent configuration
        const agent = project.agents!.find(a => a.id === entityId);
        if (!agent) {
          console.error(`${RED}✗ Error: Agent not found${RESET}`);
          continue;
        }

        // Story 7.4: Skip option or Ctrl+C returns to entity menu
        let actualModel: string | undefined | 'skip';
        try {
          actualModel = await selectModelForEntity(agent.name, agent.model);
        } catch (error: any) {
          // Handle Ctrl+C/ESC - check multiple error types
          if (error.name === 'ExitPromptError' || error.name === 'CancelPromptError' || error.message?.includes('User force closed')) {
            // User pressed Ctrl+C or ESC - return to entity menu
            console.log(`${YELLOW}\nCancelled${RESET}`);
            continue;
          }
          throw error;
        }

        if (actualModel === 'skip') {
          continue;
        }

        // Track the change
        session.addAgentChange(agent.id, agent.name, agent.model, actualModel);

        // Update in-memory state for display
        agent.model = actualModel;

        // Show confirmation
        const modelDisplay = actualModel || '[default]';
        console.log(`${GREEN}✓ ${agent.name} → ${modelDisplay}${RESET}`);
      } else if (entityType === 'workflow') {
        // Handle workflow configuration (Story 6.4)
        const workflow = project.workflows!.find(w => w.id === entityId);
        if (!workflow) {
          console.error(`${RED}✗ Error: Workflow not found${RESET}`);
          continue;
        }

        // Story 7.4 UX refinement: Single unified prompt for model + inheritance
        // Build unified choices: [Inherit], [Router.default], then models
        const availableModels = await getAvailableModels();
        const modelChoices = availableModels.map(m => ({
          value: m.value,
          name: m.label
        }));

        // Special options at the top
        const unifiedChoices = [
          {
            value: 'INHERIT',
            name: '[Inherit active model] - Seamless agent → workflow transition (recommended)'
          },
          {
            value: VALUE_DEFAULT,
            name: '[Use Router.default] - Use CCR default routing'
          },
          {
            value: 'SKIP',
            name: '[Skip - Go back to menu]'
          },
          ...modelChoices
        ];

        // Default selection: inherit mode (recommended)
        const currentMode = workflow.modelInheritance || 'default';
        const defaultSelection = currentMode === 'inherit' ? 'INHERIT' : (workflow.model || VALUE_DEFAULT);

        // Add visual spacing before prompt (Story 7.4 UX refinement)
        console.log('');

        // Single prompt for workflow configuration with skip support
        let selection: string;
        try {
          selection = await select({
            message: `Select routing strategy for ${workflow.name}:`,
            choices: unifiedChoices,
            default: defaultSelection
          });
        } catch (error: any) {
          // Handle Ctrl+C/ESC - check multiple error types
          if (error.name === 'ExitPromptError' || error.name === 'CancelPromptError' || error.message?.includes('User force closed')) {
            // User pressed Ctrl+C or ESC - return to entity menu
            console.log(`${YELLOW}\nCancelled${RESET}`);
            continue;
          }
          // Re-throw if not a cancellation
          throw error;
        }

        // Handle skip - return to entity menu
        if (selection === 'SKIP') {
          continue;
        }

        // Map selection to model + inheritanceMode
        let actualModel: string | undefined;
        let inheritanceMode: 'inherit' | 'default';

        if (selection === 'INHERIT') {
          // Inherit active model: keep existing model, set inherit mode
          actualModel = workflow.model;
          inheritanceMode = 'inherit';
        } else if (selection === VALUE_DEFAULT) {
          // Use Router.default: clear model, set default mode
          actualModel = undefined;
          inheritanceMode = 'default';
        } else {
          // Specific model selected: set model, use default mode
          actualModel = selection;
          inheritanceMode = 'default';

          // Validate model format
          if (!Validators.isValidModelString(actualModel)) {
            console.error(`${RED}✗ Error: Invalid model format: ${actualModel}${RESET}`);
            console.log(`${DIM}  Model must be in format: provider,modelname${RESET}`);
            continue;
          }
        }

        // Track the change (Story 7.4: include inheritance mode)
        session.addWorkflowChange(
          workflow.id,
          workflow.name,
          workflow.model,
          actualModel,
          workflow.modelInheritance,
          inheritanceMode
        );

        // Update in-memory state for display
        workflow.model = actualModel;
        workflow.modelInheritance = inheritanceMode;

        // Show confirmation (Story 7.4: include mode)
        const modelDisplay = actualModel || '[default]';
        const modeDisplay = inheritanceMode;
        console.log(`${GREEN}✓ ${workflow.name} → ${modelDisplay} [${modeDisplay}]${RESET}`);
      }

      // Loop continues - user will see entity selection menu again

    } catch (error: any) {
      // Handle Ctrl+C/ESC at top level - check multiple error types
      if (error.name === 'ExitPromptError' || error.name === 'CancelPromptError' || error.message?.includes('User force closed')) {
        // User pressed Ctrl+C or ESC at entity menu - exit configuration
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
      const agentCount = session.getAgentCount();
      const workflowCount = session.getWorkflowCount();

      console.log(`${GREEN}\n✓ Configuration complete!${RESET}`);

      // Display configured entities
      if (agentCount > 0 && workflowCount > 0) {
        console.log(`\nConfigured ${agentCount} agent${agentCount === 1 ? '' : 's'} and ${workflowCount} workflow${workflowCount === 1 ? '' : 's'}:`);
      } else if (agentCount > 0) {
        console.log(`\nConfigured ${agentCount} agent${agentCount === 1 ? '' : 's'}:`);
      } else if (workflowCount > 0) {
        console.log(`\nConfigured ${workflowCount} workflow${workflowCount === 1 ? '' : 's'}:`);
      }

      for (const line of session.getSummary()) {
        console.log(`${DIM}${line}${RESET}`);
      }

      // Git workflow guidance
      console.log(`\n${DIM}Next steps:${RESET}`);
      console.log(`${DIM}  • Copy projects.json to share with your team:${RESET}`);
      console.log(`${DIM}      mkdir -p .claude-code-router${RESET}`);
      console.log(`${DIM}      cp ~/.claude-code-router/projects.json .claude-code-router/${RESET}`);
      console.log(`${DIM}  • Commit and push to git:${RESET}`);
      console.log(`${DIM}      git add .claude-code-router/projects.json${RESET}`);
      console.log(`${DIM}      git commit -m "Configure model assignments"${RESET}`);
      console.log(`${DIM}  • Team members will receive this configuration on git pull${RESET}`);
      console.log(`${DIM}  • No manual setup needed for team members (zero-config onboarding)${RESET}`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`${RED}✗ Error saving configuration: ${errorMsg}${RESET}`);
      console.error(`${DIM}  ${session.getCount()} entit${session.getCount() === 1 ? 'y' : 'ies'} configured but not saved${RESET}`);
      process.exit(1);
    }
  } else {
    console.log(`${DIM}\nNo changes to save${RESET}`);
  }
}

/**
 * Select model for an entity (agent or workflow)
 * Presents interactive model selection prompt and validates the result
 *
 * @param entityName - Name of the entity being configured
 * @param currentModel - Current model assignment (undefined if using Router.default)
 * @returns Promise resolving to selected model string, undefined for Router.default, or 'skip' on validation failure
 *
 * @throws {Error} If user interrupts the prompt (ExitPromptError)
 *
 * @example
 * const model = await selectModelForEntity('dev.md', undefined);
 * // Returns: 'openai,gpt-4o' or undefined or 'skip'
 */
async function selectModelForEntity(
  entityName: string,
  currentModel: string | undefined
): Promise<string | undefined | 'skip'> {
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
  modelChoices.push({
    value: 'skip',
    name: '[Skip - Go back to menu]'
  });

  // Default to current model or Router.default
  const defaultModel = currentModel || VALUE_DEFAULT;

  // Add visual spacing before prompt (Story 7.4 UX refinement)
  console.log('');

  // Model selection prompt with skip option
  const selectedModel = await select({
    message: `Select model for ${entityName}:`,
    choices: modelChoices,
    default: defaultModel
  });

  // Handle skip selection
  if (selectedModel === 'skip') {
    return 'skip';
  }

  // Validate selection before storing
  const actualModel = selectedModel === VALUE_DEFAULT ? undefined : selectedModel;
  if (actualModel !== undefined && !Validators.isValidModelString(actualModel)) {
    console.error(`${RED}✗ Error: Invalid model format: ${actualModel}${RESET}`);
    console.log(`${DIM}  Model must be in format: provider,modelname${RESET}`);
    return 'skip'; // Signal to skip this change
  }

  return actualModel;
}
