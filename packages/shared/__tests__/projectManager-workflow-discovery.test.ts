import { ProjectManager } from '../src/projectManager';
import { rm, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const TEST_PROJECTS_DIR = path.join(os.tmpdir(), 'test-ccr-workflow-projects');
const TEST_PROJECTS_FILE = path.join(TEST_PROJECTS_DIR, 'projects.json');

describe('ProjectManager - Workflow Discovery (Story 6.1)', () => {
  let testProjectPath: string;
  let workflowsDir: string;

  beforeEach(async () => {
    // Create test projects directory
    await mkdir(TEST_PROJECTS_DIR, { recursive: true });

    // Clean up test file before each test
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }

    // Create test project structure
    testProjectPath = path.join(os.tmpdir(), `test-workflow-project-${Date.now()}`);
    workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
    await mkdir(workflowsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    if (existsSync(TEST_PROJECTS_FILE)) {
      await rm(TEST_PROJECTS_FILE);
    }
    if (existsSync(testProjectPath)) {
      await rm(testProjectPath, { recursive: true, force: true });
    }
  });

  describe('scanWorkflows', () => {
    it('should discover workflows from workflow.yaml files', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create test workflow
      const workflowDir = path.join(workflowsDir, 'test-workflow');
      await mkdir(workflowDir, { recursive: true });
      await writeFile(
        path.join(workflowDir, 'workflow.yaml'),
        'name: test-workflow\ndescription: A test workflow\n',
        'utf-8'
      );

      // Add and scan project
      const project = await pm.addProject(testProjectPath);

      expect(project.workflows).toBeDefined();
      expect(project.workflows.length).toBe(1);
      expect(project.workflows[0].name).toBe('test-workflow');
      expect(project.workflows[0].description).toBe('A test workflow');
      expect(project.workflows[0].relativePath).toContain('_bmad/bmm/workflows/test-workflow');
    });

    it('should discover multiple workflows', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create multiple workflows
      const workflow1Dir = path.join(workflowsDir, 'workflow-1');
      await mkdir(workflow1Dir, { recursive: true });
      await writeFile(
        path.join(workflow1Dir, 'workflow.yaml'),
        'name: workflow-1\ndescription: First workflow\n',
        'utf-8'
      );

      const workflow2Dir = path.join(workflowsDir, 'workflow-2');
      await mkdir(workflow2Dir, { recursive: true });
      await writeFile(
        path.join(workflow2Dir, 'workflow.yaml'),
        'name: workflow-2\ndescription: Second workflow\n',
        'utf-8'
      );

      // Add and scan project
      const project = await pm.addProject(testProjectPath);

      expect(project.workflows.length).toBe(2);
      const workflowNames = project.workflows.map(w => w.name).sort();
      expect(workflowNames).toEqual(['workflow-1', 'workflow-2']);
    });

    it('should return empty array when no workflows directory exists', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Remove workflows directory
      await rm(workflowsDir, { recursive: true, force: true });

      // Add project without workflows
      const project = await pm.addProject(testProjectPath);

      expect(project.workflows).toBeDefined();
      expect(project.workflows.length).toBe(0);
    });

    it('should handle malformed workflow.yaml gracefully', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create valid workflow
      const validWorkflowDir = path.join(workflowsDir, 'valid-workflow');
      await mkdir(validWorkflowDir, { recursive: true });
      await writeFile(
        path.join(validWorkflowDir, 'workflow.yaml'),
        'name: valid-workflow\ndescription: Valid workflow\n',
        'utf-8'
      );

      // Create malformed workflow
      const malformedWorkflowDir = path.join(workflowsDir, 'malformed-workflow');
      await mkdir(malformedWorkflowDir, { recursive: true });
      await writeFile(
        path.join(malformedWorkflowDir, 'workflow.yaml'),
        'invalid: yaml: content: [[[',
        'utf-8'
      );

      // Add and scan project
      const project = await pm.addProject(testProjectPath);

      // Should only discover the valid workflow
      expect(project.workflows.length).toBe(1);
      expect(project.workflows[0].name).toBe('valid-workflow');
    });

    it('should use directory name as fallback when name is missing', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create workflow without name field
      const workflowDir = path.join(workflowsDir, 'unnamed-workflow');
      await mkdir(workflowDir, { recursive: true });
      await writeFile(
        path.join(workflowDir, 'workflow.yaml'),
        'description: Workflow without name\n',
        'utf-8'
      );

      // Add and scan project
      const project = await pm.addProject(testProjectPath);

      expect(project.workflows.length).toBe(1);
      expect(project.workflows[0].name).toBe('unnamed-workflow');
      expect(project.workflows[0].description).toBe('Workflow without name');
    });

    it('should store workflows in projects.json', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create test workflow
      const workflowDir = path.join(workflowsDir, 'stored-workflow');
      await mkdir(workflowDir, { recursive: true });
      await writeFile(
        path.join(workflowDir, 'workflow.yaml'),
        'name: stored-workflow\ndescription: Workflow to be stored\n',
        'utf-8'
      );

      // Add project
      await pm.addProject(testProjectPath);

      // Load projects.json and verify workflows are stored
      const data = await pm.loadProjects();
      const projects = Object.values(data.projects);
      expect(projects.length).toBe(1);
      expect(projects[0].workflows).toBeDefined();
      expect(projects[0].workflows.length).toBe(1);
      expect(projects[0].workflows[0].name).toBe('stored-workflow');
    });

    it('should initialize empty workflows array for backward compatibility', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Create project without workflows directory
      await rm(workflowsDir, { recursive: true, force: true });

      // Add project
      const project = await pm.addProject(testProjectPath);

      expect(project.workflows).toBeDefined();
      expect(Array.isArray(project.workflows)).toBe(true);
      expect(project.workflows.length).toBe(0);
    });
  });

  describe('scanProject with workflows', () => {
    it('should update workflows when rescanning project', async () => {
      const pm = new ProjectManager(TEST_PROJECTS_FILE);

      // Add project initially without workflows
      await rm(workflowsDir, { recursive: true, force: true });
      const project = await pm.addProject(testProjectPath);
      expect(project.workflows.length).toBe(0);

      // Create workflow after initial scan
      await mkdir(workflowsDir, { recursive: true });
      const workflowDir = path.join(workflowsDir, 'new-workflow');
      await mkdir(workflowDir, { recursive: true });
      await writeFile(
        path.join(workflowDir, 'workflow.yaml'),
        'name: new-workflow\ndescription: Newly added workflow\n',
        'utf-8'
      );

      // Rescan project
      const updatedProject = await pm.scanProject(project.id);

      expect(updatedProject.workflows.length).toBe(1);
      expect(updatedProject.workflows[0].name).toBe('new-workflow');
    });
  });
});
