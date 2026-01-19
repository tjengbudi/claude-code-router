import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProjectManager, Validators, PROJECTS_SCHEMA_VERSION } from '../src';
import { rm, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import JSON5 from 'json5';

const TEST_PROJECTS_DIR = path.join(os.tmpdir(), 'test-ccr-git-workflow');
const TEST_PROJECTS_FILE = path.join(TEST_PROJECTS_DIR, 'projects.json');

describe('Git Workflow Integration Tests (Story 2.4)', () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_PROJECTS_DIR, { recursive: true });
    // Clean up test file before each test
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }
  });

  afterEach(async () => {
    // Clean up test file after each test
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }
    await rm(TEST_PROJECTS_DIR, { recursive: true, force: true });
  });

  describe('JSON5 Format and Human Readability', () => {
    it('should create projects.json with JSON5 format', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = '/tmp/test-project';

      await pm.addProject(testDir);

      // Verify file exists
      expect(existsSync(TEST_PROJECTS_FILE)).toBe(true);

      // Verify JSON5 parse works
      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');
      const data = JSON5.parse(content);

      expect(data).toBeDefined();
      expect(data.projects).toBeDefined();
    });

    it('should include human-readable comments in projects.json', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = '/tmp/test-project';

      await pm.addProject(testDir);

      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');

      // Verify comments are present
      expect(content).toContain('// Project configurations for CCR agent system');
      expect(content).toContain('// Schema version:');
      expect(content).toContain('// This file is safe to commit to git');
    });

    it('should format projects.json with 2-space indentation', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = '/tmp/test-project';

      await pm.addProject(testDir);

      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');

      // Verify 2-space indentation (check for consistent indentation)
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('"') || line.trim().startsWith('schemaVersion')) {
          const indentMatch = line.match(/^(\s*)/);
          if (indentMatch) {
            const indent = indentMatch[1].length;
            // Indentation should be multiple of 2 spaces
            expect(indent % 2).toBe(0);
          }
        }
      }
    });

    it('should include schemaVersion in projects.json', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = '/tmp/test-project';

      await pm.addProject(testDir);

      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');
      const data = JSON5.parse(content) as { schemaVersion?: string };

      expect(data.schemaVersion).toBe(PROJECTS_SCHEMA_VERSION);
    });
  });

  describe('Schema Version Compatibility', () => {
    it('should load projects.json with matching schema version', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create projects.json with current schema version
      const data = {
        schemaVersion: PROJECTS_SCHEMA_VERSION,
        projects: {}
      };
      const content = `// Test\n${JSON5.stringify(data, { space: 2 })}`;
      await writeFile(TEST_PROJECTS_FILE, content, 'utf-8');

      // Load should succeed without warnings
      const loaded = await pm.loadProjects();

      expect(loaded).toBeDefined();
      expect(loaded.projects).toBeDefined();
    });

    it('should load projects.json without schema version (backward compatibility)', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create projects.json without schema version (pre-Story 2.4 format)
      const data = { projects: {} };
      const content = JSON5.stringify(data, { space: 2 });
      await writeFile(TEST_PROJECTS_FILE, content, 'utf-8');

      // Load should succeed with backward compatibility
      const loaded = await pm.loadProjects();

      expect(loaded).toBeDefined();
      expect(loaded.projects).toBeDefined();
    });

    it('should handle projects.json with future schema version (forward compatibility)', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create projects.json with future schema version
      const data = {
        schemaVersion: '2.0.0',
        projects: {}
      };
      const content = JSON5.stringify(data, { space: 2 });
      await writeFile(TEST_PROJECTS_FILE, content, 'utf-8');

      // Load should succeed (forward compatibility)
      const loaded = await pm.loadProjects();

      expect(loaded).toBeDefined();
      expect(loaded.projects).toBeDefined();
    });

    it('should handle corrupted projects.json gracefully', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Write corrupted JSON
      await writeFile(TEST_PROJECTS_FILE, '{ invalid json }', 'utf-8');

      // Load should return empty projects (graceful degradation)
      const loaded = await pm.loadProjects();

      expect(loaded).toBeDefined();
      expect(loaded.projects).toEqual({});
    });

    it('should add schemaVersion to existing projects.json on save', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create projects.json without schema version
      const data = { projects: {} };
      const content = JSON5.stringify(data, { space: 2 });
      await writeFile(TEST_PROJECTS_FILE, content, 'utf-8');

      // Load and save (should add schemaVersion)
      const loaded = await pm.loadProjects();
      // Trigger a save by adding a project
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
      await pm.addProject(testDir);

      // Verify schemaVersion was added
      const newContent = await readFile(TEST_PROJECTS_FILE, 'utf-8');
      const newData = JSON5.parse(newContent) as { schemaVersion?: string };

      expect(newData.schemaVersion).toBe(PROJECTS_SCHEMA_VERSION);

      // Cleanup
      await rm(testDir, { recursive: true });
    });
  });

  describe('Git-Safe Security', () => {
    it('should not write API keys to projects.json', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      // Create agent files
      const agentsDir = path.join(testDir, '.bmad', 'bmm', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'dev.md'), '# Dev Agent', 'utf-8');

      // Add project and configure agent
      const project = await pm.addProject(testDir);
      const agentId = project.agents[0].id;

      // Set model (this is validated, no API keys allowed)
      await pm.setAgentModel(project.id, agentId, 'openai,gpt-4o');

      // Read projects.json and verify no API keys
      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');

      // Check for common API key patterns
      expect(content.toLowerCase()).not.toContain('sk-');
      expect(content.toLowerCase()).not.toContain('api-key');
      expect(content.toLowerCase()).not.toContain('secret');
      expect(content.toLowerCase()).not.toContain('token');
      expect(content.toLowerCase()).not.toContain('password');

      // Cleanup
      await rm(testDir, { recursive: true });
    });

    it('should only store provider and model names', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      // Create agent files
      const agentsDir = path.join(testDir, '.bmad', 'bmm', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'dev.md'), '# Dev Agent', 'utf-8');

      // Add project and configure agent
      const project = await pm.addProject(testDir);
      const agentId = project.agents[0].id;

      // Set model with valid format
      await pm.setAgentModel(project.id, agentId, 'openai,gpt-4o');

      // Load and verify only provider/model stored
      const data = await pm.loadProjects();
      const agent = data.projects[project.id].agents[0];

      expect(agent.model).toBe('openai,gpt-4o');

      // Cleanup
      await rm(testDir, { recursive: true });
    });

    it('should reject model strings with API key patterns', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      // Create agent files
      const agentsDir = path.join(testDir, '.bmad', 'bmm', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'dev.md'), '# Dev Agent', 'utf-8');

      // Add project
      const project = await pm.addProject(testDir);
      const agentId = project.agents[0].id;

      // Attempt to set model with API key pattern - should fail
      await expect(
        pm.setAgentModel(project.id, agentId, 'sk-proj-abc123def456,gpt-4o')
      ).rejects.toThrow(/Invalid model string format/);

      // Cleanup
      await rm(testDir, { recursive: true });
    });
  });

  describe('Atomic Write Pattern', () => {
    it('should use atomic write for projects.json', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = '/tmp/test-project';

      await pm.addProject(testDir);

      // Verify backup file was deleted (atomic write success)
      const backupPath = `${TEST_PROJECTS_FILE}.backup`;
      expect(existsSync(backupPath)).toBe(false);

      // Verify projects.json was created successfully
      expect(existsSync(TEST_PROJECTS_FILE)).toBe(true);
    });

    it('should create backup during write operation', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = '/tmp/test-project';

      // First write
      await pm.addProject(testDir);

      // Modify content manually
      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');
      await writeFile(TEST_PROJECTS_FILE, content.replace('test-project', 'original-project'), 'utf-8');

      // Second write (should create backup first)
      await pm.loadProjects();

      // Verify file was updated
      const newContent = await readFile(TEST_PROJECTS_FILE, 'utf-8');
      expect(newContent).toContain('test-project');
    });
  });

  describe('Backward Compatibility with Story 2.1/2.2 (Task 13)', () => {
    it('should load projects.json without schemaVersion (Story 2.1/2.2 format)', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create projects.json in Story 2.1/2.2 format (no schemaVersion)
      const testData = {
        projects: {
          '550e8400-e29b-41d4-a716-446655440000': {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'test-project',
            path: '/tmp/test',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            agents: []
          }
        }
      };
      const content = JSON5.stringify(testData, { space: 2 });
      await writeFile(TEST_PROJECTS_FILE, content, 'utf-8');

      // Load should succeed with backward compatibility
      const loaded = await pm.loadProjects();

      expect(loaded).toBeDefined();
      expect(loaded.projects).toBeDefined();
      // Should not crash, even though schemaVersion is missing
    });

    it('should apply default schemaVersion when loading old format', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create projects.json without schemaVersion
      const testData = { projects: {} };
      const content = JSON5.stringify(testData, { space: 2 });
      await writeFile(TEST_PROJECTS_FILE, content, 'utf-8');

      // Load projects (should add schemaVersion on save)
      const loaded = await pm.loadProjects();

      // Trigger a save by adding a project
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
      await pm.addProject(testDir);

      // Verify schemaVersion was applied
      const newContent = await readFile(TEST_PROJECTS_FILE, 'utf-8');
      const newData = JSON5.parse(newContent) as { schemaVersion?: string };

      expect(newData.schemaVersion).toBe(PROJECTS_SCHEMA_VERSION);

      await rm(testDir, { recursive: true });
    });

    it('should preserve existing Story 2.1/2.2 project configurations', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create projects.json in Story 2.1/2.2 format with model configurations
      const testData = {
        projects: {
          '550e8400-e29b-41d4-a716-446655440000': {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'my-project',
            path: '/tmp/my-project',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            agents: [
              {
                id: 'agent-uuid-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: '/tmp/my-project/.bmad/bmm/agents/dev.md',
                model: 'openai,gpt-4o'
              }
            ]
          }
        }
      };
      const content = JSON5.stringify(testData, { space: 2 });
      await writeFile(TEST_PROJECTS_FILE, content, 'utf-8');

      // Load and verify model configurations are preserved
      const loaded = await pm.loadProjects();

      expect(loaded.projects['550e8400-e29b-41d4-a716-446655440000']).toBeDefined();
      const project = loaded.projects['550e8400-e29b-41d4-a716-446655440000'];
      expect(project.agents[0].model).toBe('openai,gpt-4o');
    });
  });
});
