/**
 * Story 6.3: Workflow Model Lookup Tests
 * Standalone test file for workflow routing functionality
 */

import { ProjectManager } from '../src/projectManager';
import { rm, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

const TEST_PROJECTS_DIR = path.join(os.tmpdir(), 'test-ccr-workflows');
const TEST_PROJECTS_FILE = path.join(TEST_PROJECTS_DIR, 'projects.json');

describe('Story 6.3: Workflow Model Lookup', () => {
  beforeEach(async () => {
    // Clean up test directory before each test
    try {
      await rm(TEST_PROJECTS_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
    await mkdir(TEST_PROJECTS_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory after each test
    try {
      await rm(TEST_PROJECTS_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getModelByWorkflowId', () => {
    it('should return model for valid workflow ID in specific project', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const projectPath = path.join(TEST_PROJECTS_DIR, `test-workflow-project-${Date.now()}`);

      // Create project directory
      await mkdir(projectPath, { recursive: true });

      const projectData = await pm.addProject(projectPath);
      const projectId = projectData.id;
      const workflowId = uuidv4();

      // Add workflow with model
      const data = await pm.loadProjects();
      data.projects[projectId].workflows = [
        {
          id: workflowId,
          name: 'test-workflow',
          description: 'Test workflow',
          relativePath: '_bmad/bmm/workflows/test-workflow',
          absolutePath: projectPath + '/_bmad/bmm/workflows/test-workflow',
          model: 'openai,gpt-4o'
        }
      ];
      await pm['saveProjects'](data);

      const model = await pm.getModelByWorkflowId(workflowId, projectId);
      expect(model).toBe('openai,gpt-4o');
    });

    it('should return undefined for workflow not found', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const projectPath = path.join(TEST_PROJECTS_DIR, `test-workflow-project-${Date.now()}`);

      // Create project directory
      await mkdir(projectPath, { recursive: true });

      await pm.addProject(projectPath);
      const data = await pm.loadProjects();
      const projectId = Object.keys(data.projects)[0];

      const model = await pm.getModelByWorkflowId(uuidv4(), projectId);
      expect(model).toBeUndefined();
    });

    it('should return undefined for invalid workflow ID format', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const projectPath = path.join(TEST_PROJECTS_DIR, `test-workflow-project-${Date.now()}`);

      // Create project directory
      await mkdir(projectPath, { recursive: true });

      await pm.addProject(projectPath);
      const data = await pm.loadProjects();
      const projectId = Object.keys(data.projects)[0];

      const model = await pm.getModelByWorkflowId('not-a-uuid', projectId);
      expect(model).toBeUndefined();
    });

    it('should search across all projects when projectId not provided', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const projectPath = path.join(TEST_PROJECTS_DIR, `test-workflow-project-${Date.now()}`);

      // Create project directory
      await mkdir(projectPath, { recursive: true });

      const projectData = await pm.addProject(projectPath);
      const workflowId = uuidv4();

      // Add workflow with model
      const data = await pm.loadProjects();
      data.projects[projectData.id].workflows = [
        {
          id: workflowId,
          name: 'test-workflow',
          description: 'Test workflow',
          relativePath: '_bmad/bmm/workflows/test-workflow',
          absolutePath: projectPath + '/_bmad/bmm/workflows/test-workflow',
          model: 'anthropic,claude-sonnet-4'
        }
      ];
      await pm['saveProjects'](data);

      const model = await pm.getModelByWorkflowId(workflowId);
      expect(model).toBe('anthropic,claude-sonnet-4');
    });

    it('should return undefined for workflow with no model configured', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const projectPath = path.join(TEST_PROJECTS_DIR, `test-workflow-project-${Date.now()}`);

      // Create project directory
      await mkdir(projectPath, { recursive: true });

      const projectData = await pm.addProject(projectPath);
      const workflowId = uuidv4();

      // Add workflow without model
      const data = await pm.loadProjects();
      data.projects[projectData.id].workflows = [
        {
          id: workflowId,
          name: 'workflow-no-model',
          description: 'Workflow without model',
          relativePath: '_bmad/bmm/workflows/workflow-no-model',
          absolutePath: projectPath + '/_bmad/bmm/workflows/workflow-no-model'
        }
      ];
      await pm['saveProjects'](data);

      const model = await pm.getModelByWorkflowId(workflowId, projectData.id);
      expect(model).toBeUndefined();
    });
  });

  describe('detectProjectByWorkflowId', () => {
    it('should return project ID for workflow found in project', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const projectPath = path.join(TEST_PROJECTS_DIR, `test-workflow-detect-${Date.now()}`);

      // Create project directory
      await mkdir(projectPath, { recursive: true });

      const projectData = await pm.addProject(projectPath);
      const workflowId = uuidv4();

      // Add workflow
      const data = await pm.loadProjects();
      data.projects[projectData.id].workflows = [
        {
          id: workflowId,
          name: 'test-workflow',
          description: 'Test workflow',
          relativePath: '_bmad/bmm/workflows/test-workflow',
          absolutePath: projectPath + '/_bmad/bmm/workflows/test-workflow',
          model: 'openai,gpt-4o'
        }
      ];
      await pm['saveProjects'](data);

      const projectId = await pm.detectProjectByWorkflowId(workflowId);
      expect(projectId).toBe(projectData.id);
    });

    it('should return undefined for workflow not found in any project', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const projectPath = path.join(TEST_PROJECTS_DIR, `test-workflow-project-${Date.now()}`);

      // Create project directory
      await mkdir(projectPath, { recursive: true });

      await pm.addProject(projectPath);

      const projectId = await pm.detectProjectByWorkflowId(uuidv4());
      expect(projectId).toBeUndefined();
    });

    it('should return undefined for invalid workflow ID format', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);
      const projectPath = path.join(TEST_PROJECTS_DIR, `test-workflow-project-${Date.now()}`);

      // Create project directory
      await mkdir(projectPath, { recursive: true });

      await pm.addProject(projectPath);

      const projectId = await pm.detectProjectByWorkflowId('not-a-uuid');
      expect(projectId).toBeUndefined();
    });
  });
});
