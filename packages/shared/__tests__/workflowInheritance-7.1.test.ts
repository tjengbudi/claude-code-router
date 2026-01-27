/**
 * Story 7.1: WorkflowConfig modelInheritance Tests
 * Simple 2-mode inheritance system: inherit vs default
 *
 * Tests focus on:
 * - ModelInheritanceMode type validation
 * - WorkflowConfig with modelInheritance field
 * - Validators.isValidInheritanceMode() helper
 */

import { describe, it, expect } from '@jest/globals';
import { Validators } from '../src/validation';
import type { WorkflowConfig, ModelInheritanceMode } from '../src/types/agent';

describe('Story 7.1: WorkflowConfig modelInheritance', () => {
  describe('ModelInheritanceMode type', () => {
    it('should accept "inherit" mode', () => {
      const mode: ModelInheritanceMode = 'inherit';
      expect(Validators.isValidInheritanceMode(mode)).toBe(true);
    });

    it('should accept "default" mode', () => {
      const mode: ModelInheritanceMode = 'default';
      expect(Validators.isValidInheritanceMode(mode)).toBe(true);
    });

    it('should accept undefined (defaults to "default" mode)', () => {
      expect(Validators.isValidInheritanceMode(undefined)).toBe(true);
    });

    it('should reject invalid modes', () => {
      expect(Validators.isValidInheritanceMode('specific')).toBe(false);
      expect(Validators.isValidInheritanceMode('invalid')).toBe(false);
      expect(Validators.isValidInheritanceMode('auto')).toBe(false);
      expect(Validators.isValidInheritanceMode('')).toBe(false);
    });
  });

  describe('WorkflowConfig validation with modelInheritance', () => {
    const baseWorkflow = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'party-mode',
      description: 'Collaborative brainstorming',
      relativePath: '.bmad/bmm/workflows/party-mode',
      absolutePath: '/home/user/project/.bmad/bmm/workflows/party-mode',
      model: 'openai,gpt-4o',
    };

    it('should validate workflow with inherit mode', () => {
      const workflow: WorkflowConfig = {
        ...baseWorkflow,
        modelInheritance: 'inherit',
      };
      expect(Validators.isValidWorkflowConfig(workflow)).toBe(true);
    });

    it('should validate workflow with default mode', () => {
      const workflow: WorkflowConfig = {
        ...baseWorkflow,
        modelInheritance: 'default',
      };
      expect(Validators.isValidWorkflowConfig(workflow)).toBe(true);
    });

    it('should validate workflow without modelInheritance (backward compatible)', () => {
      const workflow: WorkflowConfig = {
        ...baseWorkflow,
        // modelInheritance omitted - defaults to 'default' mode
      };
      expect(Validators.isValidWorkflowConfig(workflow)).toBe(true);
    });

    it('should reject workflow with invalid modelInheritance', () => {
      const workflow = {
        ...baseWorkflow,
        modelInheritance: 'invalid-mode',
      };
      expect(Validators.isValidWorkflowConfig(workflow)).toBe(false);
    });
  });

  describe('Backward compatibility', () => {
    it('should treat undefined modelInheritance as valid (defaults to "default")', () => {
      const workflow = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'old-workflow',
        description: 'Old workflow without inheritance config',
        relativePath: '.bmad/bmm/workflows/old-workflow',
        absolutePath: '/home/user/project/.bmad/bmm/workflows/old-workflow',
        model: 'openai,gpt-4o',
        // No modelInheritance field
      };
      expect(Validators.isValidWorkflowConfig(workflow)).toBe(true);
    });
  });
});
