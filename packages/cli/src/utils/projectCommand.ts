import { ProjectManager, Validators, PROJECTS_FILE } from '@CCR/shared';
import path from 'path';

/**
 * Handle project commands
 * @param args - Command arguments (e.g., ['add', '/path/to/project'])
 */
export async function handleProjectCommand(args: string[]): Promise<void> {
  const subCommand = args[0];

  switch (subCommand) {
    case 'add':
      await handleProjectAdd(args.slice(1));
      break;
    default:
      console.error(`Unknown project command: ${subCommand}`);
      console.error('Available commands: add');
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
