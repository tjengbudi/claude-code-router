import fs from 'fs/promises';
import path from 'path';
import { validate as uuidValidate } from 'uuid';
import { AGENT_ID_REGEX } from './constants';
import type { ProjectsData } from './types/agent';

/**
 * Validators - Utility class for validating paths and data structures
 */
export class Validators {
  /**
   * Validate agent ID (UUID v4 format) - Story 1.2
   * Uses both uuid.validate() and AGENT_ID_REGEX for robust validation
   * @param agentId - Agent ID to validate
   * @returns true if agent ID is valid UUID v4 format
   */
  static isValidAgentId(agentId: string): boolean {
    // NFR-S3: UUID validation - use both uuid library and regex
    return (
      typeof agentId === 'string' &&
      uuidValidate(agentId) &&
      AGENT_ID_REGEX.test(agentId)
    );
  }

  /**
   * Validate project path (absolute, exists, is directory)
   * Protects against path traversal by requiring absolute paths
   * @param projectPath - Path to validate
   * @returns true if path is valid, false otherwise
   */
  static async isValidProjectPath(projectPath: string): Promise<boolean> {
    try {
      const resolved = path.resolve(projectPath);

      // MED-3: Path traversal protection - require absolute paths after resolution
      // This prevents relative path traversal like ../../../etc/passwd
      if (!path.isAbsolute(resolved)) {
        return false;
      }

      const stats = await fs.stat(resolved);
      return stats.isDirectory();
    } catch (error) {
      // Log unexpected errors for debugging while returning false for validation failure
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.debug(`Path validation failed for ${projectPath}: ${(error as Error).message}`);
      }
      return false;
    }
  }

  /**
   * Validate projects.json schema with type guard
   * @param data - Data to validate
   * @returns true if data is valid ProjectsData structure
   */
  static isValidProjectsData(data: unknown): data is ProjectsData {
    const projects = (data as any)?.projects;
    return (
      typeof data === 'object' &&
      data !== null &&
      'projects' in data &&
      typeof projects === 'object' &&
      projects !== null &&
      !Array.isArray(projects)
    );
  }
}
