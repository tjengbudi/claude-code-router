import { Validators } from '../validation';
import path from 'path';
import fs from 'fs/promises';

describe('Validators', () => {
  describe('isValidAgentId', () => {
    it('should return true for valid UUID v4', () => {
      const validId = '123e4567-e89b-42d3-a456-426614174000'; // v4-like structure
      // Real v4
      const realV4 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      expect(Validators.isValidAgentId(realV4)).toBe(true);
    });

    it('should return false for invalid strings', () => {
      expect(Validators.isValidAgentId('invalid-uuid')).toBe(false);
      expect(Validators.isValidAgentId('')).toBe(false);
      expect(Validators.isValidAgentId('123')).toBe(false);
    });
  });

  describe('isValidModelString', () => {
    it('should return true for valid model strings', () => {
      expect(Validators.isValidModelString('openai,gpt-4o')).toBe(true);
      expect(Validators.isValidModelString('anthropic,claude-3-5-sonnet-20241022')).toBe(true);
      expect(Validators.isValidModelString('openrouter,meta-llama/llama-3-70b')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(Validators.isValidModelString('gpt-4o')).toBe(false); // Missing provider
      expect(Validators.isValidModelString('openai,')).toBe(false); // Missing model
      expect(Validators.isValidModelString(',gpt-4o')).toBe(false); // Missing provider
      expect(Validators.isValidModelString('openai,gpt-4o,extra')).toBe(false); // Too many parts
    });

    it('should reject API keys (NFR-S1)', () => {
      expect(Validators.isValidModelString('openai,sk-1234567890abcdef1234567890abcdef')).toBe(false);
      expect(Validators.isValidModelString('anthropic,sk-ant-api03-1234567890')).toBe(false);
      expect(Validators.isValidModelString('openai,key-123')).toBe(false); // "key" keyword
      expect(Validators.isValidModelString('openai,secret-123')).toBe(false); // "secret" keyword
    });

    it('should reject suspiciously long or short strings', () => {
      expect(Validators.isValidModelString('o,gpt-4o')).toBe(false); // Provider too short
      expect(Validators.isValidModelString('openai,g')).toBe(false); // Model too short
      const longProvider = 'a'.repeat(51);
      expect(Validators.isValidModelString(`${longProvider},model`)).toBe(false);
    });
  });

  describe('isValidProjectsData', () => {
    it('should validate correct ProjectsData structure', () => {
      const data = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            name: 'test',
            path: '/tmp/test',
            agents: [],
            createdAt: '2023-01-01',
            updatedAt: '2023-01-01'
          }
        }
      };
      expect(Validators.isValidProjectsData(data)).toBe(true);
    });

    it('should return false for invalid structures', () => {
      expect(Validators.isValidProjectsData(null)).toBe(false);
      expect(Validators.isValidProjectsData({})).toBe(false);
      expect(Validators.isValidProjectsData({ projects: [] })).toBe(false); // Should be object
    });
  });
});
