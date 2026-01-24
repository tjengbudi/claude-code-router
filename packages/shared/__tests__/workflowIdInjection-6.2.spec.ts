/**
 * Unit Tests for Story 6.2: Workflow ID Injection
 *
 * Tests the extractWorkflowId() and injectWorkflowId() methods in ProjectManager
 *
 * @see claude-code-router/packages/shared/src/projectManager.ts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProjectManager } from '../src/projectManager';
import { Validators } from '../src/validation';

/**
 * Test data directory
 */
const TEST_DATA_DIR = path.join(os.tmpdir(), 'ccr-workflow-id-test');

/**
 * Valid UUID v4 for testing
 */
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

/**
 * Setup test environment
 */
beforeEach(async () => {
  // Create test data directory
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('[Story 6.2] Workflow ID Extraction', () => {
  describe('extractWorkflowId() - YAML Extraction', () => {
    it('should extract workflow ID from workflow.yaml', async () => {
      // Arrange: Create workflow directory with workflow.yaml containing ID
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `# CCR-WORKFLOW-ID: ${VALID_UUID}
name: Test Workflow
description: A test workflow
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Extract workflow ID
      const extractedId = await (pm as any).extractWorkflowId(testWorkflowDir);

      // Assert: Should extract the correct UUID
      expect(extractedId).toBe(VALID_UUID);
    });

    it('should handle uppercase UUID in workflow.yaml (case-insensitive)', async () => {
      // Arrange: Create workflow.yaml with uppercase UUID
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const uppercaseUuid = '550E8400-E29B-41D4-A716-446655440000';
      const workflowYaml = `# CCR-WORKFLOW-ID: ${uppercaseUuid}
name: Test Workflow
description: A test workflow
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Extract workflow ID
      const extractedId = await (pm as any).extractWorkflowId(testWorkflowDir);

      // Assert: Should extract UUID regardless of case
      expect(extractedId).toBe(uppercaseUuid);
    });
  });

  describe('extractWorkflowId() - Markdown Extraction', () => {
    it('should extract workflow ID from instructions.md', async () => {
      // Arrange: Create workflow with instructions.md containing ID
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const instructionsMd = `<!-- CCR-WORKFLOW-ID: ${VALID_UUID} -->
<workflow>
  <step n="1" goal="Test step">
  </step>
</workflow>
`;
      await fs.writeFile(path.join(testWorkflowDir, 'instructions.md'), instructionsMd, 'utf-8');

      // Act: Extract workflow ID
      const extractedId = await (pm as any).extractWorkflowId(testWorkflowDir);

      // Assert: Should extract from instructions.md
      expect(extractedId).toBe(VALID_UUID);
    });
  });

  describe('extractWorkflowId() - No ID Present', () => {
    it('should return null when no workflow ID exists', async () => {
      // Arrange: Create workflow without ID
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Test Workflow
description: A test workflow
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Extract workflow ID
      const extractedId = await (pm as any).extractWorkflowId(testWorkflowDir);

      // Assert: Should return null when no ID exists
      expect(extractedId).toBeNull();
    });

    it('should handle missing workflow.yaml gracefully', async () => {
      // Arrange: Create workflow directory without workflow.yaml
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      // Act: Extract workflow ID
      const extractedId = await (pm as any).extractWorkflowId(testWorkflowDir);

      // Assert: Should return null
      expect(extractedId).toBeNull();
    });
  });

  describe('extractWorkflowId() - ID Mismatch Handling', () => {
    it('should return workflow.yaml ID when both files have different IDs', async () => {
      // Arrange: Create workflow with different IDs in yaml and md
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const yamlId = '550e8400-e29b-41d4-a716-446655440000';
      const mdId = '660e8400-e29b-41d4-a716-446655440000';

      const workflowYaml = `# CCR-WORKFLOW-ID: ${yamlId}
name: Test Workflow
description: A test workflow
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      const instructionsMd = `<!-- CCR-WORKFLOW-ID: ${mdId} -->
<workflow>
</workflow>
`;
      await fs.writeFile(path.join(testWorkflowDir, 'instructions.md'), instructionsMd, 'utf-8');

      // Act: Extract workflow ID
      const extractedId = await (pm as any).extractWorkflowId(testWorkflowDir);

      // Assert: Should prefer workflow.yaml ID
      expect(extractedId).toBe(yamlId);
    });
  });
});

describe('[Story 6.2] Workflow ID Injection', () => {
  describe('injectWorkflowId() - workflow.yaml Injection', () => {
    it('should inject workflow ID into workflow.yaml', async () => {
      // Arrange: Create workflow without ID
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const originalYaml = `name: Test Workflow
description: A test workflow
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), originalYaml, 'utf-8');

      // Act: Inject workflow ID
      const injectedPath = await (pm as any).injectWorkflowId(testWorkflowDir, VALID_UUID);

      // Assert: File should be updated with ID
      expect(injectedPath).toBe(path.join(testWorkflowDir, 'workflow.yaml'));
      const updatedContent = await fs.readFile(path.join(testWorkflowDir, 'workflow.yaml'), 'utf-8');
      expect(updatedContent).toContain(`# CCR-WORKFLOW-ID: ${VALID_UUID}`);
      expect(updatedContent).toContain('name: Test Workflow');
    });
  });

  describe('injectWorkflowId() - Fallback to instructions.md', () => {
    it('should fallback to instructions.md when workflow.yaml is not writable', async () => {
      // Arrange: Create workflow with read-only workflow.yaml
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      // Create workflow.yaml (will be made read-only)
      const workflowYaml = `name: Test Workflow\ndescription: Test\n`;
      const yamlPath = path.join(testWorkflowDir, 'workflow.yaml');
      await fs.writeFile(yamlPath, workflowYaml, 'utf-8');
      await fs.chmod(yamlPath, 0o444); // Read-only

      // Create writable instructions.md
      const instructionsMd = `<workflow>\n  <step n="1">\n  </step>\n</workflow>`;
      await fs.writeFile(path.join(testWorkflowDir, 'instructions.md'), instructionsMd, 'utf-8');

      // Act: Inject workflow ID (should fallback to instructions.md)
      const injectedPath = await (pm as any).injectWorkflowId(testWorkflowDir, VALID_UUID);

      // Restore permissions for cleanup
      await fs.chmod(yamlPath, 0o644);

      // Assert: Should have injected into instructions.md
      expect(injectedPath).toBe(path.join(testWorkflowDir, 'instructions.md'));
      const updatedContent = await fs.readFile(path.join(testWorkflowDir, 'instructions.md'), 'utf-8');
      expect(updatedContent).toContain(`<!-- CCR-WORKFLOW-ID: ${VALID_UUID} -->`);
    });
  });

  describe('injectWorkflowId() - ID Already Exists', () => {
    it('should not overwrite existing workflow ID', async () => {
      // Arrange: Create workflow with existing ID
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const existingId = '440e8400-e29b-41d4-a716-446655440000';
      const workflowYaml = `# CCR-WORKFLOW-ID: ${existingId}
name: Test Workflow
description: A test workflow
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Try to inject different ID
      const injectedPath = await (pm as any).injectWorkflowId(testWorkflowDir, VALID_UUID);

      // Assert: Should preserve existing ID
      const content = await fs.readFile(path.join(testWorkflowDir, 'workflow.yaml'), 'utf-8');
      expect(content).toContain(existingId);
      expect(content).not.toContain(VALID_UUID);
    });
  });

  describe('injectWorkflowId() - Validation', () => {
    it('should throw error for invalid UUID format', async () => {
      // Arrange: Create workflow
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Test Workflow\ndescription: Test\n`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act & Assert: Should throw error for invalid UUID
      await expect((pm as any).injectWorkflowId(testWorkflowDir, 'invalid-uuid'))
        .rejects.toThrow('Invalid workflow ID format');
    });
  });
});

