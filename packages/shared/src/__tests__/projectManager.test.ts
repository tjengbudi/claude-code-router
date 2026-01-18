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
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockProjectsData));
      // Mock validation
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      const model = 'openai,gpt-4o';
      await projectManager.setAgentModel(projectId, agentId, model);

      // Verify saveProjects called (via fs.writeFile)
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
      const savedContent = JSON5.parse(writeCall[1].replace('// Project configurations for CCR agent system\n', ''));

      expect(savedContent.projects[projectId].agents[0].model).toBe(model);
    });

    it('should remove agent model if undefined passed', async () => {
      const dataWithModel = JSON.parse(JSON.stringify(mockProjectsData));
      dataWithModel.projects[projectId].agents[0].model = 'old,model';

      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(dataWithModel));
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      await projectManager.setAgentModel(projectId, agentId, undefined);

      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
      const savedContent = JSON5.parse(writeCall[1].replace('// Project configurations for CCR agent system\n', ''));

      expect(savedContent.projects[projectId].agents[0].model).toBeUndefined();
    });

    it('should throw error if model string is invalid', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockProjectsData));

      await expect(projectManager.setAgentModel(projectId, agentId, 'invalid-model'))
        .rejects.toThrow('Invalid model string format');
    });

    it('should throw error if project not found', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ projects: {} }));

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
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockProjectsData));

      const result = await projectManager.getModelByAgentId(agentId);
      expect(result).toBe(model);
    });

    it('should return undefined if agent has no model', async () => {
      const dataNoModel = JSON.parse(JSON.stringify(mockProjectsData));
      delete dataNoModel.projects[projectId].agents[0].model;
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(dataNoModel));

      const result = await projectManager.getModelByAgentId(agentId);
      expect(result).toBeUndefined();
    });

    it('should return undefined if agent not found', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockProjectsData));
      const otherId = '00000000-0000-4000-8000-000000000000';

      const result = await projectManager.getModelByAgentId(otherId);
      expect(result).toBeUndefined();
    });
  });
});
