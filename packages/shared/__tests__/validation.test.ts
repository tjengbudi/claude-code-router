import { describe, it, expect } from 'vitest';
import { Validators } from '../src/validation';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';
import { mkdtemp, rmdir, writeFile } from 'fs/promises';

describe('Validators', () => {
  // Story 1.2: Agent ID validation tests
  describe('isValidAgentId', () => {
    it('should return true for valid UUID v4', () => {
      const validId = uuidv4();
      expect(Validators.isValidAgentId(validId)).toBe(true);
    });

    it('should return true for valid UUID v4 with regex pattern', () => {
      // Test a known valid UUID v4 format
      const validId = '550e8400-e29b-41d4-a716-446655440000';
      expect(Validators.isValidAgentId(validId)).toBe(true);
    });

    it('should return false for UUID v1 format', () => {
      // UUID v1 has different version bits
      const v1Id = '00000000-0000-1000-8000-000000000000';
      expect(Validators.isValidAgentId(v1Id)).toBe(false);
    });

    it('should return false for invalid UUID format', () => {
      expect(Validators.isValidAgentId('not-a-uuid')).toBe(false);
      expect(Validators.isValidAgentId('12345')).toBe(false);
      expect(Validators.isValidAgentId('')).toBe(false);
    });

    it('should return false for malformed UUID', () => {
      expect(Validators.isValidAgentId('550e8400-e29b-41d4-a716')).toBe(false); // Missing last segment
      expect(Validators.isValidAgentId('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false); // Extra segment
    });

    it('should return false for non-string input', () => {
      expect(Validators.isValidAgentId(null as any)).toBe(false);
      expect(Validators.isValidAgentId(undefined as any)).toBe(false);
      expect(Validators.isValidAgentId(123 as any)).toBe(false);
      expect(Validators.isValidAgentId({} as any)).toBe(false);
    });

    it('should return false for UUID v5 format', () => {
      // UUID v5 has version 5, not 4
      const v5Id = '550e8400-e29b-51d4-a716-446655440000';
      expect(Validators.isValidAgentId(v5Id)).toBe(false);
    });
  });

  describe('isValidProjectPath', () => {
    it('should return true for valid absolute directory path', async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'test-project-'));
      const result = await Validators.isValidProjectPath(tempDir);
      expect(result).toBe(true);
      await rmdir(tempDir);
    });

    it('should return false for relative path', async () => {
      const result = await Validators.isValidProjectPath('./relative-path');
      expect(result).toBe(false);
    });

    it('should return false for non-existent path', async () => {
      const result = await Validators.isValidProjectPath('/non/existent/path');
      expect(result).toBe(false);
    });

    it('should return false for file instead of directory', async () => {
      const tempFile = path.join(os.tmpdir(), `test-file-${Date.now()}`);
      await writeFile(tempFile, 'test');
      const result = await Validators.isValidProjectPath(tempFile);
      expect(result).toBe(false);
    });

    // MED-3: Test path traversal protection - relative paths rejected
    it('should reject relative paths to prevent traversal', async () => {
      // Relative paths are rejected, preventing traversal attacks
      const result1 = await Validators.isValidProjectPath('./relative-path');
      expect(result1).toBe(false);

      const result2 = await Validators.isValidProjectPath('../../../etc/passwd');
      expect(result2).toBe(false);
    });
  });

  describe('isValidProjectsData', () => {
    it('should return true for valid ProjectsData structure', () => {
      const validData = { projects: {} };
      expect(Validators.isValidProjectsData(validData)).toBe(true);
    });

    it('should return false for null', () => {
      expect(Validators.isValidProjectsData(null)).toBe(false);
    });

    it('should return false for missing projects property', () => {
      expect(Validators.isValidProjectsData({})).toBe(false);
    });

    it('should return false for non-object projects', () => {
      expect(Validators.isValidProjectsData({ projects: [] })).toBe(false);
    });
  });
});
