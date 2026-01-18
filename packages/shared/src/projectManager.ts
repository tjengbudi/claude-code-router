import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import JSON5 from 'json5';
import { glob } from 'glob';
import type { ProjectConfig, ProjectsData, AgentConfig, RescanResult } from './types/agent';
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
   * Safely write to a file using the atomic write with backup pattern
   * @param filePath - Absolute path to the file
   * @param content - Content to write
   * @throws Error if write fails
   */
  private async safeFileWrite(filePath: string, content: string): Promise<void> {
    const backup = `${filePath}.backup`;
    let backupCreated = false;

    try {
      // 1. Create backup of original file (if exists)
      try {
        await fs.access(filePath);
        await fs.copyFile(filePath, backup);
        backupCreated = true;
      } catch {
        // File doesn't exist, no backup needed
      }

      // 2. Write new content atomically
      await fs.writeFile(filePath, content, 'utf-8');

      // 3. Delete backup on success
      if (backupCreated) {
        try {
          await fs.unlink(backup);
        } catch (err) {
          console.warn(`Warning: Could not delete backup file: ${backup}`);
        }
      }
    } catch (error) {
      // 4. Restore from backup on failure
      if (backupCreated) {
        try {
          await fs.copyFile(backup, filePath);
          await fs.unlink(backup);
        } catch {
          // Restore failed, throw original error
        }
      }
      throw error;
    }
  }

  /**
   * Save projects data to projects.json (JSON5 format with comments)
   * Uses atomic write with backup pattern for safety
   * Validates write permissions before attempting file operations
   */
  private async saveProjects(data: ProjectsData): Promise<void> {
    const dirPath = path.dirname(this.projectsFile);

    // NFR-S2: Validate write permissions before file operations
    try {
      await fs.access(dirPath, fs.constants.W_OK);
    } catch {
      throw new Error(`Cannot write to ${this.projectsFile}: directory is not writable`);
    }

    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Prepare content
    const content = `// Project configurations for CCR agent system\n${JSON5.stringify(data, { space: 2 })}`;

    // Use safe write helper
    await this.safeFileWrite(this.projectsFile, content);
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

    // AC5: Append ID tag at end while preserving all content
    let separator = '\n\n';
    if (content.length === 0) {
      separator = '';
    } else if (content.endsWith('\n\n')) {
      separator = '';
    } else if (content.endsWith('\n')) {
      separator = '\n';
    }

    const idTag = `${separator}${AGENT_ID_TAG_PATTERN.replace('%s', agentId)}`;
    const newContent = content + idTag;

    // AC3: Atomic write with backup pattern using helper
    await this.safeFileWrite(agentPath, newContent);

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

  /**
   * Get a project by ID (Story 1.4 helper)
   * @param projectId - UUID of the project
   * @returns ProjectConfig or undefined if not found
   */
  async getProject(projectId: string): Promise<ProjectConfig | undefined> {
    const data = await this.loadProjects();
    return data.projects[projectId];
  }

  /**
   * Rescan project to detect new or deleted agents (Story 1.4)
   * Compares filesystem agents with projects.json entries and updates accordingly
   * @param projectId - UUID of the project to rescan
   * @returns RescanResult with detected changes
   * @throws Error if project ID is invalid or project not found
   */
  async rescanProject(projectId: string): Promise<RescanResult> {
    // AC4: Validate project ID using Validators.isValidAgentId()
    if (!Validators.isValidAgentId(projectId)) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    // Load project from projects.json
    const data = await this.loadProjects();
    const project = data.projects[projectId];

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Scan filesystem for current agent files
    const agentDir = path.join(project.path, '.bmad', 'bmm', 'agents');
    let filesystemAgentFiles: string[];

    try {
      const agentsPattern = path.join(agentDir, '*.md');
      filesystemAgentFiles = await glob(agentsPattern, { windowsPathsNoEscape: true });
    } catch (error) {
      // If glob fails (permission issues, etc.), return no changes
      if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') {
        console.warn(`Warning: Permission denied accessing agent directory: ${agentDir}`);
      }
      filesystemAgentFiles = [];
    }

    // Extract agent filenames from filesystem
    const filesystemAgentNames = new Set(
      filesystemAgentFiles.map(f => path.basename(f))
    );

    // Extract agent names from projects.json
    const currentAgentNames = new Set(
      project.agents.map(a => a.name)
    );

    // AC1: Detect new agents (in filesystem, not in projects.json)
    const newAgents = [...filesystemAgentNames].filter(
      name => !currentAgentNames.has(name)
    );

    // AC2: Detect deleted agents (in projects.json, not in filesystem)
    const deletedAgents = project.agents.filter(
      agent => !filesystemAgentNames.has(agent.name)
    );

    // Track agents that failed to process
    const failedAgents: string[] = [];

    // Process new agents: inject UUID and add to project
    for (const filename of newAgents) {
      const agentPath = path.join(agentDir, filename);
      try {
        // Reuse existing injectAgentId pattern
        const agentId = await this.injectAgentId(agentPath);

        // Check for duplicates before adding (prevent race conditions)
        const exists = project.agents.some(a => a.id === agentId || a.name === filename);
        if (exists) {
          console.warn(`Warning: Agent ${filename} (${agentId}) already exists, skipping`);
          continue;
        }

        // Add to project's agents array
        project.agents.push({
          id: agentId,
          name: filename,
          relativePath: path.relative(project.path, agentPath),
          absolutePath: agentPath,
        });

        console.info(`✓ New agent discovered: ${filename}`);
      } catch (error) {
        // Log error but continue processing other agents
        const errorMsg = (error as Error).message;
        console.warn(`Warning: Failed to process new agent ${filename}: ${errorMsg}`);
        failedAgents.push(filename);
      }
    }

    // AC2: Remove deleted agents from project
    for (const deletedAgent of deletedAgents) {
      const index = project.agents.findIndex(a => a.id === deletedAgent.id);
      if (index >= 0) {
        project.agents.splice(index, 1);
        console.info(`ℹ Removed deleted agent: ${deletedAgent.name} (${deletedAgent.id})`);
      }
    }

    // Update timestamp
    project.updatedAt = new Date().toISOString();

    // AC5: Validate schema before saving
    if (!Validators.isValidProjectsData(data)) {
      throw new Error('Invalid projects data structure detected before save');
    }

    // AC5: Save updated projects.json using atomic write pattern
    await this.saveProjects(data);

    // Return result with detected changes
    return {
      newAgents,
      deletedAgents,
      failedAgents,
      totalAgents: project.agents.length,
    } as RescanResult;
  }

  /**
   * Set model configuration for an agent - Story 2.1
   * Stores agent-to-model mapping in projects.json under the agent's entry
   * @param projectId - UUID of the project containing the agent
   * @param agentId - UUID of the agent to configure
   * @param model - Model string (e.g., "openai,gpt-4o") or undefined to remove model
   * @throws Error if project not found, agent not found, or model format invalid
   */
  async setAgentModel(projectId: string, agentId: string, model: string | undefined): Promise<void> {
    // Load projects data
    const data = await this.loadProjects();
    const project = data.projects[projectId];

    // Validate project exists
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Find agent in project
    const agent = project.agents.find(a => a.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId} in project: ${projectId}`);
    }

    // Validate model string format if provided (AC: 2)
    if (model !== undefined) {
      if (!Validators.isValidModelString(model)) {
        throw new Error(`Invalid model string format: ${model}. Expected format: "provider,modelname" (e.g., "openai,gpt-4o")`);
      }
      // Security: Ensure NO API keys in model string (AC: 5)
      // The regex validation prevents common API key patterns (contains comma, long strings, special chars)
    }

    // Update agent model (AC: 1, 3)
    if (model === undefined) {
      // Remove model property to use Router.default fallback
      delete agent.model;
    } else {
      agent.model = model;
    }

    // Update project timestamp
    project.updatedAt = new Date().toISOString();

    // Save to file using atomic write pattern
    await this.saveProjects(data);
  }

  /**
   * Get model configuration by agent ID - Story 2.1
   * Searches across all projects to find agent and return its model
   * @param agentId - UUID of the agent
   * @returns Model string if configured, undefined if not found or not set (Router.default fallback)
   */
  async getModelByAgentId(agentId: string): Promise<string | undefined> {
    // Validate agent ID format
    if (!Validators.isValidAgentId(agentId)) {
      console.debug(`Invalid agent ID format: ${agentId}`);
      return undefined;  // Graceful degradation - use Router.default
    }

    // Load projects data
    const data = await this.loadProjects();

    // Search for agent across all projects (O(n) search)
    for (const project of Object.values(data.projects)) {
      const agent = project.agents.find(a => a.id === agentId);
      if (agent) {
        // Return model if configured, undefined otherwise (AC: 3)
        if (agent.model) {
          console.debug(`Found model for agent ${agentId}: ${agent.model}`);
          return agent.model;
        }
        // Model not set - return undefined for Router.default fallback
        console.debug(`Agent ${agentId} found but no model configured`);
        return undefined;
      }
    }

    // Agent not found - return undefined for graceful degradation (AC: 3)
    console.debug(`Agent not found: ${agentId}`);
    return undefined;
  }
}
