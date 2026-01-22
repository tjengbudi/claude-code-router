/**
 * Tests for ccr-custom to CCR Enhanced migration
 * Story 5.6: Migration from ccr-custom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { migrateFromCcrCustom, isAlreadyMigrated, getMigrationPreview } from '../src/migration/migrateFromCcrCustom';
import type { ProjectsData } from '../src/types/agent';

describe('migrateFromCcrCustom', () => {
  let testDir: string;
  let sourcePath: string;
  let targetPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccr-migration-test-'));
    sourcePath = path.join(testDir, 'projects-source.json');
    targetPath = path.join(testDir, 'projects-target.json');
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Schema Transformation', () => {
    it('should convert agents from Record to Array', async () => {
      // Create ccr-custom format
      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: path.join(testDir, 'dev.md')
              },
              'agent-2': {
                id: 'agent-2',
                name: 'sm.md',
                relativePath: '.bmad/bmm/agents/sm.md',
                absolutePath: path.join(testDir, 'sm.md')
              }
            }
          }
        }
      };

      // Create dummy agent files
      await fs.writeFile(path.join(testDir, 'dev.md'), '# Dev Agent');
      await fs.writeFile(path.join(testDir, 'sm.md'), '# SM Agent');

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);
      expect(result.projectsMigrated).toBe(1);
      expect(result.agentsMigrated).toBe(2);

      // Verify target file
      const targetContent = await fs.readFile(targetPath, 'utf-8');
      const migratedData = JSON.parse(targetContent) as ProjectsData;

      expect(migratedData.schemaVersion).toBe('1.0.0');
      expect(Array.isArray(migratedData.projects['proj-1'].agents)).toBe(true);
      expect(migratedData.projects['proj-1'].agents.length).toBe(2);
    });

    it('should add timestamps to ProjectConfig', async () => {
      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {}
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);

      const targetContent = await fs.readFile(targetPath, 'utf-8');
      const migratedData = JSON.parse(targetContent) as ProjectsData;

      expect(migratedData.projects['proj-1'].createdAt).toBeDefined();
      expect(migratedData.projects['proj-1'].updatedAt).toBeDefined();
      expect(new Date(migratedData.projects['proj-1'].createdAt).getTime()).toBeGreaterThan(0);
    });

    it('should add schemaVersion to root', async () => {
      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {}
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);

      const targetContent = await fs.readFile(targetPath, 'utf-8');
      const migratedData = JSON.parse(targetContent) as ProjectsData;

      expect(migratedData.schemaVersion).toBe('1.0.0');
    });
  });

  describe('CCR-AGENT-MODEL Tag Migration', () => {
    it('should migrate model from CCR-AGENT-MODEL tag to projects.json', async () => {
      const agentPath = path.join(testDir, 'dev.md');
      await fs.writeFile(agentPath, '<!-- CCR-AGENT-MODEL: openai,gpt-4o -->\n# Dev Agent');

      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: agentPath
              }
            }
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);
      expect(result.modelsMigrated).toBe(1);

      const targetContent = await fs.readFile(targetPath, 'utf-8');
      const migratedData = JSON.parse(targetContent) as ProjectsData;

      expect(migratedData.projects['proj-1'].agents[0].model).toBe('openai,gpt-4o');
    });

    it('should remove CCR-AGENT-MODEL tag from agent file', async () => {
      const agentPath = path.join(testDir, 'dev.md');
      await fs.writeFile(agentPath, '<!-- CCR-AGENT-MODEL: openai,gpt-4o -->\n# Dev Agent');

      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: agentPath
              }
            }
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);
      expect(result.tagsRemoved).toBe(1);

      const agentContent = await fs.readFile(agentPath, 'utf-8');
      expect(agentContent).not.toContain('CCR-AGENT-MODEL');
      expect(agentContent).toBe('# Dev Agent');
    });

    it('should prefer projects.json model over tag model', async () => {
      const agentPath = path.join(testDir, 'dev.md');
      await fs.writeFile(agentPath, '<!-- CCR-AGENT-MODEL: openai,gpt-3.5-turbo -->\n# Dev Agent');

      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: agentPath,
                model: 'openai,gpt-4o'
              }
            }
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);

      const targetContent = await fs.readFile(targetPath, 'utf-8');
      const migratedData = JSON.parse(targetContent) as ProjectsData;

      // Should keep projects.json model, not tag model
      expect(migratedData.projects['proj-1'].agents[0].model).toBe('openai,gpt-4o');
    });
  });

  describe('Dry Run Mode', () => {
    it('should not modify files in dry-run mode', async () => {
      const agentPath = path.join(testDir, 'dev.md');
      const originalContent = '<!-- CCR-AGENT-MODEL: openai,gpt-4o -->\n# Dev Agent';
      await fs.writeFile(agentPath, originalContent);

      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: agentPath
              }
            }
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath, { dryRun: true });

      expect(result.success).toBe(true);

      // Target file should not exist
      await expect(fs.access(targetPath)).rejects.toThrow();

      // Agent file should be unchanged
      const agentContent = await fs.readFile(agentPath, 'utf-8');
      expect(agentContent).toBe(originalContent);
    });

    it('should count tags in dry-run mode', async () => {
      const agentPath = path.join(testDir, 'dev.md');
      await fs.writeFile(agentPath, '<!-- CCR-AGENT-MODEL: openai,gpt-4o -->\n# Dev Agent');

      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: agentPath
              }
            }
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.tagsRemoved).toBe(1); // Should count tags found
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON in source file', async () => {
      await fs.writeFile(sourcePath, 'invalid json{');

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('should handle missing projects object', async () => {
      await fs.writeFile(sourcePath, JSON.stringify({ foo: 'bar' }));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid ccr-custom schema');
    });

    it('should skip already migrated files', async () => {
      const alreadyMigrated = {
        schemaVersion: '1.0.0',
        projects: {}
      };

      await fs.writeFile(sourcePath, JSON.stringify(alreadyMigrated, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);
      expect(result.errors[0]).toContain('already migrated');
    });

    it('should handle agent file read errors gracefully', async () => {
      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: '/nonexistent/path/dev.md'
              }
            }
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      // Should succeed but with warnings
      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Failed to process agent file');
    });

    it('should reject path traversal attempts', async () => {
      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: '../../etc/passwd'
              }
            }
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);
      expect(result.errors.some(e => e.includes('Invalid agent file path'))).toBe(true);
    });
  });

  describe('Backup and Rollback', () => {
    it('should create backup before migration', async () => {
      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {}
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const backupDir = path.join(testDir, 'backups');
      const result = await migrateFromCcrCustom(sourcePath, targetPath, { backupDir });

      expect(result.success).toBe(true);

      // Check backup exists
      const backupFiles = await fs.readdir(backupDir);
      expect(backupFiles.some(f => f.startsWith('projects.json.backup-'))).toBe(true);
    });

    it('should handle backup collision by adding counter', async () => {
      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {}
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const backupDir = path.join(testDir, 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      // Run migration twice
      await migrateFromCcrCustom(sourcePath, targetPath, { backupDir });
      await migrateFromCcrCustom(sourcePath, targetPath, { backupDir });

      const backupFiles = await fs.readdir(backupDir);
      expect(backupFiles.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Atomic Write', () => {
    it('should validate temp file before rename', async () => {
      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {}
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const result = await migrateFromCcrCustom(sourcePath, targetPath);

      expect(result.success).toBe(true);

      // Temp file should not exist after successful migration
      const tempPath = `${targetPath}.tmp`;
      await expect(fs.access(tempPath)).rejects.toThrow();
    });
  });

  describe('isAlreadyMigrated', () => {
    it('should return true for migrated files', async () => {
      const migratedData = {
        schemaVersion: '1.0.0',
        projects: {}
      };

      await fs.writeFile(targetPath, JSON.stringify(migratedData, null, 2));

      const result = await isAlreadyMigrated(targetPath);
      expect(result).toBe(true);
    });

    it('should return false for non-migrated files', async () => {
      const ccrCustomData = {
        projects: {}
      };

      await fs.writeFile(targetPath, JSON.stringify(ccrCustomData, null, 2));

      const result = await isAlreadyMigrated(targetPath);
      expect(result).toBe(false);
    });

    it('should return false for non-existent files', async () => {
      const result = await isAlreadyMigrated('/nonexistent/file.json');
      expect(result).toBe(false);
    });
  });

  describe('getMigrationPreview', () => {
    it('should generate preview with statistics', async () => {
      const agentPath = path.join(testDir, 'dev.md');
      await fs.writeFile(agentPath, '<!-- CCR-AGENT-MODEL: openai,gpt-4o -->\n# Dev Agent');

      const ccrCustomData = {
        projects: {
          'proj-1': {
            id: 'proj-1',
            path: '/test/project',
            name: 'test-project',
            agents: {
              'agent-1': {
                id: 'agent-1',
                name: 'dev.md',
                relativePath: '.bmad/bmm/agents/dev.md',
                absolutePath: agentPath,
                model: 'openai,gpt-4o'
              }
            }
          }
        }
      };

      await fs.writeFile(sourcePath, JSON.stringify(ccrCustomData, null, 2));

      const preview = await getMigrationPreview(sourcePath);

      expect(preview).toContain('Projects to migrate: 1');
      expect(preview).toContain('Total agents: 1');
      expect(preview).toContain('Agents with model in projects.json: 1');
      expect(preview).toContain('Agents with CCR-AGENT-MODEL tags: 1');
    });
  });
});
