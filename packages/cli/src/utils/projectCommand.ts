import { ProjectManager, Validators, PROJECTS_FILE } from '@CCR/shared';
import path from 'path';

/**
 * Handle project commands
 * @param args - Command arguments (e.g., ['add', '/path/to/project'])
 */
export async function handleProjectCommand(args: string[]): Promise<void> {
  const subCommand = args[0];

  if (!subCommand || subCommand === '--help' || subCommand === '-h') {
    console.log('Usage: ccr project <command> [options]');
    console.log('\nCommands:');
    console.log('  add <path>   Register a new project');
    console.log('  list         List all registered projects');
    return;
  }

  switch (subCommand) {
    case 'add':
      await handleProjectAdd(args.slice(1));
      break;
    case 'list':
      await handleProjectList();
      break;
    default:
      console.error(`Unknown project command: ${subCommand}`);
      console.error('Available commands: add, list');
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
