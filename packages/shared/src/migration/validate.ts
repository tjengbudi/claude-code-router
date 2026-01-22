/**
 * Migration validation utilities for ccr-custom to CCR Enhanced
 * Story 5.6: Migration from ccr-custom
 */

import fs from 'fs/promises';
import type { ProjectsData, AgentConfig, ProjectConfig } from '../types/agent';
import { Validators } from '../validation';
import { createLogger } from '../logging/logger';

/**
 * Validation report interface
 */
export interface ValidationReport {
  success: boolean;
  agentCountMatch: boolean;
  agentCountBefore: number;
  agentCountAfter: number;
  uuidsPreserved: boolean;
  uuidErrors: string[];
  modelMappingsPreserved: boolean;
  modelErrors: string[];
  tagsRemoved: boolean;
  tagErrors: string[];
  summary: string;
}

/**
 * Agent model mapping for comparison
 */
interface AgentModelMapping {
  agentId: string;
  model?: string;
}

/**
 * CCR-AGENT-MODEL tag pattern
 */
const AGENT_MODEL_REGEX = /<!-- CCR-AGENT-MODEL: (.*?) -->/;

/**
 * Logger for validation operations
 */
const logger = createLogger('MigrationValidation');

/**
 * Validate migration from ccr-custom to CCR Enhanced
 *
 * Checks:
 * - Agent count matches (before vs after)
 * - All agent UUIDs preserved exactly
 * - All model mappings preserved (compare each agent's model)
 * - CCR-AGENT-MODEL tags removed from agent files
 *
 * @param beforePath - Path to original ccr-custom projects.json
 * @param afterPath - Path to migrated CCR Enhanced projects.json
 * @returns ValidationReport with pass/fail status and details
 */
