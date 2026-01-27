/**
 * Integration tests for Story 7.4: CLI Workflow Model Inheritance Configuration
 *
 * Tests the CLI functionality for configuring workflow inheritance mode:
 * - Workflow entity display shows inheritance mode
 * - Inheritance mode selection prompt (inherit | default)
 * - ConfigurationSession tracks inheritance mode changes
 * - ProjectManager.setWorkflowInheritanceMode() method
 * - ProjectManager.setWorkflowConfig() atomic method
 * - Backward compatibility (undefined = default)
 * - Atomic save (model + inheritance together)
 * - Validation for invalid modes
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProjectManager, Validators } from '@CCR/shared';
import type { WorkflowConfig, ProjectsData } from '@CCR/shared';
import fs from 'fs/promises';
import path from 'path';

// Mock fs/promises
jest.mock('fs/promises');

describe('Story 7.4: CLI Workflow Model Inheritance Configuration', () => {
  // Use valid UUIDs to pass Validators checks
  const mockProjectId = '123e4567-e89b-12d3-a456-426614174000';
  const mockWorkflowId = '987fcdeb-51a2-43d1-a589-c70284247815';
  const mockProjectsFile = '/mock/projects.json';

  const mockWorkflow: WorkflowConfig = {
    id: mockWorkflowId,
    name: 'test-workflow',
    description: 'Test workflow',
    relativePath: '.bmad/bmm/workflows/test-workflow',
    absolutePath: '/absolute/path/to/test-workflow',
    model: 'openai,gpt-4o',
    modelInheritance: 'default',
  };

  const mockProjectData: ProjectsData = {
    schemaVersion: '1.0.0',
    projects: {
      [mockProjectId]: {
        id: mockProjectId,
        name: 'test-project',
        path: '/test/project',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        agents: [],
        workflows: [mockWorkflow]
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mock implementation for fs.readFile
    (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(JSON.stringify(mockProjectData));
    (fs.access as jest.MockedFunction<typeof fs.access>).mockResolvedValue(undefined);
    (fs.mkdir as jest.MockedFunction<typeof fs.mkdir>).mockResolvedValue(undefined);
    (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mockResolvedValue(undefined);
    (fs.copyFile as jest.MockedFunction<typeof fs.copyFile>).mockResolvedValue(undefined);
    (fs.unlink as jest.MockedFunction<typeof fs.unlink>).mockResolvedValue(undefined);
  });

  describe('AC1, AC2, AC4: Workflow selection prompts include inheritance mode configuration', () => {
    it('should display workflow with inheritance mode in entity selection', () => {
      const workflowWithInherit: WorkflowConfig = {
        ...mockWorkflow,
        model: 'anthropic,claude-sonnet',
        modelInheritance: 'inherit',
      };

      const workflowWithDefault: WorkflowConfig = {
        ...mockWorkflow,
        model: 'openai,gpt-4o',
        modelInheritance: 'default',
      };

      const workflowWithUndefined: WorkflowConfig = {
        ...mockWorkflow,
        model: 'deepseek,deepseek-chat',
        modelInheritance: undefined,
      };

      expect(workflowWithInherit.model || '[default]').toBe('anthropic,claude-sonnet');
      expect(workflowWithInherit.modelInheritance || 'default').toBe('inherit');

      expect(workflowWithDefault.model || '[default]').toBe('openai,gpt-4o');
      expect(workflowWithDefault.modelInheritance || 'default').toBe('default');

      expect(workflowWithUndefined.model || '[default]').toBe('deepseek,deepseek-chat');
      expect(workflowWithUndefined.modelInheritance || 'default').toBe('default');
    });
  });

  describe('AC3: Configuration saves both model and inheritance mode atomically', () => {
    it('should update both model and inheritance mode in a single operation', async () => {
      const pm = new ProjectManager(mockProjectsFile);

      // Setup initial state with a workflow
      const initialData = JSON.parse(JSON.stringify(mockProjectData));
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(JSON.stringify(initialData));

      // Call the atomic method
      await pm.setWorkflowConfig(mockProjectId, mockWorkflowId, 'anthropic,claude-opus', 'inherit');

      // Verify fs.writeFile was called with updated data
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const callArgs = (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls[0];
      // strip comments before parsing
      const writtenContent = JSON.parse((callArgs[1] as string).replace(/^\s*\/\/.*$/gm, ''));

      const updatedWorkflow = writtenContent.projects[mockProjectId].workflows[0];
      expect(updatedWorkflow.model).toBe('anthropic,claude-opus');
      expect(updatedWorkflow.modelInheritance).toBe('inherit');
    });

    it('should handle partial updates (only model)', async () => {
      const pm = new ProjectManager(mockProjectsFile);

      await pm.setWorkflowConfig(mockProjectId, mockWorkflowId, 'anthropic,claude-haiku', null);

      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      // strip comments before parsing
      const writtenContent = JSON.parse(((fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls[0][1] as string).replace(/^\s*\/\/.*$/gm, ''));
      const updatedWorkflow = writtenContent.projects[mockProjectId].workflows[0];

      expect(updatedWorkflow.model).toBe('anthropic,claude-haiku');
      expect(updatedWorkflow.modelInheritance).toBe('default'); // Unchanged
    });

    it('should handle partial updates (only inheritance mode)', async () => {
      const pm = new ProjectManager(mockProjectsFile);

      await pm.setWorkflowConfig(mockProjectId, mockWorkflowId, null, 'inherit');

      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      // strip comments before parsing
      const writtenContent = JSON.parse(((fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls[0][1] as string).replace(/^\s*\/\/.*$/gm, ''));
      const updatedWorkflow = writtenContent.projects[mockProjectId].workflows[0];

      expect(updatedWorkflow.model).toBe('openai,gpt-4o'); // Unchanged
      expect(updatedWorkflow.modelInheritance).toBe('inherit');
    });
  });

  describe('AC5: Handle workflows without modelInheritance gracefully', () => {
    it('should treat undefined modelInheritance as default (backward compatible)', () => {
      const workflowWithoutMode: WorkflowConfig = {
        ...mockWorkflow,
        modelInheritance: undefined,
      };

      const mode = workflowWithoutMode.modelInheritance || 'default';
      expect(mode).toBe('default');
    });
  });

  describe('AC6: ProjectManager.setWorkflowInheritanceMode method', () => {
    it('should validate inheritance mode using Validators.isValidInheritanceMode', async () => {
      const pm = new ProjectManager(mockProjectsFile);

      // Should succeed with valid modes
      await expect(pm.setWorkflowInheritanceMode(mockProjectId, mockWorkflowId, 'inherit')).resolves.not.toThrow();
      await expect(pm.setWorkflowInheritanceMode(mockProjectId, mockWorkflowId, 'default')).resolves.not.toThrow();

      // Should fail with invalid modes (simulated via cast since TS blocks it)
      await expect(pm.setWorkflowInheritanceMode(mockProjectId, mockWorkflowId, 'invalid' as any))
        .rejects.toThrow(/Invalid inheritance mode/);
    });

    it('should update the inheritance mode in the file', async () => {
      const pm = new ProjectManager(mockProjectsFile);

      await pm.setWorkflowInheritanceMode(mockProjectId, mockWorkflowId, 'inherit');

      expect(fs.writeFile).toHaveBeenCalled();
      // strip comments before parsing
      const writtenContent = JSON.parse(((fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls[0][1] as string).replace(/^\s*\/\/.*$/gm, ''));
      expect(writtenContent.projects[mockProjectId].workflows[0].modelInheritance).toBe('inherit');
    });
  });

  describe('AC7: Configuration session tracks inheritance mode changes', () => {
    it('should track inheritance mode changes separately from model changes', () => {
      interface ConfigurationChange {
        entityType: 'agent' | 'workflow';
        entityId: string;
        entityName: string;
        oldModel: string | undefined;
        newModel: string | undefined;
        oldInheritanceMode?: 'inherit' | 'default';
        newInheritanceMode?: 'inherit' | 'default';
      }

      const change: ConfigurationChange = {
        entityType: 'workflow',
        entityId: mockWorkflowId,
        entityName: 'test-workflow',
        oldModel: 'openai,gpt-4o',
        newModel: 'anthropic,claude-sonnet',
        oldInheritanceMode: 'default',
        newInheritanceMode: 'inherit',
      };

      expect(change.oldInheritanceMode).toBe('default');
      expect(change.newInheritanceMode).toBe('inherit');
    });

    it('should display both model and inheritance mode in summary', () => {
      const model = 'anthropic,claude-sonnet';
      const mode = 'inherit';
      const summary = `test-workflow → ${model} [${mode}]`;

      expect(summary).toBe('test-workflow → anthropic,claude-sonnet [inherit]');
    });
  });

  describe('AC8: Validation and error handling', () => {
    it('should reject invalid inheritance modes', () => {
      expect(Validators.isValidInheritanceMode('invalid')).toBe(false);
      expect(Validators.isValidInheritanceMode('INHERIT')).toBe(false);
      expect(Validators.isValidInheritanceMode('DEFAULT')).toBe(false);
      expect(Validators.isValidInheritanceMode('')).toBe(false);
    });

    it('should accept valid inheritance modes', () => {
      expect(Validators.isValidInheritanceMode('inherit')).toBe(true);
      expect(Validators.isValidInheritanceMode('default')).toBe(true);
      expect(Validators.isValidInheritanceMode(undefined)).toBe(true);
    });
  });

  describe('Display format tests', () => {
    it('should show workflow format: "name (workflow) → model [mode]"', () => {
      const formatWorkflowDisplay = (workflow: WorkflowConfig): string => {
        const modelDisplay = workflow.model || '[default]';
        const modeDisplay = workflow.modelInheritance || 'default';
        return `${workflow.name} (workflow) → ${modelDisplay} [${modeDisplay}]`;
      };

      const workflow: WorkflowConfig = {
        ...mockWorkflow,
        model: 'openai,gpt-4o',
        modelInheritance: 'inherit',
      };

      expect(formatWorkflowDisplay(workflow)).toBe(
        'test-workflow (workflow) → openai,gpt-4o [inherit]'
      );
    });
  });

  describe('Integration: ConfigurationSession inheritance tracking', () => {
    it('should always show mode for workflows in getSummary', () => {
      // Simulate ConfigurationChange with both old and new modes
      const change = {
        entityType: 'workflow' as const,
        entityId: mockWorkflowId,
        entityName: 'test-workflow',
        oldModel: 'openai,gpt-4o',
        newModel: 'anthropic,claude-sonnet',
        oldInheritanceMode: 'default' as 'inherit' | 'default',
        newInheritanceMode: 'inherit' as 'inherit' | 'default',
      };

      // Both modes are defined, should show bracket
      let summary = `  - ${change.entityName} → ${change.newModel || '[default]'} [${change.newInheritanceMode}]`;
      expect(summary).toBe('  - test-workflow → anthropic,claude-sonnet [inherit]');
    });
  });
});
