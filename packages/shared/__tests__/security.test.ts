import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectManager, Validators } from '../src';
import { rm, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import JSON5 from 'json5';

const TEST_PROJECTS_DIR = path.join(os.tmpdir(), 'test-ccr-security');
const TEST_PROJECTS_FILE = path.join(TEST_PROJECTS_DIR, 'projects.json');

describe('Security Audit Tests (Story 2.4)', () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_PROJECTS_DIR, { recursive: true });
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }
  });

  afterEach(async () => {
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }
    await rm(TEST_PROJECTS_DIR, { recursive: true, force: true });
  });

  describe('API Key Detection in Model Strings', () => {
    it('should reject OpenAI API key patterns', () => {
      expect(Validators.isValidModelString('sk-abc123def456,gpt-4o')).toBe(false);
      expect(Validators.isValidModelString('openai,sk-abc123def456')).toBe(false);
      expect(Validators.isValidModelString('sk-proj-xyz789,gpt-4o')).toBe(false);
      expect(Validators.isValidModelString('openai,sk-proj-xyz789')).toBe(false);
    });

    it('should reject Anthropic API key patterns', () => {
      expect(Validators.isValidModelString('sk-ant-api123,claude-3')).toBe(false);
      expect(Validators.isValidModelString('anthropic,sk-ant-api123')).toBe(false);
    });

    it('should reject Stripe API key patterns', () => {
      expect(Validators.isValidModelString('pk-test-key123,model')).toBe(false);
      expect(Validators.isValidModelString('provider,pk-test-key123')).toBe(false);
    });

    it('should reject Slack API key patterns', () => {
      expect(Validators.isValidModelString('xoxb-test-token,model')).toBe(false);
      expect(Validators.isValidModelString('provider,xoxb-test-token')).toBe(false);
    });

    it('should reject GitHub token patterns', () => {
      // These use actual GitHub token patterns (ghp_ + exactly 36 chars)
      // The pattern matches: /^ghp_[a-zA-Z0-9]{36}$/i
      const ghToken = 'ghp_' + 'a'.repeat(36);  // Exactly 36 chars after ghp_
      expect(Validators.containsSecret(ghToken)).toBe(true);

      // Verify the full model string is rejected (ghp_ + 36 chars = 40 chars total for provider part)
      const ghTokenFull = 'ghp_' + 'a'.repeat(36) + ',gpt-4o';
      expect(Validators.isValidModelString(ghTokenFull)).toBe(false);

      // Verify tokens in model name position are also rejected
      expect(Validators.isValidModelString('provider,' + 'gho_' + 'b'.repeat(36))).toBe(false);
    });

    it('should reject AWS access key patterns', () => {
      expect(Validators.isValidModelString('AKIA1234567890ABCDEF,model')).toBe(false);
      expect(Validators.isValidModelString('provider,AKIA1234567890ABCDEF')).toBe(false);
    });
  });

  describe('Secret Keyword Detection', () => {
    it('should detect "api-key" keyword variations', () => {
      expect(Validators.containsSecret('api-key-123')).toBe(true);
      expect(Validators.containsSecret('apikey-test')).toBe(true);
      expect(Validators.containsSecret('api_key_value')).toBe(true);
    });

    it('should detect "secret" keyword', () => {
      expect(Validators.containsSecret('my-secret-key')).toBe(true);
      expect(Validators.containsSecret('secret-value')).toBe(true);
    });

    it('should detect "token" keyword', () => {
      expect(Validators.containsSecret('auth-token-xyz')).toBe(true);
      expect(Validators.containsSecret('token-value')).toBe(true);
    });

    it('should detect "password" keyword', () => {
      expect(Validators.containsSecret('password123')).toBe(true);
      expect(Validators.containsSecret('my-password')).toBe(true);
    });

    it('should detect "credential" keyword', () => {
      expect(Validators.containsSecret('credential-data')).toBe(true);
      expect(Validators.containsSecret('credentials')).toBe(true);
    });
  });

  describe('Git-Safe Content Verification', () => {
    it('should not write secrets to projects.json', async () => {
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

      // Set valid model
      await pm.setAgentModel(project.id, agentId, 'openai,gpt-4o');

      // Read projects.json and verify no secrets
      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');

      // Scan for secret patterns
      const secretPatterns = [
        /sk-[-a-z0-9]+/i,
        /api[-_]?key/i,
        /secret/i,
        /token/i,
        /password/i,
        /credential/i,
      ];

      for (const pattern of secretPatterns) {
        expect(content).not.toMatch(pattern);
      }

      await rm(testDir, { recursive: true });
    });

    it('should only contain safe metadata in projects.json', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      // Create agent files
      const agentsDir = path.join(testDir, '.bmad', 'bmm', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'dev.md'), '# Dev Agent', 'utf-8');

      // Add project and configure
      const project = await pm.addProject(testDir);
      const agentId = project.agents[0].id;
      await pm.setAgentModel(project.id, agentId, 'anthropic,claude-haiku');

      // Load and verify content
      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');
      const data = JSON5.parse(content);

      // Verify only safe metadata
      expect(data).toBeDefined();
      expect(data.projects).toBeDefined();

      // Check each project entry
      for (const [projectId, projectData] of Object.entries(data.projects)) {
        const proj = projectData as any;
        expect(typeof proj.id).toBe('string');
        expect(typeof proj.name).toBe('string');
        expect(typeof proj.path).toBe('string');
        expect(Array.isArray(proj.agents)).toBe(true);

        // Check each agent entry
        for (const agent of proj.agents) {
          expect(typeof agent.id).toBe('string');
          expect(typeof agent.name).toBe('string');

          // If model is set, verify it's safe
          if (agent.model) {
            expect(Validators.isValidModelString(agent.model)).toBe(true);
            expect(Validators.containsSecret(agent.model)).toBe(false);
          }
        }
      }

      await rm(testDir, { recursive: true });
    });
  });

  describe('Validation Prevents Secret Injection', () => {
    it('should prevent setting model with API key pattern', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      const agentsDir = path.join(testDir, '.bmad', 'bmm', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'dev.md'), '# Dev Agent', 'utf-8');

      const project = await pm.addProject(testDir);
      const agentId = project.agents[0].id;

      // Try to set model with API key
      await expect(
        pm.setAgentModel(project.id, agentId, 'sk-proj-abc123,gpt-4o')
      ).rejects.toThrow(/Invalid model string format/);

      // Verify the bad model was not saved
      const data = await pm.loadProjects();
      const agent = data.projects[project.id].agents[0];
      expect(agent.model).toBeUndefined();

      await rm(testDir, { recursive: true });
    });

    it('should prevent setting model with secret keyword', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      const agentsDir = path.join(testDir, '.bmad', 'bmm', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'dev.md'), '# Dev Agent', 'utf-8');

      const project = await pm.addProject(testDir);
      const agentId = project.agents[0].id;

      // Try to set model with secret keyword
      await expect(
        pm.setAgentModel(project.id, agentId, 'provider,api-key-model')
      ).rejects.toThrow(/Invalid model string format/);

      await rm(testDir, { recursive: true });
    });
  });

  describe('Safe Model Formats', () => {
    it('should accept legitimate model strings', () => {
      const validModels = [
        'openai,gpt-4o',
        'openai,gpt-4o-mini',
        'anthropic,claude-haiku',
        'anthropic,claude-sonnet',
        'anthropic,claude-opus',
        'anthropic,claude-3-5-sonnet-20241022',
        'google,gemini-pro',
        'google,gemini-2.0-flash-exp',
        'deepseek,deepseek-r1',
        'deepseek,deepseek-chat',
        'openrouter,meta-llama/llama-3-70b',
      ];

      for (const model of validModels) {
        expect(Validators.isValidModelString(model)).toBe(true);
        expect(Validators.containsSecret(model)).toBe(false);
      }
    });

    it('should reject dangerous model strings', () => {
      const invalidModels = [
        'sk-abc123,gpt-4o',
        'openai,sk-abc123',
        'provider,api-key-model',
        'secret-provider,model',
        'my-key-provider,model',
        'openai,model-token',
        'pk-test,model',
      ];

      for (const model of invalidModels) {
        expect(Validators.isValidModelString(model)).toBe(false);
      }
    });
  });

  describe('Environment Variable Safety', () => {
    it('should not leak environment variables in projects.json', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const testDir = path.join(os.tmpdir(), `test-project-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      const agentsDir = path.join(testDir, '.bmad', 'bmm', 'agents');
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, 'dev.md'), '# Dev Agent', 'utf-8');

      const project = await pm.addProject(testDir);

      // Verify projects.json doesn't contain environment variable patterns
      const content = await readFile(TEST_PROJECTS_FILE, 'utf-8');

      expect(content).not.toContain('${');
      expect(content).not.toContain('$ENV');
      expect(content).not.toContain('process.env');

      await rm(testDir, { recursive: true });
    });
  });
});
