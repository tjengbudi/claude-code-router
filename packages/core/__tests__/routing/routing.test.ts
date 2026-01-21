/**
 * Story 2.3: Router Default Fallback Mechanism - Integration Tests
 *
 * These tests verify end-to-end routing behavior with agent-based model selection,
 * including Router.default fallback when agents have no specific model configured.
 */

import { describe, test, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProjectManager, PROJECTS_FILE } from '@CCR/shared';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Mock projects.json path for testing
const TEST_DIR = path.join(os.tmpdir(), 'ccr-test-routing-' + Date.now());
const TEST_PROJECTS_FILE = path.join(TEST_DIR, 'projects.json');

// Mock ConfigService for testing
class MockConfigService {
  private config: any;

  constructor(config: any = {}) {
    this.config = {
      Router: {
        default: 'anthropic,claude-sonnet-4',
        think: 'anthropic,claude-haiku',
        longContext: 'anthropic,claude-opus',
        webSearch: 'openai,gpt-4o',
        background: 'anthropic,claude-haiku',
        longContextThreshold: 60000,
      },
      providers: [
        {
          name: 'anthropic',
          models: ['claude-sonnet-4', 'claude-haiku', 'claude-opus'],
        },
        {
          name: 'openai',
          models: ['gpt-4o', 'gpt-4o-mini'],
        },
      ],
      ...config,
    };
  }

  get<T = any>(key: string): T {
    return this.config[key];
  }

  getAll(): any {
    return this.config;
  }
}

