import { ProjectManager, Validators, PROJECTS_FILE } from '@CCR/shared';
import path from 'path';
import type { RescanResult, AgentConfig } from '@CCR/shared';
import { interactiveModelConfiguration } from '../interactive/modelConfig';
import { confirm } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/prompts';

/**
 * Handle project commands
 * @param args - Command arguments (e.g., ['add', '/path/to/project'])
 */
export async function handleProjectCommand(args: string[]): Promise<void> {
  const subCommand = args[0];

  if (!subCommand || subCommand === '--help' || subCommand === '-h') {
    console.log('Usage: ccr project <command> [options]');
    console.log('\nCommands:');
    console.log('  add <path>       Register a new project');
    console.log('  list             List all registered projects');
    console.log('  scan <id>        Rescan project for new or deleted agents');
    console.log('  configure <id>   Configure agent models interactively');
    console.log('\nGit-Based Configuration Sharing:');
    console.log('  Projects are stored in ~/.claude-code-router/projects.json');
    console.log('  This file is safe to commit to git (contains no API keys)');
    console.log('  Share configurations with your team via version control');
    console.log('  Team members receive agent routing on git pull (zero-config)');
    console.log('\nExamples:');
    console.log('  ccr project add /home/user/my-project');
    console.log('  ccr project configure <project-id>');
    console.log('  git add ~/.claude-code-router/projects.json');
    console.log('  git commit -m "Configure agent models"');
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
 * @param args - Command arguments (e.g., ['/path/to/project'])
 */
async function handleProjectAdd(args: string[]): Promise<void> {
  const projectPath = args[0];

  if (!projectPath) {
    console.error('Error: Project path is required');
    console.error('\nUsage: ccr project add <path>');
    console.error('\nExample: ccr project add /home/user/my-project');
    process.exit(1);
  }

  // Resolve to absolute path
  const resolvedPath = path.resolve(projectPath);

  // Validate project path
  const isValid = await Validators.isValidProjectPath(resolvedPath);
  if (!isValid) {
    console.error(`✗ Error: Invalid project path: ${resolvedPath}\n`);
    console.error('  Troubleshooting:');
    console.error('  - Verify the path exists and is accessible');
    console.error('  - Ensure the path points to a valid directory');
    console.error('  - Note: Agents will be auto-discovered from .bmad/bmm/agents/*.md');
    console.error('  - Check file permissions\n');
    console.error('  Get help: ccr project --help');
    process.exit(1);
  }

  // Create project manager and add project
  // Story 1.2: addProject() now automatically scans and injects UUIDs
  const pm = new ProjectManager(PROJECTS_FILE);
  const result = await pm.addProject(resolvedPath);

  // Story 1.2: Display discovered agents with injected UUIDs
  console.log(`✓ Project added: ${result.name} (${result.id})`);
  console.log(`  Path: ${result.path}`);
  console.log(`  Agents discovered: ${result.agents.length}`);

  if (result.agents.length > 0) {
    console.log('\n  Agents with injected UUIDs:');
    for (const agent of result.agents) {
      console.log(`  ├─ ${agent.name} → CCR-AGENT-ID: ${agent.id}`);
    }
  }

  // Story 2.4: Git workflow hint for team collaboration
  console.log('\n  Next steps:');
  console.log('  • Configure agent models: ccr project configure ' + result.id);
  console.log('  • Commit and push to share with your team:');
  console.log('      git add ~/.claude-code-router/projects.json');
  console.log('      git commit -m "Add project: ' + result.name + '"');
  console.log('  • Team members will receive configuration on git pull');
}

/**
 * Handle 'project list' command (Story 1.3: Display all registered projects with agents)
 */
async function handleProjectList(): Promise<void> {
  const pm = new ProjectManager(PROJECTS_FILE);
  const projects = await pm.listProjects();

  // AC#3: Display helpful message for empty projects
  if (!projects || projects.length === 0) {
    console.log('No projects registered. Add a project with: ccr project add <path>');
    return;
  }

  // AC#1, #2, #5: Display formatted project list
  console.log(`\n📦 Registered Projects (${projects.length})\n`);

  projects.forEach((project, index) => {
    console.log(`${index + 1}. ${project.name}`);
    console.log(`   ID: ${project.id}`);
    console.log(`   Path: ${project.path}`);
    console.log(`   Agents: ${project.agents.length}`);

    // AC#2: Display agent-to-model mappings
    if (project.agents.length > 0) {
      console.log(`   Agent Details:`);
      project.agents.forEach((agent, i) => {
        // Show [default] for all agents in Epic 1 (model configuration in Epic 2)
        // AC#2: Use configured model if available, otherwise default
        const model = (agent as any).model || '[default]';
        const isLast = i === project.agents.length - 1;
        const prefix = isLast ? '   └─' : '   ├─';
        console.log(`${prefix} ${agent.name} → ${model}`);
        console.log(`      CCR-AGENT-ID: ${agent.id}`);
      });
    }
    console.log(''); // Separator between projects (AC#5)
  });
}

/**
 * Handle 'project scan' command (Story 1.4: Rescan project for new or deleted agents)
 * @param args - Command arguments (e.g., ['<project-id>'])
 */
async function handleProjectScan(args: string[]): Promise<void> {
  const projectId = args[0];

  if (!projectId) {
    console.error('✗ Error: Project ID required');
    console.error('\nUsage: ccr project scan <project-id>');
    console.error('\nList projects: ccr project list');
    process.exit(1);
  }

  const pm = new ProjectManager(PROJECTS_FILE);

  try {
    // AC4: Validate project ID format before processing
    if (!Validators.isValidAgentId(projectId)) {
      console.error(`✗ Error: Invalid project ID: ${projectId}`);
      console.error('\nProject ID must be a valid UUID v4 format');
      console.error('List available projects: ccr project list');
      process.exit(1);
    }

    // Call rescanProject method
    const result: RescanResult = await pm.rescanProject(projectId);

    // AC3: Display scan summary
    if (result.newAgents.length === 0 && result.deletedAgents.length === 0 && result.failedAgents.length === 0) {
      console.log('✓ No changes detected. All agents up to date.');
    } else {
      console.log('\n✓ Project rescan complete:\n');

      if (result.newAgents.length > 0) {
        console.log(`  Found ${result.newAgents.length} new agent(s):`);
        result.newAgents.forEach(name => console.log(`  ├─ ${name}`));
        if (result.deletedAgents.length > 0 || result.failedAgents.length > 0) {
          console.log('');
        }
      }

      if (result.deletedAgents.length > 0) {
        console.log(`  Removed ${result.deletedAgents.length} deleted agent(s):`);
        result.deletedAgents.forEach(agent => console.log(`  ├─ ${agent.name}`));
        if (result.failedAgents.length > 0) {
          console.log('');
        }
      }

      if (result.failedAgents.length > 0) {
        console.log(`  ${result.failedAgents.length} agent(s) failed to process:`);
        result.failedAgents.forEach(name => console.log(`  ├─ ${name}`));
      }

      console.log(`\n  Total agents: ${result.totalAgents}`);
    }

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
          // Skip configuration path (AC5)
          console.log('\nNew agents added without model configuration.');
          console.log('Configure later with: ccr project configure <id>');
          console.log('New agents will use Router.default until configured.');
        }
      } catch (error) {
        if (error instanceof ExitPromptError) {
          console.log('\nConfiguration interrupted');
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error(`✗ Error: ${(error as Error).message}`);

    if ((error as Error).message.includes('Invalid project ID')) {
      console.log('\nList available projects: ccr project list');
    }
  }
}

/**
 * Interactive configuration for new agents (Story 4.3)
 * Prompts user to configure models for newly detected agents
 * @param projectId - Project ID
 * @param newAgents - List of newly detected agents to configure
 */
async function configureNewAgentsInteractive(
  projectId: string,
  newAgents: AgentConfig[]
): Promise<void> {
  const pm = new ProjectManager(PROJECTS_FILE);

  if (newAgents.length === 0) {
    return; // AC1a: Empty new agents handling
  }

  console.log('\nConfiguring new agents...\n');

  // Load available models from config.json
  const { getAvailableModels } = await import('../interactive/modelConfig.js');
  const availableModels = await getAvailableModels();

  const configuredAgents: Array<{ name: string; model: string }> = [];

  // Configure each new agent
  for (const agent of newAgents) {
    const { select } = await import('@inquirer/prompts');

    const modelChoices = availableModels.map(m => ({
      value: m.value,
      name: m.label
    }));
    modelChoices.push({
      value: 'default',
      name: '[Use Router.default]'
    });

    const selectedModel = await select({
      message: `Select model for ${agent.name}:`,
      choices: modelChoices
    });

    const actualModel = selectedModel === 'default' ? undefined : selectedModel;

    // Validate model before saving
    const { Validators } = await import('@CCR/shared');
    if (actualModel !== undefined && !Validators.isValidModelString(actualModel)) {
      console.error(`✗ Invalid model format: ${actualModel}`);
      console.log('  Model must be in format: provider,modelname');
      continue;
    }

    // Save model assignment
    await pm.setAgentModel(projectId, agent.id, actualModel);

    const modelDisplay = actualModel || '[default]';
    console.log(`✓ ${agent.name} → ${modelDisplay}`);

    configuredAgents.push({ name: agent.name, model: modelDisplay });
  }

  // Display configuration summary (AC4)
  console.log(`\n✓ Configured ${configuredAgents.length} new agent(s):`);
  configuredAgents.forEach(agent => {
    console.log(`  - ${agent.name} → ${agent.model}`);
  });

  const project = await pm.getProject(projectId);
  console.log(`\nTotal agents: ${project?.agents.length || 0}`);

  // Git workflow guidance
  console.log('\nCommit projects.json to share configuration with team');
}

/**
 * Handle 'project configure' command (Story 2.2: Interactive CLI model assignment)
 * @param args - Command arguments (e.g., ['<project-id>'])
 */
async function handleProjectConfigure(args: string[]): Promise<void> {
  const projectId = args[0];

  if (!projectId) {
    console.error('✗ Error: Project ID required');
    console.error('\nUsage: ccr project configure <project-id>');
    console.error('\nList projects: ccr project list');
    process.exit(1);
  }

  // Call interactive model configuration
  await interactiveModelConfiguration(projectId);
}

