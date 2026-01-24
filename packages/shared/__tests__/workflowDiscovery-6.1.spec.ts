/**
 * Unit Tests for Story 6.1: Workflow Discovery & Scanning
 *
 * Tests the scanWorkflows() method in ProjectManager
 *
 * @see claude-code-router/packages/shared/src/projectManager.ts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProjectManager } from '../src/projectManager';

/**
 * Test data directory
 */
const TEST_DATA_DIR = path.join(os.tmpdir(), 'ccr-workflow-test');

/**
 * Setup test environment
 */
beforeEach(async () => {
  // Create test data directory
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('[Story 6.1] Workflow Discovery', () => {
  describe('scanWorkflows() - Basic Functionality', () => {
    it('should return empty array when workflows directory does not exist', async () => {
      // Arrange: Create a project without workflows directory
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      await fs.mkdir(testProjectPath, { recursive: true });

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should return empty array
      expect(workflows).toEqual([]);
    });

    it('should discover workflow.yaml files in workflows directory', async () => {
      // Arrange: Create project with workflow directory and workflow.yaml
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Test Workflow
description: A test workflow for unit testing
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should discover one workflow
      expect(workflows).toHaveLength(1);
      expect(workflows[0].name).toBe('Test Workflow');
      expect(workflows[0].description).toBe('A test workflow for unit testing');
      expect(workflows[0].relativePath).toBe('_bmad/bmm/workflows/test-workflow');
    });

    it('should extract name and description from workflow.yaml', async () => {
      // Arrange: Create workflow with name and description
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'my-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: My Custom Workflow
description: This is a custom workflow description
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should extract name and description correctly
      expect(workflows[0].name).toBe('My Custom Workflow');
      expect(workflows[0].description).toBe('This is a custom workflow description');
    });

    it('should handle multiple workflows in the same project', async () => {
      // Arrange: Create multiple workflows
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');

      // Create workflow 1
      const workflow1Dir = path.join(workflowsDir, 'workflow-1');
      await fs.mkdir(workflow1Dir, { recursive: true });
      await fs.writeFile(
        path.join(workflow1Dir, 'workflow.yaml'),
        'name: Workflow 1\ndescription: First workflow\n',
        'utf-8'
      );

      // Create workflow 2
      const workflow2Dir = path.join(workflowsDir, 'workflow-2');
      await fs.mkdir(workflow2Dir, { recursive: true });
      await fs.writeFile(
        path.join(workflow2Dir, 'workflow.yaml'),
        'name: Workflow 2\ndescription: Second workflow\n',
        'utf-8'
      );

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should discover both workflows (order may vary by filesystem)
      expect(workflows).toHaveLength(2);
      const workflowNames = workflows.map((w: any) => w.name).sort();
      expect(workflowNames).toEqual(['Workflow 1', 'Workflow 2']);
    });
  });

  describe('scanWorkflows() - Error Handling', () => {
    it('should handle malformed YAML gracefully', async () => {
      // Arrange: Create workflow with invalid YAML
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'bad-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      // Use truly invalid YAML (unmatched brackets)
      const invalidYaml = `name: Test Workflow
description: [invalid: yaml: syntax
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), invalidYaml, 'utf-8');

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should skip malformed workflow and return empty array
      expect(workflows).toEqual([]);
    });

    it('should handle missing workflow.yaml gracefully', async () => {
      // Arrange: Create workflow directory without workflow.yaml
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'empty-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should skip directory without workflow.yaml
      expect(workflows).toEqual([]);
    });

    it('should use workflow directory name as fallback when name is missing', async () => {
      // Arrange: Create workflow.yaml without name field
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'fallback-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `description: Workflow without name
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should use directory name as workflow name
      expect(workflows).toHaveLength(1);
      expect(workflows[0].name).toBe('fallback-workflow');
    });

    it('should handle empty description gracefully', async () => {
      // Arrange: Create workflow.yaml without description
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'no-desc-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Workflow Without Description
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should handle missing description
      expect(workflows).toHaveLength(1);
      expect(workflows[0].description).toBe('');
    });
  });

  describe('scanWorkflows() - Edge Cases', () => {
    it('should set empty string for workflow ID (Story 6.2 will inject)', async () => {
      // Arrange: Create valid workflow
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Test Workflow\ndescription: Test\n`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: ID should be empty string (will be injected in Story 6.2)
      expect(workflows[0].id).toBe('');
    });

    it('should generate correct absolute path for workflow', async () => {
      // Arrange: Create workflow
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'absolute-path-test');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Test Workflow\ndescription: Test\n`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan for workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Absolute path should point to workflow directory
      expect(workflows[0].absolutePath).toBe(testWorkflowDir);
    });
  });

  describe('ProjectConfig - Workflow Integration', () => {
    it('should include workflows in project config when adding project', async () => {
      // Arrange: Create project with workflows
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Test Workflow\ndescription: Test workflow\n`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Add project (which includes workflow scanning)
      const project = await pm.addProject(testProjectPath);

      // Assert: Project should have workflows array
      expect(project.workflows).toBeDefined();
      expect(project.workflows).toHaveLength(1);
      expect(project.workflows![0].name).toBe('Test Workflow');
    });

    it('should include workflows in scanProject result', async () => {
      // Arrange: Add project with workflows
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Test Workflow\ndescription: Test\n`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      const project = await pm.addProject(testProjectPath);

      // Act: Scan project again
      const updatedProject = await pm.scanProject(project.id);

      // Assert: Workflows should be included
      expect(updatedProject.workflows).toBeDefined();
      expect(updatedProject.workflows).toHaveLength(1);
    });
  });
});
