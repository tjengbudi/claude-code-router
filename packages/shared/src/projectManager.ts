import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import JSON5 from 'json5';
import { glob } from 'glob';
import type { ProjectConfig, ProjectsData, AgentConfig } from './types/agent';
import { AGENT_ID_REGEX } from './constants';
import { Validators } from './validation';

/**
 * Agent ID tag pattern for injection into markdown files
 */
const AGENT_ID_TAG_PATTERN = '<!-- CCR-AGENT-ID: %s -->';

/**
 * ProjectManager - Manages CCR project registration and metadata
 */
export class ProjectManager {
  private projectsFile: string;

  constructor(projectsFile: string) {
    this.projectsFile = projectsFile;
  }

  /**
   * Load projects data from projects.json (JSON5 format)
   */
  async loadProjects(): Promise<ProjectsData> {
    try {
      const content = await fs.readFile(this.projectsFile, 'utf-8');
      return JSON5.parse(content) as ProjectsData;
    } catch {
      // Return default structure if file doesn't exist
      return { projects: {} };
    }
  }

  /**
   * Save projects data to projects.json (JSON5 format with comments)
   * Uses atomic write with backup pattern for safety
   * Validates write permissions before attempting file operations
   */
  private async saveProjects(data: ProjectsData): Promise<void> {
    const dirPath = path.dirname(this.projectsFile);
    const backup = `${this.projectsFile}.backup`;

    // NFR-S2: Validate write permissions before file operations
    try {
      await fs.access(dirPath, fs.constants.W_OK);
    } catch {
      throw new Error(`Cannot write to ${this.projectsFile}: directory is not writable`);
    }

    // 1. Create backup of original file (if exists)
    let backupCreated = false;
    try {
      await fs.access(this.projectsFile);
      await fs.copyFile(this.projectsFile, backup);
      backupCreated = true;
    } catch {
      // File doesn't exist, no backup needed
    }

    try {
      // 2. Ensure directory exists
      await fs.mkdir(dirPath, { recursive: true });

      // 3. Write new content atomically
      const content = `// Project configurations for CCR agent system\n${JSON5.stringify(data, { space: 2 })}`;
      await fs.writeFile(this.projectsFile, content, 'utf-8');

      // 4. Delete backup on success
      if (backupCreated) {
        try {
          await fs.unlink(backup);
        } catch (err) {
          // Log warning but don't fail - backup cleanup is non-critical
          console.warn(`Warning: Could not delete backup file: ${backup}`);
        }
      }
    } catch (error) {
      // 5. Restore from backup on failure
      if (backupCreated) {
        try {
          await fs.copyFile(backup, this.projectsFile);
          await fs.unlink(backup);
        } catch {
          // Restore failed, throw original error
        }
      }
      throw error;
    }
  }

  /**
   * Inject agent ID into agent file with atomic write pattern (Story 1.2)
   * Appends CCR-AGENT-ID tag at end of file, preserving all existing content
   * @param agentPath - Absolute path to agent markdown file
   * @returns The agent UUID (existing or newly generated)
   * @throws Error if write permission validation fails
   */
  private async injectAgentId(agentPath: string): Promise<string> {
    // AC3: Validate write permissions before attempting modification (NFR-S2)
    try {
      await fs.access(agentPath, fs.constants.W_OK);
    } catch {
      throw new Error(`Cannot write to agent file ${agentPath}: file is not writable`);
    }

    // Read current content
    const content = await fs.readFile(agentPath, 'utf-8');

    // AC2: Check if UUID already exists (idempotency)
    const existingIdMatch = content.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);

    if (existingIdMatch) {
      const existingId = existingIdMatch[1];
      // Validate existing UUID format (NFR-S3)
      if (!Validators.isValidAgentId(existingId)) {
        throw new Error(`Invalid existing agent ID in ${agentPath}: ${existingId}`);
      }
      return existingId;
    }

    // AC1: Generate new UUID v4
    const agentId = uuidv4();
    if (!Validators.isValidAgentId(agentId)) {
      throw new Error(`Invalid UUID generated: ${agentId}`);
    }

    // AC3: Atomic write with backup pattern
    const backup = `${agentPath}.backup`;
    let backupCreated = false;

    try {
      // Create backup
      await fs.copyFile(agentPath, backup);
      backupCreated = true;

      // AC5: Append ID tag at end while preserving all content
      // Fix: Do not use trimEnd() as it violates content preservation requirement
      // Ensure there is at least one newline before the tag if the file is not empty
      let separator = '\n\n';
      if (content.length === 0) {
        separator = '';
      } else if (content.endsWith('\n\n')) {
        separator = '';
      } else if (content.endsWith('\n')) {
        separator = '\n';
      }

      const idTag = `${separator}${AGENT_ID_TAG_PATTERN.replace('%s', agentId)}`;
      await fs.writeFile(agentPath, content + idTag, 'utf-8');

      // Delete backup on success
      try {
        await fs.unlink(backup);
      } catch (err) {
        // Log warning but don't fail - backup cleanup is non-critical
        console.warn(`Warning: Could not delete backup file: ${backup}`);
      }
    } catch (error) {
      // Restore from backup on failure
      if (backupCreated) {
        try {
          await fs.copyFile(backup, agentPath);
          await fs.unlink(backup);
        } catch {
          // Restore failed, throw original error
        }
      }
      throw error;
    }