describe('Story 2.3: Router Default Fallback - Integration Tests', () => {
  let projectManager: ProjectManager;
  let testProjectId: string;
  let testAgentId: string;
  let testAgentId2: string;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Create valid projects.json with proper structure
    await fs.writeFile(TEST_PROJECTS_FILE, '// Test projects file\n{\n  "projects": {}\n}', 'utf-8');

    // Initialize ProjectManager with test file
    projectManager = new ProjectManager(TEST_PROJECTS_FILE);

    // Create test project
    const testProjectPath = path.join(TEST_DIR, 'test-project');
    await fs.mkdir(testProjectPath, { recursive: true });
    await fs.mkdir(path.join(testProjectPath, '.bmad', 'bmm', 'agents'), { recursive: true });

    // Add project
    const projectConfig = await projectManager.addProject(testProjectPath);
    testProjectId = projectConfig.id;

    // Create test agent files
    const agent1Path = path.join(testProjectPath, '.bmad', 'bmm', 'agents', 'agent1.md');
    const agent2Path = path.join(testProjectPath, '.bmad', 'bmm', 'agents', 'agent2.md');

    await fs.writeFile(agent1Path, '# Agent 1\n\nTest agent 1', 'utf-8');
    await fs.writeFile(agent2Path, '# Agent 2\n\nTest agent 2', 'utf-8');

    // Scan project to get agent IDs
    await projectManager.scanProject(testProjectId);
    const project = await projectManager.getProject(testProjectId);

    testAgentId = project!.agents[0].id;
    testAgentId2 = project!.agents[1].id;
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Agent Model Configuration and Retrieval', () => {
    // Priority: P0
    test('2.3-AC1-001: should return undefined for agent without configured model', async () => {
      // Given: An agent with no model configured
      // When: Retrieving model for the agent
      // Then: Should return undefined to trigger Router.default fallback

      const model = await projectManager.getModelByAgentId(testAgentId);
      expect(model).toBeUndefined();
      // Undefined triggers Router.default fallback in routing logic
    });

    // Priority: P0
    test('2.3-AC2-001: should return configured model for agent with specific model', async () => {
      // Given: An agent with a specific model configured
      // When: Retrieving model for the agent
      // Then: Should return the configured model, not Router.default

      const testModel = 'openai,gpt-4o';
      await projectManager.setAgentModel(testProjectId, testAgentId, testModel);

      const model = await projectManager.getModelByAgentId(testAgentId);
      expect(model).toBe(testModel);
      // Agent should route to the configured model, not Router.default
    });

    // Priority: P0
    test('2.3-AC3-001: should return undefined after removing agent model (setting to undefined)', async () => {
      // Given: An agent with a configured model
      // When: Removing the model by setting to undefined
      // Then: Should return undefined and fall back to Router.default

      // First set a model
      await projectManager.setAgentModel(testProjectId, testAgentId, 'openai,gpt-4o');

      // Verify it's set
      let model = await projectManager.getModelByAgentId(testAgentId);
      expect(model).toBe('openai,gpt-4o');

      // Remove model by setting to undefined (Router.default mode)
      await projectManager.setAgentModel(testProjectId, testAgentId, undefined);

      // Verify it's removed
      model = await projectManager.getModelByAgentId(testAgentId);
      expect(model).toBeUndefined();
      // Agent should now use Router.default
    });

    // Priority: P1
    test('2.3-AC4-001: should return undefined for non-existent agent ID', async () => {
      // Given: A non-existent agent ID
      // When: Retrieving model for the agent
      // Then: Should return undefined and gracefully degrade to Router.default

      const fakeAgentId = uuidv4();
      const model = await projectManager.getModelByAgentId(fakeAgentId);
      expect(model).toBeUndefined();
      // Non-existent agents should gracefully degrade to Router.default
    });

    // Priority: P1
    test('2.3-AC4-002: should return undefined for invalid agent ID format', async () => {
      // Given: An invalid agent ID format
      // When: Retrieving model for the agent
      // Then: Should return undefined and gracefully degrade to Router.default

      const invalidAgentId = 'not-a-uuid';
      const model = await projectManager.getModelByAgentId(invalidAgentId);
      expect(model).toBeUndefined();
      // Invalid IDs should gracefully degrade to Router.default (security)
    });
  });

  describe('Router.default Fallback Behavior', () => {
    // Priority: P0
    test('2.3-AC1-002: should allow multiple agents to use Router.default', async () => {
      // Given: Multiple agents with no model configured
      // When: Retrieving models for all agents
      // Then: All should return undefined and use same Router.default

      // Both agents start with no model configured
      const model1 = await projectManager.getModelByAgentId(testAgentId);
      const model2 = await projectManager.getModelByAgentId(testAgentId2);

      expect(model1).toBeUndefined();
      expect(model2).toBeUndefined();
      // Both agents should use the same Router.default model (consistent behavior)
    });

    // Priority: P0
    test('2.3-AC2-002: should handle mixed configuration (some agents configured, some not)', async () => {
      // Given: One agent with specific model, another without
      // When: Retrieving models for both agents
      // Then: Configured agent uses specific model, unconfigured uses Router.default

      // Configure first agent with specific model
      await projectManager.setAgentModel(testProjectId, testAgentId, 'openai,gpt-4o');

      // Leave second agent unconfigured (Router.default)
      const model1 = await projectManager.getModelByAgentId(testAgentId);
      const model2 = await projectManager.getModelByAgentId(testAgentId2);

      expect(model1).toBe('openai,gpt-4o');
      expect(model2).toBeUndefined();
      // Agent 1 uses specific model, Agent 2 uses Router.default
    });

    // Priority: P1
    test('2.3-AC5-001: should handle model format validation during configuration', async () => {
      // Given: Valid and invalid model format strings
      // When: Setting agent models
      // Then: Valid formats succeed, invalid formats fail with previous model intact

      // Valid model format
      await expect(
        projectManager.setAgentModel(testProjectId, testAgentId, 'openai,gpt-4o')
      ).resolves.not.toThrow();

      // Invalid model format (missing comma)
      await expect(
        projectManager.setAgentModel(testProjectId, testAgentId, 'invalid-model')
      ).rejects.toThrow();

      // Verify previous model is still intact after failed update
      const model = await projectManager.getModelByAgentId(testAgentId);
      expect(model).toBe('openai,gpt-4o');
    });

    // Priority: P0
    test('2.3-AC5-002: should reject API keys in model strings (security)', async () => {
      // Given: Model strings that look like API keys
      // When: Attempting to set these as agent models
      // Then: Should reject all API key patterns for security

      // These look like API keys and should be rejected
      const apiKeyModels = [
        'sk-1234567890,model',
        'provider,sk-1234567890',
        'key-value,model',
      ];

      for (const modelString of apiKeyModels) {
        await expect(
          projectManager.setAgentModel(testProjectId, testAgentId, modelString)
        ).rejects.toThrow();
      }
    });
  });

  describe('ConfigService Router.default Fallback', () => {
    // Priority: P0
    test('2.3-AC6-001: should return configured Router.default from config', () => {
      // Given: A config with Router.default configured
      // When: Retrieving Router.default value
      // Then: Should return the configured fallback model

      const configService = new MockConfigService();
      const routerDefault = configService.get('Router')?.default;

      expect(routerDefault).toBe('anthropic,claude-sonnet-4');
      // This is the fallback model used when agent has no specific model
    });

    // Priority: P1
    test('2.3-AC6-002: should handle missing Router.default with hardcoded fallback', () => {
      // Given: A config with empty Router section
      // When: Retrieving Router.default value
      // Then: Should return undefined and use hardcoded fallback

      const configService = new MockConfigService({ Router: {} });
      const routerDefault = configService.get('Router')?.default;

      expect(routerDefault).toBeUndefined();
      // Router code should use hardcoded fallback: 'anthropic,claude-sonnet-4'
    });

    // Priority: P1
    test('2.3-AC6-003: should handle missing Router section entirely', () => {
      // Given: A config with no Router section
      // When: Retrieving Router section
      // Then: Should return undefined and use hardcoded fallback

      // Create a config service with completely empty config
      const emptyConfigService = new MockConfigService({});
      // Delete the Router property that gets set by constructor
      delete (emptyConfigService as any).config.Router;
      const router = emptyConfigService.get('Router');

      expect(router).toBeUndefined();
      // Router code should use hardcoded fallback when Router section missing
    });
  });

  describe('End-to-End Scenarios', () => {
    // Priority: P0
    test('2.3-E2E-001: scenario: create agent → do not configure model → verify Router.default used', async () => {
      // Given: A newly created agent with no model configuration
      // When: Retrieving model for the agent
      // Then: Should use Router.default

      // Agent is created via scanProject in beforeEach
      // No model is configured
      const model = await projectManager.getModelByAgentId(testAgentId);

      expect(model).toBeUndefined();
      // Routing logic should use Router.default
    });

    // Priority: P0
    test('2.3-E2E-002: scenario: configure agent with specific model → verify model used', async () => {
      // Given: An agent configured with a specific model
      // When: Retrieving model for the agent
      // Then: Should use the configured model, not Router.default

      const specificModel = 'openai,gpt-4o';
      await projectManager.setAgentModel(testProjectId, testAgentId, specificModel);

      const model = await projectManager.getModelByAgentId(testAgentId);

      expect(model).toBe(specificModel);
      // Routing logic should use the configured model, not Router.default
    });

    // Priority: P0
    test('2.3-E2E-003: scenario: configure agent to use Router.default explicitly → verify model removed', async () => {
      // Given: An agent with a specific model configured
      // When: Explicitly setting model to undefined
      // Then: Should remove model and use Router.default

      // First set a specific model
      await projectManager.setAgentModel(testProjectId, testAgentId, 'openai,gpt-4o');

      // Then explicitly set to undefined (use Router.default)
      await projectManager.setAgentModel(testProjectId, testAgentId, undefined);

      const model = await projectManager.getModelByAgentId(testAgentId);

      expect(model).toBeUndefined();
      // Agent should now use Router.default
    });

    // Priority: P0
    test('2.3-E2E-004: scenario: multiple agents without configuration → all use same Router.default', async () => {
      // Given: Multiple agents with no model configuration
      // When: Retrieving models for all agents
      // Then: All should use the same Router.default model

      const model1 = await projectManager.getModelByAgentId(testAgentId);
      const model2 = await projectManager.getModelByAgentId(testAgentId2);

      expect(model1).toBeUndefined();
      expect(model2).toBeUndefined();
      // Both should use the same Router.default model
    });
  });

  describe('Performance Requirements', () => {
    // Priority: P1
    test('2.3-NFR-P1-001: should complete agent model lookup in reasonable time', async () => {
      // Given: 100 sequential model lookups
      // When: Measuring average lookup time
      // Then: Average should be well under 50ms (NFR-P1 target)

      const startTime = Date.now();

      // Perform 100 model lookups
      for (let i = 0; i < 100; i++) {
        await projectManager.getModelByAgentId(testAgentId);
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / 100;

      // Average lookup should be well under 50ms (NFR-P1 target)
      expect(avgTime).toBeLessThan(50);
    });

    // Priority: P2
    test('2.3-NFR-P1-002: should handle concurrent model lookups', async () => {
      // Given: 50 concurrent model lookup requests
      // When: Executing all lookups in parallel
      // Then: All should complete successfully with correct results

      // Perform 50 concurrent lookups
      const promises = Array.from({ length: 50 }, () =>
        projectManager.getModelByAgentId(testAgentId)
      );

      const results = await Promise.all(promises);

      // All should return undefined (no model configured)
      expect(results.every(r => r === undefined)).toBe(true);
    });
  });

  describe('Error Handling and Graceful Degradation', () => {
    // Priority: P1
    test('2.3-NFR-R3-001: should handle corrupted projects.json gracefully', async () => {
      // Given: A corrupted projects.json file
      // When: Creating ProjectManager and retrieving model
      // Then: Should gracefully degrade to Router.default without throwing

      // Write corrupted data to projects.json
      await fs.writeFile(TEST_PROJECTS_FILE, '{invalid json}', 'utf-8');

      // Create new ProjectManager instance with corrupted file
      const corruptedPM = new ProjectManager(TEST_PROJECTS_FILE);

      // Should return default structure instead of throwing
      const model = await corruptedPM.getModelByAgentId(testAgentId);
      expect(model).toBeUndefined();
      // Graceful degradation: fallback to Router.default
    });

    // Priority: P1
    test('2.3-NFR-R3-002: should handle missing projects.json file', async () => {
      // Given: A non-existent projects.json file
      // When: Creating ProjectManager and loading projects
      // Then: Should create default structure without throwing

      // Use non-existent file path
      const missingFile = path.join(TEST_DIR, 'nonexistent-projects.json');
      const missingPM = new ProjectManager(missingFile);

      // Should create default structure instead of throwing
      const data = await missingPM.loadProjects();
      expect(data.projects).toEqual({});
      // Graceful degradation: treat as empty project list
    });

    // Priority: P1
    test('2.3-NFR-R3-003: should validate agent ID format before lookup', async () => {
      // Given: Various invalid agent ID formats
      // When: Attempting to retrieve models for invalid IDs
      // Then: Should gracefully degrade to Router.default for all

      const invalidIds = [
        '',                    // empty
        'not-a-uuid',         // not UUID format
        '12345',              // numeric
        null as any,          // null
        undefined as any,     // undefined
      ];

      for (const invalidId of invalidIds) {
        const model = await projectManager.getModelByAgentId(invalidId);
        expect(model).toBeUndefined();
        // Invalid IDs should gracefully degrade to Router.default
      }
    });
  });
});