export async function validateMigration(
  beforePath: string,
  afterPath: string
): Promise<ValidationReport> {
  const report: ValidationReport = {
    success: true,
    agentCountMatch: true,
    agentCountBefore: 0,
    agentCountAfter: 0,
    uuidsPreserved: true,
    uuidErrors: [],
    modelMappingsPreserved: true,
    modelErrors: [],
    tagsRemoved: true,
    tagErrors: [],
    summary: ''
  };

  try {
    // Load before (ccr-custom) and after (migrated) data
    logger.info(`Loading original data from: ${beforePath}`);
    const beforeContent = await fs.readFile(beforePath, 'utf-8');
    const beforeData = JSON.parse(beforeContent) as any;

    logger.info(`Loading migrated data from: ${afterPath}`);
    const afterContent = await fs.readFile(afterPath, 'utf-8');
    const afterData = JSON.parse(afterContent) as ProjectsData;

    // Validate structure
    if (!beforeData.projects || typeof beforeData.projects !== 'object') {
      report.success = false;
      report.summary = 'Invalid ccr-custom schema: missing or invalid "projects" object';
      return report;
    }

    if (!Validators.isValidProjectsData(afterData)) {
      report.success = false;
      report.summary = 'Invalid CCR Enhanced schema after migration';
      return report;
    }

    // Extract agent data from before state (ccr-custom uses Record)
    const beforeAgents: AgentModelMapping[] = [];
    for (const ccrProject of Object.values(beforeData.projects)) {
      const project = ccrProject as any;
      const agents = project.agents || {}; // Record<string, AgentConfig>
      for (const agent of Object.values(agents)) {
        const agentConfig = agent as AgentConfig;
        beforeAgents.push({
          agentId: agentConfig.id,
          model: agentConfig.model
        });
        report.agentCountBefore++;
      }
    }

    // Extract agent data from after state (CCR Enhanced uses Array)
    const afterAgents: AgentModelMapping[] = [];
    for (const ccrProject of Object.values(afterData.projects)) {
      const project = ccrProject as ProjectConfig;
      for (const agent of project.agents) {
        afterAgents.push({
          agentId: agent.id,
          model: agent.model
        });
        report.agentCountAfter++;
      }
    }

    // Check 1: Agent count matches
    logger.info(`Checking agent count: before=${report.agentCountBefore}, after=${report.agentCountAfter}`);
    report.agentCountMatch = report.agentCountBefore === report.agentCountAfter;
    if (!report.agentCountMatch) {
      report.success = false;
      report.uuidErrors.push(
        `Agent count mismatch: before=${report.agentCountBefore}, after=${report.agentCountAfter}`
      );
    }

    // Check 2: All agent UUIDs preserved exactly
    logger.info('Validating agent UUIDs are preserved');
    const beforeAgentMap = new Map<string, AgentModelMapping>();
    for (const agent of beforeAgents) {
      beforeAgentMap.set(agent.agentId, agent);
    }

    const afterAgentMap = new Map<string, AgentModelMapping>();
    for (const agent of afterAgents) {
      afterAgentMap.set(agent.agentId, agent);
    }

    // Check for missing UUIDs
    for (const [agentId, beforeAgent] of beforeAgentMap) {
      if (!afterAgentMap.has(agentId)) {
        report.uuidsPreserved = false;
        report.success = false;
        report.uuidErrors.push(`Missing agent ID in migrated data: ${agentId}`);
      }
    }

    // Check for extra UUIDs (shouldn't happen)
    for (const [agentId] of afterAgentMap) {
      if (!beforeAgentMap.has(agentId)) {
        report.uuidsPreserved = false;
        report.success = false;
        report.uuidErrors.push(`Extra agent ID in migrated data: ${agentId}`);
      }
    }

    // Validate each UUID format
    for (const [agentId] of afterAgentMap) {
      if (!Validators.isValidAgentId(agentId)) {
        report.uuidsPreserved = false;
        report.success = false;
        report.uuidErrors.push(`Invalid agent ID format: ${agentId}`);
      }
    }

    // Check 3: All model mappings preserved
    logger.info('Validating model mappings are preserved');
    for (const [agentId, beforeAgent] of beforeAgentMap) {
      const afterAgent = afterAgentMap.get(agentId);
      if (!afterAgent) continue;

      const beforeModel = beforeAgent.model || undefined;
      const afterModel = afterAgent.model || undefined;

      if (beforeModel !== afterModel) {
        report.modelMappingsPreserved = false;
        report.success = false;
        report.modelErrors.push(
          `Model mismatch for agent ${agentId}: before="${beforeModel}", after="${afterModel}"`
        );
      }
    }

    // Check 4: CCR-AGENT-MODEL tags removed from agent files
    logger.info('Validating CCR-AGENT-MODEL tags removed from agent files');
    for (const ccrProject of Object.values(afterData.projects)) {
      const project = ccrProject as ProjectConfig;
      for (const agent of project.agents) {
        try {
          const content = await fs.readFile(agent.absolutePath, 'utf-8');
          if (AGENT_MODEL_REGEX.test(content)) {
            report.tagsRemoved = false;
            report.success = false;
            report.tagErrors.push(
              `CCR-AGENT-MODEL tag still present in: ${agent.absolutePath}`
            );
          }
        } catch (error) {
          // Skip files that can't be read (log warning)
          logger.warn(`Could not read agent file for validation: ${agent.absolutePath}`);
        }
      }
    }

    // Generate summary
    const sections: string[] = [];
    sections.push(`\n=== Migration Validation Report ===\n`);

    sections.push(`Agent Count: ${report.agentCountMatch ? '✓ PASS' : '✗ FAIL'}`);
    sections.push(`  Before: ${report.agentCountBefore} agents`);
    sections.push(`  After: ${report.agentCountAfter} agents`);

    sections.push(`\nUUIDs Preserved: ${report.uuidsPreserved ? '✓ PASS' : '✗ FAIL'}`);
    if (report.uuidErrors.length > 0) {
      sections.push(`  Errors: ${report.uuidErrors.length}`);
      for (const error of report.uuidErrors.slice(0, 5)) {
        sections.push(`    - ${error}`);
      }
      if (report.uuidErrors.length > 5) {
        sections.push(`    - ... and ${report.uuidErrors.length - 5} more`);
      }
    }

    sections.push(`\nModel Mappings: ${report.modelMappingsPreserved ? '✓ PASS' : '✗ FAIL'}`);
    if (report.modelErrors.length > 0) {
      sections.push(`  Errors: ${report.modelErrors.length}`);
      for (const error of report.modelErrors.slice(0, 5)) {
        sections.push(`    - ${error}`);
      }
      if (report.modelErrors.length > 5) {
        sections.push(`    - ... and ${report.modelErrors.length - 5} more`);
      }
    }

    sections.push(`\nTags Removed: ${report.tagsRemoved ? '✓ PASS' : '✗ FAIL'}`);
    if (report.tagErrors.length > 0) {
      sections.push(`  Errors: ${report.tagErrors.length}`);
      for (const error of report.tagErrors.slice(0, 5)) {
        sections.push(`    - ${error}`);
      }
      if (report.tagErrors.length > 5) {
        sections.push(`    - ... and ${report.tagErrors.length - 5} more`);
      }
    }

    sections.push(`\nOverall: ${report.success ? '✓ PASS' : '✗ FAIL'}\n`);

    report.summary = sections.join('\n');

    return report;

  } catch (error) {
    report.success = false;
    report.summary = `Validation failed: ${(error as Error).message}`;
    logger.error(`Validation error: ${(error as Error).message}`);
    return report;
  }
}

/**
 * Quick validation - check only schema version
 * @param projectsJsonPath - Path to projects.json
 * @returns true if file has correct schemaVersion
 */
export async function quickValidate(projectsJsonPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(projectsJsonPath, 'utf-8');
    const data = JSON.parse(content) as ProjectsData;
    return Validators.isValidProjectsData(data);
  } catch {
    return false;
  }
}
