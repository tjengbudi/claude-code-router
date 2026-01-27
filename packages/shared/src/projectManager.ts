import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import JSON5 from 'json5';
import { glob } from 'glob';
import * as yaml from 'js-yaml';
import type { ProjectConfig, ProjectsData, AgentConfig, RescanResult, WorkflowConfig } from './types/agent';
import { AGENT_ID_REGEX, PROJECTS_SCHEMA_VERSION, BMAD_FOLDER_NAME } from './constants';
import { Validators } from './validation';
import { createLogger } from './logging/logger';

/**
 * Agent ID tag pattern for injection into markdown files
 */
const AGENT_ID_TAG_PATTERN = '<!-- CCR-AGENT-ID: %s -->';

/**
 * ProjectManager - Manages CCR project registration and metadata
 * Story 5.4: Integrated with logger for debugging operations
 */
export class ProjectManager {
  private projectsFile: string;
  private logger = createLogger('ProjectManager');

  constructor(projectsFile: string) {
    this.projectsFile = projectsFile;
  }

  /**
   * Load projects data from projects.json (JSON5 format)
   * Story 2.4: Validates schema version for forward/backward compatibility
   * Story 5.2: Enhanced error handling with specific error type detection
   */
  async loadProjects(): Promise<ProjectsData> {
    try {
      const content = await fs.readFile(this.projectsFile, 'utf-8');
      const data = JSON5.parse(content) as ProjectsData;

      // Story 2.4: Check schema version compatibility
      if (data.schemaVersion !== undefined) {
        if (data.schemaVersion !== PROJECTS_SCHEMA_VERSION) {
          // Schema version mismatch - log warning but attempt to load anyway
          // This allows forward compatibility (newer versions) and backward compatibility (older versions)
          this.logger.warn(
            `Schema version mismatch: expected ${PROJECTS_SCHEMA_VERSION}, found ${data.schemaVersion}. ` +
            `Attempting compatibility mode.`
          );
        }
      } else {
        // No schema version - this is a pre-Story 2.4 projects.json file
        this.logger.debug(
          `projects.json has no schema version (pre-Story 2.4 format). ` +
          `Current version is ${PROJECTS_SCHEMA_VERSION}. Loading with backward compatibility.`
        );
      }

      // Story 5.2 AC2: Validate structure using Validators.isValidProjectsData()
      if (!Validators.isValidProjectsData(data)) {
        this.logger.warn('projects.json has invalid schema, returning empty projects');
        return { projects: {} };
      }

      return data;
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;

      // Story 5.2 AC1: Handle missing file (ENOENT) with debug level
      if (errorCode === 'ENOENT') {
        this.logger.debug(`projects.json not found at ${this.projectsFile}, agent system inactive`);
        return { projects: {} };
      }

      // Story 5.2 AC2: Handle corrupted JSON with warn level
      if (error instanceof SyntaxError) {
        this.logger.warn(`Failed to load projects.json: ${(error as Error).message}`);
        return { projects: {} };
      }

      // Other unexpected errors - still return empty but log at error level
      this.logger.error(`Unexpected error loading projects.json: ${(error as Error).message}`);
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
   * Story 2.4: Adds schemaVersion for git-based configuration sharing
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

    // Story 2.4: Add schemaVersion to data for git-based sharing
    const dataWithVersion = {
      schemaVersion: PROJECTS_SCHEMA_VERSION,
      ...data
    };

    // Prepare content with human-readable JSON5 format
    const content = `// Project configurations for CCR agent system
// Schema version: ${PROJECTS_SCHEMA_VERSION}
// This file is safe to commit to git (contains no API keys)
${JSON5.stringify(dataWithVersion, { space: 2 })}`;

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
   * Extract workflow ID from workflow files (workflow.yaml or instructions.md) - Story 6.2
   * Prefers workflow.yaml over instructions.md
   * @param workflowPath - Absolute path to the workflow directory
   * @returns Workflow ID if found, null otherwise
   */
  private async extractWorkflowId(workflowPath: string): Promise<string | null> {
    const yamlPath = path.join(workflowPath, 'workflow.yaml');
    const instructionsPath = path.join(workflowPath, 'instructions.md');

    let yamlId: string | null = null;
    let mdId: string | null = null;

    // Try workflow.yaml
    try {
      const yamlContent = await fs.readFile(yamlPath, 'utf-8');
      const yamlMatch = yamlContent.match(/^# CCR-WORKFLOW-ID: ([0-9a-f-]+)$/im);
      if (yamlMatch && Validators.isValidWorkflowId(yamlMatch[1])) {
        yamlId = yamlMatch[1];
        this.logger.debug(`Found workflow ID in workflow.yaml: ${yamlId}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug(`workflow.yaml not found at ${yamlPath}`);
      } else if (error instanceof Error && error.name === 'YAMLException') {
        this.logger.warn(`Invalid YAML in ${yamlPath}: ${error.message}`);
      }
    }

    // Try instructions.md
    try {
      const mdContent = await fs.readFile(instructionsPath, 'utf-8');
      const mdMatch = mdContent.match(/<!-- CCR-WORKFLOW-ID: ([0-9a-f-]+) -->/i);
      if (mdMatch && Validators.isValidWorkflowId(mdMatch[1])) {
        mdId = mdMatch[1];
        this.logger.debug(`Found workflow ID in instructions.md: ${mdId}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug(`instructions.md not found at ${instructionsPath}`);
      }
    }

    // Validate consistency if both exist
    if (yamlId && mdId && yamlId !== mdId) {
      this.logger.warn(`Workflow ID mismatch: workflow.yaml=${yamlId}, instructions.md=${mdId}. Using workflow.yaml ID.`);
      return yamlId;
    }

    return yamlId || mdId;
  }

  /**
   * Inject workflow ID into workflow files - Story 6.2
   * Prefers workflow.yaml, falls back to instructions.md
   * @param workflowPath - Absolute path to the workflow directory
   * @param workflowId - Workflow ID to inject
   * @returns Path to the file that was injected
   * @throws Error if injection fails
   */
  private async injectWorkflowId(workflowPath: string, workflowId: string): Promise<string> {
    if (!Validators.isValidWorkflowId(workflowId)) {
      throw new Error(`Invalid workflow ID format: ${workflowId}`);
    }

    const yamlPath = path.join(workflowPath, 'workflow.yaml');
    const instructionsPath = path.join(workflowPath, 'instructions.md');

    // Try workflow.yaml first
    try {
      await fs.access(yamlPath);
      await fs.access(yamlPath, fs.constants.W_OK);

      const yamlContent = await fs.readFile(yamlPath, 'utf-8');

      if (yamlContent.includes('CCR-WORKFLOW-ID:')) {
        this.logger.warn(`Workflow ID already exists in ${yamlPath}`);
        return yamlPath;
      }

      if (yamlContent.trim().length === 0) {
        this.logger.warn(`Empty workflow.yaml at ${yamlPath}, skipping injection`);
        throw new Error('Empty file');
      }

      this.logger.debug('Attempting workflow.yaml injection');
      const idTag = `# CCR-WORKFLOW-ID: ${workflowId}`;
      const newContent = `${idTag}\n${yamlContent}`;

      await this.safeFileWrite(yamlPath, newContent);
      this.logger.info(`Injected workflow ID into workflow.yaml: ${workflowId}`);
      return yamlPath;
    } catch (error) {
      this.logger.debug(`Cannot inject into workflow.yaml: ${(error as Error).message}. Trying instructions.md`);
    }

    // Fallback to instructions.md
    try {
      await fs.access(instructionsPath);
      await fs.access(instructionsPath, fs.constants.W_OK);

      const mdContent = await fs.readFile(instructionsPath, 'utf-8');

      if (mdContent.includes('CCR-WORKFLOW-ID:')) {
        this.logger.warn(`Workflow ID already exists in ${instructionsPath}`);
        return instructionsPath;
      }

      if (mdContent.trim().length === 0) {
        this.logger.warn(`Empty instructions.md at ${instructionsPath}, skipping injection`);
        throw new Error('Empty file');
      }

      this.logger.debug('Falling back to instructions.md injection');
      const idTag = `<!-- CCR-WORKFLOW-ID: ${workflowId} -->`;
      const newContent = `${idTag}\n${mdContent}`;

      await this.safeFileWrite(instructionsPath, newContent);
      this.logger.info(`Injected workflow ID into instructions.md: ${workflowId}`);
      return instructionsPath;
    } catch (error) {
      throw new Error(`Cannot inject workflow ID: neither workflow.yaml nor instructions.md is writable in ${workflowPath}`);
    }
  }

  /**
   * Add a new project to the registry
   * @param projectPath - Absolute path to the project directory
   * @returns ProjectConfig with generated UUID and metadata
   * @throws Error if project already exists or UUID generation fails
   */
  async addProject(projectPath: string): Promise<ProjectConfig> {
    this.logger.info(`Adding project: ${projectPath}`);

    // NFR-S2: Validate path - reject path traversal attempts and non-existent paths
    if (projectPath.includes('..') || projectPath.includes('~')) {
      this.logger.warn(`Path traversal attempt detected: ${projectPath}`);
      throw new Error('Invalid project path');
    }

    // Check if path exists
    try {
      await fs.access(projectPath);
    } catch {
      this.logger.warn(`Project path does not exist: ${projectPath}`);
      throw new Error('Invalid project path');
    }

    // Generate and validate UUID (NFR-S3)
    const id = uuidv4();
    if (!uuidValidate(id) || !AGENT_ID_REGEX.test(id)) {
      this.logger.error(`Invalid UUID generated: ${id}`);
      throw new Error(`Invalid UUID generated: ${id}`);
    }

    const name = path.basename(projectPath);
    const now = new Date().toISOString();

    // HIGH-3: Check for duplicate project by path
    const data = await this.loadProjects();
    for (const [existingId, existingProject] of Object.entries(data.projects)) {
      if (existingProject.path === projectPath) {
        this.logger.warn(`Project already registered: ${projectPath} with ID: ${existingId}`);
        throw new Error(`Project already registered with ID: ${existingId}`);
      }
    }

    // HIGH-1: Discover agents and store them in project config
    const agents = await this.discoverAgents(projectPath);
    this.logger.info(`Discovered ${agents.length} agents in project: ${name}`);

    // Story 6.1: Discover workflows
    const workflows = await this.scanWorkflows(projectPath);
    this.logger.info(`Discovered ${workflows.length} workflows in project: ${name}`);

    const projectConfig: ProjectConfig = {
      id,
      name,
      path: projectPath,
      agents,
      workflows,
      createdAt: now,
      updatedAt: now,
    };

    data.projects[id] = projectConfig;
    await this.saveProjects(data);

    this.logger.info(`Project added successfully: ${name} (${id})`);

    return projectConfig;
  }

  /**
   * Discover agents in a project by scanning _bmad/bmm/agents/*.md files
   * Story 1.2: Updated to return agent metadata with UUID injection
   * @param projectPath - Absolute path to the project directory
   * @returns Array of AgentConfig objects with injected UUIDs
   * @throws Error if agent file write permission is denied
   */
  async discoverAgents(projectPath: string): Promise<AgentConfig[]> {
    const agentsPattern = path.join(projectPath, BMAD_FOLDER_NAME, 'bmm', 'agents', '*.md');
    let agentFiles: string[];

    try {
      // windowsPathsNoEscape: true prevents backslash escaping issues on Windows
      agentFiles = await glob(agentsPattern, { windowsPathsNoEscape: true });
    } catch (error) {
      // If glob fails (e.g., permission issues, invalid path), return empty array
      // This allows the system to gracefully handle projects without agent directories
      if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') {
        this.logger.warn(`Permission denied accessing agent directory: ${agentsPattern}`);
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
        this.logger.warn(`Failed to process agent file ${agentFile}: ${errorMsg}`);
        return null;
      }
    });

    const results = await Promise.all(agentPromises);
    const agents = results.filter((a): a is AgentConfig => a !== null);

    return agents;
  }

  /**
   * Discover workflows in a project by scanning workflow.yaml files
   * Story 6.1: Workflow discovery and metadata extraction
   * @param projectPath - Absolute path to the project directory
   * @returns Array of WorkflowConfig objects with metadata
   */
  private async scanWorkflows(projectPath: string): Promise<WorkflowConfig[]> {
    const workflowsDir = path.join(projectPath, BMAD_FOLDER_NAME, 'bmm', 'workflows');

    // Check if workflows directory exists
    try {
      await fs.access(workflowsDir);
    } catch {
      this.logger.debug(`No workflows directory found at ${workflowsDir}`);
      return [];
    }

    const workflows: WorkflowConfig[] = [];

    // Use glob to find all workflow.yaml files (recursive scan for nested directories)
    try {
      const workflowFiles = await glob('**/workflow.yaml', {
        cwd: workflowsDir,
        absolute: false,
        windowsPathsNoEscape: true
      });

      for (const workflowFile of workflowFiles) {
        const workflowDir = path.dirname(workflowFile);
        const absoluteWorkflowPath = path.join(workflowsDir, workflowDir);
        const yamlPath = path.join(absoluteWorkflowPath, 'workflow.yaml');

        try {
          // Validate workflow directory structure
          const dirStats = await fs.stat(absoluteWorkflowPath);
          if (!dirStats.isDirectory()) {
            this.logger.warn(`Invalid workflow structure: ${absoluteWorkflowPath} is not a directory`);
            continue;
          }

          // Validate workflow.yaml exists
          try {
            await fs.access(yamlPath);
          } catch {
            this.logger.warn(`Missing workflow.yaml in ${absoluteWorkflowPath}`);
            continue;
          }

          // Parse workflow.yaml
          const yamlContent = await fs.readFile(yamlPath, 'utf-8');
          let workflowData: any;

          try {
            workflowData = yaml.load(yamlContent);
          } catch (yamlError) {
            this.logger.warn(`Invalid YAML syntax in ${yamlPath}: ${(yamlError as Error).message}`);
            continue;
          }

          // Handle null/undefined/empty YAML - create workflow with directory name as fallback
          // Story 6.1: Empty YAML files should still create workflow entries
          if (!workflowData || typeof workflowData !== 'object') {
            this.logger.debug(`Empty or invalid workflow data in ${yamlPath}, using directory name as fallback`);
            workflowData = { name: undefined, description: undefined };
          }

          // Story 6.2: Extract or inject workflow ID
          let workflowId = await this.extractWorkflowId(absoluteWorkflowPath);

          if (!workflowId) {
            workflowId = uuidv4();

            if (!Validators.isValidWorkflowId(workflowId)) {
              this.logger.error(`Invalid UUID generated for workflow: ${workflowId}`);
              continue;
            }

            try {
              await this.injectWorkflowId(absoluteWorkflowPath, workflowId);
              this.logger.info(`Injected workflow ID: ${workflowId} for ${workflowDir}`);
            } catch (error) {
              this.logger.error(`Failed to inject workflow ID for ${workflowDir}: ${(error as Error).message}`);
              continue;
            }
          } else {
            this.logger.debug(`Using existing workflow ID: ${workflowId} for ${workflowDir}`);
          }

          // Extract metadata
          // Use basename of workflowDir as the workflow name (last folder in path)
          const workflowName = path.basename(workflowDir);
          const workflow: WorkflowConfig = {
            id: workflowId, // Story 6.2: Now populated
            name: workflowData.name || workflowName,
            description: workflowData.description || '',
            relativePath: path.join(BMAD_FOLDER_NAME, 'bmm', 'workflows', workflowDir),
            absolutePath: absoluteWorkflowPath
          };

          workflows.push(workflow);
          this.logger.debug(`Discovered workflow: ${workflow.name} at ${workflow.relativePath}`);
        } catch (error) {
          // Handle file read errors
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            this.logger.warn(`Workflow file not found: ${yamlPath}`);
          } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
            this.logger.warn(`Permission denied reading workflow: ${yamlPath}`);
          } else {
            this.logger.warn(`Failed to process workflow at ${yamlPath}: ${(error as Error).message}`);
          }
          // Continue scanning other workflows
        }
      }
    } catch (error) {
      // If glob fails, return empty array
      if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') {
        this.logger.warn(`Permission denied accessing workflows directory: ${workflowsDir}`);
      }
      return [];
    }

