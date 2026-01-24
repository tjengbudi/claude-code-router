/**
 * Migration utilities for ccr-custom to CCR Enhanced
 * Story 5.6: Migration from ccr-custom
 */

import fs from 'fs/promises';
import path from 'path';
import type { ProjectsData, ProjectConfig, AgentConfig } from '../types/agent';
import { Validators } from '../validation';
import { PROJECTS_SCHEMA_VERSION } from '../constants';
import { createLogger } from '../logging/logger';

/**
 * Migration result interface
 */
export interface MigrationResult {
  success: boolean;
  projectsMigrated: number;
  agentsMigrated: number;
  modelsMigrated: number;
  tagsRemoved: number;
  errors: string[];
}

/**
 * Migration options
 */
export interface MigrationOptions {
  dryRun?: boolean;
  backupDir?: string;
}

/**
 * ccr-custom ProjectConfig interface (agents as Record)
 */
interface CcrCustomProjectConfig {
  id: string;
  path: string;
  name: string;
  agents: Record<string, AgentConfig>;
}

/**
 * ccr-custom ProjectsData interface
 */
interface CcrCustomProjectsData {
  projects: Record<string, CcrCustomProjectConfig>;
}

/**
 * CCR-AGENT-MODEL tag pattern (with optional newline)
 */
const AGENT_MODEL_REGEX = /<!-- CCR-AGENT-MODEL: (.*?) -->/;
const AGENT_MODEL_REGEX_WITH_NEWLINE = /<!-- CCR-AGENT-MODEL: .*? -->\n?/g;

/**
 * Logger for migration operations
 */
const logger = createLogger('Migration');

/**
 * Migrate from ccr-custom to CCR Enhanced format
 *
 * Transformations:
 * - agents: Record<string, AgentConfig> → AgentConfig[] (Record to Array)
 * - Add: createdAt, updatedAt timestamps to ProjectConfig
 * - Add: schemaVersion: "1.0.0" to ProjectsData root
 * - Remove: CCR-AGENT-MODEL tags from agent files (migrate to projects.json)
 *
 * @param sourcePath - Path to ccr-custom projects.json
 * @param targetPath - Path for migrated CCR Enhanced projects.json
 * @param options - Migration options (dryRun, backupDir)
 * @returns MigrationResult with statistics and errors
 */
