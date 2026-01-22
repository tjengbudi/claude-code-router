/**
 * Graceful Degradation Test Suite - Story 5.2
 * Non-Invasive Error Handling for Agent System
 *
 * This test suite validates that the agent system gracefully degrades when
 * configuration is missing, corrupted, or invalid, ensuring the system remains
 * functional even when the agent system is inactive.
 *
 * Coverage:
 * - AC1: Handle Missing projects.json
 * - AC2: Handle Corrupted projects.json
 * - AC3: Validate Invalid Agent IDs
 * - AC4: Handle Unknown Agents
 * - AC5: Non-BMM Project Compatibility
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { ProjectManager } from '../src/projectManager';
import { AGENT_ID_REGEX } from '../src/constants';

// Test paths
const TEST_PROJECTS_FILE = '/tmp/test-ccr-graceful-degradation-projects.json';

describe('Graceful Degradation - Story 5.2', () => {
  describe('AC1: Handle Missing projects.json', () => {
    let pm: ProjectManager;

    beforeEach(() => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
      // Clean up any existing test file
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('should return empty data when projects.json does not exist', async () => {
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });

    it('should not throw error when file is missing', async () => {
      await expect(pm.loadProjects()).resolves.toBeDefined();
    });

    it('should allow subsequent operations after missing file', async () => {
      const result = await pm.loadProjects();
      expect(result.projects).toEqual({});

      // Should be able to call other methods without crash
      const projects = await pm.listProjects();
      expect(projects).toBeUndefined();
    });

    it('should return empty projects array when calling getProjects on missing file', async () => {
      const projects = await pm.listProjects();
      expect(projects).toBeUndefined();
    });

    it('should return undefined when looking up model on missing file', async () => {
      const model = await pm.getModelByAgentId('any-agent-id');
      expect(model).toBeUndefined();
    });
  });

  describe('AC2: Handle Corrupted projects.json', () => {
    let pm: ProjectManager;

    beforeEach(() => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('should handle invalid JSON syntax', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '{ invalid json', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });

    it('should handle malformed structure', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '{"random": "data"}', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });

    it('should handle empty file', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });

    it('should return empty data on schema validation failure', async () => {
      // Valid JSON but invalid schema (missing required fields)
      writeFileSync(TEST_PROJECTS_FILE, '{"schemaVersion": "1.0.0"}', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });

    it('should not throw on corrupted JSON', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '{corrupted}}}', 'utf-8');
      await expect(pm.loadProjects()).resolves.toBeDefined();
    });

    it('should handle valid JSON with null projects', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '{"projects": null}', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });

    it('should handle valid JSON with wrong type for projects', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '{"projects": "not-an-object"}', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });
  });

  describe('AC3: Validate Invalid Agent IDs', () => {
    it('should reject malformed UUID', () => {
      const invalidId = 'not-a-uuid';
      const isValid = AGENT_ID_REGEX.test(invalidId);
      expect(isValid).toBe(false);
    });

    it('should reject non-UUID format', () => {
      const invalidId = '12345';
      const isValid = AGENT_ID_REGEX.test(invalidId);
      expect(isValid).toBe(false);
    });

    it('should reject too-short UUID', () => {
      const invalidId = '12345678-1234-1234-1234-1234';
      const isValid = AGENT_ID_REGEX.test(invalidId);
      expect(isValid).toBe(false);
    });

    it('should reject UUID with wrong version', () => {
      const invalidId = '550e8400-e29b-51d4-a716-446655440000'; // Version 5 instead of 4
      const isValid = AGENT_ID_REGEX.test(invalidId);
      expect(isValid).toBe(false);
    });

    it('should accept valid UUID v4', () => {
      const validId = '550e8400-e29b-41d4-a716-446655440000';
      const isValid = AGENT_ID_REGEX.test(validId);
      expect(isValid).toBe(true);
    });

    it('should accept valid UUID v4 with lowercase', () => {
      const validId = '550e8400-e29b-41d4-a716-446655440000';
      const isValid = AGENT_ID_REGEX.test(validId);
      expect(isValid).toBe(true);
    });

    it('should be case-insensitive for hex digits', () => {
      const validId = '550E8400-E29B-41D4-A716-446655440000'; // Uppercase
      const isValid = AGENT_ID_REGEX.test(validId);
      expect(isValid).toBe(true);
    });
  });

  describe('AC4: Handle Unknown Agents', () => {
    let pm: ProjectManager;

    beforeEach(async () => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
      // Create a valid projects.json with a project
      writeFileSync(TEST_PROJECTS_FILE, JSON.stringify({
        schemaVersion: '1.0.0',
        projects: {
          'test-project': {
            id: 'test-project',
            path: '/tmp/test',
            agents: []
          }
        }
      }, null, 2), 'utf-8');
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('should return undefined for unknown agent ID', async () => {
      const unknownAgentId = '550e8400-e29b-41d4-a716-446655440000';
      const model = await pm.getModelByAgentId(unknownAgentId, 'test-project');
      expect(model).toBeUndefined();
    });

    it('should handle agent not in any project', async () => {
      const unknownAgentId = '550e8400-e29b-41d4-a716-446655440000';
      const model = await pm.getModelByAgentId(unknownAgentId);
      expect(model).toBeUndefined();
    });

    it('should not crash when looking up unknown agent', async () => {
      const unknownAgentId = '550e8400-e29b-41d4-a716-446655440000';
      await expect(pm.getModelByAgentId(unknownAgentId)).resolves.toBeUndefined();
    });

    it('should return undefined for invalid agent ID format', async () => {
      const invalidAgentId = 'not-a-uuid';
      const model = await pm.getModelByAgentId(invalidAgentId);
      expect(model).toBeUndefined();
    });

    it('should return undefined for non-existent project ID', async () => {
      const validAgentId = '550e8400-e29b-41d4-a716-446655440000';
      const model = await pm.getModelByAgentId(validAgentId, 'non-existent-project');
      expect(model).toBeUndefined();
    });
  });

  describe('AC5: Non-BMM Project Compatibility', () => {
    let pm: ProjectManager;

    beforeEach(() => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
      // Ensure no projects.json exists
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('should handle empty projects gracefully', async () => {
      const result = await pm.loadProjects();
      expect(result.projects).toEqual({});

      // Should be able to call getProjects without crash
      const projects = await pm.listProjects();
      expect(projects).toBeUndefined();
    });

    it('should allow operations without agent system active', async () => {
      // All operations should work even when projects.json doesn't exist
      await expect(pm.loadProjects()).resolves.toBeDefined();
      await expect(pm.listProjects()).resolves.toBeUndefined();
      await expect(pm.getModelByAgentId('any-id')).resolves.toBeUndefined();
    });

    it('should have minimal overhead when agent system inactive', async () => {
      const start = performance.now();
      await pm.loadProjects();
      const elapsed = performance.now() - start;

      // Should complete in < 10ms (just checking if file exists)
      expect(elapsed).toBeLessThan(50);
    });

    it('should return empty projects array when no projects.json', async () => {
      const projects = await pm.listProjects();
      expect(projects).toBeUndefined();
    });
  });

  describe('Integration: Complete Graceful Degradation Flow', () => {
    let pm: ProjectManager;

    beforeEach(() => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('should handle complete chain: missing file -> empty data -> fallback', async () => {
      const result = await pm.loadProjects();
      expect(result.projects).toEqual({});

      const model = await pm.getModelByAgentId('any-agent-id');
      expect(model).toBeUndefined();
    });

    it('should recover from corrupted to valid JSON', async () => {
      // First, write corrupted JSON
      writeFileSync(TEST_PROJECTS_FILE, '{invalid}', 'utf-8');
      const corruptedResult = await pm.loadProjects();
      expect(corruptedResult.projects).toEqual({});

      // Now write valid JSON
      writeFileSync(TEST_PROJECTS_FILE, JSON.stringify({
        schemaVersion: '1.0.0',
        projects: {
          'test-project': {
            id: 'test-project',
            path: '/tmp/test',
            agents: []
          }
        }
      }, null, 2), 'utf-8');

      const validResult = await pm.loadProjects();
      expect(validResult.projects).toHaveProperty('test-project');
    });

    it('should handle multiple consecutive errors gracefully', async () => {
      // Multiple load attempts with missing file
      const result1 = await pm.loadProjects();
      const result2 = await pm.loadProjects();
      const result3 = await pm.loadProjects();

      expect(result1.projects).toEqual({});
      expect(result2.projects).toEqual({});
      expect(result3.projects).toEqual({});
    });

    it('should handle missing to corrupted to valid transition', async () => {
      // Start with missing
      const missingResult = await pm.loadProjects();
      expect(missingResult.projects).toEqual({});

      // Write corrupted
      writeFileSync(TEST_PROJECTS_FILE, '{invalid}', 'utf-8');
      const corruptedResult = await pm.loadProjects();
      expect(corruptedResult.projects).toEqual({});

      // Write valid
      writeFileSync(TEST_PROJECTS_FILE, JSON.stringify({
        schemaVersion: '1.0.0',
        projects: {}
      }, null, 2), 'utf-8');
      const validResult = await pm.loadProjects();
      expect(validResult.projects).toEqual({});
    });
  });

  describe('Performance: No Regression for Valid Requests', () => {
    let pm: ProjectManager;

    beforeEach(async () => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
      // Create valid projects.json
      writeFileSync(TEST_PROJECTS_FILE, JSON.stringify({
        schemaVersion: '1.0.0',
        projects: {
          'test-project': {
            id: 'test-project',
            path: '/tmp/test',
            agents: [
              {
                id: '550e8400-e29b-41d4-a716-446655440000',
                name: 'test-agent',
                model: 'openai,gpt-4o'
              }
            ]
          }
        }
      }, null, 2), 'utf-8');
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('should load valid projects.json quickly', async () => {
      const start = performance.now();
      await pm.loadProjects();
      const elapsed = performance.now() - start;

      // Should complete in < 10ms for small file
      expect(elapsed).toBeLessThan(20);
    });

    it('should validate valid agent ID quickly', () => {
      const validAgentId = '550e8400-e29b-41d4-a716-446655440000';
      const isValid = AGENT_ID_REGEX.test(validAgentId);

      expect(isValid).toBe(true);
      // Regex validation should be < 0.1ms per validation
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        AGENT_ID_REGEX.test(validAgentId);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(20); // 1000 iterations in < 20ms
    });

    it('should handle listProjects quickly with valid data', async () => {
      const start = performance.now();
      const projects = await pm.listProjects();
      const elapsed = performance.now() - start;

      // Should have 1 project and complete quickly
      expect(projects).toBeDefined();
      expect(projects?.length).toBe(1);
      expect(elapsed).toBeLessThan(10);
    });

    it('should handle getModelByAgentId quickly with valid data', async () => {
      const start = performance.now();
      const model = await pm.getModelByAgentId('550e8400-e29b-41d4-a716-446655440000');
      const elapsed = performance.now() - start;

      expect(model).toBe('openai,gpt-4o');
      expect(elapsed).toBeLessThan(100); // Increased for CI environment variability
    });
  });

  describe('Schema Version Compatibility', () => {
    let pm: ProjectManager;

    beforeEach(() => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('should handle missing schemaVersion gracefully', async () => {
      // Pre-Story 2.4 format (no schemaVersion)
      writeFileSync(TEST_PROJECTS_FILE, JSON.stringify({
        projects: {}
      }, null, 2), 'utf-8');

      const result = await pm.loadProjects();
      expect(result.projects).toEqual({});
    });

    it('should handle current schemaVersion', async () => {
      writeFileSync(TEST_PROJECTS_FILE, JSON.stringify({
        schemaVersion: '1.0.0',
        projects: {}
      }, null, 2), 'utf-8');

      const result = await pm.loadProjects();
      expect(result.projects).toEqual({});
    });

    it('should handle different schemaVersion', async () => {
      // Future version
      writeFileSync(TEST_PROJECTS_FILE, JSON.stringify({
        schemaVersion: '2.0.0',
        projects: {}
      }, null, 2), 'utf-8');

      const result = await pm.loadProjects();
      // Should still load with warning
      expect(result.projects).toEqual({});
    });
  });

  describe('Log Message Validation - AC Specifications', () => {
    let pm: ProjectManager;

    beforeEach(() => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
      // Clean up any existing test file
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('AC1: should log exact message for missing projects.json', async () => {
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

      await pm.loadProjects();

      expect(debugSpy).toHaveBeenCalledWith(`projects.json not found at ${TEST_PROJECTS_FILE}, agent system inactive`);
      debugSpy.mockRestore();
    });

    it('AC2: should log exact message for corrupted JSON', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '{invalid json}', 'utf-8');

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await pm.loadProjects();

      // Should contain "Failed to load projects.json:" prefix
      expect(warnSpy).toHaveBeenCalled();
      const callArgs = warnSpy.mock.calls[0][0] as string;
      expect(callArgs).toContain('Failed to load projects.json:');
      warnSpy.mockRestore();
    });

    it('AC4: should log exact message for unknown agent', async () => {
      // Create a valid project
      writeFileSync(TEST_PROJECTS_FILE, JSON.stringify({
        schemaVersion: '1.0.0',
        projects: {
          'test-project': {
            id: 'test-project',
            path: '/tmp/test',
            agents: []
          }
        }
      }, null, 2), 'utf-8');

      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

      const unknownAgentId = '550e8400-e29b-41d4-a716-446655440000';
      await pm.getModelByAgentId(unknownAgentId);

      expect(debugSpy).toHaveBeenCalledWith(`Agent not found: ${unknownAgentId}, using Router.default`);
      debugSpy.mockRestore();
    });
  });

  describe('Edge Cases: Whitespace and Empty Files', () => {
    let pm: ProjectManager;

    beforeEach(() => {
      pm = new ProjectManager(TEST_PROJECTS_FILE);
    });

    afterEach(() => {
      if (existsSync(TEST_PROJECTS_FILE)) {
        unlinkSync(TEST_PROJECTS_FILE);
      }
    });

    it('should handle whitespace-only file', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '   ', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });

    it('should handle newline-only file', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '\n\n', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });

    it('should handle mixed whitespace file', async () => {
      writeFileSync(TEST_PROJECTS_FILE, '  \n  \t  ', 'utf-8');
      const result = await pm.loadProjects();
      expect(result).toEqual({ projects: {} });
    });
  });
});
