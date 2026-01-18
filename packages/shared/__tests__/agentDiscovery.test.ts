import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectManager } from '../src/projectManager';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { writeFile, mkdir } from 'fs/promises';

const TEST_PROJECTS_DIR = path.join(os.tmpdir(), 'test-ccr-projects-agents');
const TEST_PROJECTS_FILE = path.join(TEST_PROJECTS_DIR, 'projects.json');

describe('ProjectManager - Agent Discovery', () => {
  beforeEach(async () => {
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }
  });

  afterEach(async () => {
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }
  });

  describe('discoverAgents', () => {
    it('should scan .bmad/bmm/agents/*.md files', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testPath = '/tmp/test-project-with-agents';
      const agentsDir = path.join(testPath, '.bmad', 'bmm', 'agents');

      // Create test agent files
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'agent1.md'), '# Agent 1');
      await writeFile(path.join(agentsDir, 'agent2.md'), '# Agent 2');

      const agents = await pm.discoverAgents(testPath);

      expect(agents).toHaveLength(2);
      // Story 1.2: AgentConfig now uses 'name' instead of 'file'
      const agentNames = agents.map(a => a.name);
      expect(agentNames).toContain('agent1.md');
      expect(agentNames).toContain('agent2.md');
      // Verify UUID injection happened
      agents.forEach(agent => {
        expect(agent.id).toBeDefined();
        expect(agent.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });
    });

    it('should count discovered agents', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testPath = '/tmp/test-project-count';
      const agentsDir = path.join(testPath, '.bmad', 'bmm', 'agents');

      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'agent1.md'), '# Agent 1');
      await writeFile(path.join(agentsDir, 'agent2.md'), '# Agent 2');
      await writeFile(path.join(agentsDir, 'agent3.md'), '# Agent 3');

      const agents = await pm.discoverAgents(testPath);

      expect(agents).toHaveLength(3);
    });

    it('should return empty array when no agents found', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testPath = '/tmp/test-project-no-agents';

      const agents = await pm.discoverAgents(testPath);

      expect(agents).toHaveLength(0);
    });
  });
});