    return agentId;
  }

  /**
   * Add a new project to the registry
   * @param projectPath - Absolute path to the project directory
   * @returns ProjectConfig with generated UUID and metadata
   * @throws Error if project already exists or UUID generation fails
   */
  async addProject(projectPath: string): Promise<ProjectConfig> {
    // Generate and validate UUID (NFR-S3)
    const id = uuidv4();
    if (!uuidValidate(id) || !AGENT_ID_REGEX.test(id)) {
      throw new Error(`Invalid UUID generated: ${id}`);
    }

    const name = path.basename(projectPath);
    const now = new Date().toISOString();

    // HIGH-3: Check for duplicate project by path
    const data = await this.loadProjects();
    for (const [existingId, existingProject] of Object.entries(data.projects)) {
      if (existingProject.path === projectPath) {
        throw new Error(`Project already registered with ID: ${existingId}`);
      }
    }

    // HIGH-1: Discover agents and store them in project config
    const agents = await this.discoverAgents(projectPath);

    const projectConfig: ProjectConfig = {
      id,
      name,
      path: projectPath,
      agents,
      createdAt: now,
      updatedAt: now,
    };

    data.projects[id] = projectConfig;
    await this.saveProjects(data);

    return projectConfig;
  }

  /**
   * Discover agents in a project by scanning .bmad/bmm/agents/*.md files
   * Story 1.2: Updated to return agent metadata with UUID injection
   * @param projectPath - Absolute path to the project directory
   * @returns Array of AgentConfig objects with injected UUIDs
   * @throws Error if agent file write permission is denied
   */
  async discoverAgents(projectPath: string): Promise<AgentConfig[]> {
    const agentsPattern = path.join(projectPath, '.bmad', 'bmm', 'agents', '*.md');
    let agentFiles: string[];

    try {
      // windowsPathsNoEscape: true prevents backslash escaping issues on Windows
      agentFiles = await glob(agentsPattern, { windowsPathsNoEscape: true });
    } catch (error) {
      // If glob fails (e.g., permission issues, invalid path), return empty array
      // This allows the system to gracefully handle projects without agent directories
      if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') {
        console.warn(`Warning: Permission denied accessing agent directory: ${agentsPattern}`);
      }
      return [];
    }

    const agentPromises = agentFiles.map(async (agentFile) => {
      try {
        // Story 1.2: Inject UUID and get agent ID
        const agentId = await this.injectAgentId(agentFile);

        return {
          id: agentId,
          name: path.basename(agentFile),
          relativePath: path.relative(projectPath, agentFile),
          absolutePath: agentFile,
        } as AgentConfig;
      } catch (error) {
        // Log error but continue processing other agents
        const errorMsg = (error as Error).message;
        console.warn(`Warning: Failed to process agent file ${agentFile}: ${errorMsg}`);
        return null;
      }
    });

    const results = await Promise.all(agentPromises);
    const agents = results.filter((a): a is AgentConfig => a !== null);

    return agents;
  }

  /**
   * Scan project to discover agents and inject UUIDs (Story 1.2)
   * Updates project metadata in projects.json with discovered agent information
   * @param projectId - UUID of the project to scan
   * @returns Updated ProjectConfig with agent metadata
   * @throws Error if project not found
   */
  async scanProject(projectId: string): Promise<ProjectConfig> {
    const data = await this.loadProjects();
    const project = data.projects[projectId];

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Discover agents with UUID injection
    const agents = await this.discoverAgents(project.path);

    // AC4: Check for UUID collisions
    const agentIds = new Set<string>();
    for (const agent of agents) {
      if (agentIds.has(agent.id)) {
        throw new Error(`UUID collision detected: ${agent.id}`);
      }
      agentIds.add(agent.id);
    }

    // Update project with agent metadata
    project.agents = agents;
    project.updatedAt = new Date().toISOString();

    await this.saveProjects(data);

    return project;
  }

  /**
   * List all registered projects sorted alphabetically by name (Story 1.3)
   * @returns Array of ProjectConfig sorted by name, or undefined if no projects
   */
  async listProjects(): Promise<ProjectConfig[] | undefined> {
    try {
      // Load projects data using existing loadProjects() pattern
      const projectsData = await this.loadProjects();

      // Handle empty or missing data (graceful degradation per NFR-R3)
      if (!projectsData || !projectsData.projects || Object.keys(projectsData.projects).length === 0) {
        return undefined;
      }

      // Convert projects object to array
      const projectsArray = Object.values(projectsData.projects);

      // Sort alphabetically by project name (AC#5)
      const sortedProjects = projectsArray.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      return sortedProjects;
    } catch (error) {
      // Graceful degradation for corrupted files or unexpected failures (AC#4)
      // AC#4 requires debug-level warning for graceful degradation scenarios
      console.debug(`Failed to list projects: ${(error as Error).message}`);
      return undefined;
    }
  }
}
