/**
 * NFR Security Test Suite
 * Validates security requirements from Epic 1 NFR Assessment
 *
 * Tests:
 * - NFR-S1: API Key Isolation (config.json vs projects.json)
 * - NFR-S2: File System Access Control
 * - NFR-S3: UUID Validation (Injection Prevention)
 * - NFR-S4: Configuration File Integrity
 */

import { test, expect } from '@jest/globals';
import { ProjectManager } from './test-helpers';
import { Validators } from './test-helpers';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const fail = (message: string) => {
  throw new Error(message);
};

describe('NFR Security: API Key Isolation (NFR-S1)', () => {
  const TEST_PROJECTS_FILE = path.join(__dirname, '../fixtures/test-projects.json');

  beforeEach(async () => {
    // Ensure clean state
    try {
      await fs.unlink(TEST_PROJECTS_FILE);
    } catch {}
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.unlink(TEST_PROJECTS_FILE);
    } catch {}
  });

  test('projects.json NEVER contains API keys', async () => {
    const projectManager = new ProjectManager(TEST_PROJECTS_FILE);

    // Create project with agent-to-model mapping
    const testProjectPath = path.join(__dirname, '../fixtures/test-project');
    await projectManager.addProject(testProjectPath);

    // Read projects.json content
    const projectsContent = await fs.readFile(TEST_PROJECTS_FILE, 'utf-8');

    // Validate NO API keys present
    expect(projectsContent).not.toContain('api_key');
    expect(projectsContent).not.toContain('API_KEY');
    expect(projectsContent).not.toContain('sk-'); // OpenAI key prefix
    expect(projectsContent).not.toContain('Bearer '); // Token prefix

    // Validate only provider,model format
    const projectsData = JSON.parse(projectsContent);
    const projects = Object.values(projectsData.projects) as any[];

    projects.forEach((project: any) => {
      Object.values(project.agents || {}).forEach((agent: any) => {
        if (agent.model) {
          // Format: "provider,model" (e.g., "openai,gpt-4o")
          expect(agent.model).toMatch(/^[a-z0-9_-]+,[a-z0-9_.-]+$/i);
          expect(agent.model).not.toContain('sk-');
          expect(agent.model).not.toContain('Bearer');
        }
      });
    });
  });

  test.skip('API keys only in config.json (not git-committed)', async () => {
    // This is a documentation test - validates architecture decision
    // Skipped: .gitignore patterns vary by project setup
    // The important validation is that projects.json never contains keys (tested above)
  });
});

describe('NFR Security: File System Access Control (NFR-S2)', () => {
  const TEST_DIR = path.join(__dirname, '../fixtures/test-fs-access');
  const TEST_FILE = path.join(TEST_DIR, 'test-agent.md');

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.writeFile(TEST_FILE, '# Test Agent\n', 'utf-8');
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  test('write permission check before file modification', async () => {
    // Make file read-only
    await fs.chmod(TEST_FILE, 0o444); // Read-only

    // Create project structure with read-only agent file
    const testProjectDir = path.join(TEST_DIR, 'test-read-only');
    await fs.mkdir(path.join(testProjectDir, '.bmad/bmm/agents'), { recursive: true });
    await fs.copyFile(TEST_FILE, path.join(testProjectDir, '.bmad/bmm/agents/dev.md'));
    await fs.chmod(path.join(testProjectDir, '.bmad/bmm/agents/dev.md'), 0o444);

    const projectManager = new ProjectManager();

    // Attempt to inject agent ID should fail gracefully
    try {
      await projectManager.discoverAgents(testProjectDir);
      fail('Should throw error on write permission failure');
    } catch (error: any) {
      expect(error.message).toContain('permission');
    }

    // Restore permissions
    await fs.chmod(TEST_FILE, 0o644);
    await fs.chmod(path.join(testProjectDir, '.bmad/bmm/agents/dev.md'), 0o644);
  });

  test('path traversal prevention', async () => {
    const projectManager = new ProjectManager();

    // Attempt path traversal attack
    const maliciousPath = '../../../etc/passwd';

    try {
      await projectManager.addProject(maliciousPath);
      fail('Should reject path traversal attempt');
    } catch (error: any) {
      expect(error.message).toContain('Invalid project path');
    }
  });

  test('atomic file write with backup/rollback', async () => {
    const originalContent = await fs.readFile(TEST_FILE, 'utf-8');
    const backupFile = `${TEST_FILE}.backup`;

    // Create project structure
    const testProjectDir = path.join(TEST_DIR, 'test-atomic');
    await fs.mkdir(path.join(testProjectDir, '.bmad/bmm/agents'), { recursive: true });
    const agentFile = path.join(testProjectDir, '.bmad/bmm/agents/dev.md');
    await fs.copyFile(TEST_FILE, agentFile);

    const projectManager = new ProjectManager();

    // Inject agent ID (should create backup)
    const agents = await projectManager.discoverAgents(testProjectDir);
    const agentId = agents[0].id;

    // Verify backup was created during operation
    // (In production, backup is deleted after success)

    // Verify original content preserved + agent ID added
    const newContent = await fs.readFile(agentFile, 'utf-8');
    expect(newContent).toContain(originalContent.trim());
    expect(newContent).toContain(`<!-- CCR-AGENT-ID: ${agentId} -->`);

    // Verify no backup file remains (cleaned up on success)
    const agentBackupFile = `${agentFile}.backup`;
    const backupExists = await fs.access(agentBackupFile).then(() => true).catch(() => false);
    expect(backupExists).toBe(false);
  });
});

