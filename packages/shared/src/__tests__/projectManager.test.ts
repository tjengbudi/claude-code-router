import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import JSON5 from 'json5';
import { ProjectManager } from '../projectManager';
import { Validators } from '../validation';

// Mock fs and glob
jest.mock('fs/promises');
jest.mock('glob', () => ({
  glob: jest.fn()
}));

// Type assertions for mocked functions
const mockFsRead = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockFsWrite = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockFsAccess = fs.access as jest.MockedFunction<typeof fs.access>;
const mockFsMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;

describe('ProjectManager', () => {
  const mockProjectsFile = '/home/user/.claude-code-router/projects.json';
  let projectManager: ProjectManager;

  beforeEach(() => {
    jest.clearAllMocks();
    projectManager = new ProjectManager(mockProjectsFile);
  });

  describe('setAgentModel', () => {
    const projectId = '550e8400-e29b-41d4-a716-446655440000';
    const agentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

    const mockProjectsData = {
      projects: {
        [projectId]: {
          id: projectId,
          name: 'test-project',
          path: '/test/path',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01',
          agents: [
            {
              id: agentId,
              name: 'dev.md',
              relativePath: '.bmad/bmm/agents/dev.md',
              absolutePath: '/test/path/.bmad/bmm/agents/dev.md'
            }
          ]
        }
      }
    };

    it('should set agent model and save file', async () => {
      // Mock loadProjects via fs.readFile
      mockFsRead.mockResolvedValue(JSON.stringify(mockProjectsData));
      // Mock validation
      mockFsAccess.mockResolvedValue(undefined);
      mockFsWrite.mockResolvedValue(undefined);
      mockFsMkdir.mockResolvedValue(undefined);

      const model = 'openai,gpt-4o';
      await projectManager.setAgentModel(projectId, agentId, model);

      // Verify saveProjects called (via fs.writeFile)
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = mockFsWrite.mock.calls[0];
      const contentStr = Buffer.from(writeCall[1] as any).toString('utf-8');
      const savedContent = JSON5.parse(contentStr.replace('// Project configurations for CCR agent system\n', ''));

      expect(savedContent.projects[projectId].agents[0].model).toBe(model);
    });

    it('should remove agent model if undefined passed', async () => {
      const dataWithModel = JSON.parse(JSON.stringify(mockProjectsData));
      dataWithModel.projects[projectId].agents[0].model = 'old,model';

      mockFsRead.mockResolvedValue(JSON.stringify(dataWithModel));
      mockFsAccess.mockResolvedValue(undefined);
      mockFsWrite.mockResolvedValue(undefined);
      mockFsMkdir.mockResolvedValue(undefined);

      await projectManager.setAgentModel(projectId, agentId, undefined);

      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = mockFsWrite.mock.calls[0];
      const contentStr = Buffer.from(writeCall[1] as any).toString('utf-8');
      const savedContent = JSON5.parse(contentStr.replace('// Project configurations for CCR agent system\n', ''));

      expect(savedContent.projects[projectId].agents[0].model).toBeUndefined();
    });

    it('should throw error if model string is invalid', async () => {
      mockFsRead.mockResolvedValue(JSON.stringify(mockProjectsData));

      await expect(projectManager.setAgentModel(projectId, agentId, 'invalid-model'))
        .rejects.toThrow('Invalid model string format');
    });

    it('should throw error if project not found', async () => {
      mockFsRead.mockResolvedValue(JSON.stringify({ projects: {} }));

      await expect(projectManager.setAgentModel(projectId, agentId, 'openai,gpt-4o'))
        .rejects.toThrow('Project not found');
    });
  });

  describe('getModelByAgentId', () => {
    const projectId = '550e8400-e29b-41d4-a716-446655440000';
    const agentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const model = 'openai,gpt-4o';

    const mockProjectsData = {
      projects: {
        [projectId]: {
          id: projectId,
          name: 'test-project',
          path: '/test/path',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01',
          agents: [
            {
              id: agentId,
              name: 'dev.md',
              relativePath: '.bmad/bmm/agents/dev.md',
              absolutePath: '/test/path/.bmad/bmm/agents/dev.md',
              model: model
            }
          ]
        }
      }
    };

    it('should return model string if agent configured', async () => {
      mockFsRead.mockResolvedValue(JSON.stringify(mockProjectsData));

      const result = await projectManager.getModelByAgentId(agentId);
      expect(result).toBe(model);
    });

    it('should return undefined if agent has no model', async () => {
      const dataNoModel = JSON.parse(JSON.stringify(mockProjectsData));
      delete dataNoModel.projects[projectId].agents[0].model;
      mockFsRead.mockResolvedValue(JSON.stringify(dataNoModel) as any);

      const result = await projectManager.getModelByAgentId(agentId);
      expect(result).toBeUndefined();
    });

    it('should return undefined if agent not found', async () => {
      mockFsRead.mockResolvedValue(JSON.stringify(mockProjectsData));
      const otherId = '00000000-0000-4000-8000-000000000000';

      const result = await projectManager.getModelByAgentId(otherId);
      expect(result).toBeUndefined();
    });
  });
});
