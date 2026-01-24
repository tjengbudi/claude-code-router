import { ProjectManager, Validators, PROJECTS_FILE,
  formatProjectAddedSuccess,
  formatConfigurationSuccess,
  formatError,
  formatProjectList,
  formatScanResult,
  formatHelpText,
  colors,
  type ConfiguredEntity
} from '@CCR/shared';
import path from 'path';
import type { RescanResult, AgentConfig } from '@CCR/shared';
import { interactiveModelConfiguration, getAvailableModels, VALUE_DEFAULT, ConfigurationSession } from '../interactive/modelConfig';
import { confirm, select } from '@inquirer/prompts';

/**
 * Handle project commands
 * @param args - Command arguments (e.g., ['add', '/path/to/project'])
 */
export async function handleProjectCommand(args: string[]): Promise<void> {
  const subCommand = args[0];

  if (!subCommand || subCommand === '--help' || subCommand === '-h') {
    console.log(formatHelpText());
    return;
  }

  switch (subCommand) {
    case 'add':
      await handleProjectAdd(args.slice(1));
      break;
    case 'list':
      await handleProjectList();
      break;
    case 'scan':
      await handleProjectScan(args.slice(1));
      break;
    case 'configure':
      await handleProjectConfigure(args.slice(1));
      break;
    default:
      console.error(`Unknown project command: ${subCommand}`);
      console.error('Available commands: add, list, scan, configure');
      process.exit(1);
  }
}

/**
 * Handle 'project add' command (Story 1.2: Updated to display discovered agents with UUIDs)
 * Story 5.4: Refactored to use formatProjectAddedSuccess and formatError
 * @param args - Command arguments (e.g., ['/path/to/project'])
 */
async function handleProjectAdd(args: string[]): Promise<void> {
  const projectPath = args[0];

  if (!projectPath) {
    console.error(formatError('Project path is required', {
      operation: 'ccr project add',
      input: '<path>',
      troubleshooting: [
        'Provide the path to the project directory',
        'Example: ccr project add /home/user/my-project',
      ],
    }));
    process.exit(1);
  }

  // Resolve to absolute path
  const resolvedPath = path.resolve(projectPath);

  // Validate project path
  const isValid = await Validators.isValidProjectPath(resolvedPath);
  if (!isValid) {
    console.error(formatError(`Invalid project path: ${resolvedPath}`, {
      operation: 'ccr project add',
      input: resolvedPath,
      troubleshooting: [
        'Verify the path exists and is accessible',
        'Ensure the path points to a valid directory',
        'Note: Agents will be auto-discovered from .bmad/bmm/agents/*.md',
        'Check file permissions',
      ],
    }));
    process.exit(1);
  }

  try {
    // Create project manager and add project
    // Story 1.2: addProject() now automatically scans and injects UUIDs
    const pm = new ProjectManager(PROJECTS_FILE);
    const result = await pm.addProject(resolvedPath);

    // Story 5.4: Display using formatProjectAddedSuccess
    console.log(formatProjectAddedSuccess(result));
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.error(formatError(errorMsg, {
      operation: 'ccr project add',
      input: resolvedPath,
    }));
    process.exit(1);
  }
}

/**
 * Handle 'project list' command (Story 1.3: Display all registered projects with agents)
 * Story 5.4: Refactored to use formatProjectList
 */
async function handleProjectList(): Promise<void> {
  const pm = new ProjectManager(PROJECTS_FILE);
  const projects = await pm.listProjects();

  // Story 5.4: Display using formatProjectList
  console.log(formatProjectList(projects || []));
}

/**
 * Handle 'project scan' command (Story 1.4: Rescan project for new or deleted agents)
 * Story 5.4: Refactored to use formatScanResult and formatError
 * @param args - Command arguments (e.g., ['<project-id>'])
 */
