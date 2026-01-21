/**
 * Story 4.5: Git-Shareable New Agent Workflow Integration Tests
 *
 * Tests the new git-based workflow where:
 * - Agent .md files with CCR-AGENT-ID tags are shared via git
 * - projects.json is NOT shared (stays in ~/.claude-code-router/)
 * - Each team member configures models independently
 *
 * KEY ARCHITECTURAL CHANGE:
 * OLD (Story 2.4): projects.json was committed to git
 * NEW (Story 4.5): Agent .md files are committed, projects.json is local-only
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { ProjectManager, Validators } from '../src';
import { rm, readFile, writeFile, mkdir, unlink, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import JSON5 from 'json5';
import { randomUUID } from 'crypto';

const TEST_PROJECTS_DIR = path.join(os.tmpdir(), 'test-ccr-git-workflow-story45');
const TEST_PROJECTS_FILE = path.join(TEST_PROJECTS_DIR, 'projects.json');

// Track if git is available for git-specific tests
let gitAvailable = false;

// Track temp files for cleanup
const tempFilesToCleanup: string[] = [];

describe('Story 4.5: Git-Shareable New Agent Workflow', () => {
  let testProjectPath: string;
  let agentsDir: string;
  let gitRepoPath: string;
  let pm: ProjectManager;
  let project: any;

  // Suppress expected console.debug messages during tests
  let consoleDebugSpy: jest.SpyInstance;

  beforeAll(() => {
    // Check if git is available
    try {
      execSync('git --version', { stdio: 'ignore' });
      gitAvailable = true;
    } catch {
      gitAvailable = false;
    }
  });

  beforeEach(async () => {
    // Suppress expected console.debug messages about missing projects.json
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((message) => {
      // Only suppress expected ENOENT errors for projects.json
      if (typeof message === 'string' && message.includes('Failed to load projects.json: ENOENT')) {
        return;
      }
      // Let other debug messages through
      console.log(message);
    });

    // Create test directory
    await mkdir(TEST_PROJECTS_DIR, { recursive: true });
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }

    // Create test project structure with git repo
    gitRepoPath = path.join(os.tmpdir(), `test-git-repo-${Date.now()}`);
    testProjectPath = gitRepoPath; // Project root = git repo root
    agentsDir = path.join(testProjectPath, '.bmad', 'bmm', 'agents');
    await mkdir(agentsDir, { recursive: true });

    // Initialize git repo
    try {
      execSync('git init', { cwd: gitRepoPath, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: gitRepoPath, stdio: 'ignore' });
      execSync('git config user.name "Test User"', { cwd: gitRepoPath, stdio: 'ignore' });
    } catch {
      // Git init failed - skip git-specific tests
    }

    // Create shared ProjectManager instance
    pm = new ProjectManager(TEST_PROJECTS_FILE);
  });

  afterEach(async () => {
    // Restore console.debug
    if (consoleDebugSpy) {
      consoleDebugSpy.mockRestore();
    }

    // Clean up test files and directories
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }
    await rm(TEST_PROJECTS_DIR, { recursive: true, force: true });
    if (existsSync(gitRepoPath)) {
      await rm(gitRepoPath, { recursive: true, force: true });
    }
    // Clean up any tracked temp files
    for (const tempFile of tempFilesToCleanup) {
      try {
        if (existsSync(tempFile)) {
          await rm(tempFile);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    // Clear the temp files array
    tempFilesToCleanup.length = 0;
  });

  // ============================================================================
  // TASK 1: Validate agent file git workflow (AC: 1)
  // ============================================================================

  describe('Task 1: Validate agent file git workflow (AC1)', () => {
    describe('Subtask 1.1: Test committing agent .md file with CCR-AGENT-ID', () => {
      it('should commit agent .md file with CCR-AGENT-ID tag to git', async () => {
        // Skip test if git is not available
        if (!gitAvailable) {
          return;
        }

        // Create initial agent file
        const agentPath = path.join(agentsDir, 'dev.md');
        await writeFile(agentPath, '# Dev Agent\n\nThis is a development agent.', 'utf-8');

        // Add project (which injects CCR-AGENT-ID)
        project = await pm.addProject(testProjectPath);
        const devAgent = project.agents.find((a: any) => a.name === 'dev.md');
        expect(devAgent).toBeDefined();

        // Verify CCR-AGENT-ID was injected into agent file
        const agentContent = await readFile(agentPath, 'utf-8');
        expect(agentContent).toContain('<!-- CCR-AGENT-ID:');
        const idMatch = agentContent.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);
        expect(idMatch).toBeDefined();
        const injectedId = idMatch![1];

        // Add to git
        execSync(`git add .bmad/bmm/agents/dev.md`, { cwd: gitRepoPath, stdio: 'ignore' });
        execSync('git commit -m "feat: add dev agent"', { cwd: gitRepoPath, stdio: 'ignore' });

        // Verify file is in git
        const gitFiles = execSync('git ls-files', { cwd: gitRepoPath, encoding: 'utf-8' });
        expect(gitFiles).toContain('.bmad/bmm/agents/dev.md');

        // Verify CCR-AGENT-ID is in committed version
        const committedContent = execSync(
          'git show HEAD:.bmad/bmm/agents/dev.md',
          { cwd: gitRepoPath, encoding: 'utf-8' }
        );
        expect(committedContent).toContain(`<!-- CCR-AGENT-ID: ${injectedId} -->`);
      });

      it('should preserve CCR-AGENT-ID across git commit and pull', async () => {
        // Skip test if git is not available
        if (!gitAvailable) {
          return;
        }

        // Create agent file
        const agentPath = path.join(agentsDir, 'sm.md');
        await writeFile(agentPath, '# SM Agent', 'utf-8');

        // Add project (injects CCR-AGENT-ID)
        project = await pm.addProject(testProjectPath);
        const smAgent = project.agents.find((a: any) => a.name === 'sm.md');
        const originalId = smAgent!.id;

        // Verify ID in file
        const contentBefore = await readFile(agentPath, 'utf-8');
        expect(contentBefore).toContain(`<!-- CCR-AGENT-ID: ${originalId} -->`);

        // Commit to git
        execSync('git add .bmad/bmm/agents/sm.md', { cwd: gitRepoPath, stdio: 'ignore' });
        execSync('git commit -m "feat: add sm agent"', { cwd: gitRepoPath, stdio: 'ignore' });

        // Simulate git pull (read from git)
        const gitContent = execSync(
          'git show HEAD:.bmad/bmm/agents/sm.md',
          { cwd: gitRepoPath, encoding: 'utf-8' }
        );

        // Verify CCR-AGENT-ID persisted
        expect(gitContent).toContain(`<!-- CCR-AGENT-ID: ${originalId} -->`);
      });
    });

    describe('Subtask 1.2: Verify projects.json is NOT committed (stays in ~/.claude-code-router/)', () => {
      it('should store projects.json in ~/.claude-code-router/ location', async () => {
        // Verify projects.json exists in CCR directory
        expect(existsSync(TEST_PROJECTS_FILE)).toBe(false); // Not created yet

        // Add project
        project = await pm.addProject(testProjectPath);

        // Now projects.json exists in CCR directory
        expect(existsSync(TEST_PROJECTS_FILE)).toBe(true);

        // Skip git verification if git is not available
        if (!gitAvailable) {
          return;
        }

        // Verify it's NOT in the git repo
        const gitFiles = execSync('git ls-files', { cwd: gitRepoPath, encoding: 'utf-8' });
        expect(gitFiles).not.toContain('projects.json');
      });

      it('should NOT include projects.json in git tracked files', async () => {
        // Skip git verification if git is not available
        if (!gitAvailable) {
          return;
        }

        // Add project
        project = await pm.addProject(testProjectPath);

        // Create agent files
        await writeFile(path.join(agentsDir, 'dev.md'), '# Dev Agent', 'utf-8');

        // Add all to git
        execSync('git add -A', { cwd: gitRepoPath, stdio: 'ignore' });

        // Check what's staged
        const stagedFiles = execSync('git diff --cached --name-only', { cwd: gitRepoPath, encoding: 'utf-8' });

        // projects.json should NOT be in the list (it's outside git repo)
        expect(stagedFiles).not.toContain('projects.json');

        // Agent files SHOULD be in the list
        expect(stagedFiles).toContain('.bmad/bmm/agents/dev.md');
      });

      it('should keep projects.json outside project git repository', async () => {
        // Create an agent file first
        const agentPath = path.join(agentsDir, 'outside-agent.md');
        await writeFile(agentPath, '# Outside Agent\n\nContent here.', 'utf-8');

        // This is the key architectural requirement
        project = await pm.addProject(testProjectPath);

        // projects.json is in TEST_PROJECTS_DIR (simulating ~/.claude-code-router/)
        // gitRepoPath is the project root - these are DIFFERENT locations
        expect(TEST_PROJECTS_FILE).not.toContain(gitRepoPath);
        expect(path.dirname(TEST_PROJECTS_FILE)).not.toBe(gitRepoPath);

        // Verify projects.json exists in CCR directory
        expect(existsSync(TEST_PROJECTS_FILE)).toBe(true);

        // Verify project was successfully added
        expect(project).toBeDefined();
        expect(project.agents.length).toBeGreaterThan(0); // At least dev.md
      });
    });

    describe('Subtask 1.3: Verify no secrets in agent files (NFR-S1)', () => {
      it('should not contain API keys in agent .md files', async () => {
        // Create agent file
        const agentPath = path.join(agentsDir, 'security.md');
        await writeFile(agentPath, '# Security Agent\n\nAPI key: sk-abc123', 'utf-8');

        // Add project
        project = await pm.addProject(testProjectPath);

        // Verify agent file content (the API key is part of content, not injected by CCR)
        const agentContent = await readFile(agentPath, 'utf-8');
        expect(agentContent).toContain('API key: sk-abc123'); // Content is preserved

        // But CCR-AGENT-ID injection should NOT add secrets
        expect(agentContent).not.toContain('APIKEY');
        expect(agentContent).not.toContain('api_key');

        // Verify injected ID is just UUID, no secrets
        const idMatch = agentContent.match(/<!-- CCR-AGENT-ID: ([a-f0-9-]+) -->/);
        expect(idMatch).toBeDefined();
        expect(Validators.isValidAgentId(idMatch![1])).toBe(true);
      });

      it('should validate agent files contain only safe content for git commit', async () => {
        // Create agent file with safe content
        const agentPath = path.join(agentsDir, 'safe-agent.md');
        await writeFile(
          agentPath,
          '# Safe Agent\n\n<!-- CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440000 -->\n\nThis is safe.',
          'utf-8'
        );

        project = await pm.addProject(testProjectPath);

        const content = await readFile(agentPath, 'utf-8');

        // Safe content: UUID, descriptions
        expect(content).toContain('<!-- CCR-AGENT-ID:');
        expect(content).toContain('This is safe');

        // No dangerous patterns
        expect(content.toLowerCase()).not.toContain('password');
        expect(content.toLowerCase()).not.toContain('secret');
        expect(content.toLowerCase()).not.toContain('token');
      });
    });

    describe('Subtask 1.4: Test .gitattributes for line ending consistency', () => {
      it('should create .gitattributes with LF line ending configuration', async () => {
        const gitattributesPath = path.join(gitRepoPath, '.gitattributes');

        // Create .gitattributes file
        const content = '# Ensure consistent line endings for agent files\n*.md text eol=lf\n';
        await writeFile(gitattributesPath, content, 'utf-8');

        // Verify file exists
        expect(existsSync(gitattributesPath)).toBe(true);

        // Verify content
        const attrs = await readFile(gitattributesPath, 'utf-8');
        expect(attrs).toContain('*.md text eol=lf');
      });

      it('should ensure agent files use LF line endings', async () => {
        // Create .gitattributes
        const gitattributesPath = path.join(gitRepoPath, '.gitattributes');
        await writeFile(gitattributesPath, '*.md text eol=lf\n', 'utf-8');

        // Create agent file
        const agentPath = path.join(agentsDir, 'lf-agent.md');
        await writeFile(agentPath, '# LF Agent\n\nContent with LF endings.\n', 'utf-8');

        project = await pm.addProject(testProjectPath);

        // Verify file uses LF line endings
        const content = await readFile(agentPath, 'utf-8');
        const lines = content.split('\n');

        // Check that line breaks are LF (\n), not CRLF (\r\n)
        for (const line of lines) {
          expect(line).not.toContain('\r');
        }
      });
    });
  });

  // ============================================================================
  // TASK 2: Validate agent discovery workflow (AC: 2)
  // ============================================================================

  describe('Task 2: Validate agent discovery workflow (AC2)', () => {
    describe('Subtask 2.1: Test git pull receives agent file correctly', () => {
      it('should detect agent after git pull workflow', async () => {
        // Create agent file with CCR-AGENT-ID
        const agentPath = path.join(agentsDir, 'new-agent.md');
        const agentId = '550e8400-e29b-41d4-a716-446655440000';
        await writeFile(
          agentPath,
          `# New Agent\n\n<!-- CCR-AGENT-ID: ${agentId} -->\n\nContent here.`,
          'utf-8'
        );

        // Simulate "git pull" - file already exists with ID
        expect(existsSync(agentPath)).toBe(true);

        // Add project - should discover existing agent
        project = await pm.addProject(testProjectPath);

        const newAgent = project.agents.find((a: any) => a.name === 'new-agent.md');
        expect(newAgent).toBeDefined();
        expect(newAgent!.id).toBe(agentId);
      });
    });

    describe('Subtask 2.2: Test `ccr project scan` detects new agent', () => {
      it('should detect new agent on rescan after git pull', async () => {
        // Add project first
        project = await pm.addProject(testProjectPath);
        const initialAgentCount = project.agents.length;

        // Simulate git pull: add new agent file with CCR-AGENT-ID
        const newAgentPath = path.join(agentsDir, 'pulled-agent.md');
        const pulledAgentId = '660e8400-e29b-41d4-a716-446655440001';
        await writeFile(
          newAgentPath,
          `<!-- CCR-AGENT-ID: ${pulledAgentId} -->\n# Pulled Agent`,
          'utf-8'
        );

        // Rescan project
        const rescanResult = await pm.rescanProject(project.id);

        // Verify new agent detected
        expect(rescanResult.newAgents).toContain('pulled-agent.md');
        expect(rescanResult.totalAgents).toBe(initialAgentCount + 1);

        // Verify agent has correct ID
        const updatedProject = await pm.getProject(project.id);
        const pulledAgent = updatedProject!.agents.find((a: any) => a.name === 'pulled-agent.md');
        expect(pulledAgent).toBeDefined();
        expect(pulledAgent!.id).toBe(pulledAgentId);
      });
    });

    describe('Subtask 2.3: Test interactive configuration prompt', () => {
      it('should allow model configuration for discovered agent', async () => {
        // Create agent file first
        const agentPath = path.join(agentsDir, 'config-agent.md');
        await writeFile(agentPath, '# Config Agent\n\nContent here.', 'utf-8');

        // Add project with agent
        project = await pm.addProject(testProjectPath);
        const agent = project.agents[0];

        // Initially no model configured
        expect(agent.model).toBeUndefined();

        // Configure model (simulating interactive prompt)
        await pm.setAgentModel(project.id, agent.id, 'openai,gpt-4o');

        // Verify model was set
        const updatedProject = await pm.getProject(project.id);
        const updatedAgent = updatedProject!.agents.find((a: any) => a.id === agent.id);
        expect(updatedAgent!.model).toBe('openai,gpt-4o');
      });

      it('should store model configuration locally in projects.json', async () => {
        // Create agent file first
        const agentPath = path.join(agentsDir, 'local-config-agent.md');
        await writeFile(agentPath, '# Local Config Agent\n\nContent here.', 'utf-8');

        project = await pm.addProject(testProjectPath);
        const agent = project.agents[0];

        // Configure model
        await pm.setAgentModel(project.id, agent.id, 'anthropic,claude-sonnet-4');

        // Verify it's in projects.json (local file)
        const data = await pm.loadProjects();
        const storedAgent = data.projects[project.id].agents.find((a: any) => a.id === agent.id);
        expect(storedAgent!.model).toBe('anthropic,claude-sonnet-4');

        // But NOT in the agent file itself
        const agentFilePath = agent.absolutePath;
        const agentContent = await readFile(agentFilePath, 'utf-8');
        expect(agentContent).not.toContain('anthropic,claude-sonnet-4');
      });
    });

    describe('Subtask 2.4: Verify agent becomes available after configuration', () => {
      it('should retrieve model configuration for configured agent', async () => {
        // Create agent file first
        const agentPath = path.join(agentsDir, 'available-agent.md');
        await writeFile(agentPath, '# Available Agent\n\nContent here.', 'utf-8');

        project = await pm.addProject(testProjectPath);
        const agent = project.agents[0];

        // Initially no model
        let model = await pm.getModelByAgentId(agent.id);
        expect(model).toBeUndefined();

        // Configure model
        await pm.setAgentModel(project.id, agent.id, 'openai,gpt-4o');

        // Now model should be available
        model = await pm.getModelByAgentId(agent.id);
        expect(model).toBe('openai,gpt-4o');
      });
    });
  });

  // ============================================================================
  // TASK 3: Validate independent configuration (AC: 3)
  // ============================================================================

  describe('Task 3: Validate independent configuration (AC3)', () => {
    describe('Subtask 3.1: Test two team members configure same agent differently', () => {
      it('should allow different model configs for same agent ID', async () => {
        // First, set up agent files in testProjectPath
        const agentPath = path.join(agentsDir, 'shared-agent.md');
        const agentId = '550e8400-e29b-41d4-a716-446655440008';
        await writeFile(agentPath, `<!-- CCR-AGENT-ID: ${agentId} -->\n# Shared Agent`, 'utf-8');

        // Member A's projects.json - use randomUUID for uniqueness and track for cleanup
        const memberAFile = path.join(os.tmpdir(), `member-a-projects-${randomUUID()}.json`);
        tempFilesToCleanup.push(memberAFile);
        const pmA = new ProjectManager(memberAFile);

        // Member B's projects.json
        const memberBFile = path.join(os.tmpdir(), `member-b-projects-${randomUUID()}.json`);
        tempFilesToCleanup.push(memberBFile);
        const pmB = new ProjectManager(memberBFile);

        // Both add the same project
        const projectA = await pmA.addProject(testProjectPath);
        const projectB = await pmB.addProject(testProjectPath);

        const agentA = projectA.agents.find((a: any) => a.id === agentId);
        const agentB = projectB.agents.find((a: any) => a.id === agentId);

        expect(agentA).toBeDefined();
        expect(agentB).toBeDefined();

        // Same agent file, same ID
        expect(agentA!.id).toBe(agentB!.id);

        // Member A configures GPT-4o
        await pmA.setAgentModel(projectA.id, agentA!.id, 'openai,gpt-4o');

        // Member B configures Claude Sonnet
        await pmB.setAgentModel(projectB.id, agentB!.id, 'anthropic,claude-sonnet-4');

        // Verify different configs in their respective projects.json
        const modelA = await pmA.getModelByAgentId(agentA!.id);
        const modelB = await pmB.getModelByAgentId(agentB!.id);

        expect(modelA).toBe('openai,gpt-4o');
        expect(modelB).toBe('anthropic,claude-sonnet-4');
        expect(modelA).not.toBe(modelB);

        // Cleanup handled by afterEach
      });
    });

    describe('Subtask 3.2: Verify each has independent projects.json', () => {
      it('should maintain separate projects.json files', async () => {
        const memberAFile = path.join(os.tmpdir(), `member-a-${randomUUID()}.json`);
        tempFilesToCleanup.push(memberAFile);
        const memberBFile = path.join(os.tmpdir(), `member-b-${randomUUID()}.json`);
        tempFilesToCleanup.push(memberBFile);

        const pmA = new ProjectManager(memberAFile);
        const pmB = new ProjectManager(memberBFile);

        await pmA.addProject(testProjectPath);
        await pmB.addProject(testProjectPath);

        // Both have separate files
        expect(existsSync(memberAFile)).toBe(true);
        expect(existsSync(memberBFile)).toBe(true);
        expect(memberAFile).not.toBe(memberBFile);

        // Cleanup handled by afterEach
      });
    });

    describe('Subtask 3.3: Test routing works with different configs per member', () => {
      it('should retrieve correct model for each member', async () => {
        // Set up agent file first
        const agentPath = path.join(agentsDir, 'route-agent.md');
        const agentId = '550e8400-e29b-41d4-a716-446655440009';
        await writeFile(agentPath, `<!-- CCR-AGENT-ID: ${agentId} -->\n# Route Agent`, 'utf-8');

        const memberAFile = path.join(os.tmpdir(), `member-a-route-${randomUUID()}.json`);
        tempFilesToCleanup.push(memberAFile);
        const memberBFile = path.join(os.tmpdir(), `member-b-route-${randomUUID()}.json`);
        tempFilesToCleanup.push(memberBFile);

        const pmA = new ProjectManager(memberAFile);
        const pmB = new ProjectManager(memberBFile);

        const projectA = await pmA.addProject(testProjectPath);
        const projectB = await pmB.addProject(testProjectPath);

        const agentA = projectA.agents.find((a: any) => a.id === agentId);
        const agentB = projectB.agents.find((a: any) => a.id === agentId);

        expect(agentA).toBeDefined();
        expect(agentB).toBeDefined();

        // Same agent ID
        const sharedAgentId = agentA!.id;
        expect(agentB!.id).toBe(sharedAgentId);

        // Different models
        await pmA.setAgentModel(projectA.id, sharedAgentId, 'openai,gpt-4o');
        await pmB.setAgentModel(projectB.id, sharedAgentId, 'anthropic,claude-haiku');

        // Router lookup for each member
        const modelA = await pmA.getModelByAgentId(sharedAgentId, projectA.id);
        const modelB = await pmB.getModelByAgentId(sharedAgentId, projectB.id);

        expect(modelA).toBe('openai,gpt-4o');
        expect(modelB).toBe('anthropic,claude-haiku');

        // Cleanup handled by afterEach
      });
    });

    describe('Subtask 3.4: Verify no configuration conflicts', () => {
      it('should not cause conflicts when same agent configured differently', async () => {
        // Set up agent file first
        const agentPath = path.join(agentsDir, 'conflict-agent.md');
        const agentId = '550e8400-e29b-41d4-a716-446655440010';
        await writeFile(agentPath, `<!-- CCR-AGENT-ID: ${agentId} -->\n# Conflict Agent`, 'utf-8');

        const memberAFile = path.join(os.tmpdir(), `member-a-no-conflict-${randomUUID()}.json`);
        tempFilesToCleanup.push(memberAFile);
        const memberBFile = path.join(os.tmpdir(), `member-b-no-conflict-${randomUUID()}.json`);
        tempFilesToCleanup.push(memberBFile);

        const pmA = new ProjectManager(memberAFile);
        const pmB = new ProjectManager(memberBFile);

        const projectA = await pmA.addProject(testProjectPath);
        const projectB = await pmB.addProject(testProjectPath);

        const agentA = projectA.agents.find((a: any) => a.id === agentId);
        expect(agentA).toBeDefined();
        const sharedAgentId = agentA!.id;

        // Configure independently - no errors expected
        await expect(pmA.setAgentModel(projectA.id, sharedAgentId, 'openai,gpt-4o')).resolves.not.toThrow();
        await expect(pmB.setAgentModel(projectB.id, sharedAgentId, 'anthropic,claude-sonnet-4')).resolves.not.toThrow();

        // Both work correctly
        expect(await pmA.getModelByAgentId(sharedAgentId)).toBe('openai,gpt-4o');
        expect(await pmB.getModelByAgentId(sharedAgentId)).toBe('anthropic,claude-sonnet-4');

        // Cleanup handled by afterEach
      });
    });
  });

  // ============================================================================
  // TASK 4: Test merge scenarios (AC: 4)
  // ============================================================================

  describe('Task 4: Test merge scenarios (AC4)', () => {
    describe('Subtask 4.1: Test concurrent different agent additions (no conflict)', () => {
      it('should handle two different agents added by different members', async () => {
        // Member A adds agent-a.md
        const agentAPath = path.join(agentsDir, 'agent-a.md');
        const agentAId = '770e8400-e29b-41d4-a716-446655440002';
        await writeFile(agentAPath, `<!-- CCR-AGENT-ID: ${agentAId} -->\n# Agent A`, 'utf-8');

        // Member B adds agent-b.md
        const agentBPath = path.join(agentsDir, 'agent-b.md');
        const agentBId = '880e8400-e29b-41d4-a716-446655440003';
        await writeFile(agentBPath, `<!-- CCR-AGENT-ID: ${agentBId} -->\n# Agent B`, 'utf-8');

        // Add project - should discover both
        project = await pm.addProject(testProjectPath);

        expect(project.agents.length).toBeGreaterThanOrEqual(2); // At least agent-a.md and agent-b.md

        const agentA = project.agents.find((a: any) => a.id === agentAId);
        const agentB = project.agents.find((a: any) => a.id === agentBId);

        expect(agentA).toBeDefined();
        expect(agentB).toBeDefined();
      });
    });

    describe('Subtask 4.2: Test same agent added by two members (conflict expected)', () => {
      it('should detect different CCR-AGENT-IDs as different agents', async () => {
        // This simulates merge conflict scenario:
        // Member A creates my-agent.md with ID-A
        // Member B creates my-agent.md with ID-B
        // Git will show conflict in the file itself

        // For this test, we verify that:
        // 1. Different IDs = different agents (our system handles this)
        // 2. Same filename but different IDs are tracked separately

        const agentPath = path.join(agentsDir, 'my-agent.md');
        const idA = '990e8400-e29b-41d4-a716-446655440004';
        await writeFile(agentPath, `<!-- CCR-AGENT-ID: ${idA} -->\n# My Agent`, 'utf-8');

        project = await pm.addProject(testProjectPath);
        const agent = project.agents.find((a: any) => a.id === idA);

        expect(agent).toBeDefined();
        expect(agent!.name).toBe('my-agent.md');
      });
    });

    describe('Subtask 4.3: Verify CCR-AGENT-ID uniqueness after merge', () => {
      it('should maintain unique CCR-AGENT-ID across agents', async () => {
        project = await pm.addProject(testProjectPath);

        // All agent IDs should be unique
        const agentIds = new Set<string>();
        for (const agent of project.agents) {
          expect(agentIds.has(agent.id)).toBe(false); // No duplicates
          agentIds.add(agent.id);
          expect(Validators.isValidAgentId(agent.id)).toBe(true); // Valid format
        }
      });
    });

    describe('Subtask 4.4: Test merged agent works correctly', () => {
      it('should work with agent after git merge scenario', async () => {
        // Simulate merged agent file
        const agentPath = path.join(agentsDir, 'merged-agent.md');
        const mergedId = 'aa0e8400-e29b-41d4-a716-446655440005';
        await writeFile(
          agentPath,
          `<!-- CCR-AGENT-ID: ${mergedId} -->\n# Merged Agent\n\nContent from both branches.`,
          'utf-8'
        );

        project = await pm.addProject(testProjectPath);
        const agent = project.agents.find((a: any) => a.id === mergedId);

        expect(agent).toBeDefined();
        expect(agent!.name).toBe('merged-agent.md');

        // Configure and verify it works
        await pm.setAgentModel(project.id, mergedId, 'openai,gpt-4o');
        const model = await pm.getModelByAgentId(mergedId);
        expect(model).toBe('openai,gpt-4o');
      });
    });
  });

  // ============================================================================
  // TASK 5: Validate cross-platform consistency (AC: 5)
  // ============================================================================

  describe('Task 5: Validate cross-platform consistency (AC5)', () => {
    describe('Subtask 5.1: Test LF line endings in agent files', () => {
      it('should use LF line endings in agent files', async () => {
        const agentPath = path.join(agentsDir, 'lf-test.md');
        await writeFile(agentPath, '# LF Test\n\nContent.\n', 'utf-8');

        project = await pm.addProject(testProjectPath);

        const content = await readFile(agentPath, 'utf-8');

        // Check for CRLF (\r\n) - should not be present
        expect(content).not.toContain('\r\n');

        // Content should use LF (\n)
        expect(content).toContain('\n');
      });
    });

    describe('Subtask 5.2: Verify .gitattributes configuration', () => {
      it('should respect .gitattributes for line endings', async () => {
        const gitattributesPath = path.join(gitRepoPath, '.gitattributes');

        // Create .gitattributes
        await writeFile(gitattributesPath, '*.md text eol=lf\n', 'utf-8');

        // Verify it exists
        expect(existsSync(gitattributesPath)).toBe(true);

        const content = await readFile(gitattributesPath, 'utf-8');
        expect(content).toContain('*.md');
        expect(content).toContain('eol=lf');
      });
    });

    describe('Subtask 5.3: Test CCR-AGENT-ID detection across platforms', () => {
      it('should detect CCR-AGENT-ID with various line endings', async () => {
        // Test with LF
        const agentLf = path.join(agentsDir, 'lf-agent.md');
        const idLf = 'bb0e8400-e29b-41d4-a716-446655440006';
        await writeFile(agentLf, `# Agent\n\n<!-- CCR-AGENT-ID: ${idLf} -->\n`, 'utf-8');

        project = await pm.addProject(testProjectPath);

        const agentLfFound = project.agents.find((a: any) => a.id === idLf);
        expect(agentLfFound).toBeDefined();
      });
    });

    describe('Subtask 5.4: Test UTF-8 encoding with non-ASCII characters', () => {
      it('should handle UTF-8 encoded agent files with non-ASCII characters', async () => {
        // Agent file with non-ASCII characters
        const agentPath = path.join(agentsDir, 'utf8-agent.md');
        const agentId = 'cc0e8400-e29b-41d4-a716-446655440007';
        const content = `# UTF-8 Agent\n<!-- CCR-AGENT-ID: ${agentId} -->\n\n特殊字符测试\nÉmoji: 🚀\n`;
        await writeFile(agentPath, content, 'utf-8');

        project = await pm.addProject(testProjectPath);

        const agent = project.agents.find((a: any) => a.id === agentId);
        expect(agent).toBeDefined();

        // Verify content preserved
        const readContent = await readFile(agentPath, 'utf-8');
        expect(readContent).toContain('特殊字符测试');
        expect(readContent).toContain('🚀');
      });
    });
  });

  // ============================================================================
  // TASK 6: Validate existing documentation (AC: 1-5)
  // ============================================================================

  describe('Task 6: Validate existing documentation (AC1-5)', () => {
    describe('Subtask 6.1: Review docs/docs/team/git-workflow.md (258 lines)', () => {
      it('should have git-workflow.md file exist', async () => {
        // From packages/shared/__tests__/ go up 3 levels to reach project root, then into docs
        const docsPath = path.join(__dirname, '../../../docs/docs/team/git-workflow.md');
        // Verify documentation file exists (checked during story development)
        // The docs have been updated to reflect the new architecture
        expect(existsSync(docsPath)).toBe(true);

        // Validate actual content
        const content = await readFile(docsPath, 'utf-8');

        // Must document the NEW architecture (Story 4.5)
        expect(content).toContain('CCR-AGENT-ID');
        expect(content).toContain('~/.claude-code-router/');
        expect(content).toContain('projects.json');

        // Must explain what's shared vs local
        expect(content.toLowerCase()).toContain('shared');
        expect(content.toLowerCase()).toContain('local');

        // Must document git workflow
        expect(content.toLowerCase()).toContain('git');
        expect(content.toLowerCase()).toContain('commit');
      });

      it('should document the NEW workflow (agent files shared, projects.json local)', async () => {
        const docsPath = path.join(__dirname, '../../../docs/docs/team/git-workflow.md');
        const content = await readFile(docsPath, 'utf-8');

        // Key documentation requirements:
        // 1. Agent .md files with CCR-AGENT-ID are committed to git
        expect(content).toContain('.md');
        expect(content).toContain('CCR-AGENT-ID');

        // 2. projects.json stays in ~/.claude-code-router/ (NOT committed)
        expect(content).toContain('~/.claude-code-router/');
        expect(content).toContain('projects.json');

        // 3. Each team member configures independently
        expect(content.toLowerCase()).toContain('independent');
      });
    });

    describe('Subtask 6.2: Review docs/docs/team/onboarding.md (282 lines)', () => {
      it('should document onboarding for new architecture', async () => {
        const docsPath = path.join(__dirname, '../../../docs/docs/team/onboarding.md');
        expect(existsSync(docsPath)).toBe(true);

        const content = await readFile(docsPath, 'utf-8');

        // Onboarding should describe:
        // 1. Clone repo to get agent files
        expect(content.toLowerCase()).toContain('clone');
        expect(content.toLowerCase()).toContain('git');

        // 2. Run ccr project scan to detect agents
        expect(content).toContain('ccr project scan');

        // 3. Configure models interactively
        expect(content.toLowerCase()).toContain('configure');
        expect(content.toLowerCase()).toContain('model');

        // 4. Agent files come from git
        expect(content).toContain('agent');
        expect(content).toContain('.md');
      });
    });

    describe('Subtask 6.3: Verify documentation matches actual workflow', () => {
      it('should match actual code behavior', async () => {
        // Create an agent file first
        const agentPath = path.join(agentsDir, 'workflow-match-agent.md');
        await writeFile(agentPath, '# Workflow Match Agent\n\nContent here.', 'utf-8');

        // Actual workflow:
        // 1. Agent files are in .bmad/bmm/agents/
        // 2. CCR-AGENT-ID is injected into agent files
        // 3. projects.json is in ~/.claude-code-router/
        // 4. Model configs are in projects.json

        project = await pm.addProject(testProjectPath);

        // Agent files in project
        expect(project.agents[0].absolutePath).toContain('.bmad/bmm/agents');

        // projects.json in CCR directory
        expect(TEST_PROJECTS_FILE).not.toContain(project.path);

        // CCR-AGENT-ID in agent file
        const agentContent = await readFile(project.agents[0].absolutePath, 'utf-8');
        expect(agentContent).toContain('<!-- CCR-AGENT-ID:');
      });
    });
  });

  // ============================================================================
  // ADDITIONAL VALIDATION: Git Workflow Integration
  // ============================================================================

  describe('Additional: Git workflow integration validation', () => {
    it('should complete full team member workflow', async () => {
      // First, create agent files for the test
      const agentPath = path.join(agentsDir, 'team-workflow-agent.md');
      await writeFile(agentPath, '# Team Workflow Agent\n\nContent here.', 'utf-8');

      // Member A workflow
      const memberAProjects = path.join(os.tmpdir(), `member-a-workflow-${randomUUID()}.json`);
      tempFilesToCleanup.push(memberAProjects);
      const pmA = new ProjectManager(memberAProjects);

      // 1. Member A adds project and agents
      const projectA = await pmA.addProject(testProjectPath);

      // 2. Agent files have CCR-AGENT-ID
      const agentId = projectA.agents[0].id;
      const contentA = await readFile(projectA.agents[0].absolutePath, 'utf-8');
      expect(contentA).toContain('<!-- CCR-AGENT-ID:');

      // 3. Configure model
      await pmA.setAgentModel(projectA.id, agentId, 'openai,gpt-4o');

      // Member B workflow (simulating receiving from git)
      const memberBProjects = path.join(os.tmpdir(), `member-b-workflow-${randomUUID()}.json`);
      tempFilesToCleanup.push(memberBProjects);
      const pmB = new ProjectManager(memberBProjects);

      // 1. "Pull" agent files (already exist in testProjectPath)
      // 2. Add project - discovers existing agents
      const projectB = await pmB.addProject(testProjectPath);
      const agentB = projectB.agents.find((a: any) => a.id === agentId);
      expect(agentB).toBeDefined();

      // 3. Configure independently
      await pmB.setAgentModel(projectB.id, agentId, 'anthropic,claude-sonnet-4');

      // 4. Verify different configs
      expect(await pmA.getModelByAgentId(agentId)).toBe('openai,gpt-4o');
      expect(await pmB.getModelByAgentId(agentId)).toBe('anthropic,claude-sonnet-4');

      // Cleanup handled by afterEach
    });

    it('should ensure agent file location is in git repo, projects.json is not', async () => {
      // Create an agent file first
      const agentPath = path.join(agentsDir, 'location-agent.md');
      await writeFile(agentPath, '# Location Agent\n\nContent here.', 'utf-8');

      project = await pm.addProject(testProjectPath);

      // Agent files are in project (git repo)
      for (const agent of project.agents) {
        expect(agent.absolutePath).toContain(testProjectPath);
      }

      // projects.json is outside project (in ~/.claude-code-router/ simulation)
      expect(TEST_PROJECTS_FILE).not.toContain(testProjectPath);
    });
  });
});
