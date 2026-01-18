/**
 * Simplified NFR Test Mock - Matches Actual Implementation
 * These mocks provide minimal implementations for NFR validation
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4, validate as isValidUUID } from 'uuid';

export interface AgentConfig {
  id: string;
  name: string;
  relativePath: string;
  absolutePath: string;
  model?: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  agents: AgentConfig[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectsData {
  projects: Record<string, ProjectConfig>;
}

export class Validators {
  static isValidAgentId(agentId: string): boolean {
    return isValidUUID(agentId);
  }

  static async isValidProjectPath(projectPath: string): Promise<boolean> {
    try {
      const resolved = path.resolve(projectPath);
      await fs.access(resolved);
      const stats = await fs.stat(resolved);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  static isValidProjectsData(data: any): data is ProjectsData {
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof data.projects === 'object'
    );
  }

  static isValidModelString(model: string): boolean {
    return /^[a-z0-9_-]+,[a-z0-9_.-]+$/i.test(model);
  }
}

export class ProjectManager {
  private projectsFile: string;

  constructor(projectsFile?: string) {
    this.projectsFile = projectsFile || path.join(process.env.HOME || '', '.claude-code-router', 'projects.json');
  }

  async loadProjects(): Promise<ProjectsData> {
    try {
      const exists = await fs.access(this.projectsFile).then(() => true).catch(() => false);
      if (!exists) {
        return { projects: {} };
      }

      const content = await fs.readFile(this.projectsFile, 'utf-8');
      const data = JSON.parse(content);

      if (!Validators.isValidProjectsData(data)) {
        return { projects: {} };
      }

      return data;
    } catch (error) {
      return { projects: {} };
    }
  }

  private async saveProjects(data: ProjectsData): Promise<void> {
    if (!Validators.isValidProjectsData(data)) {
      throw new Error('Invalid projects data');
    }

    const content = JSON.stringify(data, null, 2);
    const dir = path.dirname(this.projectsFile);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write with backup
    const backup = `${this.projectsFile}.backup`;
    const exists = await fs.access(this.projectsFile).then(() => true).catch(() => false);

    if (exists) {
      await fs.copyFile(this.projectsFile, backup);
    }

    try {
      await fs.writeFile(this.projectsFile, content, 'utf-8');
      if (exists) {
        await fs.unlink(backup).catch(() => {});
      }
    } catch (error) {
      if (exists) {
        await fs.copyFile(backup, this.projectsFile).catch(() => {});
        await fs.unlink(backup).catch(() => {});
      }
      throw error;
    }
  }

  async addProject(projectPath: string): Promise<ProjectConfig> {
    if (!(await Validators.isValidProjectPath(projectPath))) {
      throw new Error('Invalid project path');
    }

    const projectId = uuidv4();
    const projectName = path.basename(projectPath);

    const agents = await this.discoverAgents(projectPath);

    const project: ProjectConfig = {
      id: projectId,
      name: projectName,
      path: projectPath,
      agents,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const data = await this.loadProjects();
    data.projects[projectId] = project;
    await this.saveProjects(data);

    return project;
  }

  async discoverAgents(projectPath: string): Promise<AgentConfig[]> {
    const agents: AgentConfig[] = [];
    const agentsDir = path.join(projectPath, '.bmad/bmm/agents');

    try {
      const files = await fs.readdir(agentsDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        const filePath = path.join(agentsDir, file);
        const agentId = await this.injectAgentId(filePath);

        agents.push({
          id: agentId,
          name: file,
          relativePath: path.relative(projectPath, filePath),
          absolutePath: filePath,
        });
      }
    } catch {
      // Directory doesn't exist, return empty
    }

    return agents;
  }

  private async injectAgentId(agentPath: string): Promise<string> {
    // Check write permission
    try {
      await fs.access(agentPath, fs.constants.W_OK);
    } catch {
      throw new Error('No write permission for file');
    }

    const content = await fs.readFile(agentPath, 'utf-8');

    // Idempotent check
    const existingMatch = content.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);
    if (existingMatch) {
      return existingMatch[1];
    }

    const agentId = uuidv4();

    // Atomic write with backup
    const backup = `${agentPath}.backup`;
    await fs.copyFile(agentPath, backup);

    try {
      const newContent = content.trimEnd() + `\n\n<!-- CCR-AGENT-ID: ${agentId} -->`;
      await fs.writeFile(agentPath, newContent, 'utf-8');
      await fs.unlink(backup).catch(() => {});
    } catch (error) {
      await fs.copyFile(backup, agentPath).catch(() => {});
      await fs.unlink(backup).catch(() => {});
      throw error;
    }

    return agentId;
  }

  async listProjects(): Promise<ProjectConfig[] | undefined> {
    const data = await this.loadProjects();
    const projects = Object.values(data.projects);

    if (projects.length === 0) {
      return undefined;
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  async scanProject(projectId: string): Promise<ProjectConfig> {
    const data = await this.loadProjects();
    const project = data.projects[projectId];

    if (!project) {
      throw new Error('Project not found');
    }

    const agents = await this.discoverAgents(project.path);
    project.agents = agents;
    project.updatedAt = new Date().toISOString();

    await this.saveProjects(data);

    return project;
  }

  async getProject(projectId: string): Promise<ProjectConfig | undefined> {
    const data = await this.loadProjects();
    return data.projects[projectId];
  }

  // NFR Test Helper: Get model by agent ID
  async getModelByAgentId(agentId: string): Promise<string | undefined> {
    if (!Validators.isValidAgentId(agentId)) {
      return undefined;
    }

    const data = await this.loadProjects();

    for (const project of Object.values(data.projects)) {
      const agent = project.agents.find(a => a.id === agentId);
      if (agent) {
        return agent.model;
      }
    }

    return undefined;
  }

  // NFR Test Helper: Set agent model
  async setAgentModel(agentId: string, model: string): Promise<void> {
    const data = await this.loadProjects();

    for (const project of Object.values(data.projects)) {
      const agent = project.agents.find(a => a.id === agentId);
      if (agent) {
        agent.model = model;
        await this.saveProjects(data);
        return;
      }
    }

    throw new Error('Agent not found');
  }
}