export async function migrateFromCcrCustom(
  sourcePath: string,
  targetPath: string,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    projectsMigrated: 0,
    agentsMigrated: 0,
    modelsMigrated: 0,
    tagsRemoved: 0,
    errors: []
  };

  let backupPath: string | null = null;
  let originalFileContents = new Map<string, string>(); // For agent files rollback
  let originalProjectsJson: string | null = null; // For projects.json rollback

  try {
    // Step 1: Load ccr-custom projects.json
    logger.info(`Loading ccr-custom projects.json from: ${sourcePath}`);
    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    let ccrCustomData: CcrCustomProjectsData;

    try {
      ccrCustomData = JSON.parse(sourceContent) as CcrCustomProjectsData;
    } catch (parseError) {
      throw new Error(
        `Invalid JSON in projects.json: ${(parseError as Error).message}. ` +
        `Try validating at https://jsonlint.com`
      );
    }

    // Validate ccr-custom structure
    if (!ccrCustomData.projects || typeof ccrCustomData.projects !== 'object') {
      throw new Error('Invalid ccr-custom schema: missing or invalid "projects" object');
    }

    // Check if already migrated
    if ((ccrCustomData as any).schemaVersion === PROJECTS_SCHEMA_VERSION) {
      result.success = true;
      result.errors.push('Configuration already migrated (schemaVersion detected)');
      logger.info('Configuration already has schemaVersion, migration skipped');
      return result;
    }

    // Step 2: Transform schema
    logger.info('Transforming schema from ccr-custom to CCR Enhanced format');
    const migratedData: ProjectsData = {
      schemaVersion: PROJECTS_SCHEMA_VERSION,
      projects: {}
    };

    const now = new Date().toISOString();

    for (const [projectId, ccrProject] of Object.entries(ccrCustomData.projects)) {
      const project = ccrProject as CcrCustomProjectConfig;
      // CRITICAL: Convert agents Record → Array
      const agentsArray = Object.values(project.agents || {});

      const enhancedProject: ProjectConfig = {
        id: project.id,
        name: project.name,
        path: project.path,
        createdAt: now,
        updatedAt: now,
        agents: agentsArray, // Record → Array transformation
        workflows: [] // Story 6.1: Initialize empty workflows array
      };

      migratedData.projects[projectId] = enhancedProject;
      result.projectsMigrated++;
      result.agentsMigrated += agentsArray.length;
    }

    // Warn if no projects found
    if (result.projectsMigrated === 0) {
      logger.warn('No projects found in ccr-custom configuration');
      result.errors.push('No projects found to migrate');
    }

    // Step 3: Migrate CCR-AGENT-MODEL tags from agent files to projects.json
    logger.info('Migrating CCR-AGENT-MODEL tags from agent files');
    let tagsFoundInDryRun = 0;
    for (const migratedProject of Object.values(migratedData.projects)) {
      const project = migratedProject as ProjectConfig;
      for (const agent of project.agents) {
        const agentFilePath = agent.absolutePath;

        try {
          // Validate agent file path is safe (prevent path traversal)
          const normalizedPath = path.normalize(agentFilePath);
          if (normalizedPath.includes('..') || !path.isAbsolute(normalizedPath)) {
            throw new Error(`Invalid agent file path: ${agentFilePath}`);
          }

          // Read agent file content
          const content = await fs.readFile(agentFilePath, 'utf-8');

          // Store original content for rollback
          originalFileContents.set(agentFilePath, content);

          // Extract model from CCR-AGENT-MODEL tag
          const modelMatch = content.match(AGENT_MODEL_REGEX);
          if (modelMatch && modelMatch[1]) {
            const modelFromFile = modelMatch[1].trim();

            // Only set if agent doesn't already have a model (projects.json wins)
            // Validate model is not empty or whitespace-only
            if (!agent.model && modelFromFile.length > 0 && modelFromFile !== 'default') {
              agent.model = modelFromFile;
              result.modelsMigrated++;
            }

            // Remove CCR-AGENT-MODEL tag (unless dry run)
            if (!options.dryRun) {
              const cleanedContent = content.replace(AGENT_MODEL_REGEX_WITH_NEWLINE, '');
              if (cleanedContent !== content) {
                await fs.writeFile(agentFilePath, cleanedContent, 'utf-8');
                result.tagsRemoved++;
              }
            } else {
              // In dry-run, count tags that would be removed
              if (AGENT_MODEL_REGEX.test(content)) {
                tagsFoundInDryRun++;
              }
            }
          }
        } catch (agentError) {
          const errorMsg = `Failed to process agent file ${agentFilePath}: ${(agentError as Error).message}`;
          logger.warn(errorMsg);
          result.errors.push(errorMsg);
          // Continue processing other agents
        }
      }
    }

    // In dry-run mode, set tagsRemoved to the count of tags found
    if (options.dryRun) {
      result.tagsRemoved = tagsFoundInDryRun;
    }

    // Step 4: Validate using Story 2.1 validators
    logger.info('Validating migrated schema');
    if (!Validators.isValidProjectsData(migratedData)) {
      throw new Error('Migration produced invalid schema');
    }

    // Step 5: Atomic write (if not dry-run)
    if (!options.dryRun) {
      // Create backup directory if specified
      const backupDir = options.backupDir || path.dirname(targetPath);
      await fs.mkdir(backupDir, { recursive: true });

      // Create backup of original file with collision detection
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      let backupPath = path.join(backupDir, `projects.json.backup-${timestamp}`);
      let counter = 0;
      while (await fs.access(backupPath).then(() => true).catch(() => false)) {
        counter++;
        backupPath = path.join(backupDir, `projects.json.backup-${timestamp}-${counter}`);
      }

      // Store original projects.json for rollback
      try {
        originalProjectsJson = await fs.readFile(targetPath, 'utf-8');
      } catch {
        // Target file doesn't exist yet, no need to backup
      }

      await fs.copyFile(sourcePath, backupPath);
      logger.info(`Backup created at: ${backupPath}`);

      // Write to temp file
      const tempPath = `${targetPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(migratedData, null, 2), 'utf-8');
      logger.info(`Temp file written to: ${tempPath}`);

      // Validate temp file before atomic rename
      try {
        const tempContent = await fs.readFile(tempPath, 'utf-8');
        const parsedTemp = JSON.parse(tempContent);
        if (!Validators.isValidProjectsData(parsedTemp)) {
          throw new Error('Temp file validation failed');
        }
      } catch (validationError) {
        await fs.unlink(tempPath);
        throw new Error(`Temp file validation failed: ${(validationError as Error).message}`);
      }

      // Atomic rename
      await fs.rename(tempPath, targetPath);
      logger.info(`Migration complete. Output written to: ${targetPath}`);
    } else {
      logger.info('Dry run complete - no files modified');
    }

    result.success = true;
    return result;

  } catch (error) {
    // Rollback on failure
    const errorMsg = (error as Error).message;
    logger.error(`Migration failed: ${errorMsg}`);
    result.errors.push(errorMsg);

    // Restore projects.json if it was modified
    if (originalProjectsJson !== null) {
      logger.info('Rolling back projects.json...');
      try {
        await fs.writeFile(targetPath, originalProjectsJson, 'utf-8');
      } catch (rollbackError) {
        logger.error(`Failed to rollback projects.json: ${(rollbackError as Error).message}`);
      }
    }

    // Restore agent files if they were modified
    if (originalFileContents.size > 0) {
      logger.info('Rolling back agent file changes...');
      for (const [filePath, content] of originalFileContents) {
        try {
          await fs.writeFile(filePath, content, 'utf-8');
        } catch (rollbackError) {
          logger.error(`Failed to rollback ${filePath}: ${(rollbackError as Error).message}`);
        }
      }
    }

    // Clean up temp file if it exists
    const tempPath = `${targetPath}.tmp`;
    try {
      await fs.unlink(tempPath);
    } catch {
      // Temp file doesn't exist, ignore
    }

    return result;
  }
}

/**
 * Validate if a file is already migrated
 * @param projectsJsonPath - Path to projects.json
 * @returns true if file has schemaVersion (already migrated)
 */
export async function isAlreadyMigrated(projectsJsonPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(projectsJsonPath, 'utf-8');
    const data = JSON.parse(content) as ProjectsData;
    return data.schemaVersion === PROJECTS_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

/**
 * Migration preview data interface
 */
export interface MigrationPreviewData {
  sourcePath: string;
  totalProjects: number;
  totalAgents: number;
  agentsWithModels: number;
  agentsWithTags: number;
  error?: string;
}

/**
 * Get migration preview without modifying files
 * @param sourcePath - Path to ccr-custom projects.json
 * @returns Preview data with statistics
 */
export async function getMigrationPreview(sourcePath: string): Promise<MigrationPreviewData> {
  try {
    const content = await fs.readFile(sourcePath, 'utf-8');
    const data = JSON.parse(content) as CcrCustomProjectsData;

    let totalProjects = 0;
    let totalAgents = 0;
    let agentsWithModels = 0;
    let agentsWithTags = 0;

    for (const [projectId, project] of Object.entries(data.projects)) {
      totalProjects++;
      const agents = Object.values(project.agents || {});
      totalAgents += agents.length;

      for (const agent of agents) {
        if (agent.model) {
          agentsWithModels++;
        }
        // Check for CCR-AGENT-MODEL tag in file
        try {
          const content = await fs.readFile(agent.absolutePath, 'utf-8');
          if (AGENT_MODEL_REGEX.test(content)) {
            agentsWithTags++;
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }

    return {
      sourcePath,
      totalProjects,
      totalAgents,
      agentsWithModels,
      agentsWithTags
    };
  } catch (error) {
    return {
      sourcePath,
      totalProjects: 0,
      totalAgents: 0,
      agentsWithModels: 0,
      agentsWithTags: 0,
      error: (error as Error).message
    };
  }
}

/**
 * Format migration preview data as string
 * @param previewData - Migration preview data
 * @returns Formatted preview string
 */
export function formatMigrationPreview(previewData: MigrationPreviewData): string {
  if (previewData.error) {
    return `Preview failed: ${previewData.error}`;
  }

  let preview = '\n=== Migration Preview ===\n';
  preview += `Source: ${previewData.sourcePath}\n\n`;
  preview += `Projects to migrate: ${previewData.totalProjects}\n`;
  preview += `Total agents: ${previewData.totalAgents}\n`;
  preview += `Agents with model in projects.json: ${previewData.agentsWithModels}\n`;
  preview += `Agents with CCR-AGENT-MODEL tags: ${previewData.agentsWithTags}\n`;
  preview += '\nTransformations:\n';
  preview += '  - agents: Record → Array\n';
  preview += '  - Add: createdAt, updatedAt timestamps\n';
  preview += '  - Add: schemaVersion "1.0.0"\n';
  preview += '  - Remove: CCR-AGENT-MODEL tags from agent files\n';
  preview += '\n';

  return preview;
}
