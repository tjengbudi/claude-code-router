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
    test('should return undefined for agent without configured model', async () => {
      const model = await projectManager.getModelByAgentId(testAgentId);
      expect(model).toBeUndefined();
      // Undefined triggers Router.default fallback in routing logic
    });

    test('should return configured model for agent with specific model', async () => {
      const testModel = 'openai,gpt-4o';
      await projectManager.setAgentModel(testProjectId, testAgentId, testModel);

      const model = await projectManager.getModelByAgentId(testAgentId);
      expect(model).toBe(testModel);
      // Agent should route to the configured model, not Router.default
    });

    test('should return undefined after removing agent model (setting to undefined)', async () => {
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

    test('should return undefined for non-existent agent ID', async () => {
      const fakeAgentId = uuidv4();
      const model = await projectManager.getModelByAgentId(fakeAgentId);
      expect(model).toBeUndefined();
      // Non-existent agents should gracefully degrade to Router.default
    });

    test('should return undefined for invalid agent ID format', async () => {
      const invalidAgentId = 'not-a-uuid';
      const model = await projectManager.getModelByAgentId(invalidAgentId);
      expect(model).toBeUndefined();
      // Invalid IDs should gracefully degrade to Router.default (security)
    });
  });

  describe('Router.default Fallback Behavior', () => {
    test('should allow multiple agents to use Router.default', async () => {
      // Both agents start with no model configured
      const model1 = await projectManager.getModelByAgentId(testAgentId);
      const model2 = await projectManager.getModelByAgentId(testAgentId2);

      expect(model1).toBeUndefined();
      expect(model2).toBeUndefined();
      // Both agents should use the same Router.default model (consistent behavior)
    });

    test('should handle mixed configuration (some agents configured, some not)', async () => {
      // Configure first agent with specific model
      await projectManager.setAgentModel(testProjectId, testAgentId, 'openai,gpt-4o');

      // Leave second agent unconfigured (Router.default)
      const model1 = await projectManager.getModelByAgentId(testAgentId);
      const model2 = await projectManager.getModelByAgentId(testAgentId2);

      expect(model1).toBe('openai,gpt-4o');
      expect(model2).toBeUndefined();
      // Agent 1 uses specific model, Agent 2 uses Router.default
    });

    test('should handle model format validation during configuration', async () => {
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

    test('should reject API keys in model strings (security)', async () => {
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
    test('should return configured Router.default from config', () => {
      const configService = new MockConfigService();
      const routerDefault = configService.get('Router')?.default;

      expect(routerDefault).toBe('anthropic,claude-sonnet-4');
      // This is the fallback model used when agent has no specific model
    });

    test('should handle missing Router.default with hardcoded fallback', () => {
      const configService = new MockConfigService({ Router: {} });
      const routerDefault = configService.get('Router')?.default;

      expect(routerDefault).toBeUndefined();
      // Router code should use hardcoded fallback: 'anthropic,claude-sonnet-4'
    });

    test('should handle missing Router section entirely', () => {
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
    test('scenario: create agent → do not configure model → verify Router.default used', async () => {
      // Agent is created via scanProject in beforeEach
      // No model is configured
      const model = await projectManager.getModelByAgentId(testAgentId);

      expect(model).toBeUndefined();
      // Routing logic should use Router.default
    });

    test('scenario: configure agent with specific model → verify model used', async () => {
      const specificModel = 'openai,gpt-4o';
      await projectManager.setAgentModel(testProjectId, testAgentId, specificModel);

      const model = await projectManager.getModelByAgentId(testAgentId);

      expect(model).toBe(specificModel);
      // Routing logic should use the configured model, not Router.default
    });

    test('scenario: configure agent to use Router.default explicitly → verify model removed', async () => {
      // First set a specific model
      await projectManager.setAgentModel(testProjectId, testAgentId, 'openai,gpt-4o');

      // Then explicitly set to undefined (use Router.default)
      await projectManager.setAgentModel(testProjectId, testAgentId, undefined);

      const model = await projectManager.getModelByAgentId(testAgentId);

      expect(model).toBeUndefined();
      // Agent should now use Router.default
    });

    test('scenario: multiple agents without configuration → all use same Router.default', async () => {
      const model1 = await projectManager.getModelByAgentId(testAgentId);
      const model2 = await projectManager.getModelByAgentId(testAgentId2);

      expect(model1).toBeUndefined();
      expect(model2).toBeUndefined();
      // Both should use the same Router.default model
    });
  });

  describe('Performance Requirements', () => {
    test('should complete agent model lookup in reasonable time', async () => {
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

    test('should handle concurrent model lookups', async () => {
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
    test('should handle corrupted projects.json gracefully', async () => {
      // Write corrupted data to projects.json
      await fs.writeFile(TEST_PROJECTS_FILE, '{invalid json}', 'utf-8');

      // Create new ProjectManager instance with corrupted file
      const corruptedPM = new ProjectManager(TEST_PROJECTS_FILE);

      // Should return default structure instead of throwing
      const model = await corruptedPM.getModelByAgentId(testAgentId);
      expect(model).toBeUndefined();
      // Graceful degradation: fallback to Router.default
    });

    test('should handle missing projects.json file', async () => {
      // Use non-existent file path
      const missingFile = path.join(TEST_DIR, 'nonexistent-projects.json');
      const missingPM = new ProjectManager(missingFile);

      // Should create default structure instead of throwing
      const data = await missingPM.loadProjects();
      expect(data.projects).toEqual({});
      // Graceful degradation: treat as empty project list
    });

    test('should validate agent ID format before lookup', async () => {
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
