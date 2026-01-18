import fs from 'fs/promises';
import path from 'path';
import { validate as uuidValidate } from 'uuid';
import { AGENT_ID_REGEX, MODEL_STRING_REGEX, API_KEY_PATTERNS } from './constants';
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

  /**
   * Validate model string format - Story 2.1
   * Model string format: "provider,modelname" (e.g., "openai,gpt-4o")
   * Rejects strings that look like API keys (security: NFR-S1)
   * @param model - Model string to validate
   * @returns true if model string matches expected format and is not an API key
   */
  static isValidModelString(model: string): boolean {
    // Must be a string
    if (typeof model !== 'string') {
      return false;
    }

    // Must match the expected format: "provider,modelname"
    if (!MODEL_STRING_REGEX.test(model)) {
      return false;
    }

    // Split into provider and model name
    const parts = model.split(',');
    if (parts.length !== 2) {
      return false;
    }

    const [provider, modelName] = parts;

    // Security: Reject if either part looks like an API key (AC: 5)
    for (const pattern of API_KEY_PATTERNS) {
      if (pattern.test(provider) || pattern.test(modelName)) {
        return false;
      }
    }

    // Additional checks: reject common API key patterns not caught by regex
    // - Contains "key" keyword
    // - Very long strings (likely API keys)
    // - Suspiciously short strings (likely invalid)
    const lowerModel = model.toLowerCase();
    if (
      lowerModel.includes('key') ||
      lowerModel.includes('secret') ||
      provider.length < 2 ||   // Provider name too short (e.g., "a")
      modelName.length < 2 ||   // Model name too short (e.g., "b")
      provider.length > 50 ||   // Provider names shouldn't be this long
      modelName.length > 100    // Model names shouldn't be this long
    ) {
      return false;
    }

    return true;
  }
}
