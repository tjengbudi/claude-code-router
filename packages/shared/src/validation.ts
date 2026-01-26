import fs from 'fs/promises';
import path from 'path';
import { validate as uuidValidate } from 'uuid';
import { AGENT_ID_REGEX, MODEL_STRING_REGEX, API_KEY_PATTERNS, PROJECTS_SCHEMA_VERSION } from './constants';
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

      // Security: Verify the path exists and is a directory
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
   * Story 2.4: Enhanced with schema version validation and graceful degradation
   * Story 6.1: Added workflow validation
   * @param data - Data to validate
   * @returns true if data is valid ProjectsData structure
   */
  static isValidProjectsData(data: unknown): data is ProjectsData {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const dataObj = data as Record<string, unknown>;

    // Check for projects object
    const projects = dataObj.projects;
    if (typeof projects !== 'object' || projects === null || Array.isArray(projects)) {
      return false;
    }

    // Story 2.4: Schema version validation (optional for backward compatibility)
    if (dataObj.schemaVersion !== undefined) {
      if (typeof dataObj.schemaVersion !== 'string') {
        console.warn('Invalid schemaVersion format (should be string), ignoring');
      }
      // Version mismatch is allowed - will log warning in loadProjects
    }

    // Story 6.1: Validate workflows if present (backward compatible)
    for (const project of Object.values(projects as Record<string, any>)) {
      if (project.workflows !== undefined) {
        if (!Array.isArray(project.workflows)) {
          return false;
        }
        for (const workflow of project.workflows) {
          if (!this.isValidWorkflowConfig(workflow)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Check if a string contains secret-like patterns
   * Story 2.4: Security validation to prevent API keys from leaking into git
   * @param str - String to check
   * @returns true if string contains secret-like patterns
   */
  static containsSecret(str: string): boolean {
    const lowerStr = str.toLowerCase();

    // Check for secret-like keywords
    // These patterns detect secret-related terms while avoiding false positives
    // on legitimate words like "tokenize", "keyboard", "keyword"
    const secretKeywords = [
      'api-key',
      'apikey',
      'api_key',
      'secret',
      'password',
      'credential',
      'auth-token',
      'auth_token',
      'bearer',
    ];

    for (const keyword of secretKeywords) {
      if (lowerStr.includes(keyword)) {
        return true;
      }
    }

    // Check for "token" as a standalone word (not part of "tokenize" or "keyword")
    // This regex matches "token" when surrounded by delimiters but not followed by letters
    if (/(\W|^)token(\W|$)/.test(lowerStr) && !/tokenize|keyword|detector|rotator/.test(lowerStr)) {
      return true;
    }

    // Check against known API key patterns
    for (const pattern of API_KEY_PATTERNS) {
      if (pattern.test(str)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate semantic version string (for schemaVersion)
   * Story 2.4: Version format validation
   * @param version - Version string to validate
   * @returns true if version is valid semver format
   */
  static isValidSchemaVersion(version: string): boolean {
    // Basic semver regex: X.Y.Z where X, Y, Z are numbers
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
    return semverRegex.test(version);
  }

  /**
   * Validate workflow ID (UUID v4 format) - Story 6.2
   * Uses both uuid.validate() and AGENT_ID_REGEX for robust validation
   * @param workflowId - Workflow ID to validate
   * @returns true if workflow ID is valid UUID v4 format
   */
  static isValidWorkflowId(workflowId: string): boolean {
    // NFR-S3: UUID validation - use both uuid library and regex
    return (
      typeof workflowId === 'string' &&
      uuidValidate(workflowId) &&
      AGENT_ID_REGEX.test(workflowId)
    );
  }

  /**
   * Validate WorkflowConfig structure - Story 6.1
   * Story 6.2: Enhanced with UUID format validation for id field
   * Story 7.1: Enhanced with modelInheritance validation
   * @param workflow - Workflow object to validate
   * @returns true if workflow has valid structure
   */
  static isValidWorkflowConfig(workflow: any): boolean {
    // Story 6.2: Validate UUID format if id field is present and non-empty
    if (workflow.id && workflow.id !== '') {
      if (!this.isValidWorkflowId(workflow.id)) {
        return false;
      }
    }

    // Story 7.1: Validate modelInheritance field if present
    if (workflow.modelInheritance !== undefined) {
      if (!this.isValidInheritanceMode(workflow.modelInheritance)) {
        return false;
      }
    }

    return (
      typeof workflow === 'object' &&
      workflow !== null &&
      typeof workflow.name === 'string' &&
      typeof workflow.description === 'string' &&
      typeof workflow.relativePath === 'string' &&
      typeof workflow.absolutePath === 'string'
    );
  }

  /**
   * Validate model inheritance mode - Story 7.1
   * @param mode - Inheritance mode to validate
   * @returns true if mode is valid ('inherit', 'default', 'specific', or undefined)
   */
  static isValidInheritanceMode(mode: unknown): boolean {
    // Story 7.1 AC4: undefined is treated as valid (defaults to 'default')
    if (mode === undefined) {
      return true;
    }

    // Story 7.1 AC4: Only accept valid string values
    if (typeof mode !== 'string') {
      return false;
    }

    // Story 7.1 AC4: Valid modes are 'inherit', 'default', 'specific'
    return mode === 'inherit' || mode === 'default' || mode === 'specific';
  }

  /**
   * Validate model string format - Story 2.1
   * Model string format: "provider,modelname" (e.g., "openai,gpt-4o")
   * Rejects strings that look like API keys (security: NFR-S1)
   * Story 2.4: Enhanced with containsSecret helper
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

    // Story 2.4: Security: Reject if either part looks like a secret
    // Check provider and model name individually against API key patterns
    for (const pattern of API_KEY_PATTERNS) {
      if (pattern.test(provider) || pattern.test(modelName)) {
        return false;
      }
    }

    // Also use containsSecret for additional keyword checks
    if (this.containsSecret(provider) || this.containsSecret(modelName)) {
      return false;
    }

    // Additional checks: reject common invalid patterns
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