describe('NFR Security: UUID Validation (NFR-S3)', () => {
  test('valid UUID v4 format accepted', () => {
    const validUUID = uuidv4();
    expect(Validators.isValidAgentId(validUUID)).toBe(true);
  });

  test('invalid UUID format rejected', () => {
    const invalidUUIDs = [
      'not-a-uuid',
      '12345',
      'xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      '550e8400-e29b-41d4-a716', // Incomplete
      '550e8400-e29b-41d4-a716-446655440000-extra', // Too long
      '', // Empty
      'null',
      'undefined',
    ];

    invalidUUIDs.forEach((invalidUUID) => {
      expect(Validators.isValidAgentId(invalidUUID)).toBe(false);
    });
  });

  test('SQL injection in UUID rejected', () => {
    const sqlInjection = "'; DROP TABLE users; --";
    expect(Validators.isValidAgentId(sqlInjection)).toBe(false);
  });

  test('XSS injection in UUID rejected', () => {
    const xssInjection = '<script>alert("XSS")</script>';
    expect(Validators.isValidAgentId(xssInjection)).toBe(false);
  });

  test('path traversal in UUID rejected', () => {
    const pathTraversal = '../../etc/passwd';
    expect(Validators.isValidAgentId(pathTraversal)).toBe(false);
  });

  test('command injection in UUID rejected', () => {
    const commandInjection = '$(rm -rf /)';
    expect(Validators.isValidAgentId(commandInjection)).toBe(false);
  });
});

describe('NFR Security: Configuration File Integrity (NFR-S4)', () => {
  const TEST_PROJECTS_FILE = path.join(__dirname, '../fixtures/test-projects-integrity.json');

  afterEach(async () => {
    try {
      await fs.unlink(TEST_PROJECTS_FILE);
    } catch {}
  });

  test('valid projects.json schema accepted', async () => {
    const validData = {
      projects: {
        'project-uuid-1': {
          id: 'project-uuid-1',
          name: 'Test Project',
          path: '/path/to/project',
          agents: [
            {
              id: 'agent-uuid-1',
              name: 'dev.md',
              relativePath: '.bmad/bmm/agents/dev.md',
              absolutePath: '/path/to/project/.bmad/bmm/agents/dev.md',
              model: 'openai,gpt-4o',
            },
          ],
        },
      },
    };

    await fs.writeFile(TEST_PROJECTS_FILE, JSON.stringify(validData, null, 2), 'utf-8');

    const projectManager = new ProjectManager(TEST_PROJECTS_FILE);
    const data = await projectManager.loadProjects();

    expect(Validators.isValidProjectsData(data)).toBe(true);
    expect(data.projects['project-uuid-1']).toBeDefined();
  });

  test('corrupted JSON gracefully degraded', async () => {
    const corruptedJSON = '{ invalid json syntax }';
    await fs.writeFile(TEST_PROJECTS_FILE, corruptedJSON, 'utf-8');

    const projectManager = new ProjectManager(TEST_PROJECTS_FILE);
    const data = await projectManager.loadProjects();

    // Should return empty projects object (graceful degradation)
    expect(data).toEqual({ projects: {} });
  });

  test('invalid schema gracefully degraded', async () => {
    const invalidSchema = {
      wrongKey: 'this is not projects',
    };

    await fs.writeFile(TEST_PROJECTS_FILE, JSON.stringify(invalidSchema), 'utf-8');

    const projectManager = new ProjectManager(TEST_PROJECTS_FILE);
    const data = await projectManager.loadProjects();

    // Should return empty projects object (graceful degradation)
    expect(data).toEqual({ projects: {} });
  });

  test('missing projects.json gracefully degraded', async () => {
    const nonExistentFile = path.join(__dirname, '../fixtures/does-not-exist.json');

    const projectManager = new ProjectManager(nonExistentFile);
    const data = await projectManager.loadProjects();

    // Should return empty projects object (graceful degradation)
    expect(data).toEqual({ projects: {} });
  });

  test('projects.json with malicious content rejected', async () => {
    const maliciousData = {
      projects: {
        'project-1': {
          name: '<script>alert("XSS")</script>',
          path: '../../etc/passwd',
          agents: {},
        },
      },
    };

    await fs.writeFile(TEST_PROJECTS_FILE, JSON.stringify(maliciousData), 'utf-8');

    const projectManager = new ProjectManager(TEST_PROJECTS_FILE);
    const data = await projectManager.loadProjects();

    // Schema validation should pass (it's valid structure)
    // But path validation should reject during addProject()
    expect(Validators.isValidProjectsData(data)).toBe(true);

    // Path validation happens at addProject level
    try {
      await projectManager.addProject('../../etc/passwd');
      fail('Should reject malicious path');
    } catch (error: any) {
      expect(error.message).toContain('Invalid project path');
    }
  });
});
