/**
 * Agent metadata interface (Story 1.2)
 */
export interface AgentConfig {
  id: string;              // UUID v4
  name: string;            // Filename (e.g., "dev.md")
  relativePath: string;    // ".bmad/bmm/agents/dev.md"
  absolutePath: string;    // Full path to file
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