    return workflows;
  }

  /**
   * Scan project to discover agents and inject UUIDs (Story 1.2)
   * Story 6.1: Extended to discover workflows
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

    // Story 6.1: Discover workflows
    const workflows = await this.scanWorkflows(project.path);

    // Update project with agent and workflow metadata
    project.agents = agents;
    project.workflows = workflows;
    project.updatedAt = new Date().toISOString();

    await this.saveProjects(data);

    return project;
  }

  /**
   * List all registered projects sorted alphabetically by name (Story 1.3)
   * @returns Array of ProjectConfig sorted by name, or undefined if no projects
   */
  async listProjects(): Promise<ProjectConfig[]> {
    try {
      // Load projects data using existing loadProjects() pattern
      const projectsData = await this.loadProjects();

      // Handle empty or missing data (graceful degradation per NFR-R3)
      if (!projectsData || !projectsData.projects || Object.keys(projectsData.projects).length === 0) {
        return [];
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
      return [];
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
   * Story 6.1: Extended to detect workflow changes
   * Compares filesystem agents/workflows with projects.json entries and updates accordingly
   * @param projectId - UUID of the project to rescan
   * @returns RescanResult with detected changes
   * @throws Error if project ID is invalid or project not found
   */
  async rescanProject(projectId: string): Promise<RescanResult> {
    this.logger.info(`Rescanning project: ${projectId}`);

    // AC4: Validate project ID using Validators.isValidAgentId()
    if (!Validators.isValidAgentId(projectId)) {
      this.logger.error(`Invalid project ID format: ${projectId}`);
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    // Load project from projects.json
    const data = await this.loadProjects();
    const project = data.projects[projectId];

    if (!project) {
      this.logger.error(`Project not found: ${projectId}`);
      throw new Error(`Project not found: ${projectId}`);
    }

    // ==================== AGENT RESCAN (existing logic) ====================
    // Scan filesystem for current agent files
    const agentDir = path.join(project.path, BMAD_FOLDER_NAME, 'bmm', 'agents');
    let filesystemAgentFiles: string[];

    try {
      const agentsPattern = path.join(agentDir, '*.md');
      filesystemAgentFiles = await glob(agentsPattern, { windowsPathsNoEscape: true });
    } catch (error) {
      // If glob fails (permission issues, etc.), return no changes
      if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') {
        this.logger.warn(`Permission denied accessing agent directory: ${agentDir}`);
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
          this.logger.warn(`Agent ${filename} (${agentId}) already exists, skipping`);
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

    // ==================== WORKFLOW RESCAN (Story 6.1) ====================
    // Scan workflows to detect new/deleted workflows
    const discoveredWorkflows = await this.scanWorkflows(project.path);
    const filesystemWorkflowNames = new Set(
      discoveredWorkflows.map(w => w.name)
    );

    // Extract workflow names from projects.json
    const currentWorkflowNames = new Set(
      (project.workflows || []).map(w => w.name)
    );

    // Detect new workflows (in filesystem, not in projects.json)
    const newWorkflows = [...filesystemWorkflowNames].filter(
      name => !currentWorkflowNames.has(name)
    );

    // Detect deleted workflows (in projects.json, not in filesystem)
    const deletedWorkflows = (project.workflows || []).filter(
      workflow => !filesystemWorkflowNames.has(workflow.name)
    );

    // Remove deleted workflows from project
    for (const deletedWorkflow of deletedWorkflows) {
      const index = project.workflows!.findIndex(w => w.name === deletedWorkflow.name);
      if (index >= 0) {
        project.workflows!.splice(index, 1);
        console.info(`ℹ Removed deleted workflow: ${deletedWorkflow.name}`);
      }
    }

    // Add discovered workflows (replace entire array to ensure sync)
    project.workflows = discoveredWorkflows;

    if (newWorkflows.length > 0) {
      console.info(`✓ New workflow(s) discovered: ${newWorkflows.join(', ')}`);
    }

    // Update timestamp
    project.updatedAt = new Date().toISOString();

    // AC5: Validate schema before saving
    if (!Validators.isValidProjectsData(data)) {
      throw new Error('Invalid projects data structure detected before save');
    }

    // AC5: Save updated projects.json using atomic write pattern
    await this.saveProjects(data);

    // Return result with detected changes (agents + workflows)
    return {
      newAgents,
      deletedAgents,
      failedAgents,
      totalAgents: project.agents.length,
      newWorkflows,
      deletedWorkflows,
      totalWorkflows: project.workflows!.length,
    } as RescanResult;
  }

  /**
   * Set model configuration for a workflow - Story 6.4
   * Stores workflow-to-model mapping in projects.json under the workflow's entry
   * Uses optimistic locking via updatedAt timestamp to prevent concurrent modification conflicts
   * @param projectId - UUID of the project containing the workflow
   * @param workflowId - UUID of the workflow to configure
   * @param model - Model string (e.g., "openai,gpt-4o") or undefined to remove model
   * @throws Error if project not found, workflow not found, model format invalid, or concurrent modification detected
   */
  async setWorkflowModel(projectId: string, workflowId: string, model: string | undefined): Promise<void> {
    // Load projects data and capture timestamp for optimistic locking
    const data = await this.loadProjects();
    const project = data.projects[projectId];

    // Validate project exists
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Capture original timestamp for conflict detection
    const originalTimestamp = project.updatedAt;

    // Validate project has workflows array
    if (!project.workflows || project.workflows.length === 0) {
      throw new Error(`Workflow not found: ${workflowId}. Project ${projectId} has no workflows configured`);
    }

    // Find workflow in project
    const workflow = project.workflows.find(w => w.id === workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId} in project: ${projectId}`);
    }

    // Validate model string format if provided
    if (model !== undefined) {
      if (!Validators.isValidModelString(model)) {
        throw new Error(`Invalid model string format: ${model}. Expected format: "provider,modelname" (e.g., "openai,gpt-4o")`);
      }
    }

    // Update workflow model
    if (model === undefined) {
      // Remove model property to use Router.default fallback
      delete workflow.model;
    } else {
      workflow.model = model;
    }

    // Update project timestamp
    const newTimestamp = new Date().toISOString();
    project.updatedAt = newTimestamp;

    // Optimistic locking: Reload and check if timestamp changed before save
    const currentData = await this.loadProjects();
    const currentProject = currentData.projects[projectId];

    if (currentProject && currentProject.updatedAt && originalTimestamp &&
        currentProject.updatedAt !== originalTimestamp) {
      throw new Error(
        `Concurrent modification detected for project ${projectId}. ` +
        `Another process modified the project between read and write. ` +
        `Please retry the operation.`
      );
    }

    // Save to file using atomic write pattern
    await this.saveProjects(data);

    this.logger.info(`Workflow model updated: ${workflow.name} -> ${model || '[default]'}`);
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
   * Detect which project contains a given agent ID - Story 3.1
   * Used for multi-project cache isolation and agent lookup
   * @param agentId - UUID of the agent
   * @returns Project ID if found, undefined otherwise
   */
  async detectProject(agentId: string): Promise<string | undefined> {
    // Validate agent ID format
    if (!Validators.isValidAgentId(agentId)) {
      console.debug(`Invalid agent ID format in detectProject: ${agentId}`);
      return undefined;
    }

    // Load projects data
    const data = await this.loadProjects();

    // Search for agent across all projects to find its containing project
    for (const [projectId, project] of Object.entries(data.projects)) {
      const agent = project.agents.find(a => a.id === agentId);
      if (agent) {
        console.debug(`Agent ${agentId} found in project ${projectId}`);
        return projectId;
      }
    }

    // Agent not found - return undefined
    console.debug(`Agent ${agentId} not found in any project`);
    return undefined;
  }

  /**
   * Get model configuration by agent ID - Story 2.1, enhanced for Story 3.1
   * Searches across all projects to find agent and return its model
   * @param agentId - UUID of the agent
   * @param projectId - Optional project ID for multi-project support (Story 3.1)
   * @returns Model string if configured, undefined if not found or not set (Router.default fallback)
   */
  async getModelByAgentId(agentId: string, projectId?: string): Promise<string | undefined> {
    // Validate agent ID format
    if (!Validators.isValidAgentId(agentId)) {
      console.debug(`Invalid agent ID format: ${agentId}`);
      return undefined;  // Graceful degradation - use Router.default
    }

    // Load projects data
    const data = await this.loadProjects();

    // Story 3.1: If projectId provided, use it directly (multi-project support)
    if (projectId) {
      const project = data.projects[projectId];
      if (project) {
        const agent = project.agents.find(a => a.id === agentId);
        if (agent) {
          if (agent.model) {
            console.debug(`Found model for agent ${agentId} in project ${projectId}: ${agent.model}`);
            return agent.model;
          }
          console.debug(`Agent ${agentId} found in project ${projectId} but no model configured`);
          return undefined;
        }
      }
      console.debug(`Project ${projectId} or agent ${agentId} not found`);
      return undefined;
    }

    // Search for agent across all projects (O(n) search) - backward compatibility
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
    console.debug(`Agent not found: ${agentId}, using Router.default`);
    return undefined;
  }

  /**
   * Get configured model for a workflow by workflow ID - Story 6.3
   * Searches across all projects to find workflow and return its configured model
   * @param workflowId - UUID of the workflow
   * @param projectId - Optional project ID for specific project search
   * @returns Model string if configured, undefined if not found or not set (Router.default fallback)
   */
  async getModelByWorkflowId(workflowId: string, projectId?: string): Promise<string | undefined> {
    // Validate workflow ID format
    if (!Validators.isValidWorkflowId(workflowId)) {
      this.logger.debug(`Invalid workflow ID format: ${workflowId} (expected UUID v4)`);
      return undefined;
    }

    const projectsData = await this.loadProjects();

    // Search in specific project if provided
    if (projectId && projectsData.projects[projectId]) {
      const project = projectsData.projects[projectId];
      if (!project.workflows || project.workflows.length === 0) return undefined;

      const workflow = project.workflows.find(w => w.id === workflowId);
      if (workflow) {
        // Validate model string format before returning
        if (workflow.model && !Validators.isValidModelString(workflow.model)) {
          this.logger.warn(`Invalid model string format for workflow ${workflowId}: ${workflow.model}`);
          return undefined;
        }
        this.logger.debug(`Workflow model lookup: ${workflowId} in ${projectId} = ${workflow.model}`);
        return workflow.model;
      }
    }

    // Search across all projects (O(n×m) - acceptable for cache miss)
    for (const [projId, project] of Object.entries(projectsData.projects)) {
      if (!project.workflows || project.workflows.length === 0) continue;

      const workflow = project.workflows.find(w => w.id === workflowId);
      if (workflow) {
        if (workflow.model && !Validators.isValidModelString(workflow.model)) {
          this.logger.warn(`Invalid model string format for workflow ${workflowId}: ${workflow.model}`);
          return undefined;
        }
        this.logger.debug(`Workflow model lookup (cross-project): ${workflowId} in ${projId} = ${workflow.model}`);
        return workflow.model;
      }
    }

    this.logger.debug(`Workflow not found or no model configured: ${workflowId}`);
    return undefined;
  }

  /**
   * Detect which project contains a workflow by workflow ID - Story 6.3
   * Used for multi-project cache isolation and workflow lookup
   * @param workflowId - UUID of the workflow
   * @returns Project ID if found, undefined otherwise
   */
  async detectProjectByWorkflowId(workflowId: string): Promise<string | undefined> {
    if (!Validators.isValidWorkflowId(workflowId)) {
      this.logger.debug(`Invalid workflow ID format: ${workflowId}`);
      return undefined;
    }

    const projectsData = await this.loadProjects();
    for (const [projectId, project] of Object.entries(projectsData.projects)) {
      if (!project.workflows || project.workflows.length === 0) continue;

      const workflow = project.workflows.find(w => w.id === workflowId);
      if (workflow) {
        this.logger.debug(`Workflow project detected: ${workflowId} in ${projectId}`);
        return projectId;
      }
    }

    this.logger.debug(`Workflow not found in any project: ${workflowId}`);
    return undefined;
  }

  /**
   * Auto-register a project from an agent file path - Story 2.5
   * Detects project path from agent file location and registers if not already present
   * Merges in-repo projects.json into global projects.json for zero-config onboarding
   *
   * @param agentFilePath - Absolute path to the agent markdown file
   * @returns The registered ProjectConfig, or undefined if already registered
   * @throws Error if agent file path is invalid or auto-registration fails
   */
  async autoRegisterFromAgentFile(agentFilePath: string): Promise<ProjectConfig | undefined> {
    // Validate agent file path
    if (!agentFilePath || typeof agentFilePath !== 'string') {
      throw new Error(`Invalid agent file path: ${agentFilePath}`);
    }

    // Subtask 1.1: Extract project path from agent file absolute path
    // Agent files are at: {project-root}/_bmad/bmm/agents/*.md
    // Project root is the parent of the _bmad directory
    const agentFileName = path.basename(agentFilePath);
    if (!agentFilePath.includes(BMAD_FOLDER_NAME + path.sep + 'bmm' + path.sep + 'agents')) {
      throw new Error(`Agent file path does not match expected pattern: ${agentFilePath}`);
    }

    // Find project root by going up from _bmad/bmm/agents/
    const parts = agentFilePath.split(path.sep);
    const bmadIndex = parts.indexOf(BMAD_FOLDER_NAME);
    if (bmadIndex === -1) {
      throw new Error(`Cannot find ${BMAD_FOLDER_NAME} directory in agent file path: ${agentFilePath}`);
    }
    const projectPath = parts.slice(0, bmadIndex).join(path.sep);

    // Subtask 1.2: Check if project already registered in projects.json by path
    const data = await this.loadProjects();
    for (const [existingId, existingProject] of Object.entries(data.projects)) {
      if (existingProject.path === projectPath) {
        console.debug(`Project already registered: ${existingId} (${existingProject.name})`);
        return undefined; // Already registered, no action needed
      }
    }

    // Subtask 1.3: If not registered, trigger auto-registration flow
    console.info(`Auto-registering project from agent file: ${projectPath}`);

    // Subtask 2.1 & 2.2: Detect and merge in-repo projects.json
    const inRepoProjectsJson = path.join(projectPath, 'projects.json');
    let inRepoData: ProjectsData | null = null;

    try {
      const content = await fs.readFile(inRepoProjectsJson, 'utf-8');
      inRepoData = JSON5.parse(content) as ProjectsData;
      console.info(`Found in-repo projects.json at: ${inRepoProjectsJson}`);

      // Subtask 2.3: Validate and merge in-repo projects.json
      if (inRepoData.projects && typeof inRepoData.projects === 'object') {
        // Merge in-repo projects into global projects.json
        // In-repo config is the "source of truth" for team
        for (const [projectId, inRepoProject] of Object.entries(inRepoData.projects)) {
          // Check if project already exists in global config
          if (!data.projects[projectId]) {
            // Add project from in-repo config to global config
            data.projects[projectId] = inRepoProject;
            console.info(`Merged project from in-repo config: ${projectId} (${inRepoProject.name})`);
          } else {
            // Project exists - verify paths match for consistency
            const existingProject = data.projects[projectId];
            if (existingProject.path !== inRepoProject.path) {
              console.warn(
                `Path mismatch for project ${projectId}: ` +
                `global="${existingProject.path}" vs in-repo="${inRepoProject.path}". ` +
                `Using global path.`
              );
            }
          }
        }
        await this.saveProjects(data);
        console.info(`Successfully merged in-repo projects.json into global config`);
      }
    } catch (error) {
      // In-repo projects.json doesn't exist or is invalid - this is okay
      // We'll register the project using the standard addProject flow
      console.debug(`No valid in-repo projects.json found: ${(error as Error).message}`);
    }

    // After potential merge, check again if project is now registered
    for (const [existingId, existingProject] of Object.entries(data.projects)) {
      if (existingProject.path === projectPath) {
        console.info(`Project registered after merge: ${existingId} (${existingProject.name})`);
        return existingProject;
      }
    }

    // If still not registered (no in-repo config or merge didn't include this project),
    // register using standard addProject flow
    console.info(`Registering new project using standard flow: ${projectPath}`);
    const newProject = await this.addProject(projectPath);
    console.info(`Successfully auto-registered project: ${newProject.id} (${newProject.name})`);
    return newProject;
  }

  /**
   * Find project containing a specific agent by agent ID - Story 2.5
   * Searches across all registered projects to find which project contains the agent
   *
   * @param agentId - UUID of the agent
   * @returns ProjectConfig if found, undefined otherwise
   */
  async findProjectByAgentId(agentId: string): Promise<ProjectConfig | undefined> {
    if (!Validators.isValidAgentId(agentId)) {
      return undefined;
    }

    const data = await this.loadProjects();
    for (const project of Object.values(data.projects)) {
      const agent = project.agents.find(a => a.id === agentId);
      if (agent) {
        return project;
      }
    }

    return undefined;
  }

  /**
   * Find agent file path by agent ID in Claude projects directory - Story 2.5
   * Searches through all Claude projects to find the agent file containing the given agent ID
   * Used for auto-registration when agent ID is detected but project is not registered
   *
   * @param agentId - UUID of the agent to find
   * @param claudeProjectsDir - Path to Claude projects directory (default: ~/.claude/projects)
   * @returns Absolute path to agent file if found, undefined otherwise
   */
  async findAgentFileById(agentId: string, claudeProjectsDir?: string): Promise<string | undefined> {
    if (!Validators.isValidAgentId(agentId)) {
      return undefined;
    }

    const searchDir = claudeProjectsDir || path.join(process.env.HOME || '', '.claude', 'projects');

    try {
      // Get all project directories using glob pattern
      const projectPattern = path.join(searchDir, '*');
      const potentialPaths = await glob(projectPattern, { windowsPathsNoEscape: true });

      // Filter to only directories
      const projectDirs: string[] = [];
      for (const potentialPath of potentialPaths) {
        try {
          const stat = await fs.stat(potentialPath);
          if (stat.isDirectory()) {
            projectDirs.push(potentialPath);
          }
        } catch {
          continue; // Skip entries that can't be accessed
        }
      }

      // Search each project for agents with matching ID
      for (const projectPath of projectDirs) {
        const agentsPattern = path.join(projectPath, BMAD_FOLDER_NAME, 'bmm', 'agents', '*.md');

        let agentFiles: string[];
        try {
          agentFiles = await glob(agentsPattern, { windowsPathsNoEscape: true });
        } catch {
          continue; // Skip projects without agent directories
        }

        // Read each agent file to find matching CCR-AGENT-ID
        for (const agentFile of agentFiles) {
          try {
            const content = await fs.readFile(agentFile, 'utf-8');
            const match = content.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);
            if (match && match[1] === agentId) {
              console.debug(`Found agent file for ${agentId}: ${agentFile}`);
              return agentFile;
            }
          } catch {
            // Skip files that can't be read
            continue;
          }
        }
      }
    } catch (error) {
      console.debug(`Error searching for agent file: ${(error as Error).message}`);
    }

    return undefined;
  }
}
