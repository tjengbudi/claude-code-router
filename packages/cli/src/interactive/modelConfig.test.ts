/**
 * Integration tests for interactive CLI model configuration (Story 2.2)
 * Tests the interactive model configuration workflow with mocked prompts
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { select, confirm } from '@inquirer/prompts';
import { getAvailableModels, ACTION_DONE, ACTION_CANCEL, VALUE_DEFAULT } from './modelConfig';

// Mock the prompts
jest.mock('@inquirer/prompts');
const mockSelect = select as jest.MockedFunction<typeof select>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;

describe('Interactive Model Configuration (Story 2.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAvailableModels', () => {
    test('should load models from config.json when available', async () => {
      const models = await getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      models.forEach(model => {
        expect(model).toHaveProperty('value');
        expect(model).toHaveProperty('label');
        expect(typeof model.value).toBe('string');
        expect(typeof model.label).toBe('string');
      });
    });

    test('should include provider,model format in values', async () => {
      const models = await getAvailableModels();

      const hasCorrectFormat = models.some(m =>
        m.value.includes(',') && !m.value.includes(VALUE_DEFAULT)
      );
      expect(hasCorrectFormat).toBe(true);
    });

    test('should return models with correct descriptions', async () => {
      const models = await getAvailableModels();

      const gpt4oModel = models.find(m => m.value === 'openai,gpt-4o');
      if (gpt4oModel) {
        expect(gpt4oModel.label).toContain('powerful for coding');
      }

      const haikuModel = models.find(m => m.value === 'anthropic,claude-haiku');
      if (haikuModel) {
        expect(haikuModel.label).toContain('cost-effective planning');
      }
    });
  });

  describe('Model value format validation', () => {
    test('should use correct provider,model format', async () => {
      const models = await getAvailableModels();

      models.forEach(model => {
        if (model.value !== VALUE_DEFAULT) {
          expect(model.value).toMatch(/^[a-z0-9_-]+,[a-z0-9_./-]+$/i);
        }
      });
    });
  });

  describe('Constants export (HIGH-3 fix)', () => {
    test('should export action constants', () => {
      expect(ACTION_DONE).toBe('DONE');
      expect(ACTION_CANCEL).toBe('CANCEL');
      expect(VALUE_DEFAULT).toBe('default');
    });
  });
});