describe('[Story 6.2] Validator - isValidWorkflowId', () => {
  it('should validate valid workflow ID (UUID v4)', () => {
    // Arrange & Act & Assert
    expect(Validators.isValidWorkflowId(VALID_UUID)).toBe(true);
  });

  it('should validate lowercase UUID', () => {
    // Arrange & Act & Assert
    expect(Validators.isValidWorkflowId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('should validate uppercase UUID', () => {
    // Arrange & Act & Assert
    expect(Validators.isValidWorkflowId('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('should reject invalid workflow ID format', () => {
    // Arrange & Act & Assert
    expect(Validators.isValidWorkflowId('not-a-uuid')).toBe(false);
    expect(Validators.isValidWorkflowId('')).toBe(false);
    expect(Validators.isValidWorkflowId('550e8400-e29b-41d4-a716')).toBe(false); // Missing segment
  });

  it('should reject UUID v3 (not v4)', () => {
    // UUID v3 has version 3 in the 3rd segment
    expect(Validators.isValidWorkflowId('550e8400-e29b-31d4-a716-446655440000')).toBe(false);
  });
});

describe('[Story 6.2] Integration Tests', () => {
  describe('Full workflow scan with ID injection', () => {
    it('should inject workflow ID during scan', async () => {
      // Arrange: Create project with workflow without ID
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Test Workflow
description: A test workflow for ID injection
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan workflows (should inject IDs)
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Workflow should have ID injected
      expect(workflows).toHaveLength(1);
      expect(workflows[0].id).toBeTruthy();
      expect(workflows[0].id).not.toBe('');
      expect(Validators.isValidWorkflowId(workflows[0].id)).toBe(true);

      // Verify ID was written to file
      const yamlContent = await fs.readFile(path.join(testWorkflowDir, 'workflow.yaml'), 'utf-8');
      expect(yamlContent).toMatch(/# CCR-WORKFLOW-ID: [0-9a-f-]+/i);
    });
  });

  describe('Rescan preserves existing IDs', () => {
    it('should preserve existing workflow IDs on rescan', async () => {
      // Arrange: Create workflow with existing ID
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'test-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const existingId = '440e8400-e29b-41d4-a716-446655440000';
      const workflowYaml = `# CCR-WORKFLOW-ID: ${existingId}
name: Test Workflow
description: A test workflow
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan workflows twice
      const workflows1 = await (pm as any).scanWorkflows(testProjectPath);
      const workflows2 = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: ID should remain the same
      expect(workflows1[0].id).toBe(existingId);
      expect(workflows2[0].id).toBe(existingId);
    });
  });

  describe('Backward compatibility', () => {
    it('should inject IDs into workflows without IDs', async () => {
      // Arrange: Create workflow without ID (legacy workflow)
      const projectsFile = path.join(TEST_DATA_DIR, 'projects.json');
      const pm = new ProjectManager(projectsFile);
      const testProjectPath = path.join(TEST_DATA_DIR, 'test-project');
      const workflowsDir = path.join(testProjectPath, '_bmad', 'bmm', 'workflows');
      const testWorkflowDir = path.join(workflowsDir, 'legacy-workflow');
      await fs.mkdir(testWorkflowDir, { recursive: true });

      const workflowYaml = `name: Legacy Workflow
description: A workflow created before Story 6.2
`;
      await fs.writeFile(path.join(testWorkflowDir, 'workflow.yaml'), workflowYaml, 'utf-8');

      // Act: Scan workflows
      const workflows = await (pm as any).scanWorkflows(testProjectPath);

      // Assert: Should inject new ID
      expect(workflows[0].id).toBeTruthy();
      expect(workflows[0].id).not.toBe('');
    });
  });
});
