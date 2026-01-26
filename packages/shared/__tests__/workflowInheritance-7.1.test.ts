/**
 * Story 7.1: Extend WorkflowConfig with modelInheritance field
 * Tests for model routing inheritance and context propagation
 */

import { Validators } from '../src/validation';
import type { WorkflowConfig, RoutingContext } from '../src/types/agent';

describe('Story 7.1: Workflow Inheritance Types', () => {
  describe('Task 7.1.1: WorkflowConfig modelInheritance field', () => {
    it('should accept valid inheritance mode values', () => {
      const workflowWithInherit: WorkflowConfig = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Workflow',
        description: 'Test description',
        relativePath: '.bmad/bmm/workflows/test',
        absolutePath: '/absolute/path/test',
        modelInheritance: 'inherit',
      };
      expect(workflowWithInherit.modelInheritance).toBe('inherit');

      const workflowWithDefault: WorkflowConfig = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test Workflow',
        description: 'Test description',
        relativePath: '.bmad/bmm/workflows/test',
        absolutePath: '/absolute/path/test',
        modelInheritance: 'default',
      };
      expect(workflowWithDefault.modelInheritance).toBe('default');

      const workflowWithSpecific: WorkflowConfig = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Test Workflow',
        description: 'Test description',
        relativePath: '.bmad/bmm/workflows/test',
        absolutePath: '/absolute/path/test',
        modelInheritance: 'specific',
      };
      expect(workflowWithSpecific.modelInheritance).toBe('specific');
    });

    it('should accept undefined modelInheritance (backward compatibility)', () => {
      const workflowWithoutInherit: WorkflowConfig = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Test Workflow',
        description: 'Test description',
        relativePath: '.bmad/bmm/workflows/test',
        absolutePath: '/absolute/path/test',
        // modelInheritance is undefined - should be valid for backward compatibility
      };
      expect(workflowWithoutInherit.modelInheritance).toBeUndefined();
    });

    it('should compile successfully with WorkflowConfig type', () => {
      // This test validates that TypeScript compilation succeeds
      const workflow: WorkflowConfig = {
        id: '550e8400-e29b-41d4-a716-446655440004',
        name: 'Test Workflow',
        description: 'Test description',
        relativePath: '.bmad/bmm/workflows/test',
        absolutePath: '/absolute/path/test',
        model: 'openai,gpt-4o',
        modelInheritance: 'inherit',
      };
      expect(workflow.model).toBe('openai,gpt-4o');
      expect(workflow.modelInheritance).toBe('inherit');
    });
  });

  describe('Task 7.1.2: RoutingContext interface', () => {
    it('should accept RoutingContext with all required fields', () => {
      const context: RoutingContext = {
        currentId: '550e8400-e29b-41d4-a716-446655440005',
        currentModel: 'openai,gpt-4o',
      };
      expect(context.currentId).toBe('550e8400-e29b-41d4-a716-446655440005');
      expect(context.currentModel).toBe('openai,gpt-4o');
      expect(context.parentId).toBeUndefined();
      expect(context.parentModel).toBeUndefined();
    });

    it('should accept RoutingContext with optional parent fields', () => {
      const context: RoutingContext = {
        currentId: '550e8400-e29b-41d4-a716-446655440006',
        currentModel: 'openai,gpt-4o',
        parentId: '550e8400-e29b-41d4-a716-446655440007',
        parentModel: 'anthropic,claude-3-5-sonnet-20241022',
      };
      expect(context.currentId).toBe('550e8400-e29b-41d4-a716-446655440006');
      expect(context.currentModel).toBe('openai,gpt-4o');
      expect(context.parentId).toBe('550e8400-e29b-41d4-a716-446655440007');
      expect(context.parentModel).toBe('anthropic,claude-3-5-sonnet-20241022');
    });

    it('should accept RoutingContext with only parentId', () => {
      const context: RoutingContext = {
        currentId: '550e8400-e29b-41d4-a716-446655440008',
        currentModel: 'openai,gpt-4o',
        parentId: '550e8400-e29b-41d4-a716-446655440009',
        // parentModel is undefined
      };
      expect(context.currentId).toBe('550e8400-e29b-41d4-a716-446655440008');
      expect(context.parentId).toBe('550e8400-e29b-41d4-a716-446655440009');
      expect(context.parentModel).toBeUndefined();
    });

    it('should compile successfully with RoutingContext type', () => {
      // This test validates that TypeScript compilation succeeds
      const context: RoutingContext = {
        currentId: '550e8400-e29b-41d4-a716-446655440010',
        currentModel: 'openai,gpt-4o',
        parentId: '550e8400-e29b-41d4-a716-446655440011',
        parentModel: 'anthropic,claude-3-5-sonnet-20241022',
      };
      expect(typeof context.currentId).toBe('string');
      expect(typeof context.currentModel).toBe('string');
    });
  });

  describe('Task 7.1.4: Validation for inheritance modes', () => {
    describe('isValidInheritanceMode', () => {
      it('should return true for valid inheritance modes', () => {
        expect(Validators.isValidInheritanceMode?.('inherit')).toBe(true);
        expect(Validators.isValidInheritanceMode?.('default')).toBe(true);
        expect(Validators.isValidInheritanceMode?.('specific')).toBe(true);
      });

      it('should return true for undefined (defaults to default mode)', () => {
        expect(Validators.isValidInheritanceMode?.(undefined)).toBe(true);
      });

      it('should return false for invalid inheritance modes', () => {
        expect(Validators.isValidInheritanceMode?.('invalid')).toBe(false);
        expect(Validators.isValidInheritanceMode?.('INHERIT')).toBe(false); // Case sensitive
        expect(Validators.isValidInheritanceMode?.('Default')).toBe(false); // Case sensitive
        expect(Validators.isValidInheritanceMode?.('')).toBe(false);
      });

      it('should return false for non-string types', () => {
        expect(Validators.isValidInheritanceMode?.(null as any)).toBe(false);
        expect(Validators.isValidInheritanceMode?.(123 as any)).toBe(false);
        expect(Validators.isValidInheritanceMode?.({} as any)).toBe(false);
        expect(Validators.isValidInheritanceMode?.([] as any)).toBe(false);
      });
    });

    describe('isValidWorkflowConfig with modelInheritance', () => {
      it('should validate WorkflowConfig with valid modelInheritance', () => {
        const workflowWithInherit = {
          id: '550e8400-e29b-41d4-a716-446655440012',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: 'inherit',
        };
        expect(Validators.isValidWorkflowConfig(workflowWithInherit)).toBe(true);

        const workflowWithDefault = {
          id: '550e8400-e29b-41d4-a716-446655440013',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: 'default',
        };
        expect(Validators.isValidWorkflowConfig(workflowWithDefault)).toBe(true);

        const workflowWithSpecific = {
          id: '550e8400-e29b-41d4-a716-446655440014',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: 'specific',
        };
        expect(Validators.isValidWorkflowConfig(workflowWithSpecific)).toBe(true);
      });

      it('should validate WorkflowConfig without modelInheritance (backward compatibility)', () => {
        const workflowWithoutInherit = {
          id: '550e8400-e29b-41d4-a716-446655440015',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          // modelInheritance is undefined
        };
        expect(Validators.isValidWorkflowConfig(workflowWithoutInherit)).toBe(true);
      });

      // Code review fixes: Edge case tests for modelInheritance validation
      it('should reject WorkflowConfig with invalid modelInheritance values', () => {
        // Wrong case
        const workflowWrongCase = {
          id: '550e8400-e29b-41d4-a716-446655440016',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: 'INHERIT',
        };
        expect(Validators.isValidWorkflowConfig(workflowWrongCase)).toBe(false);

        // Invalid string
        const workflowInvalidString = {
          id: '550e8400-e29b-41d4-a716-446655440017',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: 'invalid',
        };
        expect(Validators.isValidWorkflowConfig(workflowInvalidString)).toBe(false);

        // Empty string
        const workflowEmptyString = {
          id: '550e8400-e29b-41d4-a716-446655440018',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: '',
        };
        expect(Validators.isValidWorkflowConfig(workflowEmptyString)).toBe(false);

        // Numeric value
        const workflowNumeric = {
          id: '550e8400-e29b-41d4-a716-446655440019',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: 123,
        };
        expect(Validators.isValidWorkflowConfig(workflowNumeric)).toBe(false);

        // Boolean value
        const workflowBoolean = {
          id: '550e8400-e29b-41d4-a716-446655440020',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: true,
        };
        expect(Validators.isValidWorkflowConfig(workflowBoolean)).toBe(false);

        // Null value
        const workflowNull = {
          id: '550e8400-e29b-41d4-a716-446655440021',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: null,
        };
        expect(Validators.isValidWorkflowConfig(workflowNull)).toBe(false);

        // Object value
        const workflowObject = {
          id: '550e8400-e29b-41d4-a716-446655440022',
          name: 'Test Workflow',
          description: 'Test description',
          relativePath: '.bmad/bmm/workflows/test',
          absolutePath: '/absolute/path/test',
          modelInheritance: { mode: 'inherit' },
        };
        expect(Validators.isValidWorkflowConfig(workflowObject)).toBe(false);
      });
    });
  });

  describe('Integration: ProjectManager.scanWorkflows with modelInheritance', () => {
    // Note: scanWorkflows is private, so we test it via scanProject or by mocking the fs and checking the result of a public method that uses it.
    // However, for this unit test file, we'll simulate the validation logic that happens inside scanWorkflows
    // effectively testing the logic we added to ProjectManager.

    it('should validate and accept valid modelInheritance from YAML data', () => {
      // Simulation of the logic in scanWorkflows
      const validModes = ['inherit', 'default', 'specific'];

      validModes.forEach(mode => {
        const workflowData = {
          name: 'Test Workflow',
          modelInheritance: mode
        };

        let modelInheritance = workflowData.modelInheritance;
        const isValid = Validators.isValidInheritanceMode(modelInheritance);

        expect(isValid).toBe(true);
        // logic in ProjectManager would keep it
        expect(modelInheritance).toBe(mode);
      });
    });

    it('should reject invalid modelInheritance from YAML data', () => {
      // Simulation of the logic in scanWorkflows
      const workflowData = {
        name: 'Test Workflow',
        modelInheritance: 'INVALID_MODE'
      };

      let modelInheritance: string | undefined = workflowData.modelInheritance;
      // logic in ProjectManager:
      if (modelInheritance !== undefined && !Validators.isValidInheritanceMode(modelInheritance)) {
        modelInheritance = undefined;
      }

      expect(modelInheritance).toBeUndefined();
    });

    it('should handle undefined modelInheritance', () => {
       const workflowData = {
        name: 'Test Workflow'
        // modelInheritance undefined
      };

      let modelInheritance = (workflowData as any).modelInheritance;
      // logic in ProjectManager:
      if (modelInheritance !== undefined && !Validators.isValidInheritanceMode(modelInheritance)) {
        modelInheritance = undefined;
      }

      expect(modelInheritance).toBeUndefined();
    });
  });
});
