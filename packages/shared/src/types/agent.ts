/**
 * Agent metadata interface (Story 1.2)
 */
export interface AgentConfig {
  id: string;              // UUID v4
  name: string;            // Filename (e.g., "dev.md")
  relativePath: string;    // ".bmad/bmm/agents/dev.md"
  absolutePath: string;    // Full path to file
  model?: string;          // Model assignment (e.g., "openai,gpt-4o") - Story 2.1
}

/**
 * Workflow metadata interface (Story 6.1)
 */
export interface WorkflowConfig {
  id: string;              // UUID v4 (will be added in Story 6.2)
  name: string;            // From workflow.yaml 'name' field
  description: string;     // From workflow.yaml 'description' field
  relativePath: string;    // e.g., ".bmad/bmm/workflows/correct-course"
  absolutePath: string;    // Full path to workflow directory
  model?: string;          // Optional model assignment (added in Story 6.4)
}

/**
 * Legacy agent file reference (for backward compatibility)
 */
export interface AgentFileRef {
  id: string;
  name: string;
  file: string;
}

/**
 * Project configuration interface
 */
export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  agents: AgentConfig[];
  workflows: WorkflowConfig[];  // Story 6.1: Workflow discovery support
  createdAt: string;
  updatedAt: string;
}

/**
 * Projects data structure for projects.json
 * Story 2.4: Added schemaVersion for git-based configuration sharing
 */
export interface ProjectsData {
  schemaVersion?: string;  // Schema version for forward/backward compatibility (e.g., "1.0.0")
  projects: Record<string, ProjectConfig>;
}

/**
 * Rescan result interface (Story 1.4)
 * Returns detected changes during project rescan
 */
export interface RescanResult {
  newAgents: string[];      // Names of new agents discovered
  deletedAgents: AgentConfig[];  // Agents that were deleted from filesystem
  failedAgents: string[];   // Names of agents that failed to process
  totalAgents: number;       // Total agent count after rescan
}
