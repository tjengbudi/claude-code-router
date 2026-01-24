/**
 * Message formatting utilities for CCR CLI
 * Story 5.4: CLI Feedback & Error Messages
 *
 * Provides consistent formatting for:
 * - Success messages (project added, configuration saved)
 * - Error messages with troubleshooting steps
 * - Tree-style output with box-drawing characters
 * - Path truncation for long paths
 * - Color support with TTY detection
 */

import type { AgentConfig, WorkflowConfig } from '../types/agent';

// ANSI color codes for consistent output (from existing projectCommand.ts)
const RESET = "\x1B[0m";
const DIM = "\x1B[2m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const RED = "\x1B[31m";
const BLUE = "\x1B[34m";

// Unicode box-drawing characters for tree-style output
const BOX_DRAWING = {
  BRANCH: "├─",
  LAST: "└─",
  VERTICAL: "│",
} as const;

// Fallback characters for terminals that don't support Unicode
const ASCII_FALLBACK = {
  BRANCH: "+--",
  LAST: "+--",
  VERTICAL: "|",
} as const;

/**
 * Detect if the terminal supports Unicode box-drawing characters
 */
function supportsUnicode(): boolean {
  // Check if we're in a TTY and the locale supports UTF-8
  if (!process.stdout.isTTY) {
    return false;
  }

  // Check LC_ALL, LC_CTYPE, or LANG environment variables for UTF-8
  const localeEnv = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG;
  if (localeEnv && localeEnv.toLowerCase().includes('utf-8')) {
    return true;
  }

  // Default to true for modern terminals
  return true;
}

/**
 * Get box-drawing characters (Unicode or ASCII fallback)
 */
function getBoxDrawing(): typeof BOX_DRAWING | typeof ASCII_FALLBACK {
  return supportsUnicode() ? BOX_DRAWING : ASCII_FALLBACK;
}

/**
 * Truncate a path to maximum length with ellipsis in the middle
 * @param path - The path to truncate
 * @param maxLength - Maximum length (default: 80)
 * @returns Truncated path with ellipsis in middle
 */
export function truncatePath(path: string, maxLength: number = 80): string {
  if (path.length <= maxLength) {
    return path;
  }

  // Split path into components
  const parts = path.split(/[/\\]/);
  if (parts.length < 2) {
    // No path separators, just truncate
    const halfLength = Math.floor((maxLength - 3) / 2);
    return path.slice(0, halfLength) + "..." + path.slice(path.length - halfLength);
  }

  // Keep the beginning and end, truncate the middle
  const firstPart = parts[0]; // Usually root or drive
  const lastPart = parts[parts.length - 1]; // Usually file or folder name

  // Calculate available space for ellipsis and separator
  const ellipsis = "...";
  const separator = path.includes('/') ? '/' : '\\';
  const availableLength = maxLength - firstPart.length - lastPart.length - ellipsis.length - separator.length * 2;

  if (availableLength < 0) {
    // Path too long even with minimal truncation
    const halfLength = Math.floor((maxLength - 3) / 2);
    return path.slice(0, halfLength) + "..." + path.slice(path.length - halfLength);
  }

  // Add a truncated middle portion
  const middleTruncate = Math.max(10, Math.floor(availableLength / 2));
  return `${firstPart}${separator}...${path.slice(-middleTruncate - lastPart.length)}`;
}

/**
 * Apply color to text if TTY is detected
 * @param text - The text to color
 * @param color - ANSI color code
 * @returns Colored text or plain text if not TTY
 */
function colorize(text: string, color: string): string {
  if (process.stdout.isTTY) {
    return `${color}${text}${RESET}`;
  }
  return text;
}

/**
 * Format agent list with tree-style output
 * @param agents - Array of agents with name and id
 * @returns Formatted agent list string
 */
function formatAgentList(agents: Array<{ name: string; id: string }>): string {
  if (agents.length === 0) {
    return "";
  }

  const box = getBoxDrawing();
  const lines: string[] = [];

  agents.forEach((agent, index) => {
    const isLast = index === agents.length - 1;
    const prefix = isLast ? box.LAST : box.BRANCH;
    lines.push(`  ${prefix} ${agent.name} → CCR-AGENT-ID: ${agent.id}`);
  });

  return lines.join("\n");
}

/**
 * Format project added success message
 * Extends existing format from projectCommand.ts:97-114
 *
 * @param project - Project configuration with id, name, path, agents
 * @returns Formatted success message string
 */
export interface ProjectSuccessData {
  id: string;
  name: string;
  path: string;
  agents: Array<{ name: string; id: string }>;
  workflows?: Array<{ name: string; description: string }>; // Story 6.1: Workflow discovery
}

export function formatProjectAddedSuccess(project: ProjectSuccessData): string {
  const lines: string[] = [];
  const truncatedPath = truncatePath(project.path);

  lines.push(colorize(`✓ Project added: ${project.name} (${project.id})`, GREEN));
  lines.push(`  Path: ${truncatedPath}`);
  lines.push(`  Agents discovered: ${project.agents.length}`);

  // Story 6.1: Display workflows discovered
  if (project.workflows && project.workflows.length > 0) {
    lines.push(`  Workflows discovered: ${project.workflows.length}`);
  }

  if (project.agents.length > 0) {
    lines.push("");
    lines.push("  Agents with injected UUIDs:");
    lines.push(formatAgentList(project.agents));
  }

  // Story 6.1: Display workflows if discovered
  if (project.workflows && project.workflows.length > 0) {
    lines.push("");
    lines.push("  Workflows:");
    const box = getBoxDrawing();
    project.workflows.forEach((workflow, index) => {
      const isLast = index === project.workflows!.length - 1;
      const prefix = isLast ? box.LAST : box.BRANCH;
      lines.push(`  ${prefix} ${workflow.name}`);
      if (workflow.description) {
        lines.push(`     ${workflow.description}`);
      }
    });
  }

  // Story 2.4: Git workflow hint for team collaboration
  lines.push("");
  lines.push("  Next steps:");
  lines.push(`  • Configure agent models: ccr project configure ${project.id}`);
  lines.push("  • Commit and push to share with your team:");
  lines.push("      git add ~/.claude-code-router/projects.json");
  lines.push(`      git commit -m "Add project: ${project.name}"`);
  lines.push("  • Team members will receive configuration on git pull");

  return lines.join("\n");
}

/**
 * Format configuration success message
 * @param configuredAgents - Array of configured agents with name and model
 * @returns Formatted configuration success message
 */
export function formatConfigurationSuccess(configuredAgents: AgentConfig[]): string {
  const lines: string[] = [];

  if (configuredAgents.length === 0) {
    lines.push(colorize("✓ No agents to configure", YELLOW));
    return lines.join("\n");
  }

  lines.push(colorize(`✓ Configured ${configuredAgents.length} agent(s):`, GREEN));

  const box = getBoxDrawing();
  configuredAgents.forEach((agent, index) => {
    const isLast = index === configuredAgents.length - 1;
    const prefix = isLast ? box.LAST : box.BRANCH;
    const model = agent.model || "[default]";
    lines.push(colorize(`  ${prefix} ${agent.name} → ${model}`, DIM));
  });

  // Git sharing notice
  lines.push("");
  lines.push(colorize("Commit projects.json to share configuration with team", DIM));

  return lines.join("\n");
}

/**
 * Format error message with troubleshooting steps
 * Extends existing format from projectCommand.ts:81-88
 *
 * @param error - Error object or error message
 * @param context - Error context (operation, input, etc.)
 * @returns Formatted error message string
 */
export interface ErrorContext {
  operation?: string;
  input?: string;
  troubleshooting?: string[];
}

export function formatError(error: Error | string, context: ErrorContext = {}): string {
  const errorMessage = typeof error === "string" ? error : error.message;
  const errorCode = typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;

  const lines: string[] = [];

  lines.push(colorize(`✗ Error: ${errorMessage}`, RED));

  // Add troubleshooting steps
  const troubleshooting = context.troubleshooting || getTroubleshootingSteps(errorCode, errorMessage);
  if (troubleshooting.length > 0) {
    lines.push("");
    lines.push("  Troubleshooting:");
    troubleshooting.forEach((step) => {
      lines.push(`  - ${step}`);
    });
  }

  // Add context if available
  if (context.operation) {
    lines.push("");
    lines.push(`  Operation: ${context.operation}`);
  }
  if (context.input) {
    lines.push(`  Input: ${context.input}`);
  }

  // Add help reference
  lines.push("");
  lines.push("  Get help: ccr project --help");

  return lines.join("\n");
}

/**
 * Get troubleshooting steps based on error code
 * @param errorCode - Node.js error code (ENOENT, EACCES, etc.)
 * @param errorMessage - Error message
 * @returns Array of troubleshooting step strings
 */
function getTroubleshootingSteps(errorCode?: string, errorMessage?: string): string[] {
  const steps: string[] = [];

  switch (errorCode) {
    case "ENOENT":
      steps.push("Verify the path exists and is accessible");
      steps.push("Ensure the path points to a valid directory");
      steps.push("Note: Agents will be auto-discovered from .bmad/bmm/agents/*.md");
      break;

    case "EACCES":
      steps.push("Check file permissions for the specified path");
      steps.push("Ensure you have read access to the directory");
      steps.push("Try running with appropriate permissions");
      break;

    case "EISDIR":
      steps.push("The specified path is a directory, not a file");
      steps.push("Provide the correct path to the project directory");
      break;

    case "EPERM":
      steps.push("Permission denied writing to configuration file");
      steps.push("Check write permissions for ~/.claude-code-router/");
      steps.push("Ensure the directory is not read-only");
      break;

    default:
      if (errorMessage?.includes("Invalid project ID")) {
        steps.push("Verify the project ID is a valid UUID v4 format");
        steps.push("List available projects: ccr project list");
      } else if (errorMessage?.includes("Project not found")) {
        steps.push("Verify the project ID exists in projects.json");
        steps.push("List available projects: ccr project list");
      } else if (errorMessage?.includes("Invalid model format")) {
        steps.push("Model must be in format: provider,modelname");
        steps.push('Example: "openai,gpt-4o" or "anthropic,claude-sonnet-4"');
      } else if (errorMessage?.includes("projects.json")) {
        steps.push("Check projects.json file is not corrupted");
        steps.push("Ensure the file contains valid JSON/JSON5");
        steps.push("Location: ~/.claude-code-router/projects.json");
      } else {
        steps.push("Check the error message for specific details");
        steps.push("Verify all inputs are correct");
        steps.push("Try running the command again");
      }
      break;
  }

  if (steps.length === 0) {
    steps.push("An unexpected error occurred");
    steps.push("Check the error message for details");
    steps.push("Run with verbose logging for more information");
  }

  return steps;
}

/**
 * Format project list for display
 * @param projects - Array of project configurations
 * @returns Formatted project list string
 */
export interface ProjectListData {
  name: string;
  id: string;
  path: string;
  agents: AgentConfig[];
  workflows?: Array<{ name: string; description: string }>; // Story 6.1: Workflow discovery
}

export function formatProjectList(projects: ProjectListData[]): string {
  const lines: string[] = [];

  if (projects.length === 0) {
    lines.push("No projects registered. Add a project with: ccr project add <path>");
    return lines.join("\n");
  }

  lines.push(`\n📦 Registered Projects (${projects.length})\n`);

  const box = getBoxDrawing();
  projects.forEach((project, index) => {
    lines.push(`${index + 1}. ${project.name}`);
    lines.push(`   ID: ${project.id}`);
    lines.push(`   Path: ${truncatePath(project.path)}`);
    lines.push(`   Agents: ${project.agents.length}`);

    // Story 6.1: Display workflow count
    if (project.workflows && project.workflows.length > 0) {
      lines.push(`   Workflows: ${project.workflows.length}`);
    }

    if (project.agents.length > 0) {
      lines.push("   Agent Details:");
      project.agents.forEach((agent, i) => {
        const isLast = i === project.agents.length - 1;
        const prefix = isLast ? "   └─" : "   ├─";
        const model = agent.model || "[default]";
        lines.push(`${prefix} ${agent.name} → ${model}`);
        lines.push(`      CCR-AGENT-ID: ${agent.id}`);
      });
    }

    // Story 6.1: Display workflow details
    if (project.workflows && project.workflows.length > 0) {
      lines.push("   Workflow Details:");
      project.workflows.forEach((workflow, i) => {
        const isLast = i === project.workflows!.length - 1;
        const prefix = isLast ? "   └─" : "   ├─";
        const verticalBar = isLast ? "      " : "   │  ";

        lines.push(`${prefix} ${workflow.name}`);
        if (workflow.description) {
          lines.push(`${verticalBar}${workflow.description}`);
        }
        lines.push(`${verticalBar}Path: ${truncatePath(workflow.relativePath, 60)}`);
      });
    }

    lines.push(""); // Separator between projects
  });

  return lines.join("\n");
}

/**
 * Format scan result for agent discovery
 * Story 6.1: Extended to include workflow discovery results
 * @param result - Scan result with new, deleted, failed agents and total count
 * @returns Formatted scan result string
 */
export interface ScanResult {
  newAgents: string[];
  deletedAgents: Array<{ name: string; id: string }>;
  failedAgents: string[];
  totalAgents: number;
  newWorkflows?: string[];  // Story 6.1: New workflow names
  deletedWorkflows?: WorkflowConfig[];  // Story 6.1: Deleted workflows
  totalWorkflows?: number;  // Story 6.1: Total workflow count
}

export function formatScanResult(result: ScanResult): string {
  const lines: string[] = [];
  const box = getBoxDrawing();

  const hasAgentChanges = result.newAgents.length > 0 || result.deletedAgents.length > 0 || result.failedAgents.length > 0;
  const hasWorkflowChanges = result.newWorkflows && result.newWorkflows.length > 0;
  const hasDeletedWorkflows = result.deletedWorkflows && result.deletedWorkflows.length > 0;

  if (!hasAgentChanges && !hasWorkflowChanges && !hasDeletedWorkflows) {
    return colorize("✓ No changes detected. All agents and workflows up to date.", GREEN);
  }

  lines.push("\n✓ Project rescan complete:\n");

  // Agent changes
  if (result.newAgents.length > 0) {
    lines.push(`  Found ${result.newAgents.length} new agent(s):`);
    result.newAgents.forEach((name, idx) => {
      const isLast = idx === result.newAgents.length - 1 && result.deletedAgents.length === 0 && result.failedAgents.length === 0 && !hasWorkflowChanges;
      lines.push(`  ${isLast ? box.LAST : box.BRANCH} ${name}`);
    });
    if (result.deletedAgents.length > 0 || result.failedAgents.length > 0 || hasWorkflowChanges) {
      lines.push("");
    }
  }

  if (result.deletedAgents.length > 0) {
    lines.push(`  Removed ${result.deletedAgents.length} deleted agent(s):`);
    result.deletedAgents.forEach((agent, idx) => {
      const isLast = idx === result.deletedAgents.length - 1 && result.failedAgents.length === 0 && !hasWorkflowChanges;
      lines.push(`  ${isLast ? box.LAST : box.BRANCH} ${agent.name}`);
    });
    if (result.failedAgents.length > 0 || hasWorkflowChanges) {
      lines.push("");
    }
  }

  if (result.failedAgents.length > 0) {
    lines.push(`  ${result.failedAgents.length} agent(s) failed to process:`);
    result.failedAgents.forEach((name, idx) => {
      const isLast = idx === result.failedAgents.length - 1 && !hasWorkflowChanges;
      lines.push(`  ${isLast ? box.LAST : box.BRANCH} ${name}`);
    });
    if (hasWorkflowChanges) {
      lines.push("");
    }
  }

  // Story 6.1: Workflow changes
  if (result.newWorkflows && result.newWorkflows.length > 0) {
    lines.push(`  Found ${result.newWorkflows.length} new workflow(s):`);
    result.newWorkflows.forEach((name, idx) => {
      const isLast = idx === result.newWorkflows!.length - 1 && !hasDeletedWorkflows;
      lines.push(`  ${isLast ? box.LAST : box.BRANCH} ${name}`);
    });
    if (hasDeletedWorkflows) {
      lines.push("");
    }
  }

  if (result.deletedWorkflows && result.deletedWorkflows.length > 0) {
    lines.push(`  Removed ${result.deletedWorkflows.length} deleted workflow(s):`);
    result.deletedWorkflows.forEach((workflow, idx) => {
      const isLast = idx === result.deletedWorkflows!.length - 1;
      lines.push(`  ${isLast ? box.LAST : box.BRANCH} ${workflow.name}`);
    });
  }

  // Totals
  lines.push(`\n  Total agents: ${result.totalAgents}`);
  if (result.totalWorkflows !== undefined) {
    lines.push(`  Total workflows: ${result.totalWorkflows}`);
  }

  return lines.join("\n");
}

/**
 * Format CLI help text
 * @returns Formatted help text string
 */
export function formatHelpText(): string {
  const lines: string[] = [];

  lines.push("Usage: ccr project <command> [options]");
  lines.push("");
  lines.push("Commands:");
  lines.push("  add <path>       Register a new project");
  lines.push("  list             List all registered projects");
  lines.push("  scan <id>        Rescan project for new or deleted agents");
  lines.push("  configure <id>   Configure agent models interactively");
  lines.push("");
  lines.push("Git-Based Configuration Sharing:");
  lines.push("  Projects are stored in ~/.claude-code-router/projects.json");
  lines.push("  This file is safe to commit to git (contains no API keys)");
  lines.push("  Share configurations with your team via version control");
  lines.push("  Team members receive agent routing on git pull (zero-config)");
  lines.push("");
  lines.push("Examples:");
  lines.push("  ccr project add /home/user/my-project");
  lines.push("  ccr project configure <project-id>");
  lines.push("  git add ~/.claude-code-router/projects.json");
  lines.push("  git commit -m \"Configure agent models\"");
  lines.push("");
  lines.push("Documentation: https://github.com/musistudio/claude-code-router");

  return lines.join("\n");
}

/**
 * Color utilities for direct use in CLI output
 */
export const colors = {
  green: (text: string) => colorize(text, GREEN),
  yellow: (text: string) => colorize(text, YELLOW),
  red: (text: string) => colorize(text, RED),
  blue: (text: string) => colorize(text, BLUE),
  dim: (text: string) => colorize(text, DIM),
  reset: (text: string) => `${text}${RESET}`,
};

/**
 * Symbols for use in CLI output
 */
export const symbols = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
  package: "📦",
};
