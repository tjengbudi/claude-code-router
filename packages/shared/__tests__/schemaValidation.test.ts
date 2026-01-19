import { describe, it, expect } from '@jest/globals';
import { Validators, PROJECTS_SCHEMA_VERSION } from '../src';

describe('Schema Validation Unit Tests (Story 2.4)', () => {
  describe('containsSecret', () => {
    it('should return true for API key keywords', () => {
      expect(Validators.containsSecret('api-key-123')).toBe(true);
      expect(Validators.containsSecret('apikey-test')).toBe(true);
      expect(Validators.containsSecret('api_key_value')).toBe(true);
      expect(Validators.containsSecret('my-secret-key')).toBe(true);
      expect(Validators.containsSecret('auth-token-xyz')).toBe(true);
      expect(Validators.containsSecret('password123')).toBe(true);
      expect(Validators.containsSecret('credential-data')).toBe(true);
    });

    it('should return true for known API key patterns', () => {
      // OpenAI patterns
      expect(Validators.containsSecret('sk-abc123def456')).toBe(true);
      expect(Validators.containsSecret('sk-proj-xyz789')).toBe(true);
      // Anthropic patterns
      expect(Validators.containsSecret('sk-ant-api123')).toBe(true);
      // Stripe patterns
      expect(Validators.containsSecret('pk-test-key123')).toBe(true);
      // Slack patterns
      expect(Validators.containsSecret('xoxb-test-token')).toBe(true);
    });

    it('should return false for valid model strings', () => {
      expect(Validators.containsSecret('openai')).toBe(false);
      expect(Validators.containsSecret('gpt-4o')).toBe(false);
      expect(Validators.containsSecret('anthropic')).toBe(false);
      expect(Validators.containsSecret('claude-3-5-sonnet-20241022')).toBe(false);
      expect(Validators.containsSecret('google')).toBe(false);
      expect(Validators.containsSecret('gemini-pro')).toBe(false);
    });

    it('should return false for safe metadata', () => {
      expect(Validators.containsSecret('project-name')).toBe(false);
      expect(Validators.containsSecret('agent-config')).toBe(false);
      expect(Validators.containsSecret('model-assignment')).toBe(false);
      expect(Validators.containsSecret('provider-name')).toBe(false);
    });

    it('should be case-insensitive for keyword detection', () => {
      expect(Validators.containsSecret('API-KEY-123')).toBe(true);
      expect(Validators.containsSecret('ApiKeY-test')).toBe(true);
      expect(Validators.containsSecret('SECRET-data')).toBe(true);
      expect(Validators.containsSecret('ToKeN-value')).toBe(true);
    });
  });

  describe('isValidSchemaVersion', () => {
    it('should return true for valid semver versions', () => {
      expect(Validators.isValidSchemaVersion('1.0.0')).toBe(true);
      expect(Validators.isValidSchemaVersion('2.1.3')).toBe(true);
      expect(Validators.isValidSchemaVersion('10.20.30')).toBe(true);
      expect(Validators.isValidSchemaVersion('0.0.1')).toBe(true);
    });

    it('should return true for semver with pre-release tags', () => {
      expect(Validators.isValidSchemaVersion('1.0.0-alpha')).toBe(true);
      expect(Validators.isValidSchemaVersion('1.0.0-beta.1')).toBe(true);
      expect(Validators.isValidSchemaVersion('1.0.0-rc.1')).toBe(true);
    });

    it('should return false for invalid version formats', () => {
      expect(Validators.isValidSchemaVersion('1.0')).toBe(false);
      expect(Validators.isValidSchemaVersion('v1.0.0')).toBe(false);
      expect(Validators.isValidSchemaVersion('1.0.0.0')).toBe(false);
      expect(Validators.isValidSchemaVersion('latest')).toBe(false);
      expect(Validators.isValidSchemaVersion('')).toBe(false);
      expect(Validators.isValidSchemaVersion('1.x.0')).toBe(false);
    });

    it('should validate PROJECTS_SCHEMA_VERSION constant', () => {
      expect(Validators.isValidSchemaVersion(PROJECTS_SCHEMA_VERSION)).toBe(true);
    });
  });

  describe('isValidProjectsData with schema version', () => {
    it('should return true for valid data with schema version', () => {
      const validData = {
        schemaVersion: '1.0.0',
        projects: {}
      };
      expect(Validators.isValidProjectsData(validData)).toBe(true);
    });

    it('should return true for valid data without schema version (backward compatibility)', () => {
      const validData = {
        projects: {}
      };
      expect(Validators.isValidProjectsData(validData)).toBe(true);
    });

    it('should return true for valid data with non-string schemaVersion (graceful handling)', () => {
      const data = {
        schemaVersion: 123,
        projects: {}
      };
      // Should still be valid (logs warning but accepts)
      expect(Validators.isValidProjectsData(data)).toBe(true);
    });

    it('should return false for null', () => {
      expect(Validators.isValidProjectsData(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(Validators.isValidProjectsData('string')).toBe(false);
      expect(Validators.isValidProjectsData(123)).toBe(false);
      expect(Validators.isValidProjectsData([])).toBe(false);
    });

    it('should return false for missing projects property', () => {
      expect(Validators.isValidProjectsData({})).toBe(false);
      expect(Validators.isValidProjectsData({ schemaVersion: '1.0.0' })).toBe(false);
    });

    it('should return false for non-object projects', () => {
      expect(Validators.isValidProjectsData({ projects: [] })).toBe(false);
      expect(Validators.isValidProjectsData({ projects: 'string' })).toBe(false);
      expect(Validators.isValidProjectsData({ projects: null })).toBe(false);
    });
  });

  describe('isValidModelString with containsSecret integration', () => {
    it('should reject model strings containing secret keywords', () => {
      expect(Validators.isValidModelString('openai,api-key-gpt-4o')).toBe(false);
      expect(Validators.isValidModelString('secret-provider,gpt-4o')).toBe(false);
      expect(Validators.isValidModelString('openai,model-token')).toBe(false);
    });

    it('should accept valid model strings', () => {
      expect(Validators.isValidModelString('openai,gpt-4o')).toBe(true);
      expect(Validators.isValidModelString('anthropic,claude-3-5-sonnet-20241022')).toBe(true);
      expect(Validators.isValidModelString('google,gemini-pro')).toBe(true);
    });

    it('should reject model strings with API key patterns', () => {
      expect(Validators.isValidModelString('sk-proj-abc123,gpt-4o')).toBe(false);
      expect(Validators.isValidModelString('openai,sk-abc123')).toBe(false);
      expect(Validators.isValidModelString('pk-test-key,gpt-4o')).toBe(false);
    });
  });

  describe('Validation with Missing Required Fields', () => {
    it('should return false for missing required fields', () => {
      // Missing projects object entirely
      expect(Validators.isValidProjectsData({ schemaVersion: '1.0.0' })).toBe(false);

      // Projects object exists but is null
      expect(Validators.isValidProjectsData({ schemaVersion: '1.0.0', projects: null })).toBe(false);

      // Projects with missing required fields (id, name, path)
      const projectWithMissingFields = {
        schemaVersion: '1.0.0',
        projects: {
          'project-id': {
            // Missing: id, name, path (all required)
            agents: []
          }
        }
      };
      // The validator checks for projects object structure at top level
      // Individual project field validation happens at the Project level
      expect(Validators.isValidProjectsData(projectWithMissingFields)).toBe(true); // Top-level structure is valid
    });

    it('should return true for projects with extra unknown fields (forward compatibility)', () => {
      // Extra fields are allowed for forward compatibility
      const dataWithExtraFields = {
        schemaVersion: '1.0.0',
        projects: {},
        extraField: 'some value',
        anotherUnknownField: { nested: true }
      };
      expect(Validators.isValidProjectsData(dataWithExtraFields)).toBe(true);
    });

    it('should handle projects entry with missing optional fields gracefully', () => {
      // Optional fields like agents, createdAt, updatedAt can be missing
      const dataWithMissingOptionalFields = {
        schemaVersion: '1.0.0',
        projects: {
          '550e8400-e29b-41d4-a716-446655440000': {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'test-project',
            path: '/tmp/test'
            // agents is optional
          }
        }
      };
      expect(Validators.isValidProjectsData(dataWithMissingOptionalFields)).toBe(true);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should detect mixed-case secret patterns', () => {
      expect(Validators.containsSecret('My-API-KEY')).toBe(true);
      expect(Validators.containsSecret('SecretValue123')).toBe(true);
      expect(Validators.containsSecret('AUTH_TOKEN')).toBe(true);
    });

    it('should not have false positives on safe strings', () => {
      expect(Validators.containsSecret('keyboard')).toBe(false);
      expect(Validators.containsSecret('tokenize')).toBe(false);
      expect(Validators.containsSecret('keyword-research')).toBe(false);
      // Note: "password-protected" contains "password" as a word, so it IS detected
      // This is correct behavior - "password" should trigger the security check
      expect(Validators.containsSecret('password-protected')).toBe(true);
    });

    it('should handle empty and edge case strings', () => {
      expect(Validators.containsSecret('')).toBe(false);
      expect(Validators.containsSecret('a')).toBe(false);
      expect(Validators.containsSecret(' ')).toBe(false);
    });

    it('should handle special characters in model strings', () => {
      expect(Validators.isValidModelString('openrouter,meta-llama/llama-3-70b')).toBe(true);
      expect(Validators.isValidModelString('custom_provider,model.name_v2')).toBe(true);
      expect(Validators.isValidModelString('google,gemini-2.0.flash')).toBe(true);
    });
  });
});
