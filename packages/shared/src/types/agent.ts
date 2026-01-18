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
  createdAt: string;
  updatedAt: string;
}

/**
 * Projects data structure for projects.json
 */
export interface ProjectsData {
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