export async function handleProjectScan(args: string[]): Promise<void> {
  const projectId = args[0];

  if (!projectId) {
    console.error(formatError('Project ID required', {
      operation: 'ccr project scan',
      input: '<project-id>',
      troubleshooting: [
        'Provide the project ID to scan',
        'List available projects: ccr project list',
      ],
    }));
    process.exit(1);
  }

  const pm = new ProjectManager(PROJECTS_FILE);

  try {
    // AC2: Validate project ID format before processing
    if (!Validators.isValidAgentId(projectId)) {
      console.error(formatError(`Invalid project ID: ${projectId}`, {
        operation: 'ccr project scan',
        input: projectId,
        troubleshooting: [
          'Project ID must be a valid UUID v4 format',
          'List available projects: ccr project list',
        ],
      }));
      process.exit(1);
    }

    // Call rescanProject method
    const result: RescanResult = await pm.rescanProject(projectId);

    // Validate RescanResult structure
    if (!result || typeof result !== 'object' ||
        !Array.isArray(result.newAgents) ||
        !Array.isArray(result.deletedAgents) ||
        !Array.isArray(result.failedAgents) ||
        typeof result.totalAgents !== 'number') {
      throw new Error('Invalid rescan result structure returned from ProjectManager');
    }

    // Story 5.4: Display using formatScanResult
    console.log(formatScanResult(result));

    // Story 4.3: Prompt for configuration when new agents detected
    if (result.newAgents.length > 0) {
      try {
        const configureNow = await confirm({
          message: 'Configure new agents now?',
          default: true
        });

        if (configureNow) {
          // Fetch full AgentConfig objects for new agents
          const project = await pm.getProject(projectId);
          if (project) {
            // Filter agents that are newly detected
            const newAgentConfigs = project.agents.filter((agent: AgentConfig) =>
              result.newAgents.includes(agent.name)
            );

            // Call interactive configuration with new agents only
            await configureNewAgentsInteractive(projectId, newAgentConfigs);
          }
        } else {
          // AC6: Skip configuration path (user declines)
          console.log('\nNew agents added without model configuration.');
          console.log('Configure later with: ccr project configure <id>');
          console.log('New agents will use Router.default until configured.');
        }
      } catch (error) {
        if ((error as Error).name === 'ExitPromptError') {
          console.log('\nConfiguration interrupted');
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.error(formatError(errorMsg, {
      operation: 'ccr project scan',
      input: projectId,
    }));
    process.exit(1);
  }
}

/**
 * Interactive configuration for new agents (Story 4.3)
 * Prompts user to configure models for newly detected agents
 * Uses ConfigurationSession pattern for atomic batch saves (AC4)
 *
 * @param projectId - Project ID
 * @param newAgents - List of newly detected agents to configure
 */
async function configureNewAgentsInteractive(
  projectId: string,
  newAgents: AgentConfig[]
): Promise<void> {
  const pm = new ProjectManager(PROJECTS_FILE);

  console.log(colors.green('\nConfiguring new agents...'));

  // Bulk configuration option for 5+ agents (from Dev Notes)
  let applySameModelToAll = false;
  let bulkModel: string | undefined = undefined;

  if (newAgents.length >= 5) {
    try {
      applySameModelToAll = await confirm({
        message: `Found ${newAgents.length} new agents. Apply same model to all?`,
        default: false
      });

      if (applySameModelToAll) {
        // Load available models once
        const availableModels = await getAvailableModels();
        const modelChoices = availableModels.map(m => ({
          value: m.value,
          name: m.label
        }));
        modelChoices.push({
          value: VALUE_DEFAULT,
          name: '[Use Router.default]'
        });

        // Prompt for bulk model selection
        const selectedModel = await select({
          message: 'Select model for all new agents:',
          choices: modelChoices
        });

        bulkModel = selectedModel === VALUE_DEFAULT ? undefined : selectedModel;

        // Validate bulk model selection
        if (bulkModel !== undefined && !Validators.isValidModelString(bulkModel)) {
          console.error(colors.red(`✗ Invalid model format: ${bulkModel}`));
          console.log(colors.dim('  Model must be in format: provider,modelname'));
          applySameModelToAll = false; // Fall back to individual configuration
        } else {
          const modelDisplay = bulkModel || '[default]';
          console.log(colors.green(`✓ Applying ${modelDisplay} to all ${newAgents.length} agents`));
        }
      }
    } catch (error: any) {
      if (error.name === 'ExitPromptError') {
        console.log(colors.yellow('\nConfiguration interrupted'));
        return;
      }
      throw error;
    }
  }

  // Use ConfigurationSession for atomic batch saves (AC4)
  const session = new ConfigurationSession();

  if (applySameModelToAll) {
    // Bulk mode: add all agents with same model
    for (const agent of newAgents) {
      session.addAgentChange(agent.id, agent.name, agent.model, bulkModel);
    }
  } else {
    // Individual mode: prompt for each agent
    const availableModels = await getAvailableModels();
    const modelChoices = availableModels.map(m => ({
      value: m.value,
      name: m.label
    }));
    modelChoices.push({
      value: VALUE_DEFAULT,
      name: '[Use Router.default]'
    });

    for (const agent of newAgents) {
      try {
        const selectedModel = await select({
          message: `Select model for ${agent.name}:`,
          choices: modelChoices
        });

        const actualModel = selectedModel === VALUE_DEFAULT ? undefined : selectedModel;

        // Validate model before adding to session (AC3)
        if (actualModel !== undefined && !Validators.isValidModelString(actualModel)) {
          console.error(colors.red(`✗ Invalid model format: ${actualModel}`));
          console.log(colors.dim('  Model must be in format: provider,modelname'));
          console.log(colors.dim(`  Skipping ${agent.name}`));
          continue;
        }

        // Track change in session (not saved yet)
        session.addAgentChange(agent.id, agent.name, agent.model, actualModel);

        // Show confirmation (AC3)
        const modelDisplay = actualModel || '[default]';
        console.log(colors.green(`✓ ${agent.name} → ${modelDisplay}`));

      } catch (error: any) {
        if (error.name === 'ExitPromptError') {
          console.log(colors.yellow('\nConfiguration interrupted, no changes saved'));
          return;
        }
        throw error;
      }
    }
  }

  // Atomic batch save - all or nothing (AC4)
  if (session.getCount() > 0) {
    try {
      await session.save(projectId);
      const savedCount = session.getSavedCount();

      // Build configured agents array for formatting
      const configuredAgents: ConfiguredEntity[] = [];
      for (const line of session.getSummary()) {
        // Parse line format: "  - entity-name → model"
        // Note: ID is no longer included in summary format (Story 6.4)
        const match = line.match(/^[\s\-]+(.+?) → (.+)$/);
        if (match) {
          configuredAgents.push({
            name: match[1],
            model: match[2] === '[default]' ? undefined : match[2],
          });
        }
      }

      // Story 5.4: Display using formatConfigurationSuccess
      console.log(`\n${formatConfigurationSuccess(configuredAgents)}`);

      // Show total agents (AC4)
      const project = await pm.getProject(projectId);
      if (project) {
        console.log(`\n${colors.dim(`Total agents: ${project.agents.length}`)}`);
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(formatError(`Error saving configuration: ${errorMsg}`, {
        operation: 'ccr project configure',
        troubleshooting: [
          `${session.getCount()} agent(s) configured but not saved`,
          'Check file permissions for ~/.claude-code-router/',
          'Ensure projects.json is not corrupted',
        ],
      }));
      throw error;
    }
  } else {
    console.log(colors.dim('\nNo changes to save'));
  }
}

/**
 * Handle 'project configure' command (Story 2.2: Interactive CLI model assignment)
 * Story 5.4: Refactored to use formatError
 * @param args - Command arguments (e.g., ['<project-id>'])
 */
async function handleProjectConfigure(args: string[]): Promise<void> {
  const projectId = args[0];

  if (!projectId) {
    console.error(formatError('Project ID required', {
      operation: 'ccr project configure',
      input: '<project-id>',
      troubleshooting: [
        'Provide the project ID to configure',
        'List available projects: ccr project list',
      ],
    }));
    process.exit(1);
  }

  // Call interactive model configuration
  await interactiveModelConfiguration(projectId);
}

