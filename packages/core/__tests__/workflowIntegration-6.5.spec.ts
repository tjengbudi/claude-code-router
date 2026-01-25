/**
 * Story 6.5: End-to-End Integration Tests for Workflow Routing
 *
 * Tests the complete workflow routing flow from discovery to routing.
 * These are TRUE integration tests that exercise the full system using real components.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
// Import from @CCR/shared to match router.ts import reference
// This ensures we are spying on the same class definition that router.ts uses
import { ProjectManager } from '@CCR/shared';
import { router } from '../src/utils/router';
import { ConfigService } from '../src/services/config';

// Mock Logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => mockLogger
};

// Test constants
const TEST_DIR = path.join(os.tmpdir(), `ccr-integration-${Date.now()}`);
const PROJECTS_FILE = path.join(TEST_DIR, 'projects.json');

// Mock ConfigService
const createMockConfigService = (routerConfig: any = {}) => {
  const config = {
    providers: [
      {
        name: 'openai',
        models: ['gpt-4o', 'gpt-3.5-turbo']
      },
      {
        name: 'anthropic',
        models: ['claude-3-opus', 'claude-3-sonnet']
      }
    ],
    Router: {
      default: 'openai,gpt-3.5-turbo',
      ...routerConfig
    }
  };

  return {
    get: (key: string) => config[key as keyof typeof config],
    getAll: () => config
  } as unknown as ConfigService;
};

describe('[Story 6.5] Workflow Integration', () => {
  let pm: ProjectManager;
  let projectPath: string;
  let workflowsDir: string;
  let getModelByWorkflowIdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();

    // Setup test directory
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Setup project structure
    projectPath = path.join(TEST_DIR, 'test-project');
    workflowsDir = path.join(projectPath, '_bmad', 'bmm', 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    // Initialize ProjectManager with test projects file
    pm = new ProjectManager(PROJECTS_FILE);

    // Capture original methods to avoid recursion
    const originalDetectProjectByWorkflowId = ProjectManager.prototype.detectProjectByWorkflowId;
    const originalGetModelByWorkflowId = ProjectManager.prototype.getModelByWorkflowId;
    const originalDetectProject = ProjectManager.prototype.detectProject;
    const originalGetModelByAgentId = ProjectManager.prototype.getModelByAgentId;

    // Spy on ProjectManager.prototype methods to redirect to our test instance
    // This allows the router (which has its own internal ProjectManager instance)
    // to use our test data and logic
    vi.spyOn(ProjectManager.prototype, 'detectProjectByWorkflowId')
      .mockImplementation(async function(id) {
        // Use call to invoke original method with our test instance 'pm' as 'this'
        return originalDetectProjectByWorkflowId.call(pm, id);
      });

    getModelByWorkflowIdSpy = vi.spyOn(ProjectManager.prototype, 'getModelByWorkflowId')
      .mockImplementation(async function(id, projectId) {
        return originalGetModelByWorkflowId.call(pm, id, projectId);
      });

    vi.spyOn(ProjectManager.prototype, 'detectProject')
      .mockImplementation(async function(id) {
        return originalDetectProject.call(pm, id);
      });

    vi.spyOn(ProjectManager.prototype, 'getModelByAgentId')
      .mockImplementation(async function(id, projectId) {
        return originalGetModelByAgentId.call(pm, id, projectId);
      });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('Subtask 5.1: Complete workflow routing flow', () => {
    it('should route workflow request from discovery to configured model', async () => {
      // 1. Setup: Create a workflow file
      const workflowName = 'integration-workflow';
      const workflowDir = path.join(workflowsDir, workflowName);
      await fs.mkdir(workflowDir, { recursive: true });

      const workflowYaml = `name: Integration Workflow
description: Test workflow for integration
`;
      await fs.writeFile(path.join(workflowDir, 'workflow.yaml'), workflowYaml);

      // 2. Discovery: Add project and scan workflows
      const project = await pm.addProject(projectPath);
      expect(project.workflows).toHaveLength(1);

      const workflowId = project.workflows![0].id;
      expect(workflowId).toBeDefined();

      // Verify ID injection happened
      const fileContent = await fs.readFile(path.join(workflowDir, 'workflow.yaml'), 'utf-8');
      expect(fileContent).toContain(`CCR-WORKFLOW-ID: ${workflowId}`);

      // 3. Configuration: Set model for workflow
      const targetModel = 'openai,gpt-4o';
      await pm.setWorkflowModel(project.id, workflowId, targetModel);

      // Verify PM state directly before router call
      const detectedProjectId = await pm.detectProjectByWorkflowId(workflowId);
      if (!detectedProjectId) {
        throw new Error(`Test setup failed: PM could not detect project for workflow ${workflowId}`);
      }
      const configuredModel = await pm.getModelByWorkflowId(workflowId, detectedProjectId);
      if (configuredModel !== targetModel) {
        throw new Error(`Test setup failed: Expected model ${targetModel}, got ${configuredModel}`);
      }

      // Reset spy count for cache verification
      getModelByWorkflowIdSpy.mockClear();

      // 4. Routing: Simulate request
      const req = {
        body: {
          model: 'default', // Changed from openai,gpt-3.5-turbo to avoid early exit in router
          messages: [{ role: 'user', content: 'test' }],
          system: [
            { type: 'text', text: `<!-- CCR-WORKFLOW-ID: ${workflowId} -->\nBase prompt` }
          ],
          metadata: { user_id: 'user_123_session_test-session' }
        },
        log: mockLogger,
        sessionId: 'test-session'
      };

      const context = {
        configService: createMockConfigService()
      };

      // Execute router
      await router(req, null, context as any);

      // 5. Verification: Router should have updated the model
      expect(req.body.model).toBe(targetModel);
      expect((req as any).scenarioType).toBe('default');

      // 6. Cache: Second call should hit cache (no additional lookup)
      const req2 = {
        body: {
          model: 'default',
          messages: [{ role: 'user', content: 'test' }],
          system: [
            { type: 'text', text: `<!-- CCR-WORKFLOW-ID: ${workflowId} -->\nBase prompt` }
          ],
          metadata: { user_id: 'user_123_session_test-session' }
        },
        log: mockLogger,
        sessionId: 'test-session'
      };

      await router(req2, null, context as any);
      expect(req2.body.model).toBe(targetModel);
      expect(getModelByWorkflowIdSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Subtask 5.2: Backward compatibility with agents', () => {
    it('should route agent requests correctly when workflows exist', async () => {
      // 1. Setup: Create agent and workflow
      const agentPath = path.join(projectPath, '_bmad', 'bmm', 'agents');
      await fs.mkdir(agentPath, { recursive: true });

      // Create Agent
      await fs.writeFile(
        path.join(agentPath, 'dev.md'),
        '# Dev Agent\n<!-- CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440000 -->'
      );
      const agentId = '550e8400-e29b-41d4-a716-446655440000';

      // Create Workflow
      const workflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(path.join(workflowDir, 'workflow.yaml'), 'name: Test\n');

      // 2. Register project
      const project = await pm.addProject(projectPath);
      const workflowId = project.workflows![0].id;

      // 3. Configure models
      const agentModel = 'anthropic,claude-3-opus';
      const workflowModel = 'openai,gpt-4o';

      await pm.setAgentModel(project.id, agentId, agentModel);
      await pm.setWorkflowModel(project.id, workflowId, workflowModel);

      // 4. Test Agent Routing
      const agentReq = {
        body: {
          model: 'default',
          messages: [{ role: 'user', content: 'test' }],
          system: [{ type: 'text', text: `<!-- CCR-AGENT-ID: ${agentId} -->` }],
          metadata: { user_id: 'user_123_session_session-1' }
        },
        log: mockLogger,
        sessionId: 'session-1'
      };

      await router(agentReq, null, { configService: createMockConfigService() } as any);
      expect(agentReq.body.model).toBe(agentModel);

      // 5. Test Workflow Routing
      const workflowReq = {
        body: {
          model: 'default',
          messages: [{ role: 'user', content: 'test' }],
          system: [{ type: 'text', text: `<!-- CCR-WORKFLOW-ID: ${workflowId} -->` }],
          metadata: { user_id: 'user_123_session_session-1' }
        },
        log: mockLogger,
        sessionId: 'session-1'
      };

      await router(workflowReq, null, { configService: createMockConfigService() } as any);
      expect(workflowReq.body.model).toBe(workflowModel);
    });
  });

  describe('Subtask 5.3: Configuration sharing', () => {
    it('should store workflow configuration in projects.json', async () => {
      // 1. Setup workflow
      const workflowDir = path.join(workflowsDir, 'shared-workflow');
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(path.join(workflowDir, 'workflow.yaml'), 'name: Shared\n');

      // 2. Add project
      const project = await pm.addProject(projectPath);
      const workflowId = project.workflows![0].id;

      // 3. Configure model
      const model = 'openai,gpt-4o';
      await pm.setWorkflowModel(project.id, workflowId, model);

      // 4. Verify projects.json content
      const content = await fs.readFile(PROJECTS_FILE, 'utf-8');

      // Should NOT contain API keys
      expect(content).not.toMatch(/sk-[a-zA-Z0-9]+/);

      // Should be valid JSON/JSON5
      expect(content).toContain(workflowId);
      expect(content).toContain(model);
      expect(content).toContain('schemaVersion');
    });
  });

  describe('Subtask 5.4: Graceful degradation', () => {
    it('should use Router.default for workflow without configured model', async () => {
      // 1. Setup workflow
      const workflowDir = path.join(workflowsDir, 'fallback-workflow');
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(path.join(workflowDir, 'workflow.yaml'), 'name: Fallback\n');

      // 2. Add project
      const project = await pm.addProject(projectPath);
      const workflowId = project.workflows![0].id;

      // Note: We deliberately do NOT call setWorkflowModel

      // 3. Routing request
      const req = {
        body: {
          model: 'original-model',
          messages: [{ role: 'user', content: 'test' }],
          system: [{ type: 'text', text: `<!-- CCR-WORKFLOW-ID: ${workflowId} -->` }],
          metadata: { user_id: 'user_123_session_test-session' }
        },
        log: mockLogger,
        sessionId: 'test-session'
      };

      const defaultConfig = { default: 'openai,gpt-3.5-turbo' };

      // 4. Execute router
      await router(req, null, { configService: createMockConfigService(defaultConfig) } as any);

      // 5. Verify fallback to default
      expect(req.body.model).toBe(defaultConfig.default);
    });

    it('should ignore workflow routing when no CCR-WORKFLOW-ID is present', async () => {
      const req = {
        body: {
          model: 'openai,gpt-4o',
          messages: [{ role: 'user', content: 'test' }],
          system: [{ type: 'text', text: 'No workflow tag here' }],
          metadata: { user_id: 'user_123_session_no-tag' }
        },
        log: mockLogger,
        sessionId: 'no-tag'
      };

      await router(req, null, { configService: createMockConfigService() } as any);
      expect(req.body.model).toBe('openai,gpt-4o');
    });

    it('should fall back when projects.json is corrupted', async () => {
      const workflowDir = path.join(workflowsDir, 'corrupt-workflow');
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(path.join(workflowDir, 'workflow.yaml'), 'name: Corrupt\n');

      const project = await pm.addProject(projectPath);
      const workflowId = project.workflows![0].id;

      // Corrupt projects.json after registration
      await fs.writeFile(PROJECTS_FILE, '{ invalid json', 'utf-8');

      const req = {
        body: {
          model: 'default',
          messages: [{ role: 'user', content: 'test' }],
          system: [{ type: 'text', text: `<!-- CCR-WORKFLOW-ID: ${workflowId} -->` }],
          metadata: { user_id: 'user_123_session_corrupt' }
        },
        log: mockLogger,
        sessionId: 'corrupt'
      };

      await router(req, null, { configService: createMockConfigService() } as any);
      expect(req.body.model).toBe('openai,gpt-3.5-turbo');
    });

    it('should warn and skip invalid workflow IDs', async () => {
      const req = {
        body: {
          model: 'default',
          messages: [{ role: 'user', content: 'test' }],
          system: [{ type: 'text', text: '<!-- CCR-WORKFLOW-ID: not-a-uuid -->' }],
          metadata: { user_id: 'user_123_session_invalid' }
        },
        log: mockLogger,
        sessionId: 'invalid'
      };

      await router(req, null, { configService: createMockConfigService() } as any);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { workflowId: 'not-a-uuid' },
        'Invalid workflow ID format'
      );
      expect(req.body.model).toBe('openai,gpt-3.5-turbo');
    });
  });
});
